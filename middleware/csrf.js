export default function requireCsrf(req, res, next) {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    const cookieToken = req.cookies?.quickpulse_csrf;
    const headerToken = req.headers["x-csrf-token"];
    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
        return res.status(403).json({ message: "Invalid CSRF token." });
    }
    return next();
}
