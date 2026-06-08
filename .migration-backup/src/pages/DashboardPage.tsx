import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { LogOut, Bell, Camera, ChevronRight } from "lucide-react";

function getCurrentCycleStart(): string {
  const now = new Date();
  const jakartaStr = now.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
  const [year, month, day] = jakartaStr.split("-").map(Number) as [number, number, number];
  let startMonth = month - 1;
  let startYear = year;
  if (day < 7) {
    startMonth -= 1;
    if (startMonth < 0) { startMonth = 11; startYear -= 1; }
  }
  return `${startYear}-${String(startMonth + 1).padStart(2, "0")}-07`;
}

function formatTime(d: Date) {
  return d.toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

function formatDate(d: Date) {
  return d.toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta", weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "--:--";
  return new Date(iso).toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hour12: false });
}

const STATUS_MAP: Record<string, { label: string; bg: string; text: string }> = {
  hadir:    { label: "Hadir",    bg: "bg-green-100",  text: "text-green-700" },
  terlambat:{ label: "Terlambat",bg: "bg-red-100",    text: "text-[#E57373]" },
  izin:     { label: "Izin",     bg: "bg-blue-100",   text: "text-[#64B5F6]" },
  sakit:    { label: "Sakit",    bg: "bg-blue-100",   text: "text-[#64B5F6]" },
  alpha:    { label: "Alpha",    bg: "bg-gray-100",   text: "text-gray-500"  },
  lembur:   { label: "Lembur",   bg: "bg-yellow-100", text: "text-[#FACC15]" },
};

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();
  const [now, setNow] = useState(new Date());
  const cycleStart = getCurrentCycleStart();

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const { data: today, isLoading: loadingToday } = useQuery({
    queryKey: ["attendance", "today"],
    queryFn: () => api.attendance.today(),
  });

  const { data: cycle, isLoading: loadingCycle } = useQuery({
    queryKey: ["attendance", "cycle-summary", cycleStart],
    queryFn: () => api.attendance.cycleSummary(cycleStart),
  });

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const hasCheckedIn = !!today?.checkInTime;
  const hasCheckedOut = !!today?.checkOutTime;
  const status = today?.status;
  const statusInfo = status ? STATUS_MAP[status] : null;

  const metrics = [
    { label: "JAM KERJA", value: cycle ? Math.floor((cycle.totalWorkMinutes ?? 0) / 60) : "--", unit: "jam", color: "text-[#4A4435]" },
    { label: "LEMBUR", value: cycle ? Math.floor((cycle.totalOvertimeMinutes ?? 0) / 60) : "--", unit: "jam", color: "text-[#FACC15]" },
    { label: "TERLAMBAT", value: cycle ? (cycle.totalLatenessMinutes ?? 0) : "--", unit: "mnt", color: "text-[#E57373]" },
    { label: "IZIN", value: cycle ? (cycle.permitDays ?? 0) : "--", unit: "hari", color: "text-[#64B5F6]" },
  ];

  return (
    <div className="flex flex-col min-h-full">
      <div className="bg-[#FACC15] px-5 pt-12 pb-10 rounded-b-[48px] relative z-10 shadow-md">
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="text-[#4A4435]/60 text-xs font-medium uppercase tracking-widest">Selamat Datang</p>
            <h2 className="text-[#4A4435] text-xl font-extrabold leading-tight mt-0.5">
              {user?.name ?? "Karyawan"}
            </h2>
            <p className="text-[#4A4435]/70 text-xs mt-0.5">
              {user?.jabatan || user?.position || "Karyawan"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {(user?.role === "admin" || user?.role === "hr") && (
              <Link href="/admin" className="w-8 h-8 rounded-full bg-[#4A4435]/10 flex items-center justify-center">
                <Bell className="w-4 h-4 text-[#4A4435]" />
              </Link>
            )}
            <button onClick={handleLogout} className="w-8 h-8 rounded-full bg-[#4A4435]/10 flex items-center justify-center">
              <LogOut className="w-4 h-4 text-[#4A4435]" />
            </button>
          </div>
        </div>

        <div className="text-center">
          <div className="text-[#4A4435] text-5xl font-extrabold tabular-nums tracking-tight">
            {formatTime(now)}
          </div>
          <p className="text-[#4A4435]/70 text-xs mt-1.5 font-medium">{formatDate(now)}</p>
        </div>

        <div className="mt-4 bg-white/40 backdrop-blur-sm rounded-2xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex flex-col">
              <span className="text-[10px] text-[#4A4435]/60 uppercase tracking-wider font-medium">Masuk</span>
              <span className="text-[#4A4435] font-bold text-lg">{fmtTime(today?.checkInTime)}</span>
            </div>
            <div className="w-px h-8 bg-[#4A4435]/20" />
            <div className="flex flex-col">
              <span className="text-[10px] text-[#4A4435]/60 uppercase tracking-wider font-medium">Keluar</span>
              <span className="text-[#4A4435] font-bold text-lg">{fmtTime(today?.checkOutTime)}</span>
            </div>
          </div>
          {statusInfo && (
            <span className={`text-xs font-bold px-3 py-1 rounded-full ${statusInfo.bg} ${statusInfo.text}`}>
              {statusInfo.label}
            </span>
          )}
          {!status && !loadingToday && (
            <span className="text-xs font-medium text-[#8C8573] bg-gray-100 px-3 py-1 rounded-full">Belum Absen</span>
          )}
        </div>
      </div>

      <div className="px-5 pt-6 flex-1">
        {cycle && (
          <p className="text-xs text-[#8C8573] uppercase tracking-widest font-semibold mb-4">
            Siklus {cycle.cycleLabel}
          </p>
        )}

        <div className="grid grid-cols-2 gap-4 mb-6">
          {metrics.map((m) => (
            <div key={m.label} className="flex flex-col items-center">
              <div className="w-20 h-20 rounded-full bg-white shadow-md flex flex-col items-center justify-center">
                {loadingCycle ? (
                  <div className="w-8 h-4 bg-gray-100 rounded animate-pulse" />
                ) : (
                  <>
                    <span className={`text-2xl font-extrabold ${m.color}`}>{m.value}</span>
                    <span className="text-[10px] text-[#8C8573] font-medium">{m.unit}</span>
                  </>
                )}
              </div>
              <p className="text-[10px] text-[#8C8573] uppercase tracking-widest font-semibold mt-2">{m.label}</p>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <Link href="/riwayat" className="flex items-center justify-between bg-white rounded-2xl px-4 py-3.5 shadow-sm">
            <div>
              <p className="text-sm font-semibold text-[#4A4435]">Riwayat Absensi</p>
              <p className="text-xs text-[#8C8573]">Lihat catatan kehadiran Anda</p>
            </div>
            <ChevronRight className="w-5 h-5 text-[#8C8573]" />
          </Link>
          <Link href="/izin" className="flex items-center justify-between bg-white rounded-2xl px-4 py-3.5 shadow-sm">
            <div>
              <p className="text-sm font-semibold text-[#4A4435]">Pengajuan Izin</p>
              <p className="text-xs text-[#8C8573]">Ajukan atau cek status izin Anda</p>
            </div>
            <ChevronRight className="w-5 h-5 text-[#8C8573]" />
          </Link>
        </div>
      </div>

      <div className="sticky bottom-20 px-5 pb-4 pt-2 bg-gradient-to-t from-[#FBF9F3] to-transparent pointer-events-none">
        <Link
          href="/absen"
          className="pointer-events-auto flex items-center justify-center gap-2.5 w-full h-14 rounded-2xl bg-[#FACC15] text-[#4A4435] font-bold text-base shadow-lg active:scale-[0.98] transition-transform"
        >
          <Camera className="w-5 h-5" />
          {hasCheckedOut ? "✅ Absensi Selesai Hari Ini" : hasCheckedIn ? "📸 PINDAI WAJAH & KELUAR" : "📸 PINDAI WAJAH & MASUK"}
        </Link>
      </div>

      <div className="pb-24 text-center">
        <p className="text-[10px] text-[#8C8573]/40">PT. Lembayung Wanantara Padha</p>
      </div>
    </div>
  );
}
