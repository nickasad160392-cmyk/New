import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ArrowLeft, ChevronDown, Download, BarChart2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { id as localeId } from "date-fns/locale";

function getCycleOptions(): Array<{ label: string; start: string }> {
  const options = [];
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const day = i === 0 ? now.getDate() : 32;
    let startMonth = d.getMonth();
    let startYear = d.getFullYear();
    if (day < 7 && i === 0) {
      startMonth -= 1;
      if (startMonth < 0) { startMonth = 11; startYear -= 1; }
    }
    const start = `${startYear}-${String(startMonth + 1).padStart(2, "0")}-07`;
    const labelDate = new Date(startYear, startMonth, 7);
    const label = labelDate.toLocaleDateString("id-ID", { month: "long", year: "numeric" });
    options.push({ label, start });
  }
  const seen = new Set<string>();
  return options.filter((o) => { if (seen.has(o.start)) return false; seen.add(o.start); return true; });
}

const STATUS_MAP: Record<string, { label: string; dot: string }> = {
  hadir:     { label: "Hadir",     dot: "bg-green-500" },
  terlambat: { label: "Terlambat", dot: "bg-[#E57373]" },
  izin:      { label: "Izin",      dot: "bg-[#64B5F6]" },
  sakit:     { label: "Sakit",     dot: "bg-[#64B5F6]" },
  alpha:     { label: "Alpha",     dot: "bg-gray-400"  },
  lembur:    { label: "Lembur",    dot: "bg-[#FACC15]" },
};

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "--:--";
  return new Date(iso).toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hour12: false });
}

function fmtDateShort(d: string) {
  try { return format(parseISO(d), "dd/MM", { locale: localeId }); }
  catch { return d; }
}

function exportCSV(data: any[], cycleLabel: string) {
  const header = ["Nama", "ID", "Jabatan", "Tanggal", "Status", "Masuk", "Keluar", "Menit Kerja", "Menit Lembur", "Menit Terlambat"];
  const rows = data.map((r) => [
    r.user?.name ?? "", r.user?.employeeId || "", r.user?.jabatan || "",
    r.date, r.status,
    r.checkInTime ? fmtTime(r.checkInTime) : "",
    r.checkOutTime ? fmtTime(r.checkOutTime) : "",
    r.workMinutes ?? 0, r.overtimeMinutes ?? 0, r.latenessMinutes ?? 0,
  ]);
  const csv = [header, ...rows].map((row) => row.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `rekap-absensi-${cycleLabel.replace(/\s+/g, "-")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminRekapPage() {
  const cycles = getCycleOptions();
  const [selectedCycle, setSelectedCycle] = useState(cycles[0]?.start ?? "");
  const [search, setSearch] = useState("");
  const [expandedUser, setExpandedUser] = useState<number | null>(null);

  const { data: records, isLoading } = useQuery({
    queryKey: ["admin", "attendance", selectedCycle],
    queryFn: () => api.admin.attendance(selectedCycle),
    enabled: !!selectedCycle,
  });

  const cycleLabel = cycles.find((c) => c.start === selectedCycle)?.label ?? selectedCycle;

  const grouped = (records ?? []).reduce<Record<number, { userName: string; employeeId: string; jabatan: string; records: typeof records }>>((acc, r) => {
    if (!acc[r.userId]) {
      acc[r.userId] = { userName: r.user?.name ?? `User ${r.userId}`, employeeId: r.user?.employeeId || "", jabatan: r.user?.jabatan || "", records: [] };
    }
    acc[r.userId]!.records!.push(r);
    return acc;
  }, {});

  const filteredGroups = Object.entries(grouped).filter(([_, g]) =>
    !search || g.userName.toLowerCase().includes(search.toLowerCase()) || g.employeeId.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="flex flex-col min-h-full">
      <div className="bg-[#FACC15] px-5 pt-12 pb-8 rounded-b-[40px]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="w-8 h-8 rounded-full bg-[#4A4435]/10 flex items-center justify-center">
              <ArrowLeft className="w-4 h-4 text-[#4A4435]" />
            </Link>
            <div>
              <h1 className="text-xl font-extrabold text-[#4A4435]">Rekap Absensi</h1>
              <p className="text-xs text-[#4A4435]/60">{records?.length ?? 0} catatan</p>
            </div>
          </div>
          {records && records.length > 0 && (
            <button onClick={() => exportCSV(records, cycleLabel)}
              className="flex items-center gap-1.5 bg-[#4A4435] text-[#FACC15] text-xs font-bold px-3 py-2 rounded-xl">
              <Download className="w-3.5 h-3.5" />
              Ekspor
            </button>
          )}
        </div>
        <div className="relative mb-3">
          <select value={selectedCycle} onChange={(e) => setSelectedCycle(e.target.value)}
            className="w-full h-11 pl-4 pr-10 rounded-xl bg-white/60 border border-[#4A4435]/10 text-[#4A4435] font-semibold text-sm appearance-none focus:outline-none">
            {cycles.map((c) => <option key={c.start} value={c.start}>{c.label}</option>)}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4A4435] pointer-events-none" />
        </div>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama atau ID karyawan..."
          className="w-full h-10 px-4 rounded-xl bg-white/60 border border-[#4A4435]/10 text-[#4A4435] text-sm placeholder-[#8C8573] focus:outline-none" />
      </div>

      <div className="px-5 pt-5 pb-24 flex-1">
        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-2xl p-4 shadow-sm animate-pulse">
                <div className="h-4 bg-gray-100 rounded w-1/3 mb-2" />
                <div className="h-3 bg-gray-100 rounded w-1/2" />
              </div>
            ))}
          </div>
        )}
        {!isLoading && filteredGroups.length === 0 && (
          <div className="text-center py-12">
            <BarChart2 className="w-12 h-12 text-gray-200 mx-auto mb-3" />
            <p className="text-[#8C8573] text-sm">Tidak ada data rekap</p>
          </div>
        )}
        {!isLoading && filteredGroups.length > 0 && (
          <div className="space-y-3">
            {filteredGroups.map(([userId, g]) => {
              const uId = Number(userId);
              const isExpanded = expandedUser === uId;
              const recs = g.records ?? [];
              const hadir = recs.filter((r) => r.status === "hadir" || r.status === "terlambat" || r.status === "lembur").length;
              const alpha = recs.filter((r) => r.status === "alpha").length;
              const totalWork = recs.reduce((s, r) => s + (r.workMinutes ?? 0), 0);
              return (
                <div key={userId} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                  <button onClick={() => setExpandedUser(isExpanded ? null : uId)}
                    className="w-full px-4 py-3.5 flex items-center justify-between text-left">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-[#FACC15]/30 flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-bold text-[#4A4435]">{g.userName.charAt(0)}</span>
                      </div>
                      <div>
                        <p className="text-sm font-bold text-[#4A4435]">{g.userName}</p>
                        <p className="text-xs text-[#8C8573]">
                          {g.jabatan || g.employeeId}
                          <span className="ml-1 text-[#4A4435] font-semibold">· {hadir} hadir, {alpha} alpha</span>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[#8C8573]">{Math.floor(totalWork / 60)}j</span>
                      <ChevronDown className={`w-4 h-4 text-[#8C8573] transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="px-4 pb-3 border-t border-gray-50">
                      <div className="mt-3 space-y-1.5">
                        {[...recs].reverse().map((r) => {
                          const st = STATUS_MAP[r.status] ?? { label: r.status, dot: "bg-gray-400" };
                          return (
                            <div key={r.id} className="flex items-center justify-between text-xs py-1">
                              <div className="flex items-center gap-2">
                                <div className={`w-1.5 h-1.5 rounded-full ${st.dot} flex-shrink-0`} />
                                <span className="text-[#4A4435] font-medium w-12">{fmtDateShort(r.date)}</span>
                                <span className="text-[#8C8573]">{fmtTime(r.checkInTime)} – {fmtTime(r.checkOutTime)}</span>
                              </div>
                              <span className="text-[#4A4435] font-semibold">{st.label}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="text-center pb-20">
        <p className="text-[10px] text-[#8C8573]/40">PT. Lembayung Wanantara Padha</p>
      </div>
    </div>
  );
}
