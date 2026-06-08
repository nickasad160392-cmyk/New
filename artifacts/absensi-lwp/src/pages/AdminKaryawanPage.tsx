import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { ArrowLeft, Search, X, Loader2, User, ChevronDown, Camera, Trash2, Shield, Users } from "lucide-react";
import type { UserProfile } from "@/lib/api";

type SelectedUser = UserProfile & { profilePhoto?: string | null };

const ROLE_OPTIONS = [
  { value: "employee", label: "Karyawan" },
  { value: "hr",       label: "HRD" },
  { value: "admin",    label: "Admin" },
];

const ROLE_BADGE: Record<string, string> = {
  admin:    "bg-[#FACC15] text-[#4A4435]",
  hr:       "bg-blue-100 text-blue-700",
  employee: "bg-gray-100 text-gray-600",
};

const ROLE_LABEL: Record<string, string> = {
  admin:    "Admin",
  hr:       "HRD",
  employee: "Karyawan",
};

function Avatar({ photo, name, size = "md" }: { photo?: string | null; name: string; size?: "sm" | "md" | "lg" }) {
  const cls = size === "sm" ? "w-10 h-10 text-sm" : size === "lg" ? "w-20 h-20 text-2xl" : "w-12 h-12 text-base";
  if (photo) {
    return (
      <div className={`${cls} rounded-full overflow-hidden flex-shrink-0 border-2 border-[#FACC15]/40`}>
        <img src={`data:image/jpeg;base64,${photo}`} alt={name} className="w-full h-full object-cover" />
      </div>
    );
  }
  return (
    <div className={`${cls} rounded-full bg-[#FACC15]/30 flex items-center justify-center flex-shrink-0`}>
      <span className="font-bold text-[#4A4435]">{name.charAt(0).toUpperCase()}</span>
    </div>
  );
}

export default function AdminKaryawanPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<SelectedUser | null>(null);
  const [name, setName] = useState("");
  const [jabatan, setJabatan] = useState("");
  const [role, setRole] = useState("employee");
  const [isActive, setIsActive] = useState(true);
  const [newPassword, setNewPassword] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [deletePhotoLoading, setDeletePhotoLoading] = useState(false);
  const [filterRole, setFilterRole] = useState<string>("all");

  const { data: users, isLoading } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => api.admin.users(),
  });

  const filtered = (users ?? []).filter((u) => {
    const matchSearch =
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      (u.employeeId ?? "").toLowerCase().includes(search.toLowerCase());
    const matchRole = filterRole === "all" || u.role === filterRole;
    return matchSearch && matchRole;
  });

  const openEdit = (u: SelectedUser) => {
    setSelected(u);
    setName(u.name ?? "");
    setJabatan(u.jabatan ?? "");
    setRole(u.role ?? "employee");
    setIsActive(u.isActive ?? true);
    setNewPassword("");
  };

  const handleSave = async () => {
    if (!selected) return;
    if (!name.trim()) { toast.error("Nama tidak boleh kosong"); return; }
    setIsSaving(true);
    try {
      await api.admin.updateUser(selected.id, { name: name.trim(), jabatan: jabatan || undefined, role, isActive });
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

  const activeCount = (users ?? []).filter((u) => u.isActive !== false).length;
  const adminCount  = (users ?? []).filter((u) => u.role === "admin" || u.role === "hr").length;

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <div className="bg-[#FACC15] px-5 pt-12 pb-5 rounded-b-[40px]">
        <div className="flex items-center gap-3 mb-4">
          <Link href="/admin" className="w-8 h-8 rounded-full bg-[#4A4435]/10 flex items-center justify-center">
            <ArrowLeft className="w-4 h-4 text-[#4A4435]" />
          </Link>
          <div>
            <h1 className="text-xl font-extrabold text-[#4A4435]">Kelola Karyawan</h1>
            <p className="text-xs text-[#4A4435]/60">{users?.length ?? 0} karyawan terdaftar · {activeCount} aktif</p>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          {[
            { label: "Total", value: users?.length ?? 0, icon: Users },
            { label: "Aktif", value: activeCount, icon: User },
            { label: "Admin/HRD", value: adminCount, icon: Shield },
          ].map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="bg-white/50 rounded-xl py-2 px-3 text-center">
                <p className="text-lg font-extrabold text-[#4A4435]">{s.value}</p>
                <p className="text-[10px] text-[#4A4435]/60">{s.label}</p>
              </div>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative mb-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8C8573]" />
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama, email, atau ID..."
            className="w-full h-11 pl-9 pr-10 rounded-xl bg-white/60 border border-[#4A4435]/10 text-[#4A4435] text-sm placeholder-[#8C8573] focus:outline-none"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="w-4 h-4 text-[#8C8573]" />
            </button>
          )}
        </div>

        {/* Role filter */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          {[{ value: "all", label: "Semua" }, ...ROLE_OPTIONS].map((opt) => (
            <button
              key={opt.value}
              onClick={() => setFilterRole(opt.value)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
                filterRole === opt.value
                  ? "bg-[#4A4435] text-white"
                  : "bg-white/50 text-[#4A4435]"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="px-5 pt-5 pb-24 flex-1">
        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white rounded-2xl p-4 shadow-sm animate-pulse h-16" />
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
              <button
                key={u.id} onClick={() => openEdit(u as SelectedUser)}
                className="w-full bg-white rounded-2xl px-4 py-3.5 shadow-sm flex items-center justify-between text-left active:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Avatar photo={(u as SelectedUser).profilePhoto} name={u.name} size="sm" />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-bold text-[#4A4435]">{u.name}</p>
                      {!(u.isActive ?? true) && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-500">Nonaktif</span>
                      )}
                    </div>
                    <p className="text-xs text-[#8C8573]">{u.jabatan || u.email}</p>
                  </div>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ROLE_BADGE[u.role] ?? "bg-gray-100 text-gray-600"}`}>
                  {ROLE_LABEL[u.role] ?? u.role}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={(e) => { if (e.target === e.currentTarget) setSelected(null); }}>
          <div className="bg-white w-full max-w-[430px] rounded-t-3xl px-5 pt-5 pb-8 max-h-[92vh] overflow-y-auto">

            {/* Profile photo + name */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <Avatar photo={selected.profilePhoto} name={selected.name} size="md" />
                <div>
                  <h2 className="text-base font-bold text-[#4A4435]">{selected.name}</h2>
                  <p className="text-xs text-[#8C8573]">{selected.email}</p>
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                <X className="w-4 h-4 text-[#8C8573]" />
              </button>
            </div>

            {/* Photo actions */}
            {selected.profilePhoto && (
              <div className="bg-gray-50 rounded-2xl p-3 mb-4">
                <p className="text-xs font-bold text-[#8C8573] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5" /> Foto Profil
                </p>
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded-xl overflow-hidden border border-gray-200">
                    <img src={`data:image/jpeg;base64,${selected.profilePhoto}`} alt="foto" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-[#8C8573] mb-2">Foto terdaftar (dipakai untuk absensi & peta)</p>
                    <button
                      onClick={async () => {
                        if (!confirm("Hapus foto profil karyawan ini?")) return;
                        setDeletePhotoLoading(true);
                        try {
                          toast.info("Fitur hapus foto hanya tersedia dari akun karyawan sendiri.");
                        } finally { setDeletePhotoLoading(false); }
                      }}
                      disabled={deletePhotoLoading}
                      className="flex items-center gap-1 text-xs text-red-500 font-semibold"
                    >
                      <Trash2 className="w-3 h-3" /> Hapus Foto
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-4">
              {/* Name */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-[#4A4435]">Nama Tampilan</label>
                <input
                  value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="Nama karyawan"
                  className="w-full h-11 px-4 rounded-xl border border-gray-200 bg-gray-50 text-[#4A4435] text-sm focus:outline-none focus:ring-2 focus:ring-[#FACC15]"
                />
              </div>

              {/* Jabatan */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-[#4A4435]">Jabatan</label>
                <input
                  value={jabatan} onChange={(e) => setJabatan(e.target.value)}
                  placeholder="cth. Staff IT, Manager HRD"
                  className="w-full h-11 px-4 rounded-xl border border-gray-200 bg-gray-50 text-[#4A4435] text-sm focus:outline-none focus:ring-2 focus:ring-[#FACC15]"
                />
              </div>

              {/* Role */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-[#4A4435]">Jabatan / Akses Sistem</label>
                <div className="relative">
                  <select
                    value={role} onChange={(e) => setRole(e.target.value)}
                    className="w-full h-11 px-4 pr-10 rounded-xl border border-gray-200 bg-gray-50 text-[#4A4435] text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-[#FACC15]"
                  >
                    {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8C8573] pointer-events-none" />
                </div>
                <p className="text-[11px] text-[#8C8573]">
                  HRD: dapat approve izin · Admin: akses penuh semua fitur
                </p>
              </div>

              {/* Status Aktif */}
              <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
                <div>
                  <label className="text-sm font-semibold text-[#4A4435]">Status Karyawan</label>
                  <p className="text-xs text-[#8C8573]">{isActive ? "Aktif — bisa login & absen" : "Nonaktif — tidak bisa login"}</p>
                </div>
                <button
                  onClick={() => setIsActive(!isActive)}
                  className={`w-12 h-6 rounded-full transition-colors relative ${isActive ? "bg-[#FACC15]" : "bg-gray-300"}`}
                >
                  <div className={`w-5 h-5 rounded-full bg-white shadow absolute top-0.5 transition-all ${isActive ? "left-6" : "left-0.5"}`} />
                </button>
              </div>

              {/* Role quick-set buttons */}
              <div>
                <p className="text-xs font-semibold text-[#8C8573] mb-2">Ubah cepat status:</p>
                <div className="grid grid-cols-3 gap-2">
                  {ROLE_OPTIONS.map((r) => (
                    <button
                      key={r.value}
                      onClick={() => setRole(r.value)}
                      className={`py-2 rounded-xl text-xs font-bold border-2 transition-colors ${
                        role === r.value
                          ? "bg-[#FACC15] border-[#FACC15] text-[#4A4435]"
                          : "bg-white border-gray-200 text-[#8C8573]"
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={handleSave} disabled={isSaving}
                className="w-full h-12 rounded-2xl bg-[#FACC15] text-[#4A4435] font-bold flex items-center justify-center gap-2 shadow-md disabled:opacity-60"
              >
                {isSaving ? <><Loader2 className="w-4 h-4 animate-spin" /> Menyimpan...</> : "Simpan Perubahan"}
              </button>

              {/* Reset Password */}
              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-bold text-[#8C8573] uppercase tracking-wider mb-3">Reset Kata Sandi</p>
                <div className="flex gap-2">
                  <input
                    value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                    type="password" placeholder="Kata sandi baru (min. 6 karakter)"
                    className="flex-1 h-11 px-4 rounded-xl border border-gray-200 bg-gray-50 text-[#4A4435] text-sm focus:outline-none focus:ring-2 focus:ring-[#FACC15]"
                  />
                  <button
                    onClick={handleResetPassword} disabled={isResetting || !newPassword}
                    className="h-11 px-4 rounded-xl bg-[#4A4435] text-white text-sm font-bold disabled:opacity-40 flex items-center gap-1"
                  >
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
