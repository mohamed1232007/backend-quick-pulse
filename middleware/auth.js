import jwt from "jsonwebtoken";
import User from "../models/User.js";

export default async function requireAuth(req, res, next) {
    const token = req.cookies?.quickpulse_token;

    if (!token) return res.status(401).json({ message: "Authentication required." });

    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(payload.userId).select("_id name email tokenVersion");
        if (!user) return res.status(401).json({ message: "User no longer exists." });
        if (payload.tokenVersion !== user.tokenVersion) {
            return res.status(401).json({ message: "Session has expired." });
        }
        req.user = user;
        return next();
    } catch {
        return res.status(401).json({ message: "Invalid or expired token." });
    }
}
