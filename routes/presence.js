import { Router } from "express";
import mongoose from "mongoose";
import User from "../models/User.js";
import Conversation from "../models/Conversation.js";

const router = Router();
const ONLINE_WINDOW_MS = 12000;

router.post("/heartbeat", async (req, res) => {
    try {
        await User.updateOne(
            { _id: req.user._id },
            { $set: { lastSeen: new Date() } },
        );
        return res.json({ ok: true });
    } catch {
        return res.status(500).json({ message: "Unable to update presence." });
    }
});

router.post("/typing", async (req, res) => {
    const { conversationId, isTyping } = req.body;
    if (!mongoose.isValidObjectId(conversationId) || typeof isTyping !== "boolean") {
        return res.status(400).json({ message: "Invalid typing presence." });
    }

    try {
        const conversationExists = await Conversation.exists({
            _id: conversationId,
            participants: req.user._id,
        });
        if (!conversationExists) return res.status(404).json({ message: "Conversation not found." });

        await User.updateOne(
            { _id: req.user._id },
            {
                $set: {
                    typingConversation: isTyping ? conversationId : null,
                    typingUntil: isTyping ? new Date(Date.now() + 2500) : null,
                    lastSeen: new Date(),
                },
            },
        );
        return res.json({ ok: true });
    } catch {
        return res.status(500).json({ message: "Unable to update typing status." });
    }
});

router.get("/:conversationId", async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.conversationId)) {
        return res.status(400).json({ message: "Invalid conversation id." });
    }

    try {
        const conversation = await Conversation.findOne({
            _id: req.params.conversationId,
            participants: req.user._id,
        }).select("participants");
        if (!conversation) return res.status(404).json({ message: "Conversation not found." });

        const otherUserId = conversation.participants.find(
            (participant) => String(participant) !== String(req.user._id),
        );
        const otherUser = await User.findById(otherUserId).select("lastSeen typingConversation typingUntil");
        if (!otherUser) return res.status(404).json({ message: "User not found." });

        const now = Date.now();
        const online = otherUser.lastSeen && now - otherUser.lastSeen.getTime() < ONLINE_WINDOW_MS;
        const typing = online
            && String(otherUser.typingConversation) === String(req.params.conversationId)
            && otherUser.typingUntil
            && otherUser.typingUntil.getTime() > now;

        return res.json({ online: Boolean(online), typing: Boolean(typing) });
    } catch {
        return res.status(500).json({ message: "Unable to load presence." });
    }
});

export default router;
