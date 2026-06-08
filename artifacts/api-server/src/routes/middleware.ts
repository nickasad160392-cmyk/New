import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { db, users } from "@workspace/db";
import type { Request, Response, NextFunction } from "express";

function getJwtSecret(): string {
  const secret = process.env["JWT_SECRET"];
  if (!secret) {
    if (process.env["NODE_ENV"] === "production") {
      throw new Error("JWT_SECRET environment variable is required in production");
    }
    return "absensi-secret-key-change-in-prod";
  }
  return secret;
}

export interface AuthRequest extends Request {
  userId?: number;
  userRole?: string;
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token =
    authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : (req.cookies as Record<string, string>)?.token;
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const payload = jwt.verify(token, getJwtSecret()) as { userId: number };
    req.userId = payload.userId;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export async function loadUser(req: AuthRequest, _res: Response, next: NextFunction) {
  if (!req.userId) { next(); return; }
  try {
    const [user] = await db.select().from(users).where(eq(users.id, req.userId)).limit(1);
    if (user) req.userRole = user.role;
    next();
  } catch {
    next();
  }
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.userRole !== "admin" && req.userRole !== "hr") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
}
