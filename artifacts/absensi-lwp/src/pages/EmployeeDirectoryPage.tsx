import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { api, type UserProfile, type DailyTask } from "@/lib/api";
import { ArrowLeft, Search, Users, Briefcase, ChevronRight, Check, Target, Loader2 } from "lucide-react";

function getJakartaDate(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}

function initials(name: string): string {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = [
  "bg-amber-400", "bg-blue-400", "bg-green-500", "bg-purple-400",
  "bg-pink-400", "bg-teal-400", "bg-orange-400", "bg-cyan-500",
];

function avatarColor(id: number): string {
  return AVATAR_COLORS[id % AVATAR_COLORS.length] ?? "bg-gray-400";
}

type EmployeeWithTasks = UserProfile & { tasks?: DailyTask[] };

function EmployeeCard({ emp, onSelect }: { emp: EmployeeWithTasks; onSelect: () => void }) {
  const tasks = emp.tasks ?? [];
  const completed = tasks.filter((t) => t.isCompleted).length;
  return (
    <button
      onClick={onSelect}
      className="w-full flex items-center gap-3 bg-white rounded-2xl px-4 py-3.5 shadow-sm active:bg-gray-50 text-left"
    >
      <div className={`w-12 h-12 rounded-full ${avatarColor(emp.id)} flex items-center justify-center flex-shrink-0`}>
        <span className="text-white font-extrabold text-sm">{initials(emp.name)}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-[#4A4435] truncate">{emp.name}</p>
        <p className="text-xs text-[#8C8573] truncate">{emp.jabatan || emp.employeeId || "—"}</p>
        {tasks.length > 0 && (
          <div className="flex items-center gap-1 mt-1">
            <Check className="w-3 h-3 text-green-500" />
            <span className="text-[10px] text-green-600 font-semibold">{completed}/{tasks.length} tugas hari ini</span>
          </div>
        )}
      </div>
      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
          emp.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
        }`}>{emp.isActive ? "Aktif" : "Tidak Aktif"}</span>
        <ChevronRight className="w-4 h-4 text-gray-300" />
      </div>
    </button>
  );
}

function EmployeeDetailModal({ emp, tasks, onClose }: {
  emp: EmployeeWithTasks;
  tasks: DailyTask[];
  onClose: () => void;
}) {
  const completed = tasks.filter((t) => t.isCompleted).length;
  const pct = tasks.length > 0 ? Math.round((completed / tasks.length) * 100) : 0;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white w-full max-w-[430px] rounded-t-3xl px-5 pt-5 pb-8 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center gap-4 mb-5">
          <div className={`w-16 h-16 rounded-full ${avatarColor(emp.id)} flex items-center justify-center flex-shrink-0`}>
            <span className="text-white font-extrabold text-xl">{initials(emp.name)}</span>
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-extrabold text-[#4A4435]">{emp.name}</h2>
            <p className="text-sm text-[#8C8573]">{emp.jabatan || "Karyawan"}</p>
            <p className="text-xs text-[#8C8573]">{emp.email}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
            <span className="text-[#8C8573] text-lg leading-none">×</span>
          </button>
        </div>

        {/* Status badges */}
        <div className="flex gap-2 mb-5">
          <span className={`text-xs font-bold px-3 py-1.5 rounded-xl ${emp.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
            {emp.isActive ? "✓ Aktif" : "Tidak Aktif"}
          </span>
          <span className="text-xs font-bold px-3 py-1.5 rounded-xl bg-[#FACC15]/20 text-[#4A4435]">
            {emp.role === "admin" ? "👑 Admin" : emp.role === "hr" ? "🏢 HR" : "👤 Karyawan"}
          </span>
          {emp.employeeId && (
            <span className="text-xs font-bold px-3 py-1.5 rounded-xl bg-gray-100 text-gray-600">
              ID: {emp.employeeId}
            </span>
          )}
        </div>

        {/* Today's tasks */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold text-[#8C8573] uppercase tracking-widest">Agenda Hari Ini</p>
            <span className="text-xs font-bold text-[#4A4435]">{completed}/{tasks.length} selesai</span>
          </div>
          {tasks.length > 0 && (
            <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mb-3">
              <div className="h-full bg-[#FACC15] rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
          )}
          {tasks.length === 0 ? (
            <p className="text-sm text-[#8C8573] text-center py-4">Belum ada tugas hari ini</p>
          ) : (
            <div className="space-y-2">
              {tasks.map((task) => (
                <div key={task.id} className="flex items-start gap-3 bg-gray-50 rounded-xl px-3 py-2.5">
                  <div className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 ${
                    task.isCompleted ? "bg-green-500 border-green-500" : "border-gray-300"
                  }`}>
                    {task.isCompleted && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold text-[#4A4435] ${task.isCompleted ? "line-through opacity-60" : ""}`}>{task.title}</p>
                    {task.target && <p className="text-xs text-[#8C8573]">🎯 Target: {task.target}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function EmployeeDirectoryPage() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<EmployeeWithTasks | null>(null);

  const today = getJakartaDate();

  const usersQuery = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => api.admin.users(),
  });
  const tasksQuery = useQuery({
    queryKey: ["admin", "employee-tasks", today],
    queryFn: () => api.admin.employeeTasks(today),
  });

  const employees: EmployeeWithTasks[] = (usersQuery.data ?? []).map((u) => ({
    ...u,
    tasks: (tasksQuery.data ?? []).filter((t) => t.userId === u.id),
  }));

  const filtered = employees.filter((e) =>
    search.trim() === "" ||
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    (e.jabatan ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (e.employeeId ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const activeCount = employees.filter((e) => e.isActive).length;

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <div className="bg-[#FACC15] px-5 pt-12 pb-8 rounded-b-[40px]">
        <div className="flex items-center gap-3 mb-4">
          <Link href="/admin" className="w-8 h-8 rounded-full bg-[#4A4435]/10 flex items-center justify-center">
            <ArrowLeft className="w-4 h-4 text-[#4A4435]" />
          </Link>
          <div>
            <h1 className="text-xl font-extrabold text-[#4A4435]">Direktori Karyawan</h1>
            <p className="text-xs text-[#4A4435]/60">{activeCount} karyawan aktif</p>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8C8573]" />
          <input
            type="text"
            placeholder="Cari nama, jabatan, ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-11 pl-10 pr-4 rounded-2xl bg-white/80 text-sm text-[#4A4435] placeholder:text-[#8C8573]/60 focus:outline-none focus:ring-2 focus:ring-[#4A4435]/30"
          />
        </div>
      </div>

      <div className="px-5 pt-5 pb-24">
        {usersQuery.isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-8 h-8 text-[#FACC15] animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10">
            <Users className="w-10 h-10 text-gray-200 mx-auto mb-2" />
            <p className="text-sm text-[#8C8573]">Tidak ada karyawan ditemukan</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filtered.map((emp) => (
              <EmployeeCard
                key={emp.id}
                emp={emp}
                onSelect={() => setSelected(emp)}
              />
            ))}
          </div>
        )}
      </div>

      {selected && (
        <EmployeeDetailModal
          emp={selected}
          tasks={selected.tasks ?? []}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
