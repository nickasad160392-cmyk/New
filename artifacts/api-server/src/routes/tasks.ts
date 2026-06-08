import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db, dailyTasks, users } from "@workspace/db";
import { requireAuth, loadUser, requireAdmin, type AuthRequest } from "./middleware";

function getJakartaDate(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}

const router = Router();

router.get("/tasks", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { date } = req.query as { date?: string };
    const targetDate = date || getJakartaDate();
    const tasks = await db
      .select()
      .from(dailyTasks)
      .where(and(eq(dailyTasks.userId, req.userId!), eq(dailyTasks.date, targetDate)));
    res.json(tasks);
  } catch (err) {
    req.log.error({ err }, "get tasks error");
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

router.get("/tasks/history", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { from, to } = req.query as { from?: string; to?: string };
    const allTasks = await db
      .select()
      .from(dailyTasks)
      .where(eq(dailyTasks.userId, req.userId!));
    const filtered = allTasks.filter((t) => {
      if (from && t.date < from) return false;
      if (to && t.date > to) return false;
      return true;
    });
    res.json(filtered);
  } catch (err) {
    req.log.error({ err }, "get tasks history error");
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

router.post("/tasks", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { title, target, notes, date } = req.body;
    if (!title?.trim()) { res.status(400).json({ error: "Judul tugas wajib diisi" }); return; }
    const taskDate = date || getJakartaDate();
    const [task] = await db
      .insert(dailyTasks)
      .values({ userId: req.userId!, date: taskDate, title: title.trim(), target: target || null, notes: notes || null })
      .returning();
    res.status(201).json(task);
  } catch (err) {
    req.log.error({ err }, "create task error");
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

router.patch("/tasks/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(String(req.params["id"]));
    const updates: Record<string, unknown> = {};
    const { title, target, isCompleted, notes } = req.body;
    if (title !== undefined && title.trim()) updates["title"] = title.trim();
    if (target !== undefined) updates["target"] = target || null;
    if (isCompleted !== undefined) updates["isCompleted"] = isCompleted;
    if (notes !== undefined) updates["notes"] = notes || null;
    const [existing] = await db.select().from(dailyTasks).where(eq(dailyTasks.id, id)).limit(1);
    if (!existing || existing.userId !== req.userId) { res.status(404).json({ error: "Tugas tidak ditemukan" }); return; }
    const [updated] = await db.update(dailyTasks).set(updates).where(eq(dailyTasks.id, id)).returning();
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "update task error");
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

router.delete("/tasks/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(String(req.params["id"]));
    const [existing] = await db.select().from(dailyTasks).where(eq(dailyTasks.id, id)).limit(1);
    if (!existing || existing.userId !== req.userId) { res.status(404).json({ error: "Tugas tidak ditemukan" }); return; }
    await db.delete(dailyTasks).where(eq(dailyTasks.id, id));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "delete task error");
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

router.get("/admin/employee-tasks", requireAuth, loadUser, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { userId, date } = req.query as { userId?: string; date?: string };
    const targetDate = date || getJakartaDate();
    let tasks;
    if (userId) {
      tasks = await db.select().from(dailyTasks)
        .where(and(eq(dailyTasks.userId, parseInt(userId)), eq(dailyTasks.date, targetDate)));
    } else {
      const allTasks = await db.select({
        id: dailyTasks.id, userId: dailyTasks.userId, date: dailyTasks.date,
        title: dailyTasks.title, target: dailyTasks.target,
        isCompleted: dailyTasks.isCompleted, notes: dailyTasks.notes,
        createdAt: dailyTasks.createdAt,
        userName: users.name, userJabatan: users.jabatan,
      }).from(dailyTasks).leftJoin(users, eq(dailyTasks.userId, users.id))
        .where(eq(dailyTasks.date, targetDate));
      res.json(allTasks);
      return;
    }
    res.json(tasks);
  } catch (err) {
    req.log.error({ err }, "admin employee tasks error");
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

export default router;
