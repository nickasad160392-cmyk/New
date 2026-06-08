import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type DailyTask, type Goal } from "@/lib/api";
import { toast } from "sonner";
import {
  Briefcase, Target, CalendarDays, Plus, Check, Trash2,
  ChevronLeft, ChevronRight, Loader2, TrendingUp, X,
} from "lucide-react";

function getJakartaDate(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}

function getMonthPeriod(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function getWeekPeriod(d = new Date()): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function formatDateId(iso: string): string {
  const [y, m, dayStr] = iso.split("-");
  const months = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agt","Sep","Okt","Nov","Des"];
  return `${dayStr} ${months[(parseInt(m) - 1) % 12]} ${y}`;
}

function initials(name: string): string {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

// ─── Task List View ───────────────────────────────────────────────────────────
function TaskItem({ task, onToggle, onDelete }: { task: DailyTask; onToggle: () => void; onDelete: () => void }) {
  return (
    <div className={`flex items-center gap-3 rounded-2xl px-3.5 py-3 transition-colors ${task.isCompleted ? "bg-green-50" : "bg-white"} shadow-sm`}>
      <button
        onClick={onToggle}
        className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
          task.isCompleted ? "bg-green-500 border-green-500" : "border-gray-300"
        }`}
      >
        {task.isCompleted && <Check className="w-3.5 h-3.5 text-white" />}
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold text-[#4A4435] ${task.isCompleted ? "line-through opacity-50" : ""}`}>{task.title}</p>
        {task.target && <p className="text-xs text-[#8C8573]">🎯 {task.target}</p>}
      </div>
      <button onClick={onDelete} className="flex-shrink-0 w-7 h-7 flex items-center justify-center text-gray-300 hover:text-red-400 transition-colors">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ─── Goal Item View ───────────────────────────────────────────────────────────
function GoalItem({ goal, onProgress, onDelete }: { goal: Goal; onProgress: (v: number) => void; onDelete: () => void }) {
  const pct = goal.targetValue > 0 ? Math.round((goal.progressValue / goal.targetValue) * 100) : 0;
  const done = goal.status === "completed" || pct >= 100;
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(goal.progressValue));

  return (
    <div className={`bg-white rounded-2xl px-4 py-3.5 shadow-sm ${done ? "border-l-4 border-green-400" : "border-l-4 border-[#FACC15]"}`}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-[#4A4435]">{goal.title}</p>
          {goal.description && <p className="text-xs text-[#8C8573] mt-0.5">{goal.description}</p>}
        </div>
        <button onClick={onDelete} className="flex-shrink-0 w-7 h-7 flex items-center justify-center text-gray-200 hover:text-red-400 transition-colors ml-2">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex items-center gap-2 mb-2">
        <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${done ? "bg-green-400" : "bg-[#FACC15]"}`}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
        <span className={`text-xs font-bold w-10 text-right ${done ? "text-green-600" : "text-[#4A4435]"}`}>{pct}%</span>
      </div>
      {editing ? (
        <form onSubmit={(e) => { e.preventDefault(); onProgress(parseInt(val) || 0); setEditing(false); }} className="flex items-center gap-2">
          <input
            type="number"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            min={0} max={goal.targetValue}
            className="flex-1 h-8 px-3 rounded-xl border border-gray-200 text-xs text-[#4A4435] focus:outline-none focus:ring-1 focus:ring-[#FACC15]"
            autoFocus
          />
          <span className="text-xs text-[#8C8573]">/ {goal.targetValue}</span>
          <button type="submit" className="px-3 h-8 rounded-xl bg-[#FACC15] text-[#4A4435] text-xs font-bold">OK</button>
          <button type="button" onClick={() => setEditing(false)} className="w-8 h-8 rounded-xl bg-gray-100 text-[#8C8573] flex items-center justify-center"><X className="w-3.5 h-3.5" /></button>
        </form>
      ) : (
        <div className="flex items-center justify-between">
          <span className="text-xs text-[#8C8573]">{goal.progressValue} / {goal.targetValue}</span>
          {!done && (
            <button onClick={() => setEditing(true)} className="text-xs text-[#4A4435] font-semibold underline">
              Update progres
            </button>
          )}
          {done && <span className="text-xs font-bold text-green-600">✅ Tercapai!</span>}
        </div>
      )}
    </div>
  );
}

// ─── Add Task Form ─────────────────────────────────────────────────────────────
function AddTaskForm({ date, onAdded }: { date: string; onAdded: () => void }) {
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState("");
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: () => api.tasks.create({ title: title.trim(), target: target.trim() || undefined, date }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks", date] });
      setTitle(""); setTarget(""); setOpen(false);
      toast.success("Tugas ditambahkan");
      onAdded();
    },
    onError: () => toast.error("Gagal menambahkan tugas"),
  });
  if (!open) return (
    <button onClick={() => setOpen(true)} className="w-full h-12 rounded-2xl border-2 border-dashed border-gray-200 text-[#8C8573] text-sm font-semibold flex items-center justify-center gap-2 active:bg-gray-50">
      <Plus className="w-4 h-4" /> Tambah Tugas
    </button>
  );
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (title.trim()) mut.mutate(); }} className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
      <input
        type="text" value={title} onChange={(e) => setTitle(e.target.value)}
        placeholder="Nama tugas..." autoFocus
        className="w-full h-10 px-3 rounded-xl border border-gray-200 text-sm text-[#4A4435] focus:outline-none focus:ring-2 focus:ring-[#FACC15]"
      />
      <input
        type="text" value={target} onChange={(e) => setTarget(e.target.value)}
        placeholder="Target (opsional, contoh: 10 unit, 2 meeting)"
        className="w-full h-10 px-3 rounded-xl border border-gray-200 text-sm text-[#4A4435] focus:outline-none focus:ring-2 focus:ring-[#FACC15]"
      />
      <div className="flex gap-2">
        <button type="submit" disabled={!title.trim() || mut.isPending}
          className="flex-1 h-10 rounded-xl bg-[#FACC15] text-[#4A4435] font-bold text-sm disabled:opacity-50">
          {mut.isPending ? "..." : "Tambah"}
        </button>
        <button type="button" onClick={() => { setOpen(false); setTitle(""); setTarget(""); }}
          className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
          <X className="w-4 h-4 text-[#8C8573]" />
        </button>
      </div>
    </form>
  );
}

// ─── Add Goal Form ─────────────────────────────────────────────────────────────
function AddGoalForm({ period, periodType, onAdded }: { period: string; periodType: "weekly" | "monthly"; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [target, setTarget] = useState("100");
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: () => api.goals.create({ title: title.trim(), description: desc.trim() || undefined, period, periodType, targetValue: parseInt(target) || 100 }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["goals"] });
      setTitle(""); setDesc(""); setTarget("100"); setOpen(false);
      toast.success("Goal ditambahkan");
      onAdded();
    },
    onError: () => toast.error("Gagal menambahkan goal"),
  });
  if (!open) return (
    <button onClick={() => setOpen(true)} className="w-full h-11 rounded-2xl border-2 border-dashed border-gray-200 text-[#8C8573] text-xs font-semibold flex items-center justify-center gap-2">
      <Plus className="w-3.5 h-3.5" /> Tambah Goal
    </button>
  );
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (title.trim()) mut.mutate(); }} className="bg-white rounded-2xl shadow-sm p-3.5 space-y-2.5">
      <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Judul goal..." autoFocus
        className="w-full h-10 px-3 rounded-xl border border-gray-200 text-sm text-[#4A4435] focus:outline-none focus:ring-2 focus:ring-[#FACC15]" />
      <input type="text" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Deskripsi (opsional)"
        className="w-full h-10 px-3 rounded-xl border border-gray-200 text-sm text-[#4A4435] focus:outline-none focus:ring-2 focus:ring-[#FACC15]" />
      <div className="flex items-center gap-2">
        <span className="text-xs text-[#8C8573]">Target:</span>
        <input type="number" value={target} onChange={(e) => setTarget(e.target.value)} min={1}
          className="w-24 h-10 px-3 rounded-xl border border-gray-200 text-sm text-[#4A4435] focus:outline-none focus:ring-2 focus:ring-[#FACC15]" />
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={!title.trim() || mut.isPending}
          className="flex-1 h-9 rounded-xl bg-[#FACC15] text-[#4A4435] font-bold text-sm disabled:opacity-50">
          {mut.isPending ? "..." : "Simpan"}
        </button>
        <button type="button" onClick={() => { setOpen(false); setTitle(""); setDesc(""); setTarget("100"); }}
          className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center">
          <X className="w-4 h-4 text-[#8C8573]" />
        </button>
      </div>
    </form>
  );
}

// ─── Main WorkPage ────────────────────────────────────────────────────────────
type Tab = "agenda" | "goals" | "history";

export default function WorkPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("agenda");
  const [selectedDate, setSelectedDate] = useState(getJakartaDate());
  const [historyDate, setHistoryDate] = useState(getJakartaDate());
  const today = getJakartaDate();
  const monthPeriod = getMonthPeriod();
  const weekPeriod = getWeekPeriod();
  const qc = useQueryClient();

  // Today's tasks
  const tasksQuery = useQuery({
    queryKey: ["tasks", selectedDate],
    queryFn: () => api.tasks.list(selectedDate),
  });

  // History tasks
  const historyQuery = useQuery({
    queryKey: ["tasks", historyDate],
    queryFn: () => api.tasks.list(historyDate),
    enabled: tab === "history",
  });

  // Goals
  const goalsQuery = useQuery({
    queryKey: ["goals"],
    queryFn: () => api.goals.list(),
    enabled: tab === "goals",
  });

  const weekGoals = (goalsQuery.data ?? []).filter((g) => g.periodType === "weekly" && g.period === weekPeriod);
  const monthGoals = (goalsQuery.data ?? []).filter((g) => g.periodType === "monthly" && g.period === monthPeriod);

  const toggleTask = useMutation({
    mutationFn: (task: DailyTask) => api.tasks.update(task.id, { isCompleted: !task.isCompleted }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks", selectedDate] }),
    onError: () => toast.error("Gagal memperbarui tugas"),
  });

  const deleteTask = useMutation({
    mutationFn: (id: number) => api.tasks.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks", selectedDate] }),
    onError: () => toast.error("Gagal menghapus tugas"),
  });

  const updateGoal = useMutation({
    mutationFn: ({ id, progress }: { id: number; progress: number }) => api.goals.update(id, { progressValue: progress }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["goals"] }),
    onError: () => toast.error("Gagal memperbarui goal"),
  });

  const deleteGoal = useMutation({
    mutationFn: (id: number) => api.goals.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["goals"] }); toast.success("Goal dihapus"); },
    onError: () => toast.error("Gagal menghapus goal"),
  });

  const tasks = tasksQuery.data ?? [];
  const completed = tasks.filter((t) => t.isCompleted).length;
  const pct = tasks.length > 0 ? Math.round((completed / tasks.length) * 100) : 0;

  const changeDate = (delta: number) => {
    const d = new Date(selectedDate + "T00:00:00");
    d.setDate(d.getDate() + delta);
    setSelectedDate(d.toLocaleDateString("en-CA"));
  };

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <div className="bg-[#FACC15] px-5 pt-12 pb-6 rounded-b-[40px]">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-full bg-[#4A4435] flex items-center justify-center flex-shrink-0">
            <span className="text-[#FACC15] font-extrabold text-sm">{initials(user?.name ?? "?")}</span>
          </div>
          <div>
            <p className="text-[#4A4435]/60 text-xs font-medium">Kerja & Target</p>
            <h1 className="text-xl font-extrabold text-[#4A4435]">{user?.name}</h1>
            <p className="text-xs text-[#4A4435]/70">{user?.jabatan || "Karyawan"}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="grid grid-cols-3 bg-[#4A4435]/10 rounded-2xl p-1 gap-1">
          {([
            { id: "agenda", icon: CalendarDays, label: "Agenda" },
            { id: "goals", icon: Target, label: "Goals" },
            { id: "history", icon: TrendingUp, label: "Riwayat" },
          ] as const).map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-colors ${
                  tab === t.id ? "bg-[#4A4435] text-[#FACC15]" : "text-[#4A4435]/60"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-5 pt-5 pb-24">

        {/* ── AGENDA TAB ─────────────────────────────── */}
        {tab === "agenda" && (
          <div className="space-y-4">
            {/* Date navigator */}
            <div className="flex items-center justify-between">
              <button onClick={() => changeDate(-1)} className="w-9 h-9 rounded-xl bg-white shadow-sm flex items-center justify-center">
                <ChevronLeft className="w-4 h-4 text-[#4A4435]" />
              </button>
              <div className="text-center">
                <p className="text-sm font-bold text-[#4A4435]">{formatDateId(selectedDate)}</p>
                {selectedDate === today && <p className="text-[10px] text-[#FACC15] font-bold">— Hari Ini —</p>}
              </div>
              <button
                onClick={() => changeDate(1)}
                disabled={selectedDate >= today}
                className="w-9 h-9 rounded-xl bg-white shadow-sm flex items-center justify-center disabled:opacity-30"
              >
                <ChevronRight className="w-4 h-4 text-[#4A4435]" />
              </button>
            </div>

            {/* Progress bar */}
            {tasks.length > 0 && (
              <div className="bg-white rounded-2xl px-4 py-3 shadow-sm">
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="font-semibold text-[#4A4435]">Progres Hari Ini</span>
                  <span className="font-bold text-[#4A4435]">{completed}/{tasks.length} ({pct}%)</span>
                </div>
                <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-[#FACC15] rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
            )}

            {/* Task list */}
            {tasksQuery.isLoading ? (
              <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 text-[#FACC15] animate-spin" /></div>
            ) : (
              <div className="space-y-2">
                {tasks.length === 0 && (
                  <p className="text-sm text-[#8C8573] text-center py-4">Belum ada tugas untuk tanggal ini</p>
                )}
                {tasks.map((task) => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    onToggle={() => toggleTask.mutate(task)}
                    onDelete={() => deleteTask.mutate(task.id)}
                  />
                ))}
              </div>
            )}

            {/* Add task form (only for today) */}
            {selectedDate === today && (
              <AddTaskForm date={selectedDate} onAdded={() => {}} />
            )}
          </div>
        )}

        {/* ── GOALS TAB ──────────────────────────────── */}
        {tab === "goals" && (
          <div className="space-y-5">
            {/* Weekly goals */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-[#FACC15]/20 flex items-center justify-center">
                  <Target className="w-4 h-4 text-[#4A4435]" />
                </div>
                <p className="text-sm font-bold text-[#4A4435]">Goals Minggu Ini</p>
                <span className="text-xs text-[#8C8573]">({weekPeriod})</span>
              </div>
              {goalsQuery.isLoading ? (
                <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 text-[#FACC15] animate-spin" /></div>
              ) : (
                <div className="space-y-2.5">
                  {weekGoals.length === 0 && (
                    <p className="text-xs text-[#8C8573] text-center py-2">Belum ada goals minggu ini</p>
                  )}
                  {weekGoals.map((g) => (
                    <GoalItem
                      key={g.id}
                      goal={g}
                      onProgress={(v) => updateGoal.mutate({ id: g.id, progress: v })}
                      onDelete={() => deleteGoal.mutate(g.id)}
                    />
                  ))}
                  <AddGoalForm period={weekPeriod} periodType="weekly" onAdded={() => {}} />
                </div>
              )}
            </div>

            <div className="h-px bg-gray-100" />

            {/* Monthly goals */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-blue-500" />
                </div>
                <p className="text-sm font-bold text-[#4A4435]">Goals Bulan Ini</p>
                <span className="text-xs text-[#8C8573]">({monthPeriod})</span>
              </div>
              {goalsQuery.isLoading ? (
                <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 text-[#FACC15] animate-spin" /></div>
              ) : (
                <div className="space-y-2.5">
                  {monthGoals.length === 0 && (
                    <p className="text-xs text-[#8C8573] text-center py-2">Belum ada goals bulan ini</p>
                  )}
                  {monthGoals.map((g) => (
                    <GoalItem
                      key={g.id}
                      goal={g}
                      onProgress={(v) => updateGoal.mutate({ id: g.id, progress: v })}
                      onDelete={() => deleteGoal.mutate(g.id)}
                    />
                  ))}
                  <AddGoalForm period={monthPeriod} periodType="monthly" onAdded={() => {}} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── RIWAYAT TAB ────────────────────────────── */}
        {tab === "history" && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl px-4 py-3 shadow-sm">
              <p className="text-xs font-bold text-[#8C8573] mb-2">Pilih Tanggal</p>
              <input
                type="date"
                value={historyDate}
                max={today}
                onChange={(e) => setHistoryDate(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-gray-200 text-sm text-[#4A4435] focus:outline-none focus:ring-2 focus:ring-[#FACC15]"
              />
            </div>
            <p className="text-sm font-bold text-[#4A4435]">{formatDateId(historyDate)}</p>
            {historyQuery.isLoading ? (
              <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 text-[#FACC15] animate-spin" /></div>
            ) : (historyQuery.data ?? []).length === 0 ? (
              <div className="text-center py-8">
                <Briefcase className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                <p className="text-sm text-[#8C8573]">Tidak ada agenda untuk tanggal ini</p>
              </div>
            ) : (
              <div className="space-y-2">
                {(historyQuery.data ?? []).map((task) => (
                  <div key={task.id} className={`flex items-center gap-3 rounded-2xl px-3.5 py-3 ${task.isCompleted ? "bg-green-50" : "bg-white"} shadow-sm`}>
                    <div className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center ${task.isCompleted ? "bg-green-500 border-green-500" : "border-gray-200"}`}>
                      {task.isCompleted && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold text-[#4A4435] ${task.isCompleted ? "line-through opacity-50" : ""}`}>{task.title}</p>
                      {task.target && <p className="text-xs text-[#8C8573]">🎯 {task.target}</p>}
                    </div>
                  </div>
                ))}
                <p className="text-xs text-center text-[#8C8573] pt-1">
                  {(historyQuery.data ?? []).filter((t) => t.isCompleted).length}/{(historyQuery.data ?? []).length} selesai
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
