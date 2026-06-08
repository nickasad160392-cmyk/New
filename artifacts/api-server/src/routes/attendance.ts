import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db, attendanceRecords } from "@workspace/db";
import { requireAuth, type AuthRequest } from "./middleware";

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
  const latenessMinutes = Math.max(
    0,
    (jakartaTime.getHours() - CHECK_IN_HOUR) * 60 + (jakartaTime.getMinutes() - CHECK_IN_MINUTE),
  );
  const overtimeMinutes =
    totalMinutes > OVERTIME_THRESHOLD_HOURS * 60 ? totalMinutes - OVERTIME_THRESHOLD_HOURS * 60 : 0;
  return { workMinutes: Math.max(0, workMinutes), latenessMinutes, overtimeMinutes };
}

const router = Router();

router.post("/attendance/check-in", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { selfieBase64, latitude, longitude, accuracy } = req.body;
    const today = getJakartaDate();
    const [existing] = await db
      .select()
      .from(attendanceRecords)
      .where(and(eq(attendanceRecords.userId, req.userId!), eq(attendanceRecords.date, today)))
      .limit(1);
    if (existing?.checkInTime) {
      res.status(409).json({ error: "Anda sudah absen masuk hari ini" });
      return;
    }
    const now = new Date();
    const jakartaTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
    const latenessMinutes = Math.max(
      0,
      (jakartaTime.getHours() - CHECK_IN_HOUR) * 60 + (jakartaTime.getMinutes() - CHECK_IN_MINUTE),
    );
    const status = latenessMinutes > 0 ? "terlambat" : "hadir";
    const vals = {
      checkInTime: now,
      checkInSelfie: selfieBase64 || null,
      checkInLatitude: latitude || null,
      checkInLongitude: longitude || null,
      checkInAccuracy: accuracy || null,
      status,
      latenessMinutes,
    };
    let record;
    if (existing) {
      const [u] = await db
        .update(attendanceRecords)
        .set(vals)
        .where(eq(attendanceRecords.id, existing.id))
        .returning();
      record = u;
    } else {
      const [i] = await db
        .insert(attendanceRecords)
        .values({ userId: req.userId!, date: today, ...vals })
        .returning();
      record = i;
    }
    res.json(record);
  } catch (err) {
    req.log.error({ err }, "check-in error");
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

router.post("/attendance/check-out", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { selfieBase64 } = req.body ?? {};
    const today = getJakartaDate();
    const [existing] = await db
      .select()
      .from(attendanceRecords)
      .where(and(eq(attendanceRecords.userId, req.userId!), eq(attendanceRecords.date, today)))
      .limit(1);
    if (!existing?.checkInTime) {
      res.status(400).json({ error: "Anda belum absen masuk hari ini" });
      return;
    }
    if (existing.checkOutTime) {
      res.status(409).json({ error: "Anda sudah absen keluar hari ini" });
      return;
    }
    const now = new Date();
    const { workMinutes, latenessMinutes, overtimeMinutes } = calcMinutes(existing.checkInTime, now);
    let status = existing.status;
    if (overtimeMinutes > 0) status = "lembur";
    const [updated] = await db
      .update(attendanceRecords)
      .set({
        checkOutTime: now,
        checkOutSelfie: selfieBase64 || null,
        workMinutes,
        latenessMinutes,
        overtimeMinutes,
        status,
      })
      .where(eq(attendanceRecords.id, existing.id))
      .returning();
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "check-out error");
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

router.post("/attendance/overtime-check-in", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { selfieBase64 } = req.body ?? {};
    const today = getJakartaDate();
    const [existing] = await db
      .select()
      .from(attendanceRecords)
      .where(and(eq(attendanceRecords.userId, req.userId!), eq(attendanceRecords.date, today)))
      .limit(1);
    if (!existing?.checkOutTime) {
      res.status(400).json({ error: "Harus absen keluar terlebih dahulu sebelum lembur tambahan" });
      return;
    }
    if (existing.overtimeCheckInTime) {
      res.status(409).json({ error: "Sudah memulai sesi lembur tambahan" });
      return;
    }
    const now = new Date();
    const [updated] = await db
      .update(attendanceRecords)
      .set({ overtimeCheckInTime: now, overtimeCheckInSelfie: selfieBase64 || null })
      .where(eq(attendanceRecords.id, existing.id))
      .returning();
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "overtime-check-in error");
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

router.post("/attendance/overtime-check-out", requireAuth, async (req: AuthRequest, res) => {
  try {
    const today = getJakartaDate();
    const [existing] = await db
      .select()
      .from(attendanceRecords)
      .where(and(eq(attendanceRecords.userId, req.userId!), eq(attendanceRecords.date, today)))
      .limit(1);
    if (!existing?.overtimeCheckInTime) {
      res.status(400).json({ error: "Belum memulai sesi lembur tambahan" });
      return;
    }
    if (existing.overtimeCheckOutTime) {
      res.status(409).json({ error: "Sudah absen keluar dari sesi lembur tambahan" });
      return;
    }
    const now = new Date();
    const extraMinutes = Math.floor(
      (now.getTime() - existing.overtimeCheckInTime.getTime()) / 60000,
    );
    const totalOvertime = (existing.overtimeMinutes ?? 0) + extraMinutes;
    const [updated] = await db
      .update(attendanceRecords)
      .set({
        overtimeCheckOutTime: now,
        overtimeExtraMinutes: extraMinutes,
        overtimeMinutes: totalOvertime,
        status: "lembur",
      })
      .where(eq(attendanceRecords.id, existing.id))
      .returning();
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "overtime-check-out error");
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

router.get("/attendance/today", requireAuth, async (req: AuthRequest, res) => {
  try {
    const today = getJakartaDate();
    const [record] = await db
      .select()
      .from(attendanceRecords)
      .where(and(eq(attendanceRecords.userId, req.userId!), eq(attendanceRecords.date, today)))
      .limit(1);
    res.json(record || null);
  } catch (err) {
    req.log.error({ err }, "attendance/today error");
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

router.get("/attendance/history", requireAuth, async (req: AuthRequest, res) => {
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
      .select()
      .from(attendanceRecords)
      .where(eq(attendanceRecords.userId, req.userId!));
    res.json(records.filter((r) => r.date >= cycleStart && r.date < cycleEnd));
  } catch (err) {
    req.log.error({ err }, "attendance/history error");
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

router.get("/attendance/cycle-summary", requireAuth, async (req: AuthRequest, res) => {
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
      .select()
      .from(attendanceRecords)
      .where(eq(attendanceRecords.userId, req.userId!));
    const filtered = records.filter((r) => r.date >= cycleStart && r.date < cycleEnd);
    res.json({
      cycleLabel: new Date(cycleStart).toLocaleDateString("id-ID", { month: "long", year: "numeric" }),
      cycleStart,
      presentDays: filtered.filter((r) =>
        r.status === "hadir" || r.status === "lembur" || r.status === "terlambat",
      ).length,
      lateDays: filtered.filter((r) => r.status === "terlambat").length,
      permitDays: filtered.filter((r) => r.status === "izin" || r.status === "sakit").length,
      absentDays: filtered.filter((r) => r.status === "alpha").length,
      totalWorkMinutes: filtered.reduce((s, r) => s + (r.workMinutes ?? 0), 0),
      totalOvertimeMinutes: filtered.reduce((s, r) => s + (r.overtimeMinutes ?? 0), 0),
      totalLatenessMinutes: filtered.reduce((s, r) => s + (r.latenessMinutes ?? 0), 0),
    });
  } catch (err) {
    req.log.error({ err }, "cycle-summary error");
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

export default router;
