import { useState, useRef, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { Camera, CheckCircle2, Loader2, ArrowLeft, RefreshCw, Trash2, ImagePlus, User } from "lucide-react";

type Phase = "home" | "camera" | "preview" | "saving" | "done";

function compressPhoto(dataUrl: string, maxSize = 320): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const size = Math.min(maxSize, img.width, img.height);
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d")!;
      const srcX = (img.width - size) / 2;
      const srcY = (img.height - size) / 2;
      ctx.drawImage(img, srcX, srcY, size, size, 0, 0, size, size);
      resolve(canvas.toDataURL("image/jpeg", 0.75));
    };
    img.src = dataUrl;
  });
}

export default function FaceRegisterPage() {
  const { user, refreshUser } = useAuth();
  const [, navigate] = useLocation();
  const [phase, setPhase] = useState<Phase>("home");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [capturedBase64, setCapturedBase64] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const openCamera = useCallback(async () => {
    setErrorMsg("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 640 } },
        audio: false,
      });
      streamRef.current = stream;
      setPhase("camera");
      setTimeout(() => {
        if (videoRef.current && streamRef.current) {
          videoRef.current.srcObject = streamRef.current;
          videoRef.current.play().catch(() => {});
        }
      }, 80);
    } catch (err: any) {
      setErrorMsg(
        err?.name === "NotAllowedError"
          ? "Izin kamera ditolak. Buka Pengaturan > Izin Browser > Kamera."
          : "Kamera tidak dapat diakses. Pastikan tidak digunakan aplikasi lain."
      );
    }
  }, []);

  const capturePhoto = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 640;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(video, -canvas.width, 0);
    ctx.restore();
    const raw = canvas.toDataURL("image/jpeg", 0.9);
    const compressed = await compressPhoto(raw, 320);
    setPreviewUrl(compressed);
    setCapturedBase64(compressed.split(",")[1]!);
    stopCamera();
    setPhase("preview");
  }, [stopCamera]);

  const savePhoto = useCallback(async () => {
    if (!capturedBase64) return;
    setPhase("saving");
    try {
      await api.auth.registerSelfie(capturedBase64);
      if (refreshUser) await refreshUser();
      setPhase("done");
      toast.success("✅ Foto profil berhasil disimpan!");
    } catch (err: any) {
      toast.error(err?.data?.error || "Gagal menyimpan foto. Coba lagi.");
      setPhase("preview");
    }
  }, [capturedBase64, refreshUser]);

  const handleDeletePhoto = useCallback(async () => {
    if (!confirm("Hapus foto profil? Anda tidak bisa absen menggunakan foto sampai mendaftar ulang.")) return;
    setDeleting(true);
    try {
      await api.auth.deletePhoto();
      if (refreshUser) await refreshUser();
      toast.success("Foto profil dihapus");
    } catch (err: any) {
      toast.error(err?.data?.error || "Gagal menghapus foto");
    }
    setDeleting(false);
  }, [refreshUser]);

  const handleUploadFromFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string;
      const compressed = await compressPhoto(dataUrl, 320);
      setPreviewUrl(compressed);
      setCapturedBase64(compressed.split(",")[1]!);
      setPhase("preview");
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }, []);

  const currentPhoto = user?.profilePhoto ? `data:image/jpeg;base64,${user.profilePhoto}` : null;

  return (
    <div className="flex flex-col min-h-full bg-[#FBF9F3]">
      <div className="bg-[#FACC15] px-5 pt-12 pb-8 rounded-b-[40px]">
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={() => { stopCamera(); navigate("/dashboard"); }}
            className="w-8 h-8 rounded-full bg-[#4A4435]/10 flex items-center justify-center"
          >
            <ArrowLeft className="w-4 h-4 text-[#4A4435]" />
          </button>
          <div>
            <h1 className="text-lg font-extrabold text-[#4A4435]">Foto Profil</h1>
            <p className="text-xs text-[#4A4435]/60">Selfie untuk absensi & peta</p>
          </div>
        </div>
        <div className="bg-white/40 rounded-2xl px-4 py-3">
          <p className="text-xs font-semibold text-[#4A4435]">👤 {user?.name}</p>
          <p className="text-[10px] text-[#4A4435]/60 mt-0.5">
            {user?.hasFaceDescriptor ? "✅ Foto terdaftar — ambil ulang untuk memperbarui" : "⚠️ Belum ada foto — daftarkan untuk bisa absen"}
          </p>
        </div>
      </div>

      <canvas ref={canvasRef} className="hidden" />

      <div className="flex-1 px-5 pt-6 pb-24 flex flex-col items-center">

        {/* HOME — show current photo + options */}
        {phase === "home" && (
          <>
            {/* Current photo */}
            <div className="w-40 h-40 rounded-full overflow-hidden border-4 border-[#FACC15] shadow-xl mb-6 bg-gray-100 flex items-center justify-center">
              {currentPhoto ? (
                <img src={currentPhoto} alt="Foto profil" className="w-full h-full object-cover" />
              ) : (
                <User className="w-16 h-16 text-gray-300" />
              )}
            </div>

            {errorMsg && (
              <div className="w-full bg-red-50 border border-red-200 rounded-2xl px-4 py-3 mb-4 text-sm text-red-700">
                ⚠️ {errorMsg}
              </div>
            )}

            <p className="text-sm text-[#8C8573] text-center max-w-[280px] mb-6 leading-relaxed">
              {currentPhoto
                ? "Foto Anda digunakan untuk absensi dan ditampilkan di peta karyawan."
                : "Ambil foto selfie untuk mendaftar absensi. Foto akan ditampilkan di peta karyawan."}
            </p>

            <div className="w-full space-y-3">
              <button
                onClick={openCamera}
                className="w-full h-14 rounded-2xl bg-[#FACC15] text-[#4A4435] font-bold text-base flex items-center justify-center gap-2 shadow-md active:scale-[0.98]"
              >
                <Camera className="w-5 h-5" />
                {currentPhoto ? "Ambil Foto Baru" : "Buka Kamera & Foto Selfie"}
              </button>

              <label className="w-full h-12 rounded-2xl bg-white border-2 border-[#FACC15]/50 text-[#4A4435] font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer active:bg-gray-50">
                <ImagePlus className="w-4 h-4" />
                Upload dari Galeri
                <input type="file" accept="image/*" className="hidden" onChange={handleUploadFromFile} />
              </label>

              {currentPhoto && (
                <button
                  onClick={handleDeletePhoto}
                  disabled={deleting}
                  className="w-full h-11 rounded-2xl bg-white border border-red-200 text-red-500 font-semibold text-sm flex items-center justify-center gap-2 active:bg-red-50 disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                  {deleting ? "Menghapus..." : "Hapus Foto Profil"}
                </button>
              )}
            </div>
          </>
        )}

        {/* CAMERA */}
        {phase === "camera" && (
          <div className="w-full flex flex-col items-center">
            <div className="relative w-72 h-72 rounded-full overflow-hidden shadow-xl mb-5 bg-black border-4 border-[#FACC15]">
              <video
                ref={videoRef}
                autoPlay playsInline muted
                className="absolute inset-0 w-full h-full object-cover scale-x-[-1]"
              />
            </div>
            <p className="text-sm text-[#8C8573] mb-6 text-center">Pastikan wajah terlihat jelas dalam lingkaran</p>
            <button
              onClick={capturePhoto}
              className="w-full h-14 rounded-2xl bg-[#FACC15] text-[#4A4435] font-bold text-base flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] mb-3"
            >
              <Camera className="w-5 h-5" />
              Ambil Foto
            </button>
            <button onClick={() => { stopCamera(); setPhase("home"); }} className="text-xs text-[#8C8573] underline">
              Batalkan
            </button>
          </div>
        )}

        {/* PREVIEW */}
        {phase === "preview" && previewUrl && (
          <div className="w-full flex flex-col items-center">
            <div className="w-64 h-64 rounded-full overflow-hidden border-4 border-[#FACC15] shadow-xl mb-5">
              <img src={previewUrl} alt="preview" className="w-full h-full object-cover" />
            </div>
            <p className="text-sm font-semibold text-[#4A4435] mb-1">Foto terlihat baik?</p>
            <p className="text-xs text-[#8C8573] mb-6 text-center">Pastikan wajah terlihat jelas sebelum menyimpan</p>
            <div className="w-full space-y-3">
              <button
                onClick={savePhoto}
                className="w-full h-14 rounded-2xl bg-[#FACC15] text-[#4A4435] font-bold text-base flex items-center justify-center gap-2 shadow-md"
              >
                <CheckCircle2 className="w-5 h-5" />
                Simpan Foto Ini
              </button>
              <button
                onClick={() => { setPreviewUrl(null); setCapturedBase64(null); openCamera(); }}
                className="w-full h-11 rounded-2xl bg-white border border-gray-200 text-[#8C8573] font-semibold text-sm flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" /> Ambil Ulang
              </button>
              <button
                onClick={() => { setPreviewUrl(null); setCapturedBase64(null); setPhase("home"); }}
                className="w-full text-xs text-[#8C8573] underline py-1"
              >
                Batalkan
              </button>
            </div>
          </div>
        )}

        {/* SAVING */}
        {phase === "saving" && (
          <div className="flex flex-col items-center justify-center flex-1 text-center">
            {previewUrl && (
              <div className="w-40 h-40 rounded-full overflow-hidden border-4 border-[#FACC15] shadow-xl mb-5">
                <img src={previewUrl} alt="preview" className="w-full h-full object-cover" />
              </div>
            )}
            <Loader2 className="w-10 h-10 text-[#FACC15] animate-spin mb-3" />
            <p className="text-sm font-semibold text-[#4A4435]">Menyimpan foto profil...</p>
          </div>
        )}

        {/* DONE */}
        {phase === "done" && (
          <div className="flex flex-col items-center justify-center flex-1 text-center">
            {previewUrl && (
              <div className="w-48 h-48 rounded-full overflow-hidden border-4 border-green-400 shadow-xl mb-5">
                <img src={previewUrl} alt="preview" className="w-full h-full object-cover" />
              </div>
            )}
            <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mb-3">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-xl font-extrabold text-[#4A4435] mb-2">Foto Tersimpan!</h2>
            <p className="text-sm text-[#8C8573] mb-8 max-w-[260px]">
              Foto Anda sudah terdaftar. Gunakan pemindai wajah untuk absen.
            </p>
            <div className="w-full space-y-3">
              <button onClick={() => navigate("/absen")}
                className="w-full h-14 rounded-2xl bg-[#FACC15] text-[#4A4435] font-bold text-base">
                Coba Absen Sekarang
              </button>
              <button onClick={() => { setPreviewUrl(null); setCapturedBase64(null); setPhase("home"); }}
                className="w-full h-11 rounded-2xl bg-white border border-gray-200 text-[#8C8573] font-semibold text-sm flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4" /> Ganti Foto
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
