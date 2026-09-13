import { Router } from "express";
import User from "../models/User.js";

const router = Router();

router.get("/me", async (req, res) => {
    const user = await User.findById(req.user._id).select("name username email bio portfolio");
    return res.json(user);
});

router.put("/me", async (req, res) => {
    const { name, bio, portfolio } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: "Name is required." });

    try {
        const user = await User.findByIdAndUpdate(
            req.user._id,
            {
                $set: {
                    name: name.trim(),
                    bio: bio?.trim() || "",
                    portfolio: portfolio?.trim() || "",
                },
            },
            { new: true, runValidators: true },
        ).select("name username email bio portfolio");
        return res.json(user);
    } catch {
        return res.status(400).json({ message: "Unable to update profile." });
    }
});

router.get("/:userId", async (req, res) => {
    try {
        const user = await User.findById(req.params.userId).select("name username bio portfolio");
        if (!user) return res.status(404).json({ message: "User not found." });
        return res.json(user);
    } catch {
        return res.status(400).json({ message: "Invalid user." });
    }
});

router.get("/", async (req, res) => {
    const search = req.query.username?.trim().toLowerCase();
    if (!search) return res.json([]);

    try {
        const users = await User.find({
            _id: { $ne: req.user._id },
            username: { $regex: `^${search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, $options: "i" },
        }).select("name username email").limit(10);
        return res.json(users);
    } catch {
        return res.status(500).json({ message: "Unable to load users." });
    }
});

export default router;
