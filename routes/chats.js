import { Router } from "express";
import mongoose from "mongoose";
import Conversation from "../models/Conversation.js";

const router = Router();

router.get("/", async (req, res) => {
    try {
        const conversations = await Conversation.find({ participants: req.user._id })
            .populate("participants", "name username")
            .sort({ updatedAt: -1 });
        return res.json(conversations.map((conversation) => {
            const unreadCount = conversation.messages.reduce((count, message) =>
                String(message.sender) !== String(req.user._id)
                && !message.readBy.some((userId) => String(userId) === String(req.user._id))
                    ? count + 1
                    : count, 0);
            const result = conversation.toObject();
            delete result.messages;
            return { ...result, unreadCount };
        }));
    } catch {
        return res.status(500).json({ message: "Unable to load conversations." });
    }
});

router.post("/", async (req, res) => {
    const { participantId } = req.body;
    if (!mongoose.isValidObjectId(participantId)) {
        return res.status(400).json({ message: "A valid participant is required." });
    }

    try {
        let conversation = await Conversation.findOne({
            participants: { $all: [req.user._id, participantId] },
            $expr: { $eq: [{ $size: "$participants" }, 2] },
        });
        if (!conversation) conversation = await Conversation.create({ participants: [req.user._id, participantId] });
        await conversation.populate("participants", "name username email");
        return res.status(201).json(conversation);
    } catch {
        return res.status(500).json({ message: "Unable to create conversation." });
    }
});

router.get("/:conversationId/messages", async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.conversationId)) {
        return res.status(400).json({ message: "Invalid conversation id." });
    }
    try {
        const conversation = await Conversation.findOne({
            _id: req.params.conversationId,
            participants: req.user._id,
        }).populate("messages.sender", "name email");
        if (!conversation) return res.status(404).json({ message: "Conversation not found." });
        return res.json(conversation.messages);
    } catch {
        return res.status(500).json({ message: "Unable to load messages." });
    }
});

router.post("/:conversationId/read", async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.conversationId)) {
        return res.status(400).json({ message: "Invalid conversation id." });
    }

    try {
        const conversation = await Conversation.findOneAndUpdate(
            { _id: req.params.conversationId, participants: req.user._id },
            {
                $addToSet: {
                    "messages.$[message].readBy": req.user._id,
                },
            },
            {
                arrayFilters: {
                    "message.sender": { $ne: req.user._id },
                    "message.readBy": { $ne: req.user._id },
                },
                new: true,
            },
        ).select("_id");
        if (!conversation) return res.status(404).json({ message: "Conversation not found." });
        return res.sendStatus(204);
    } catch {
        return res.status(500).json({ message: "Unable to mark messages as read." });
    }
});

router.delete("/:conversationId/messages", async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.conversationId)) {
        return res.status(400).json({ message: "Invalid conversation id." });
    }

    try {
        const conversation = await Conversation.findOneAndUpdate(
            { _id: req.params.conversationId, participants: req.user._id },
            { $set: { messages: [] } },
            { new: true },
        ).select("_id");
        if (!conversation) return res.status(404).json({ message: "Conversation not found." });

        req.app.get("io")?.to(`conversation:${conversation._id}`).emit("messages:cleared", {
            conversationId: String(conversation._id),
        });
        return res.sendStatus(204);
    } catch {
        return res.status(500).json({ message: "Unable to clear conversation." });
    }
});

router.post("/:conversationId/messages", async (req, res) => {
    const text = req.body.text?.trim();
    if (!text) return res.status(400).json({ message: "Message text is required." });
    if (!mongoose.isValidObjectId(req.params.conversationId)) {
        return res.status(400).json({ message: "Invalid conversation id." });
    }

    try {
        const conversation = await Conversation.findOne({
            _id: req.params.conversationId,
            participants: req.user._id,
        });
        if (!conversation) return res.status(404).json({ message: "Conversation not found." });

        conversation.messages.push({ sender: req.user._id, text });
        await conversation.save();
        const message = conversation.messages.at(-1);
        req.app.get("io")?.to(`conversation:${conversation._id}`).emit("message:new", {
            conversationId: String(conversation._id),
            message,
        });
        return res.status(201).json(message);
    } catch {
        return res.status(500).json({ message: "Unable to send message." });
    }
});

export default router;
