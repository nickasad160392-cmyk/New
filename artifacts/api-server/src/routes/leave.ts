import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, leaveRequests } from "@workspace/db";
import { requireAuth, type AuthRequest } from "./middleware";

const router = Router();

router.get("/leave", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { status } = req.query as { status?: string };
    const results = await db
      .select()
      .from(leaveRequests)
      .where(eq(leaveRequests.userId, req.userId!));
    res.json(status ? results.filter((r) => r.status === status) : results);
  } catch (err) {
    req.log.error({ err }, "leave list error");
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

router.post("/leave", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { type, startDate, endDate, reason } = req.body;
    if (!type || !startDate || !endDate || !reason) {
      res.status(400).json({ error: "Semua field wajib diisi" });
      return;
    }
    if (new Date(endDate) < new Date(startDate)) {
      res.status(400).json({ error: "Tanggal selesai tidak boleh sebelum tanggal mulai" });
      return;
    }
    const [inserted] = await db
      .insert(leaveRequests)
      .values({ userId: req.userId!, type, startDate, endDate, reason, status: "pending" })
      .returning();
    res.status(201).json(inserted);
  } catch (err) {
    req.log.error({ err }, "leave create error");
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

export default router;
