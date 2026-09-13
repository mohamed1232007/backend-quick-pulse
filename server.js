import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import connectDB from "./config/db.js";
import authRoutes from "./routes/auth.js";
import chatRoutes from "./routes/chats.js";
import userRoutes from "./routes/users.js";
import presenceRoutes from "./routes/presence.js";
import requireAuth from "./middleware/auth.js";
import requireCsrf from "./middleware/csrf.js";
import http from "http";
import { pathToFileURL } from "url";
import { Server } from "socket.io";
import { configureSocket } from "./socket.js";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;
const httpServer = http.createServer(app);
app.set("io", null);

app.use(express.json());
app.use(cookieParser());
app.use(cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
}));
app.use("/api/auth", authRoutes);
app.use("/api/chats", requireAuth, requireCsrf, chatRoutes);
app.use("/api/users", requireAuth, requireCsrf, userRoutes);
app.use("/api/presence", requireAuth, requireCsrf, presenceRoutes);
app.get("/api/health", (_req, res) => res.json({ ok: true }));

const isMainModule = process.argv[1]
    && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMainModule) {
    const io = new Server(httpServer, {
        cors: {
            origin: process.env.FRONTEND_URL || "http://localhost:5173",
            credentials: true,
        },
    });
    app.set("io", io);
    configureSocket(io);
    connectDB()
        .then(() => {
            httpServer.listen(PORT, () => {
                console.log(`QuickPulse Server running on port ${PORT}`);
            });
        })
        .catch((error) => {
            console.error(`MongoDB Connection Error: ${error.message}`);
            process.exitCode = 1;
        });
}

export default app;
