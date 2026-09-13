import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true, maxlength: 80 },
        username: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
            minlength: 3,
            maxlength: 30,
            match: /^[a-z0-9_]+$/,
        },
        email: { type: String, required: true, unique: true, lowercase: true, trim: true },
        passwordHash: { type: String, required: true, select: false },
        tokenVersion: { type: Number, default: 0 },
        bio: { type: String, trim: true, maxlength: 300, default: "" },
        portfolio: { type: String, trim: true, maxlength: 500, default: "" },
        lastSeen: { type: Date, default: null },
        typingConversation: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", default: null },
        typingUntil: { type: Date, default: null },
    },
    { timestamps: true },
);

export default mongoose.model("User", userSchema);
