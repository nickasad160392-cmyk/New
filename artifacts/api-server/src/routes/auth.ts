import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { eq, or } from "drizzle-orm";
import { db, users } from "@workspace/db";
import { requireAuth, type AuthRequest } from "./middleware";

const HR_EMAILS = ["admin@test.com", "admin@lwp.com"];
const HR_NAMES_LOWER = ["admin test", "hrd", "hr manager"];

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

export function signToken(userId: number): string {
  return jwt.sign({ userId }, getJwtSecret(), { expiresIn: "30d" });
}

export function userToProfile(u: typeof users.$inferSelect) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    jabatan: u.jabatan,
    position: u.jabatan,
    employeeId: u.employeeId,
    phone: u.phone,
    isActive: u.isActive,
    hasFaceDescriptor: !!u.faceDescriptor,
    facePhoto: u.facePhoto ?? null,
    profilePhoto: u.profilePhoto ?? null,
  };
}

function resolveRole(email: string, name: string, requestedRole?: string): string {
  if (requestedRole === "admin") return "employee";
  if (HR_EMAILS.includes(email.toLowerCase())) return "hr";
  if (HR_NAMES_LOWER.some((n) => name.toLowerCase().includes(n))) return "hr";
  return "employee";
}

const router = Router();

router.post("/auth/login", async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) {
      res.status(400).json({ error: "Email/ID dan kata sandi wajib diisi" }); return;
    }
    const [user] = await db
      .select()
      .from(users)
      .where(or(eq(users.email, identifier), eq(users.employeeId, identifier)))
      .limit(1);
    if (!user) { res.status(401).json({ error: "Email/ID atau kata sandi salah" }); return; }
    if (!user.isActive) { res.status(403).json({ error: "Akun Anda tidak aktif. Hubungi admin." }); return; }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) { res.status(401).json({ error: "Email/ID atau kata sandi salah" }); return; }

    let finalUser = user;
    if (HR_EMAILS.includes(user.email.toLowerCase()) && user.role === "employee") {
      const [updated] = await db.update(users).set({ role: "hr" }).where(eq(users.id, user.id)).returning();
      if (updated) finalUser = updated;
    }

    const token = signToken(finalUser.id);
    res.cookie("token", token, { httpOnly: true, sameSite: "lax", maxAge: 30 * 24 * 60 * 60 * 1000 });
    res.json({ user: userToProfile(finalUser), token });
  } catch (err) {
    req.log.error({ err }, "login error");
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

router.post("/auth/register", async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password) {
      res.status(400).json({ error: "Nama, email, dan kata sandi wajib diisi" }); return;
    }
    if (password.length < 6) { res.status(400).json({ error: "Kata sandi minimal 6 karakter" }); return; }
    const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existing) { res.status(409).json({ error: "Email sudah terdaftar" }); return; }
    const passwordHash = await bcrypt.hash(password, 10);
    const role = resolveRole(email, name);
    const [user] = await db
      .insert(users)
      .values({ name, email, passwordHash, phone: phone || null, role })
      .returning();
    const token = signToken(user!.id);
    res.cookie("token", token, { httpOnly: true, sameSite: "lax", maxAge: 30 * 24 * 60 * 60 * 1000 });
    res.status(201).json({ user: userToProfile(user!), token });
  } catch (err) {
    req.log.error({ err }, "register error");
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

router.get("/auth/me", requireAuth, async (req: AuthRequest, res) => {
  try {
    const [user] = await db.select().from(users).where(eq(users.id, req.userId!)).limit(1);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    res.json(userToProfile(user));
  } catch (err) {
    req.log.error({ err }, "me error");
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

router.post("/auth/logout", (_req, res) => {
  res.clearCookie("token");
  res.json({ ok: true });
});

// Update name (self-service)
router.patch("/auth/update-name", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== "string" || name.trim().length < 2) {
      res.status(400).json({ error: "Nama minimal 2 karakter" }); return;
    }
    const trimmed = name.trim();
    await db.update(users).set({ name: trimmed }).where(eq(users.id, req.userId!));
    const [user] = await db.select().from(users).where(eq(users.id, req.userId!)).limit(1);
    res.json(userToProfile(user!));
  } catch (err) {
    req.log.error({ err }, "update-name error");
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

// Register face photo for attendance scanning (SEPARATE from profile photo)
router.post("/auth/register-face-photo", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { photoBase64 } = req.body;
    if (!photoBase64 || typeof photoBase64 !== "string") {
      res.status(400).json({ error: "Foto wajah tidak valid" }); return;
    }
    await db
      .update(users)
      .set({ facePhoto: photoBase64, faceDescriptor: "face_registered" })
      .where(eq(users.id, req.userId!));
    const [user] = await db.select().from(users).where(eq(users.id, req.userId!)).limit(1);
    res.json({ ok: true, user: userToProfile(user!) });
  } catch (err) {
    req.log.error({ err }, "register-face-photo error");
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

// Delete face photo
router.delete("/auth/face-photo", requireAuth, async (req: AuthRequest, res) => {
  try {
    await db
      .update(users)
      .set({ facePhoto: null, faceDescriptor: null })
      .where(eq(users.id, req.userId!));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "delete-face-photo error");
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

// Legacy: register-selfie
router.post("/auth/register-selfie", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { photoBase64 } = req.body;
    if (!photoBase64 || typeof photoBase64 !== "string") {
      res.status(400).json({ error: "Foto selfie tidak valid" }); return;
    }
    await db
      .update(users)
      .set({ facePhoto: photoBase64, faceDescriptor: "face_registered" })
      .where(eq(users.id, req.userId!));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "register-selfie error");
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

// Upload / replace profile photo
router.post("/auth/upload-photo", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { photoBase64 } = req.body;
    if (!photoBase64 || typeof photoBase64 !== "string") {
      res.status(400).json({ error: "Foto tidak valid" }); return;
    }
    await db
      .update(users)
      .set({ profilePhoto: photoBase64 })
      .where(eq(users.id, req.userId!));
    const [user] = await db.select().from(users).where(eq(users.id, req.userId!)).limit(1);
    res.json(userToProfile(user!));
  } catch (err) {
    req.log.error({ err }, "upload-photo error");
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

// Delete profile photo
router.delete("/auth/photo", requireAuth, async (req: AuthRequest, res) => {
  try {
    await db
      .update(users)
      .set({ profilePhoto: null })
      .where(eq(users.id, req.userId!));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "delete-photo error");
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

router.get("/auth/face-descriptor", requireAuth, async (req: AuthRequest, res) => {
  try {
    const [user] = await db
      .select({ faceDescriptor: users.faceDescriptor, facePhoto: users.facePhoto, profilePhoto: users.profilePhoto })
      .from(users)
      .where(eq(users.id, req.userId!))
      .limit(1);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const fd = user.faceDescriptor;
    const descriptor = fd && fd !== "selfie_registered" && fd !== "face_registered" ? JSON.parse(fd) as number[] : null;
    res.json({ descriptor, facePhoto: user.facePhoto ?? null, profilePhoto: user.profilePhoto ?? null });
  } catch (err) {
    req.log.error({ err }, "face-descriptor error");
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

export default router;
