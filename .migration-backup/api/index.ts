import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { pgTable, serial, text, boolean, integer, timestamp, real } from "drizzle-orm/pg-core";
import { eq, or, and } from "drizzle-orm";

const JWT_SECRET = process.env.JWT_SECRET || "absensi-secret-key-change-in-prod";
const DATABASE_URL = process.env.DATABASE_URL!;

const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
const db = drizzle(pool);

const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("employee"),
  jabatan: text("jabatan"),
  employeeId: text("employee_id").unique(),
  phone: text("phone"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

const attendanceRecords = pgTable("attendance_records", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  date: text("date").notNull(),
  checkInTime: timestamp("check_in_time"),
  checkOutTime: timestamp("check_out_time"),
  status: text("status").notNull().default("alpha"),
  checkInSelfie: text("check_in_selfie"),
  checkInLatitude: real("check_in_latitude"),
  checkInLongitude: real("check_in_longitude"),
  checkInAccuracy: real("check_in_accuracy"),
  workMinutes: integer("work_minutes"),
  overtimeMinutes: integer("overtime_minutes"),
  latenessMinutes: integer("lateness_minutes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

const leaveRequests = pgTable("leave_requests", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  type: text("type").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("pending"),
  adminNote: text("admin_note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

const CHECK_IN_HOUR = 8;
const CHECK_IN_MINUTE = 0;
const STANDARD_WORK_HOURS = 8;
const OVERTIME_THRESHOLD_HOURS = 9;

function getJakartaDate(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}

function calcMinutes(checkIn: Date, checkOut: Date) {
  const totalMinutes = Math.floor((checkOut.getTime() - checkIn.getTime()) / 60000);
  const workMinutes = Math.min(totalMinutes, STANDARD_WORK_HOURS * 60 + 60);
  const jakartaTime = new Date(checkIn.toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
  const latenessMinutes = Math.max(0, (jakartaTime.getHours() - CHECK_IN_HOUR) * 60 + (jakartaTime.getMinutes() - CHECK_IN_MINUTE));
  const overtimeMinutes = totalMinutes > OVERTIME_THRESHOLD_HOURS * 60 ? totalMinutes - OVERTIME_THRESHOLD_HOURS * 60 : 0;
  return { workMinutes: Math.max(0, workMinutes), latenessMinutes, overtimeMinutes };
}

function userToProfile(u: typeof users.$inferSelect) {
  return { id: u.id, name: u.name, email: u.email, role: u.role, jabatan: u.jabatan, position: u.jabatan, employeeId: u.employeeId, phone: u.phone, isActive: u.isActive };
}

function signToken(userId: number): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "30d" });
}

interface AuthRequest extends express.Request {
  userId?: number;
  userRole?: string;
}

function requireAuth(req: AuthRequest, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : req.cookies?.token;
  if (!token) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: number };
    req.userId = payload.userId;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

async function loadUser(req: AuthRequest, res: express.Response, next: express.NextFunction) {
  if (!req.userId) { next(); return; }
  try {
    const [user] = await db.select().from(users).where(eq(users.id, req.userId)).limit(1);
    if (user) req.userRole = user.role;
    next();
  } catch { next(); }
}

function requireAdmin(req: AuthRequest, res: express.Response, next: express.NextFunction) {
  if (req.userRole !== "admin" && req.userRole !== "hr") { res.status(403).json({ error: "Forbidden" }); return; }
  next();
}

const app = express();
app.use(cors({ credentials: true, origin: true }));
app.use(cookieParser());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/api/healthz", (_req, res) => res.json({ ok: true }));

app.post("/api/auth/login", async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) { res.status(400).json({ error: "Email/ID dan kata sandi wajib diisi" }); return; }
    const [user] = await db.select().from(users).where(or(eq(users.email, identifier), eq(users.employeeId, identifier))).limit(1);
    if (!user) { res.status(401).json({ error: "Email/ID atau kata sandi salah" }); return; }
    if (!user.isActive) { res.status(403).json({ error: "Akun Anda tidak aktif. Hubungi admin." }); return; }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) { res.status(401).json({ error: "Email/ID atau kata sandi salah" }); return; }
    const token = signToken(user.id);
    res.cookie("token", token, { httpOnly: true, sameSite: "lax", maxAge: 30 * 24 * 60 * 60 * 1000 });
    res.json({ user: userToProfile(user), token });
  } catch (err) { console.error(err); res.status(500).json({ error: "Terjadi kesalahan server" }); }
});

app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password) { res.status(400).json({ error: "Nama, email, dan kata sandi wajib diisi" }); return; }
    if (password.length < 6) { res.status(400).json({ error: "Kata sandi minimal 6 karakter" }); return; }
    const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existing) { res.status(409).json({ error: "Email sudah terdaftar" }); return; }
    const passwordHash = await bcrypt.hash(password, 10);
    const [user] = await db.insert(users).values({ name, email, passwordHash, phone: phone || null, role: "employee" }).returning();
    const token = signToken(user!.id);
    res.cookie("token", token, { httpOnly: true, sameSite: "lax", maxAge: 30 * 24 * 60 * 60 * 1000 });
    res.status(201).json({ user: userToProfile(user!), token });
  } catch (err) { console.error(err); res.status(500).json({ error: "Terjadi kesalahan server" }); }
});

app.get("/api/auth/me", requireAuth, async (req: AuthRequest, res) => {
  try {
    const [user] = await db.select().from(users).where(eq(users.id, req.userId!)).limit(1);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    res.json(userToProfile(user));
  } catch (err) { console.error(err); res.status(500).json({ error: "Terjadi kesalahan server" }); }
});

app.post("/api/auth/logout", (_req, res) => {
  res.clearCookie("token");
  res.json({ ok: true });
});

app.post("/api/attendance/check-in", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { selfieBase64, latitude, longitude, accuracy } = req.body;
    const today = getJakartaDate();
    const [existing] = await db.select().from(attendanceRecords).where(and(eq(attendanceRecords.userId, req.userId!), eq(attendanceRecords.date, today))).limit(1);
    if (existing?.checkInTime) { res.status(409).json({ error: "Anda sudah absen masuk hari ini" }); return; }
    const now = new Date();
    const jakartaTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
    const latenessMinutes = Math.max(0, (jakartaTime.getHours() - CHECK_IN_HOUR) * 60 + (jakartaTime.getMinutes() - CHECK_IN_MINUTE));
    const status = latenessMinutes > 0 ? "terlambat" : "hadir";
    const vals = { checkInTime: now, checkInSelfie: selfieBase64 || null, checkInLatitude: latitude || null, checkInLongitude: longitude || null, checkInAccuracy: accuracy || null, status, latenessMinutes };
    let record;
    if (existing) {
      const [u] = await db.update(attendanceRecords).set(vals).where(eq(attendanceRecords.id, existing.id)).returning();
      record = u;
    } else {
      const [i] = await db.insert(attendanceRecords).values({ userId: req.userId!, date: today, ...vals }).returning();
      record = i;
    }
    res.json(record);
  } catch (err) { console.error(err); res.status(500).json({ error: "Terjadi kesalahan server" }); }
});

app.post("/api/attendance/check-out", requireAuth, async (req: AuthRequest, res) => {
  try {
    const today = getJakartaDate();
    const [existing] = await db.select().from(attendanceRecords).where(and(eq(attendanceRecords.userId, req.userId!), eq(attendanceRecords.date, today))).limit(1);
    if (!existing?.checkInTime) { res.status(400).json({ error: "Anda belum absen masuk hari ini" }); return; }
    if (existing.checkOutTime) { res.status(409).json({ error: "Anda sudah absen keluar hari ini" }); return; }
    const now = new Date();
    const { workMinutes, latenessMinutes, overtimeMinutes } = calcMinutes(existing.checkInTime, now);
    let status = existing.status;
    if (overtimeMinutes > 0) status = "lembur";
    const [updated] = await db.update(attendanceRecords).set({ checkOutTime: now, workMinutes, latenessMinutes, overtimeMinutes, status }).where(eq(attendanceRecords.id, existing.id)).returning();
    res.json(updated);
  } catch (err) { console.error(err); res.status(500).json({ error: "Terjadi kesalahan server" }); }
});

app.get("/api/attendance/today", requireAuth, async (req: AuthRequest, res) => {
  try {
    const today = getJakartaDate();
    const [record] = await db.select().from(attendanceRecords).where(and(eq(attendanceRecords.userId, req.userId!), eq(attendanceRecords.date, today))).limit(1);
    res.json(record || null);
  } catch (err) { console.error(err); res.status(500).json({ error: "Terjadi kesalahan server" }); }
});

app.get("/api/attendance/history", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { cycleStart } = req.query as { cycleStart: string };
    if (!cycleStart) { res.status(400).json({ error: "cycleStart diperlukan" }); return; }
    const cycleStartDate = new Date(cycleStart);
    const cycleEndDate = new Date(cycleStartDate);
    cycleEndDate.setMonth(cycleEndDate.getMonth() + 1);
    const cycleEnd = cycleEndDate.toLocaleDateString("en-CA");
    const records = await db.select().from(attendanceRecords).where(eq(attendanceRecords.userId, req.userId!));
    res.json(records.filter((r) => r.date >= cycleStart && r.date < cycleEnd));
  } catch (err) { console.error(err); res.status(500).json({ error: "Terjadi kesalahan server" }); }
});

app.get("/api/attendance/cycle-summary", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { cycleStart } = req.query as { cycleStart: string };
    if (!cycleStart) { res.status(400).json({ error: "cycleStart diperlukan" }); return; }
    const cycleStartDate = new Date(cycleStart);
    const cycleEndDate = new Date(cycleStartDate);
    cycleEndDate.setMonth(cycleEndDate.getMonth() + 1);
    const cycleEnd = cycleEndDate.toLocaleDateString("en-CA");
    const records = await db.select().from(attendanceRecords).where(eq(attendanceRecords.userId, req.userId!));
    const filtered = records.filter((r) => r.date >= cycleStart && r.date < cycleEnd);
    res.json({
      cycleLabel: new Date(cycleStart).toLocaleDateString("id-ID", { month: "long", year: "numeric" }),
      cycleStart,
      presentDays: filtered.filter((r) => r.status === "hadir" || r.status === "lembur").length,
      lateDays: filtered.filter((r) => r.status === "terlambat").length,
      permitDays: filtered.filter((r) => r.status === "izin" || r.status === "sakit").length,
      absentDays: filtered.filter((r) => r.status === "alpha").length,
      totalWorkMinutes: filtered.reduce((s, r) => s + (r.workMinutes ?? 0), 0),
      totalOvertimeMinutes: filtered.reduce((s, r) => s + (r.overtimeMinutes ?? 0), 0),
      totalLatenessMinutes: filtered.reduce((s, r) => s + (r.latenessMinutes ?? 0), 0),
    });
  } catch (err) { console.error(err); res.status(500).json({ error: "Terjadi kesalahan server" }); }
});

app.get("/api/leave", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { status } = req.query as { status?: string };
    const results = await db.select().from(leaveRequests).where(eq(leaveRequests.userId, req.userId!));
    res.json(status ? results.filter((r) => r.status === status) : results);
  } catch (err) { console.error(err); res.status(500).json({ error: "Terjadi kesalahan server" }); }
});

app.post("/api/leave", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { type, startDate, endDate, reason } = req.body;
    if (!type || !startDate || !endDate || !reason) { res.status(400).json({ error: "Semua field wajib diisi" }); return; }
    if (new Date(endDate) < new Date(startDate)) { res.status(400).json({ error: "Tanggal selesai tidak boleh sebelum tanggal mulai" }); return; }
    const [inserted] = await db.insert(leaveRequests).values({ userId: req.userId!, type, startDate, endDate, reason, status: "pending" }).returning();
    res.status(201).json(inserted);
  } catch (err) { console.error(err); res.status(500).json({ error: "Terjadi kesalahan server" }); }
});

app.get("/api/admin/attendance/today", requireAuth, loadUser, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const today = getJakartaDate();
    const records = await db.select({ id: attendanceRecords.id, userId: attendanceRecords.userId, date: attendanceRecords.date, checkInTime: attendanceRecords.checkInTime, checkOutTime: attendanceRecords.checkOutTime, status: attendanceRecords.status, workMinutes: attendanceRecords.workMinutes, overtimeMinutes: attendanceRecords.overtimeMinutes, latenessMinutes: attendanceRecords.latenessMinutes, userName: users.name, userJabatan: users.jabatan, userEmployeeId: users.employeeId }).from(attendanceRecords).leftJoin(users, eq(attendanceRecords.userId, users.id)).where(eq(attendanceRecords.date, today));
    res.json({ date: today, records: records.map((r) => ({ ...r, user: { id: r.userId, name: r.userName ?? "", jabatan: r.userJabatan, employeeId: r.userEmployeeId } })) });
  } catch (err) { console.error(err); res.status(500).json({ error: "Terjadi kesalahan server" }); }
});

app.get("/api/admin/attendance", requireAuth, loadUser, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { cycleStart } = req.query as { cycleStart: string };
    if (!cycleStart) { res.status(400).json({ error: "cycleStart diperlukan" }); return; }
    const cycleEndDate = new Date(cycleStart);
    cycleEndDate.setMonth(cycleEndDate.getMonth() + 1);
    const cycleEnd = cycleEndDate.toLocaleDateString("en-CA");
    const records = await db.select({ id: attendanceRecords.id, userId: attendanceRecords.userId, date: attendanceRecords.date, checkInTime: attendanceRecords.checkInTime, checkOutTime: attendanceRecords.checkOutTime, status: attendanceRecords.status, workMinutes: attendanceRecords.workMinutes, overtimeMinutes: attendanceRecords.overtimeMinutes, latenessMinutes: attendanceRecords.latenessMinutes, userName: users.name, userJabatan: users.jabatan, userEmployeeId: users.employeeId }).from(attendanceRecords).leftJoin(users, eq(attendanceRecords.userId, users.id));
    res.json(records.filter((r) => r.date >= cycleStart && r.date < cycleEnd).map((r) => ({ ...r, user: { id: r.userId, name: r.userName ?? "", jabatan: r.userJabatan, employeeId: r.userEmployeeId } })));
  } catch (err) { console.error(err); res.status(500).json({ error: "Terjadi kesalahan server" }); }
});

app.get("/api/admin/leave", requireAuth, loadUser, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { status } = req.query as { status?: string };
    const leaves = await db.select({ id: leaveRequests.id, userId: leaveRequests.userId, type: leaveRequests.type, startDate: leaveRequests.startDate, endDate: leaveRequests.endDate, reason: leaveRequests.reason, status: leaveRequests.status, adminNote: leaveRequests.adminNote, createdAt: leaveRequests.createdAt, userName: users.name, userJabatan: users.jabatan, userEmployeeId: users.employeeId }).from(leaveRequests).leftJoin(users, eq(leaveRequests.userId, users.id));
    const filtered = status ? leaves.filter((l) => l.status === status) : leaves;
    res.json(filtered.map((l) => ({ ...l, user: { id: l.userId, name: l.userName ?? "", jabatan: l.userJabatan, employeeId: l.userEmployeeId } })));
  } catch (err) { console.error(err); res.status(500).json({ error: "Terjadi kesalahan server" }); }
});

app.post("/api/admin/leave/:id/approve", requireAuth, loadUser, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const { adminNote } = req.body;
    const [updated] = await db.update(leaveRequests).set({ status: "approved", adminNote: adminNote || null }).where(eq(leaveRequests.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Pengajuan tidak ditemukan" }); return; }
    res.json(updated);
  } catch (err) { console.error(err); res.status(500).json({ error: "Terjadi kesalahan server" }); }
});

app.post("/api/admin/leave/:id/reject", requireAuth, loadUser, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const { adminNote } = req.body;
    const [updated] = await db.update(leaveRequests).set({ status: "rejected", adminNote: adminNote || null }).where(eq(leaveRequests.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Pengajuan tidak ditemukan" }); return; }
    res.json(updated);
  } catch (err) { console.error(err); res.status(500).json({ error: "Terjadi kesalahan server" }); }
});

app.get("/api/admin/users", requireAuth, loadUser, requireAdmin, async (_req, res) => {
  try {
    const allUsers = await db.select().from(users);
    res.json(allUsers.map(userToProfile));
  } catch (err) { console.error(err); res.status(500).json({ error: "Terjadi kesalahan server" }); }
});

app.patch("/api/admin/users/:id", requireAuth, loadUser, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const { jabatan, role, isActive } = req.body;
    const updates: Record<string, unknown> = {};
    if (jabatan !== undefined) updates.jabatan = jabatan;
    if (role !== undefined) updates.role = role;
    if (isActive !== undefined) updates.isActive = isActive;
    const [updated] = await db.update(users).set(updates).where(eq(users.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Karyawan tidak ditemukan" }); return; }
    res.json(userToProfile(updated));
  } catch (err) { console.error(err); res.status(500).json({ error: "Terjadi kesalahan server" }); }
});

app.post("/api/admin/users/:id/reset-password", requireAuth, loadUser, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) { res.status(400).json({ error: "Kata sandi minimal 6 karakter" }); return; }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    const [updated] = await db.update(users).set({ passwordHash }).where(eq(users.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Karyawan tidak ditemukan" }); return; }
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: "Terjadi kesalahan server" }); }
});

export default app;
