import jwt from "jsonwebtoken";
import User from "./models/User.js";
import Conversation from "./models/Conversation.js";

function parseCookies(header = "") {
    return Object.fromEntries(header.split(";").filter(Boolean).map((part) => {
        const index = part.indexOf("=");
        return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
    }));
}

export function configureSocket(io) {
    const connectedUsers = new Map();

    io.use(async (socket, next) => {
        try {
            const token = parseCookies(socket.handshake.headers.cookie).quickpulse_token;
            const payload = jwt.verify(token, process.env.JWT_SECRET);
            const user = await User.findById(payload.userId).select("_id name tokenVersion");
            if (!user || user.tokenVersion !== payload.tokenVersion) return next(new Error("Unauthorized"));
            socket.user = user;
            return next();
        } catch {
            return next(new Error("Unauthorized"));
        }
    });

    io.on("connection", (socket) => {
        const userId = String(socket.user._id);
        socket.join(`user:${userId}`);
        connectedUsers.set(userId, (connectedUsers.get(userId) || 0) + 1);
        socket.emit("presence:connected");

        socket.on("conversation:join", async (conversationId) => {
            const conversation = await Conversation.findOne({
                _id: conversationId,
                participants: socket.user._id,
            }).select("participants");
            if (!conversation) return;

            socket.join(`conversation:${conversationId}`);
            const otherUserId = conversation.participants.find((id) => String(id) !== userId);
            socket.emit("presence:update", {
                userId: String(otherUserId),
                online: connectedUsers.has(String(otherUserId)),
            });
        });

        socket.on("conversation:leave", (conversationId) => {
            socket.leave(`conversation:${conversationId}`);
        });

        socket.on("typing:update", async ({ conversationId, isTyping }) => {
            if (typeof conversationId !== "string" || typeof isTyping !== "boolean") return;
            const conversation = await Conversation.exists({
                _id: conversationId,
                participants: socket.user._id,
            });
            if (!conversation) return;
            socket.to(`conversation:${conversationId}`).emit("typing:update", {
                userId,
                isTyping,
            });
        });

        socket.on("message:delivered", async ({ conversationId, messageId }) => {
            const conversation = await Conversation.findOneAndUpdate(
                { _id: conversationId, participants: socket.user._id, "messages._id": messageId },
                { $addToSet: { "messages.$.deliveredTo": socket.user._id } },
                { new: true },
            ).select("messages");
            const message = conversation?.messages.id(messageId);
            if (message) io.to(`user:${message.sender}`).emit("message:status", {
                conversationId, messageId, status: "delivered",
            });
        });

        socket.on("messages:read", async ({ conversationId, messageIds }) => {
            if (!Array.isArray(messageIds) || !messageIds.length) return;
            const conversation = await Conversation.findOne({
                _id: conversationId,
                participants: socket.user._id,
                "messages._id": { $in: messageIds },
            }).select("messages");
            if (!conversation) return;

            const senderIds = new Set();
            conversation.messages.forEach((message) => {
                if (messageIds.includes(String(message._id)) && String(message.sender) !== userId) {
                    message.readBy.addToSet(socket.user._id);
                    senderIds.add(String(message.sender));
                }
            });
            await conversation.save();
            senderIds.forEach((senderId) => io.to(`user:${senderId}`).emit("message:status", {
                conversationId, messageIds, status: "read",
            }));
        });

        socket.on("disconnect", () => {
            const count = (connectedUsers.get(userId) || 1) - 1;
            if (count > 0) connectedUsers.set(userId, count);
            else {
                connectedUsers.delete(userId);
                socket.broadcast.emit("presence:update", { userId, online: false });
            }
        });
    });
}
