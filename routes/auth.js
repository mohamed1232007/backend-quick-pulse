import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import User from "../models/User.js";
import requireCsrf from "../middleware/csrf.js";

const router = Router();

const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.COOKIE_SAMESITE || "lax",
    path: "/",
    maxAge: 15 * 60 * 1000,
};

function createToken(userId, tokenVersion = 0) {
    return jwt.sign({ userId, tokenVersion }, process.env.JWT_SECRET, { expiresIn: "15m" });
}

function createCsrfToken() {
    return crypto.randomBytes(32).toString("hex");
}

function authResponse(res, user, status = 200) {
    const csrfToken = createCsrfToken();
    return res
        .status(status)
        .cookie("quickpulse_token", createToken(user.id, user.tokenVersion), cookieOptions)
        .cookie("quickpulse_csrf", csrfToken, {
            httpOnly: false,
            secure: cookieOptions.secure,
            sameSite: cookieOptions.sameSite,
            path: "/",
            maxAge: cookieOptions.maxAge,
        })
        .json({ user: { id: user.id, name: user.name, username: user.username, email: user.email } });
}

router.post("/register", async (req, res) => {
    const { name, username, email, password } = req.body;
    if (!name?.trim() || !username?.trim() || !email?.trim() || !password) {
        return res.status(400).json({ message: "Name, username, email, and password are required." });
    }
    if (password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters." });
    }

    try {
        const normalizedEmail = email.trim().toLowerCase();
        const normalizedUsername = username.trim().toLowerCase();
        const existingUser = await User.findOne({
            $or: [{ email: normalizedEmail }, { username: normalizedUsername }],
        });
        if (existingUser?.email === normalizedEmail) return res.status(409).json({ message: "Email is already registered." });
        if (existingUser) return res.status(409).json({ message: "Username is already taken." });

        const passwordHash = await bcrypt.hash(password, 12);
        const user = await User.create({
            name: name.trim(),
            username: normalizedUsername,
            email: normalizedEmail,
            passwordHash,
        });
        return authResponse(res, user, 201);
    } catch (error) {
        if (error.code === 11000 && error.keyPattern?.username) {
            return res.status(409).json({ message: "Username is already taken." });
        }
        if (error.code === 11000) return res.status(409).json({ message: "Email is already registered." });
        return res.status(500).json({ message: "Unable to create account." });
    }
});

router.post("/login", async (req, res) => {
    const { email, password } = req.body;
    if (!email?.trim() || !password) {
        return res.status(400).json({ message: "Email and password are required." });
    }

    try {
        const user = await User.findOne({ email: email.trim().toLowerCase() }).select("+passwordHash");
        const validPassword = user && await bcrypt.compare(password, user.passwordHash);
        if (!validPassword) return res.status(401).json({ message: "Invalid email or password." });

        return authResponse(res, user);
    } catch {
        return res.status(500).json({ message: "Unable to sign in." });
    }
});

router.post("/logout", requireCsrf, async (req, res) => {
    const token = req.cookies?.quickpulse_token;
    if (token) {
        try {
            const payload = jwt.verify(token, process.env.JWT_SECRET);
            await User.findByIdAndUpdate(payload.userId, { $inc: { tokenVersion: 1 } });
        } catch {
            // The cookie is cleared even when the session is already invalid.
        }
    }
    return res.clearCookie("quickpulse_token", cookieOptions)
        .clearCookie("quickpulse_csrf", { ...cookieOptions, httpOnly: false })
        .sendStatus(204);
});

router.get("/me", async (req, res) => {
    const token = req.cookies?.quickpulse_token;
    if (!token) return res.status(401).json({ message: "Authentication required." });

    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(payload.userId).select("_id name username email tokenVersion");
        if (!user) return res.status(401).json({ message: "User no longer exists." });
        if (payload.tokenVersion !== user.tokenVersion) return res.status(401).json({ message: "Session has expired." });
        return res.json({ user: { id: user.id, name: user.name, username: user.username, email: user.email } });
    } catch {
        return res.status(401).json({ message: "Invalid or expired token." });
    }
});

export default router;
