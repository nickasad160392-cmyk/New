import { Router } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, users, attendanceRecords, leaveRequests } from "@workspace/db";
import { requireAuth, loadUser, requireAdmin, type AuthRequest } from "./middleware";
import { userToProfile } from "./auth";

function getJakartaDate(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}

const router = Router();

router.get("/admin/attendance/today", requireAuth, loadUser, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const today = getJakartaDate();
    const records = await db
      .select({
        id: attendanceRecords.id,
        userId: attendanceRecords.userId,
        date: attendanceRecords.date,
        checkInTime: attendanceRecords.checkInTime,
        checkOutTime: attendanceRecords.checkOutTime,
        status: attendanceRecords.status,
        workMinutes: attendanceRecords.workMinutes,
        overtimeMinutes: attendanceRecords.overtimeMinutes,
        latenessMinutes: attendanceRecords.latenessMinutes,
        checkInLatitude: attendanceRecords.checkInLatitude,
        checkInLongitude: attendanceRecords.checkInLongitude,
        checkInAccuracy: attendanceRecords.checkInAccuracy,
        userName: users.name,
        userJabatan: users.jabatan,
        userEmployeeId: users.employeeId,
      })
      .from(attendanceRecords)
      .leftJoin(users, eq(attendanceRecords.userId, users.id))
      .where(eq(attendanceRecords.date, today));
    res.json({
      date: today,
      records: records.map((r) => ({
        ...r,
        user: { id: r.userId, name: r.userName ?? "", jabatan: r.userJabatan, employeeId: r.userEmployeeId },
      })),
    });
  } catch (err) {
    req.log.error({ err }, "admin attendance today error");
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

router.get("/admin/attendance", requireAuth, loadUser, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { cycleStart } = req.query as { cycleStart: string };
    if (!cycleStart) {
      res.status(400).json({ error: "cycleStart diperlukan" });
      return;
    }
    const cycleEndDate = new Date(cycleStart);
    cycleEndDate.setMonth(cycleEndDate.getMonth() + 1);
    const cycleEnd = cycleEndDate.toLocaleDateString("en-CA");
    const records = await db
      .select({
        id: attendanceRecords.id,
        userId: attendanceRecords.userId,
        date: attendanceRecords.date,
        checkInTime: attendanceRecords.checkInTime,
        checkOutTime: attendanceRecords.checkOutTime,
        status: attendanceRecords.status,
        workMinutes: attendanceRecords.workMinutes,
        overtimeMinutes: attendanceRecords.overtimeMinutes,
        latenessMinutes: attendanceRecords.latenessMinutes,
        checkInLatitude: attendanceRecords.checkInLatitude,
        checkInLongitude: attendanceRecords.checkInLongitude,
        userName: users.name,
        userJabatan: users.jabatan,
        userEmployeeId: users.employeeId,
      })
      .from(attendanceRecords)
      .leftJoin(users, eq(attendanceRecords.userId, users.id));
    res.json(
      records
        .filter((r) => r.date >= cycleStart && r.date < cycleEnd)
        .map((r) => ({
          ...r,
          user: { id: r.userId, name: r.userName ?? "", jabatan: r.userJabatan, employeeId: r.userEmployeeId },
        })),
    );
  } catch (err) {
    req.log.error({ err }, "admin attendance error");
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

router.get("/admin/leave", requireAuth, loadUser, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { status } = req.query as { status?: string };
    const leaves = await db
      .select({
        id: leaveRequests.id,
        userId: leaveRequests.userId,
        type: leaveRequests.type,
        startDate: leaveRequests.startDate,
        endDate: leaveRequests.endDate,
        reason: leaveRequests.reason,
        status: leaveRequests.status,
        adminNote: leaveRequests.adminNote,
        createdAt: leaveRequests.createdAt,
        userName: users.name,
        userJabatan: users.jabatan,
        userEmployeeId: users.employeeId,
      })
      .from(leaveRequests)
      .leftJoin(users, eq(leaveRequests.userId, users.id));
    const filtered = status ? leaves.filter((l) => l.status === status) : leaves;
    res.json(
      filtered.map((l) => ({
        ...l,
        user: { id: l.userId, name: l.userName ?? "", jabatan: l.userJabatan, employeeId: l.userEmployeeId },
      })),
    );
  } catch (err) {
    req.log.error({ err }, "admin leave error");
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

router.post("/admin/leave/:id/approve", requireAuth, loadUser, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(String(req.params["id"]));
    const { adminNote } = req.body;
    const [updated] = await db
      .update(leaveRequests)
      .set({ status: "approved", adminNote: adminNote || null })
      .where(eq(leaveRequests.id, id))
      .returning();
    if (!updated) { res.status(404).json({ error: "Pengajuan tidak ditemukan" }); return; }
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "approve leave error");
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

router.post("/admin/leave/:id/reject", requireAuth, loadUser, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(String(req.params["id"]));
    const { adminNote } = req.body;
    const [updated] = await db
      .update(leaveRequests)
      .set({ status: "rejected", adminNote: adminNote || null })
      .where(eq(leaveRequests.id, id))
      .returning();
    if (!updated) { res.status(404).json({ error: "Pengajuan tidak ditemukan" }); return; }
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "reject leave error");
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

router.get("/admin/users", requireAuth, loadUser, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const allUsers = await db.select().from(users);
    res.json(allUsers.map(userToProfile));
  } catch (err) {
    req.log.error({ err }, "admin users error");
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

router.patch("/admin/users/:id", requireAuth, loadUser, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(String(req.params["id"]));
    const { name, jabatan, role, isActive } = req.body;
    const updates: Record<string, unknown> = {};
    if (name !== undefined && name.trim()) updates["name"] = name.trim();
    if (jabatan !== undefined) updates["jabatan"] = jabatan;
    if (role !== undefined) updates["role"] = role;
    if (isActive !== undefined) updates["isActive"] = isActive;
    const [updated] = await db.update(users).set(updates).where(eq(users.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Karyawan tidak ditemukan" }); return; }
    res.json(userToProfile(updated));
  } catch (err) {
    req.log.error({ err }, "update user error");
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

router.delete("/admin/reset-attendance", requireAuth, loadUser, requireAdmin, async (req: AuthRequest, res) => {
  try {
    await db.delete(attendanceRecords);
    req.log.info("All attendance records deleted by admin");
    res.json({ ok: true, message: "Seluruh riwayat absensi berhasil dihapus" });
  } catch (err) {
    req.log.error({ err }, "reset attendance error");
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

router.delete("/admin/reset-all-data", requireAuth, loadUser, requireAdmin, async (req: AuthRequest, res) => {
  try {
    await db.delete(attendanceRecords);
    await db.delete(leaveRequests);
    req.log.info("All data reset by admin");
    res.json({ ok: true, message: "Seluruh data absensi dan pengajuan izin berhasil dihapus" });
  } catch (err) {
    req.log.error({ err }, "reset all data error");
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

router.post("/admin/users/:id/reset-password", requireAuth, loadUser, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(String(req.params["id"]));
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      res.status(400).json({ error: "Kata sandi minimal 6 karakter" }); return;
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    const [updated] = await db.update(users).set({ passwordHash }).where(eq(users.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Karyawan tidak ditemukan" }); return; }
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "reset password error");
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

export default router;
