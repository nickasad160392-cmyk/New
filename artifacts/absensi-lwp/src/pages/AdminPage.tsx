import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Users, FileText, BarChart2, UserCheck, Clock, AlertTriangle, ChevronRight, BookOpen, Trash2, ShieldAlert } from "lucide-react";

const STATUS_MAP: Record<string, { label: string; dot: string }> = {
  hadir:     { label: "Hadir",     dot: "bg-green-500"  },
  terlambat: { label: "Terlambat", dot: "bg-[#E57373]"  },
  izin:      { label: "Izin",      dot: "bg-[#64B5F6]"  },
  sakit:     { label: "Sakit",     dot: "bg-[#64B5F6]"  },
  alpha:     { label: "Alpha",     dot: "bg-gray-400"   },
  lembur:    { label: "Lembur",    dot: "bg-[#FACC15]"  },
};

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "--:--";
  return new Date(iso).toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hour12: false });
}

export default function AdminPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [resetConfirm, setResetConfirm]       = useState<"" | "attendance" | "all">("");
  const [resetting, setResetting]             = useState(false);

  useEffect(() => {
    if (user && user.role !== "admin" && user.role !== "hr") navigate("/dashboard");
  }, [user, navigate]);

  const { data: todayData, isLoading: loadingToday } = useQuery({
    queryKey: ["admin", "attendance", "today"],
    queryFn: () => api.admin.attendanceToday(),
  });
  const { data: pendingLeaves } = useQuery({
    queryKey: ["admin", "leave", "pending"],
    queryFn: () => api.admin.leave("pending"),
  });

  const records  = todayData?.records ?? [];
  const hadir    = records.filter((r) => ["hadir", "terlambat", "lembur"].includes(r.status)).length;
  const alpha    = records.filter((r) => r.status === "alpha").length;
  const izin     = records.filter((r) => ["izin", "sakit"].includes(r.status)).length;
  const pending  = pendingLeaves?.length ?? 0;

  const quickStats = [
    { label: "Total Hadir",  value: hadir,   icon: UserCheck,     color: "text-green-600",  bg: "bg-green-100"  },
    { label: "Alpha",        value: alpha,   icon: AlertTriangle, color: "text-[#E57373]",  bg: "bg-red-100"    },
    { label: "Izin/Sakit",   value: izin,    icon: Clock,         color: "text-[#64B5F6]",  bg: "bg-blue-100"   },
    { label: "Izin Pending", value: pending, icon: FileText,      color: "text-[#FACC15]",  bg: "bg-yellow-100" },
  ];

  const menuItems = [
    { name: "Kelola Karyawan",    description: "Ubah nama, jabatan, status & role",    href: "/admin/karyawan",  icon: Users    },
    { name: "Direktori Karyawan", description: "Info + agenda harian seluruh karyawan", href: "/admin/direktori", icon: BookOpen },
    { name: "Persetujuan Izin",   description: `${pending} pengajuan menunggu`,          href: "/admin/izin",      icon: FileText },
    { name: "Rekap Absensi",      description: "Rekap kehadiran + unduh PDF per siklus", href: "/admin/rekap",     icon: BarChart2},
  ];

  const handleReset = async (type: "attendance" | "all") => {
    if (resetConfirm !== type) { setResetConfirm(type); return; }
    setResetting(true);
    try {
      const r = type === "all" ? await api.admin.resetAllData() : await api.admin.resetAttendance();
      toast_ok("✅ " + r.message);
      setResetConfirm("");
      window.location.reload();
    } catch (err: any) {
      alert("❌ " + (err?.data?.error || "Gagal mereset data"));
    } finally { setResetting(false); }
  };

  function toast_ok(msg: string) { alert(msg); }

  if (user?.role !== "admin" && user?.role !== "hr") return null;

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <div className="bg-[#FACC15] px-5 pt-12 pb-10 rounded-b-[40px]">
        <div className="mb-1">
          <p className="text-[#4A4435]/60 text-xs font-medium uppercase tracking-widest">
            {user.role === "hr" ? "Panel HRD" : "Panel Admin"}
          </p>
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
        {/* Menu */}
        <h2 className="text-xs font-bold text-[#8C8573] uppercase tracking-widest mb-3">Menu Manajemen</h2>
        <div className="space-y-3 mb-6">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.name} href={item.href}
                className="flex items-center justify-between bg-white rounded-2xl px-4 py-4 shadow-sm active:bg-gray-50 transition-colors"
              >
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

        {/* Today's attendance preview */}
        <h2 className="text-xs font-bold text-[#8C8573] uppercase tracking-widest mb-3">Kehadiran Hari Ini</h2>
        {loadingToday && (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-2xl p-3 shadow-sm animate-pulse h-12" />
            ))}
          </div>
        )}
        {!loadingToday && records.length > 0 && (
          <div className="space-y-2">
            {records.slice(0, 5).map((r) => {
              const st = STATUS_MAP[r.status] ?? { label: r.status, dot: "bg-gray-400" };
              const photo = (r.user as any)?.profilePhoto;
              return (
                <div key={r.id} className="bg-white rounded-2xl px-4 py-3 shadow-sm flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    {photo ? (
                      <div className="w-8 h-8 rounded-full overflow-hidden border border-[#FACC15]/40 flex-shrink-0">
                        <img src={`data:image/jpeg;base64,${photo}`} alt="" className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${st.dot}`} />
                    )}
                    <div>
                      <p className="text-sm font-semibold text-[#4A4435]">{r.user?.name ?? `User ${r.userId}`}</p>
                      <p className="text-xs text-[#8C8573]">Masuk: {fmtTime(r.checkInTime)}</p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    r.status === "hadir" ? "bg-green-100 text-green-700" :
                    r.status === "terlambat" ? "bg-red-100 text-red-600" :
                    r.status === "alpha" ? "bg-gray-100 text-gray-500" :
                    "bg-blue-100 text-blue-600"
                  }`}>{st.label}</span>
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
        {!loadingToday && records.length === 0 && (
          <div className="text-center py-6">
            <p className="text-[#8C8573] text-sm">Belum ada data kehadiran hari ini</p>
          </div>
        )}

        {/* Danger Zone */}
        {user.role === "admin" && (
          <div className="mt-8 border-t border-red-100 pt-6">
            <h2 className="text-xs font-bold text-red-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5" /> Zona Bahaya — Hanya Admin
            </h2>
            <div className="bg-red-50 rounded-2xl px-4 py-4 space-y-4">

              {/* Reset Attendance */}
              <div>
                <p className="text-sm font-bold text-red-700 mb-0.5">Reset Riwayat Absensi</p>
                <p className="text-xs text-red-400 mb-2">Hapus seluruh data absensi. Tidak dapat dibatalkan.</p>
                {resetConfirm === "attendance" && (
                  <div className="bg-red-100 rounded-xl px-3 py-2 mb-2 text-xs text-red-700 font-semibold">
                    ⚠️ Tekan sekali lagi untuk konfirmasi.
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleReset("attendance")}
                    disabled={resetting}
                    className={`flex-1 h-10 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5 transition-colors ${
                      resetConfirm === "attendance" ? "bg-red-600 text-white" : "bg-white border-2 border-red-300 text-red-500"
                    } disabled:opacity-50`}
                  >
                    <Trash2 className="w-4 h-4" />
                    {resetting && resetConfirm === "attendance" ? "Menghapus..." : resetConfirm === "attendance" ? "⚠️ Konfirmasi" : "Reset Absensi"}
                  </button>
                  {resetConfirm === "attendance" && (
                    <button onClick={() => setResetConfirm("")} className="h-10 px-3 rounded-xl text-xs text-[#8C8573] bg-white border border-gray-200">
                      Batal
                    </button>
                  )}
                </div>
              </div>

              <div className="border-t border-red-100" />

              {/* Reset All Data */}
              <div>
                <p className="text-sm font-bold text-red-700 mb-0.5">Reset Semua Data</p>
                <p className="text-xs text-red-400 mb-2">Hapus SELURUH data: absensi + pengajuan izin. Tidak dapat dibatalkan.</p>
                {resetConfirm === "all" && (
                  <div className="bg-red-100 rounded-xl px-3 py-2 mb-2 text-xs text-red-700 font-semibold">
                    ⚠️ PERHATIAN: Semua data akan dihapus permanen!
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleReset("all")}
                    disabled={resetting}
                    className={`flex-1 h-10 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5 transition-colors ${
                      resetConfirm === "all" ? "bg-red-700 text-white" : "bg-red-50 border-2 border-red-400 text-red-600"
                    } disabled:opacity-50`}
                  >
                    <ShieldAlert className="w-4 h-4" />
                    {resetting && resetConfirm === "all" ? "Menghapus..." : resetConfirm === "all" ? "⚠️ Konfirmasi Reset Semua" : "Reset Semua Data"}
                  </button>
                  {resetConfirm === "all" && (
                    <button onClick={() => setResetConfirm("")} className="h-10 px-3 rounded-xl text-xs text-[#8C8573] bg-white border border-gray-200">
                      Batal
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="text-center pb-20">
        <p className="text-[10px] text-[#8C8573]/40">PT. Lembayung Wanantara Padha</p>
      </div>
    </div>
  );
}
