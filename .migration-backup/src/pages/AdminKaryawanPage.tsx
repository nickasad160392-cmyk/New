import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { ArrowLeft, Search, X, Loader2, User, ChevronDown } from "lucide-react";

type SelectedUser = { id: number; name: string; email: string; jabatan?: string | null; role: string; isActive: boolean; employeeId?: string | null };

const ROLE_OPTIONS = [
  { value: "employee", label: "Karyawan" },
  { value: "hr", label: "HR" },
  { value: "admin", label: "Admin" },
];

const ROLE_BADGE: Record<string, string> = {
  admin:    "bg-[#FACC15] text-[#4A4435]",
  hr:       "bg-blue-100 text-blue-700",
  employee: "bg-gray-100 text-gray-600",
};

export default function AdminKaryawanPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<SelectedUser | null>(null);
  const [jabatan, setJabatan] = useState("");
  const [role, setRole] = useState("employee");
  const [isActive, setIsActive] = useState(true);
  const [newPassword, setNewPassword] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const { data: users, isLoading } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => api.admin.users(),
  });

  const filtered = users?.filter((u) =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    (u.employeeId ?? "").toLowerCase().includes(search.toLowerCase()),
  ) ?? [];

  const openEdit = (u: typeof filtered[0]) => {
    setSelected({ id: u.id, name: u.name, email: u.email, jabatan: u.jabatan, role: u.role, isActive: u.isActive ?? true, employeeId: u.employeeId });
    setJabatan(u.jabatan ?? "");
    setRole(u.role ?? "employee");
    setIsActive(u.isActive ?? true);
    setNewPassword("");
  };

  const handleSave = async () => {
    if (!selected) return;
    setIsSaving(true);
    try {
      await api.admin.updateUser(selected.id, { jabatan: jabatan || undefined, isActive });
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      toast.success("Data karyawan berhasil diperbarui");
      setSelected(null);
    } catch (err: any) {
      toast.error(err?.data?.error || err?.message || "Gagal memperbarui data");
    }
    setIsSaving(false);
  };

  const handleResetPassword = async () => {
    if (!selected || !newPassword) { toast.error("Masukkan kata sandi baru"); return; }
    if (newPassword.length < 6) { toast.error("Kata sandi minimal 6 karakter"); return; }
    setIsResetting(true);
    try {
      await api.admin.resetPassword(selected.id, newPassword);
      toast.success("Kata sandi berhasil direset");
      setNewPassword("");
    } catch (err: any) {
      toast.error(err?.data?.error || err?.message || "Gagal mereset kata sandi");
    }
    setIsResetting(false);
  };

  return (
    <div className="flex flex-col min-h-full">
      <div className="bg-[#FACC15] px-5 pt-12 pb-8 rounded-b-[40px]">
        <div className="flex items-center gap-3 mb-4">
          <Link href="/admin" className="w-8 h-8 rounded-full bg-[#4A4435]/10 flex items-center justify-center">
            <ArrowLeft className="w-4 h-4 text-[#4A4435]" />
          </Link>
          <div>
            <h1 className="text-xl font-extrabold text-[#4A4435]">Kelola Karyawan</h1>
            <p className="text-xs text-[#4A4435]/60">{users?.length ?? 0} karyawan terdaftar</p>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8C8573]" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama, email, atau ID..."
            className="w-full h-11 pl-9 pr-10 rounded-xl bg-white/60 border border-[#4A4435]/10 text-[#4A4435] text-sm placeholder-[#8C8573] focus:outline-none" />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="w-4 h-4 text-[#8C8573]" />
            </button>
          )}
        </div>
      </div>

      <div className="px-5 pt-5 pb-24 flex-1">
        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white rounded-2xl p-4 shadow-sm animate-pulse">
                <div className="h-4 bg-gray-100 rounded w-1/2 mb-2" />
                <div className="h-3 bg-gray-100 rounded w-1/3" />
              </div>
            ))}
          </div>
        )}
        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-12">
            <User className="w-12 h-12 text-gray-200 mx-auto mb-3" />
            <p className="text-[#8C8573] text-sm">Tidak ada karyawan ditemukan</p>
          </div>
        )}
        {!isLoading && filtered.length > 0 && (
          <div className="space-y-2">
            {filtered.map((u) => (
              <button key={u.id} onClick={() => openEdit(u)}
                className="w-full bg-white rounded-2xl px-4 py-3.5 shadow-sm flex items-center justify-between text-left active:bg-gray-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#FACC15]/30 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-[#4A4435]">{u.name.charAt(0).toUpperCase()}</span>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[#4A4435]">{u.name}</p>
                    <p className="text-xs text-[#8C8573]">{u.employeeId ? `${u.employeeId} · ` : ""}{u.jabatan || u.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!(u.isActive ?? true) && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Nonaktif</span>
                  )}
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ROLE_BADGE[u.role] ?? "bg-gray-100 text-gray-600"}`}>
                    {ROLE_OPTIONS.find((r) => r.value === u.role)?.label ?? u.role}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
          <div className="bg-white w-full max-w-[430px] rounded-t-3xl px-5 pt-5 pb-8 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-base font-bold text-[#4A4435]">{selected.name}</h2>
                <p className="text-xs text-[#8C8573]">{selected.email}</p>
              </div>
              <button onClick={() => setSelected(null)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                <X className="w-4 h-4 text-[#8C8573]" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-[#4A4435]">Jabatan</label>
                <input value={jabatan} onChange={(e) => setJabatan(e.target.value)} placeholder="cth. Staff IT, Manager HRD"
                  className="w-full h-11 px-4 rounded-xl border border-gray-200 bg-gray-50 text-[#4A4435] text-sm focus:outline-none focus:ring-2 focus:ring-[#FACC15]" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-[#4A4435]">Role</label>
                <div className="relative">
                  <select value={role} onChange={(e) => setRole(e.target.value)}
                    className="w-full h-11 px-4 pr-10 rounded-xl border border-gray-200 bg-gray-50 text-[#4A4435] text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-[#FACC15]">
                    {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8C8573] pointer-events-none" />
                </div>
              </div>
              <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
                <label className="text-sm font-semibold text-[#4A4435]">Status Aktif</label>
                <button onClick={() => setIsActive(!isActive)}
                  className={`w-12 h-6 rounded-full transition-colors relative ${isActive ? "bg-[#FACC15]" : "bg-gray-300"}`}>
                  <div className={`w-5 h-5 rounded-full bg-white shadow absolute top-0.5 transition-all ${isActive ? "left-6" : "left-0.5"}`} />
                </button>
              </div>
              <button onClick={handleSave} disabled={isSaving}
                className="w-full h-11 rounded-2xl bg-[#FACC15] text-[#4A4435] font-bold flex items-center justify-center gap-2 shadow-md disabled:opacity-60">
                {isSaving ? <><Loader2 className="w-4 h-4 animate-spin" /> Menyimpan...</> : "Simpan Perubahan"}
              </button>
              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-bold text-[#8C8573] uppercase tracking-wider mb-3">Reset Kata Sandi</p>
                <div className="flex gap-2">
                  <input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} type="password"
                    placeholder="Kata sandi baru (min. 6 karakter)"
                    className="flex-1 h-11 px-4 rounded-xl border border-gray-200 bg-gray-50 text-[#4A4435] text-sm focus:outline-none focus:ring-2 focus:ring-[#FACC15]" />
                  <button onClick={handleResetPassword} disabled={isResetting || !newPassword}
                    className="h-11 px-4 rounded-xl bg-[#4A4435] text-white text-sm font-bold disabled:opacity-40 flex items-center gap-1">
                    {isResetting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Reset"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="text-center pb-20">
        <p className="text-[10px] text-[#8C8573]/40">PT. Lembayung Wanantara Padha</p>
      </div>
    </div>
  );
}
