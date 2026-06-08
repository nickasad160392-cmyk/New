import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { format, parseISO } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { ChevronDown, Clock, Camera } from "lucide-react";

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
    } else if (i > 0) {
      startMonth = d.getMonth();
      startYear = d.getFullYear();
    }
    const start = `${startYear}-${String(startMonth + 1).padStart(2, "0")}-07`;
    const labelDate = new Date(startYear, startMonth, 7);
    const label = labelDate.toLocaleDateString("id-ID", { month: "long", year: "numeric" });
    options.push({ label, start });
  }
  const seen = new Set<string>();
  return options.filter((o) => { if (seen.has(o.start)) return false; seen.add(o.start); return true; });
}

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "--:--";
  return new Date(iso).toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hour12: false });
}

function fmtDateShort(d: string) {
  try { return format(parseISO(d), "EEE, dd MMM", { locale: localeId }); }
  catch { return d; }
}

const STATUS_MAP: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  hadir:     { label: "Hadir",     bg: "bg-green-100",  text: "text-green-700",  dot: "bg-green-500" },
  terlambat: { label: "Terlambat", bg: "bg-red-100",    text: "text-[#E57373]",  dot: "bg-[#E57373]" },
  izin:      { label: "Izin",      bg: "bg-blue-100",   text: "text-[#64B5F6]",  dot: "bg-[#64B5F6]" },
  sakit:     { label: "Sakit",     bg: "bg-blue-100",   text: "text-[#64B5F6]",  dot: "bg-[#64B5F6]" },
  alpha:     { label: "Alpha",     bg: "bg-gray-100",   text: "text-gray-500",   dot: "bg-gray-400"  },
  lembur:    { label: "Lembur",    bg: "bg-yellow-100", text: "text-yellow-600", dot: "bg-[#FACC15]" },
};

export default function RiwayatPage() {
  const cycles = getCycleOptions();
  const [selectedCycle, setSelectedCycle] = useState(cycles[0]?.start ?? "");

  const { data: history, isLoading: loadingHistory } = useQuery({
    queryKey: ["attendance", "history", selectedCycle],
    queryFn: () => api.attendance.history(selectedCycle),
    enabled: !!selectedCycle,
  });

  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ["attendance", "cycle-summary", selectedCycle],
    queryFn: () => api.attendance.cycleSummary(selectedCycle),
    enabled: !!selectedCycle,
  });

  return (
    <div className="flex flex-col min-h-full">
      <div className="bg-[#FACC15] px-5 pt-12 pb-8 rounded-b-[40px]">
        <h1 className="text-2xl font-extrabold text-[#4A4435] mb-3">Riwayat Absensi</h1>
        <div className="relative">
          <select
            value={selectedCycle}
            onChange={(e) => setSelectedCycle(e.target.value)}
            className="w-full h-11 pl-4 pr-10 rounded-xl bg-white/60 border border-[#4A4435]/10 text-[#4A4435] font-semibold text-sm appearance-none focus:outline-none"
          >
            {cycles.map((c) => <option key={c.start} value={c.start}>{c.label}</option>)}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4A4435] pointer-events-none" />
        </div>
      </div>

      <div className="px-5 pt-5 pb-24 flex-1">
        {(loadingSummary || summary) && (
          <div className="grid grid-cols-4 gap-2 mb-5">
            {[
              { label: "Hadir",     value: (summary?.presentDays ?? 0), color: "text-green-600" },
              { label: "Terlambat", value: (summary?.lateDays ?? 0),    color: "text-[#E57373]" },
              { label: "Izin",      value: (summary?.permitDays ?? 0),  color: "text-[#64B5F6]" },
              { label: "Alpha",     value: (summary?.absentDays ?? 0),  color: "text-gray-400"  },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded-xl p-2.5 shadow-sm text-center">
                {loadingSummary ? (
                  <div className="h-5 bg-gray-100 rounded animate-pulse mx-auto w-6 mb-1" />
                ) : (
                  <p className={`text-xl font-extrabold ${s.color}`}>{s.value}</p>
                )}
                <p className="text-[9px] text-[#8C8573] uppercase tracking-wider font-semibold">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {summary && (
          <div className="bg-white rounded-2xl p-4 shadow-sm mb-5 flex items-center justify-around">
            <div className="text-center">
              <p className="text-lg font-extrabold text-[#4A4435]">
                {Math.floor((summary.totalWorkMinutes ?? 0) / 60)}<span className="text-xs font-medium ml-0.5">j</span>
              </p>
              <p className="text-[10px] text-[#8C8573] uppercase tracking-wider">Jam Kerja</p>
            </div>
            <div className="w-px h-8 bg-gray-100" />
            <div className="text-center">
              <p className="text-lg font-extrabold text-[#FACC15]">
                {Math.floor((summary.totalOvertimeMinutes ?? 0) / 60)}<span className="text-xs font-medium ml-0.5">j</span>
              </p>
              <p className="text-[10px] text-[#8C8573] uppercase tracking-wider">Lembur</p>
            </div>
            <div className="w-px h-8 bg-gray-100" />
            <div className="text-center">
              <p className="text-lg font-extrabold text-[#E57373]">
                {summary.totalLatenessMinutes ?? 0}<span className="text-xs font-medium ml-0.5">m</span>
              </p>
              <p className="text-[10px] text-[#8C8573] uppercase tracking-wider">Terlambat</p>
            </div>
          </div>
        )}

        <h2 className="text-xs font-bold text-[#8C8573] uppercase tracking-widest mb-3">Catatan Harian</h2>

        {loadingHistory && (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white rounded-2xl p-4 shadow-sm animate-pulse">
                <div className="flex justify-between">
                  <div className="h-4 bg-gray-100 rounded w-1/3" />
                  <div className="h-4 bg-gray-100 rounded w-16" />
                </div>
                <div className="h-3 bg-gray-100 rounded w-1/2 mt-2" />
              </div>
            ))}
          </div>
        )}

        {!loadingHistory && (!history || history.length === 0) && (
          <div className="text-center py-10">
            <Clock className="w-12 h-12 text-gray-200 mx-auto mb-3" />
            <p className="text-[#8C8573] text-sm">Tidak ada catatan untuk siklus ini</p>
          </div>
        )}

        {!loadingHistory && history && history.length > 0 && (
          <div className="space-y-2">
            {[...history].reverse().map((r) => {
              const st = STATUS_MAP[r.status] ?? { label: r.status, bg: "bg-gray-100", text: "text-gray-600", dot: "bg-gray-400" };
              return (
                <div key={r.id} className="bg-white rounded-2xl p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${st.dot}`} />
                      <p className="text-sm font-bold text-[#4A4435]">{fmtDateShort(r.date)}</p>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${st.bg} ${st.text}`}>{st.label}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-[#8C8573]">
                    <span>Masuk: <strong className="text-[#4A4435]">{fmtTime(r.checkInTime)}</strong></span>
                    <span>Keluar: <strong className="text-[#4A4435]">{fmtTime(r.checkOutTime)}</strong></span>
                  </div>
                  {(r.latenessMinutes || r.overtimeMinutes || r.workMinutes) ? (
                    <div className="flex items-center gap-3 mt-1.5 text-[10px] text-[#8C8573]">
                      {r.workMinutes ? <span>Kerja: <strong className="text-[#4A4435]">{Math.floor(r.workMinutes / 60)}j {r.workMinutes % 60}m</strong></span> : null}
                      {r.latenessMinutes ? <span className="text-[#E57373]">+{r.latenessMinutes}m terlambat</span> : null}
                      {r.overtimeMinutes ? <span className="text-[#FACC15] font-semibold">+{Math.floor(r.overtimeMinutes / 60)}j lembur</span> : null}
                    </div>
                  ) : null}
                  {r.checkInSelfie && (
                    <details className="mt-2">
                      <summary className="text-[10px] text-[#8C8573] cursor-pointer flex items-center gap-1">
                        <Camera className="w-3 h-3" /> Lihat foto
                      </summary>
                      <img src={`data:image/jpeg;base64,${r.checkInSelfie}`} alt="Selfie" className="w-16 h-16 rounded-lg object-cover mt-1 scale-x-[-1]" />
                    </details>
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
