import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2 } from "lucide-react";

export default function LoginPage() {
  const [, navigate] = useLocation();
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      toast.error("Email/ID dan kata sandi wajib diisi");
      return;
    }
    setIsLoading(true);
    try {
      const data = await api.auth.login(identifier, password);
      login(data.user, data.token ?? undefined);
      navigate("/dashboard");
    } catch (err: any) {
      const msg = err?.data?.error || err?.message || "Login gagal. Periksa email/ID dan kata sandi Anda.";
      toast.error(msg);
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FBF9F3]">
      <div className="bg-[#FACC15] h-48 rounded-b-[60px] flex items-end px-6 pb-8">
        <div>
          <p className="text-[#4A4435]/60 text-xs uppercase tracking-widest font-medium">PT. Lembayung Wanantara Padha</p>
          <h1 className="text-3xl font-extrabold text-[#4A4435] mt-1">Masuk</h1>
        </div>
      </div>

      <div className="flex-1 px-6 pt-10">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-[#4A4435]">Email / ID Karyawan</label>
            <input
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="Masukkan email atau ID karyawan"
              autoComplete="username"
              className="w-full h-12 px-4 rounded-2xl border border-gray-200 bg-white text-[#4A4435] text-sm focus:outline-none focus:ring-2 focus:ring-[#FACC15]"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-[#4A4435]">Kata Sandi</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Masukkan kata sandi"
                autoComplete="current-password"
                className="w-full h-12 px-4 pr-11 rounded-2xl border border-gray-200 bg-white text-[#4A4435] text-sm focus:outline-none focus:ring-2 focus:ring-[#FACC15]"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center"
              >
                {showPassword ? <EyeOff className="w-4 h-4 text-[#8C8573]" /> : <Eye className="w-4 h-4 text-[#8C8573]" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full h-13 mt-2 rounded-2xl bg-[#FACC15] text-[#4A4435] font-bold text-base flex items-center justify-center gap-2 shadow-md disabled:opacity-60 active:scale-[0.98] transition-transform"
            style={{ height: "52px" }}
          >
            {isLoading ? <><Loader2 className="w-5 h-5 animate-spin" /> Masuk...</> : "Masuk"}
          </button>
        </form>

        <p className="text-center text-sm text-[#8C8573] mt-6">
          Belum punya akun?{" "}
          <a href="/register" onClick={(e) => { e.preventDefault(); navigate("/register"); }} className="text-[#4A4435] font-bold underline">
            Daftar
          </a>
        </p>
      </div>

      <div className="pb-12 text-center">
        <p className="text-[10px] text-[#8C8573]/40">PT. Lembayung Wanantara Padha</p>
      </div>
    </div>
  );
}
