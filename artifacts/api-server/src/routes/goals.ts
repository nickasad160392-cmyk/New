import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db, goals, users } from "@workspace/db";
import { requireAuth, loadUser, requireAdmin, type AuthRequest } from "./middleware";

const router = Router();

router.get("/goals", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { period, periodType } = req.query as { period?: string; periodType?: string };
    const allGoals = await db.select().from(goals).where(eq(goals.userId, req.userId!));
    const filtered = allGoals.filter((g) => {
      if (period && g.period !== period) return false;
      if (periodType && g.periodType !== periodType) return false;
      return true;
    });
    res.json(filtered);
  } catch (err) {
    req.log.error({ err }, "get goals error");
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

router.post("/goals", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { title, description, period, periodType, targetValue } = req.body;
    if (!title?.trim()) { res.status(400).json({ error: "Judul goal wajib diisi" }); return; }
    if (!period || !periodType) { res.status(400).json({ error: "Period dan tipe wajib diisi" }); return; }
    if (!["weekly", "monthly"].includes(periodType)) { res.status(400).json({ error: "PeriodType harus weekly atau monthly" }); return; }
    const [goal] = await db.insert(goals).values({
      userId: req.userId!, title: title.trim(), description: description || null,
      period, periodType, targetValue: targetValue ?? 100,
    }).returning();
    res.status(201).json(goal);
  } catch (err) {
    req.log.error({ err }, "create goal error");
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

router.patch("/goals/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(String(req.params["id"]));
    const [existing] = await db.select().from(goals).where(eq(goals.id, id)).limit(1);
    if (!existing || existing.userId !== req.userId) { res.status(404).json({ error: "Goal tidak ditemukan" }); return; }
    const updates: Record<string, unknown> = {};
    const { title, description, progressValue, status, targetValue } = req.body;
    if (title !== undefined && title.trim()) updates["title"] = title.trim();
    if (description !== undefined) updates["description"] = description || null;
    if (progressValue !== undefined) updates["progressValue"] = Math.max(0, Math.min(progressValue, existing.targetValue));
    if (status !== undefined) updates["status"] = status;
    if (targetValue !== undefined) updates["targetValue"] = targetValue;
    const [updated] = await db.update(goals).set(updates).where(eq(goals.id, id)).returning();
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "update goal error");
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

router.delete("/goals/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(String(req.params["id"]));
    const [existing] = await db.select().from(goals).where(eq(goals.id, id)).limit(1);
    if (!existing || existing.userId !== req.userId) { res.status(404).json({ error: "Goal tidak ditemukan" }); return; }
    await db.delete(goals).where(eq(goals.id, id));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "delete goal error");
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

router.get("/admin/employee-goals", requireAuth, loadUser, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { userId, period, periodType } = req.query as { userId?: string; period?: string; periodType?: string };
    const allGoals = await db.select({
      id: goals.id, userId: goals.userId, period: goals.period,
      periodType: goals.periodType, title: goals.title, description: goals.description,
      targetValue: goals.targetValue, progressValue: goals.progressValue,
      status: goals.status, createdAt: goals.createdAt,
      userName: users.name, userJabatan: users.jabatan,
    }).from(goals).leftJoin(users, eq(goals.userId, users.id));
    const filtered = allGoals.filter((g) => {
      if (userId && g.userId !== parseInt(userId)) return false;
      if (period && g.period !== period) return false;
      if (periodType && g.periodType !== periodType) return false;
      return true;
    });
    res.json(filtered);
  } catch (err) {
    req.log.error({ err }, "admin goals error");
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

export default router;
