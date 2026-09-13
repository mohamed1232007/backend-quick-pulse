import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
    {
        sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        text: { type: String, required: true, trim: true, maxlength: 2000 },
        deliveredTo: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
        readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    },
    { timestamps: true },
);

const conversationSchema = new mongoose.Schema(
    {
        participants: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }],
        messages: [messageSchema],
    },
    { timestamps: true },
);

conversationSchema.index({ participants: 1 });

export default mongoose.model("Conversation", conversationSchema);
