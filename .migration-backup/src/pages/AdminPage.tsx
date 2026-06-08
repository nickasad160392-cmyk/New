import { useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Users, FileText, BarChart2, UserCheck, Clock, AlertTriangle, ChevronRight } from "lucide-react";

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

export default function AdminPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (user && user.role !== "admin" && user.role !== "hr") {
      navigate("/dashboard");
    }
  }, [user, navigate]);

  const { data: todayData, isLoading: loadingToday } = useQuery({
    queryKey: ["admin", "attendance", "today"],
    queryFn: () => api.admin.attendanceToday(),
  });

  const { data: pendingLeaves } = useQuery({
    queryKey: ["admin", "leave", "pending"],
    queryFn: () => api.admin.leave("pending"),
  });

  const records   = todayData?.records ?? [];
  const hadir     = records.filter((r) => r.status === "hadir" || r.status === "terlambat" || r.status === "lembur").length;
  const alpha     = records.filter((r) => r.status === "alpha").length;
  const izin      = records.filter((r) => r.status === "izin" || r.status === "sakit").length;
  const pending   = pendingLeaves?.length ?? 0;

  const quickStats = [
    { label: "Total Hadir",  value: hadir,   icon: UserCheck,    color: "text-green-600",  bg: "bg-green-100" },
    { label: "Alpha",        value: alpha,   icon: AlertTriangle, color: "text-[#E57373]", bg: "bg-red-100"   },
    { label: "Izin/Sakit",  value: izin,    icon: Clock,         color: "text-[#64B5F6]", bg: "bg-blue-100"  },
    { label: "Izin Pending", value: pending, icon: FileText,      color: "text-[#FACC15]", bg: "bg-yellow-100"},
  ];

  const menuItems = [
    { name: "Kelola Karyawan",  description: "Lihat dan ubah data karyawan",   href: "/admin/karyawan", icon: Users    },
    { name: "Persetujuan Izin", description: `${pending} pengajuan menunggu`,   href: "/admin/izin",     icon: FileText },
    { name: "Rekap Absensi",    description: "Rekap kehadiran per siklus",      href: "/admin/rekap",    icon: BarChart2},
  ];

  if (user?.role !== "admin" && user?.role !== "hr") return null;

  return (
    <div className="flex flex-col min-h-full">
      <div className="bg-[#FACC15] px-5 pt-12 pb-10 rounded-b-[40px]">
        <div className="mb-1">
          <p className="text-[#4A4435]/60 text-xs font-medium uppercase tracking-widest">Panel Admin</p>
          <h1 className="text-2xl font-extrabold text-[#4A4435]">Dasbor Manajemen</h1>
        </div>
        <p className="text-[#4A4435]/60 text-xs mt-1">
          {new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </p>
        <div className="grid grid-cols-2 gap-3 mt-4">
          {quickStats.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="bg-white/60 rounded-2xl p-3 flex items-center gap-3">
                <div className={`w-8 h-8 rounded-xl ${s.bg} flex items-center justify-center flex-shrink-0`}>
                  <Icon className={`w-4 h-4 ${s.color}`} />
                </div>
                <div>
                  <p className={`text-xl font-extrabold ${s.color}`}>{loadingToday ? "—" : s.value}</p>
                  <p className="text-[10px] text-[#4A4435]/60 leading-tight">{s.label}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="px-5 pt-5 pb-24 flex-1">
        <h2 className="text-xs font-bold text-[#8C8573] uppercase tracking-widest mb-3">Menu Manajemen</h2>
        <div className="space-y-3 mb-6">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.name} href={item.href}
                className="flex items-center justify-between bg-white rounded-2xl px-4 py-4 shadow-sm active:bg-gray-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#FACC15]/20 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-[#4A4435]" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[#4A4435]">{item.name}</p>
                    <p className="text-xs text-[#8C8573]">{item.description}</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-[#8C8573]" />
              </Link>
            );
          })}
        </div>

        <h2 className="text-xs font-bold text-[#8C8573] uppercase tracking-widest mb-3">Kehadiran Hari Ini</h2>
        {loadingToday && (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-2xl p-3 shadow-sm animate-pulse">
                <div className="h-4 bg-gray-100 rounded w-1/2" />
              </div>
            ))}
          </div>
        )}
        {!loadingToday && records.length > 0 && (
          <div className="space-y-2">
            {records.slice(0, 5).map((r) => {
              const st = STATUS_MAP[r.status] ?? { label: r.status, dot: "bg-gray-400" };
              return (
                <div key={r.id} className="bg-white rounded-2xl px-4 py-3 shadow-sm flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-2 h-2 rounded-full ${st.dot}`} />
                    <div>
                      <p className="text-sm font-semibold text-[#4A4435]">{r.user?.name ?? `User ${r.userId}`}</p>
                      <p className="text-xs text-[#8C8573]">Masuk: {fmtTime(r.checkInTime)}</p>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-[#4A4435]">{st.label}</span>
                </div>
              );
            })}
            {records.length > 5 && (
              <Link href="/admin/rekap" className="block text-center text-sm text-[#4A4435] font-semibold py-2 underline">
                Lihat semua ({records.length}) →
              </Link>
            )}
          </div>
        )}
        {!loadingToday && (!todayData || records.length === 0) && (
          <div className="text-center py-6">
            <p className="text-[#8C8573] text-sm">Belum ada data kehadiran hari ini</p>
          </div>
        )}
      </div>

      <div className="text-center pb-20">
        <p className="text-[10px] text-[#8C8573]/40">PT. Lembayung Wanantara Padha</p>
      </div>
    </div>
  );
}
