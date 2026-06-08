import { useState, useRef, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { Camera, CheckCircle2, Loader2, ArrowLeft, RefreshCw, Trash2, ScanFace, User } from "lucide-react";

type Phase = "home" | "countdown" | "scanning" | "preview" | "saving" | "done";

function compressPhoto(dataUrl: string, maxSize = 400): Promise<string> {
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
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.src = dataUrl;
  });
}

export default function FaceRegisterPage() {
  const { user, refreshUser } = useAuth();
  const [, navigate] = useLocation();
  const [phase, setPhase] = useState<Phase>("home");
  const [countdown, setCountdown] = useState(3);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [capturedBase64, setCapturedBase64] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [scanLine, setScanLine] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const countdownRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanAnimRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const faceDetectorRef = useRef<any>(null);
  const faceCheckRef = useRef<number | null>(null);

  const stopCamera = useCallback(() => {
    if (countdownRef.current) clearTimeout(countdownRef.current);
    if (scanAnimRef.current) clearInterval(scanAnimRef.current);
    if (faceCheckRef.current) cancelAnimationFrame(faceCheckRef.current);
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const capturePhoto = useCallback(async () => {
    if (scanAnimRef.current) clearInterval(scanAnimRef.current);
    if (faceCheckRef.current) cancelAnimationFrame(faceCheckRef.current);
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 640;
    const ctx = canvas.getContext("2d")!;
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(video, -canvas.width, 0);
    ctx.restore();
    const raw = canvas.toDataURL("image/jpeg", 0.9);
    const compressed = await compressPhoto(raw, 400);
    setPreviewUrl(compressed);
    setCapturedBase64(compressed.split(",")[1]!);
    stopCamera();
    setPhase("preview");
  }, [stopCamera]);

  const startFaceDetection = useCallback(async () => {
    if ("FaceDetector" in window) {
      try {
        faceDetectorRef.current = new (window as any).FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
        const detect = async () => {
          if (!videoRef.current || phase === "preview") return;
          try {
            const faces = await faceDetectorRef.current.detect(videoRef.current);
            if (faces.length > 0) {
              capturePhoto();
              return;
            }
          } catch {}
          faceCheckRef.current = requestAnimationFrame(detect);
        };
        faceCheckRef.current = requestAnimationFrame(detect);
        return;
      } catch {}
    }
    // Fallback: countdown 3→0 then capture
    let count = 3;
    setCountdown(count);
    const tick = () => {
      count--;
      setCountdown(count);
      if (count <= 0) {
        capturePhoto();
      } else {
        countdownRef.current = setTimeout(tick, 1000);
      }
    };
    countdownRef.current = setTimeout(tick, 1000);
  }, [capturePhoto, phase]);

  const openCamera = useCallback(async () => {
    setErrorMsg("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 640 } },
        audio: false,
      });
      streamRef.current = stream;
      setPhase("countdown");
      setCountdown(3);
      setTimeout(() => {
        if (videoRef.current && streamRef.current) {
          videoRef.current.srcObject = streamRef.current;
          videoRef.current.play().catch(() => {});
        }
        // Start scan line animation
        let pos = 0;
        let dir = 1;
        scanAnimRef.current = setInterval(() => {
          pos += dir * 2;
          if (pos >= 100) dir = -1;
          if (pos <= 0) dir = 1;
          setScanLine(pos);
        }, 20);
        // After brief show, start detection
        setTimeout(() => {
          setPhase("scanning");
          startFaceDetection();
        }, 800);
      }, 100);
    } catch (err: any) {
      setErrorMsg(
        err?.name === "NotAllowedError"
          ? "Izin kamera ditolak. Buka Pengaturan > Izin Browser > Kamera."
          : "Kamera tidak dapat diakses. Pastikan tidak digunakan aplikasi lain."
      );
    }
  }, [startFaceDetection]);

  const savePhoto = useCallback(async () => {
    if (!capturedBase64) return;
    setPhase("saving");
    try {
      await api.auth.registerFacePhoto(capturedBase64);
      if (refreshUser) await refreshUser();
      setPhase("done");
      toast.success("✅ Wajah berhasil didaftarkan untuk absensi!");
    } catch (err: any) {
      toast.error(err?.data?.error || "Gagal menyimpan. Coba lagi.");
      setPhase("preview");
    }
  }, [capturedBase64, refreshUser]);

  const handleDeleteFace = useCallback(async () => {
    if (!confirm("Hapus pendaftaran wajah? Anda tidak bisa absen menggunakan scan wajah sampai mendaftar ulang.")) return;
    setDeleting(true);
    try {
      await api.auth.deleteFacePhoto();
      if (refreshUser) await refreshUser();
      toast.success("Wajah berhasil dihapus dari sistem absensi");
    } catch (err: any) {
      toast.error(err?.data?.error || "Gagal menghapus");
    }
    setDeleting(false);
  }, [refreshUser]);

  const currentFacePhoto = user?.facePhoto ? `data:image/jpeg;base64,${user.facePhoto}` : null;

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
            <h1 className="text-lg font-extrabold text-[#4A4435]">Daftar Wajah</h1>
            <p className="text-xs text-[#4A4435]/60">Wajah untuk scan absensi otomatis</p>
          </div>
        </div>
        <div className="bg-white/40 rounded-2xl px-4 py-3">
          <p className="text-xs font-semibold text-[#4A4435]">👤 {user?.name}</p>
          <p className="text-[10px] text-[#4A4435]/60 mt-0.5">
            {user?.hasFaceDescriptor
              ? "✅ Wajah terdaftar — ambil ulang untuk memperbarui"
              : "⚠️ Wajah belum terdaftar — daftarkan untuk scan absen otomatis"}
          </p>
        </div>
      </div>

      <canvas ref={canvasRef} className="hidden" />

      <div className="flex-1 px-5 pt-6 pb-24 flex flex-col items-center">

        {/* HOME */}
        {phase === "home" && (
          <>
            <div className="w-40 h-40 rounded-full overflow-hidden border-4 border-[#FACC15] shadow-xl mb-6 bg-gray-100 flex items-center justify-center relative">
              {currentFacePhoto ? (
                <img src={currentFacePhoto} alt="Wajah terdaftar" className="w-full h-full object-cover" />
              ) : (
                <User className="w-16 h-16 text-gray-300" />
              )}
              {currentFacePhoto && (
                <div className="absolute inset-0 flex items-end justify-center pb-2">
                  <span className="bg-green-500/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">TERDAFTAR</span>
                </div>
              )}
            </div>

            {errorMsg && (
              <div className="w-full bg-red-50 border border-red-200 rounded-2xl px-4 py-3 mb-4 text-sm text-red-700">
                ⚠️ {errorMsg}
              </div>
            )}

            <p className="text-sm text-[#8C8573] text-center max-w-[280px] mb-6 leading-relaxed">
              {currentFacePhoto
                ? "Wajah terdaftar untuk scan absensi otomatis. Kamera akan mendeteksi wajah Anda secara otomatis."
                : "Daftarkan wajah Anda agar bisa absen dengan scan wajah otomatis."}
            </p>

            <div className="w-full space-y-3">
              <button
                onClick={openCamera}
                className="w-full h-14 rounded-2xl bg-[#FACC15] text-[#4A4435] font-bold text-base flex items-center justify-center gap-2 shadow-md active:scale-[0.98]"
              >
                <ScanFace className="w-5 h-5" />
                {currentFacePhoto ? "Daftar Ulang Wajah" : "Mulai Scan & Daftar Wajah"}
              </button>

              {currentFacePhoto && (
                <button
                  onClick={handleDeleteFace}
                  disabled={deleting}
                  className="w-full h-11 rounded-2xl bg-white border border-red-200 text-red-500 font-semibold text-sm flex items-center justify-center gap-2 active:bg-red-50 disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                  {deleting ? "Menghapus..." : "Hapus Pendaftaran Wajah"}
                </button>
              )}

              <div className="bg-blue-50 rounded-2xl px-4 py-3 border border-blue-100">
                <p className="text-xs font-semibold text-blue-700 mb-1">ℹ️ Perbedaan Foto Wajah & Foto Profil</p>
                <p className="text-xs text-blue-600/80 leading-relaxed">
                  Foto ini khusus untuk <strong>scan absensi</strong>. Foto profil (tampilan di beranda) diatur terpisah melalui menu Profil.
                </p>
              </div>
            </div>
          </>
        )}

        {/* COUNTDOWN / SCANNING */}
        {(phase === "countdown" || phase === "scanning") && (
          <div className="w-full flex flex-col items-center">
            {/* Face scanner viewport */}
            <div className="relative w-72 h-72 mb-5">
              {/* Circular clip */}
              <div className="absolute inset-0 rounded-full overflow-hidden border-4 border-[#FACC15] shadow-xl bg-black">
                <video
                  ref={videoRef}
                  autoPlay playsInline muted
                  className="absolute inset-0 w-full h-full object-cover scale-x-[-1]"
                />
                {/* Scan line */}
                <div
                  className="absolute left-0 right-0 h-0.5 bg-[#FACC15]/80 shadow-[0_0_8px_2px_rgba(250,204,21,0.6)] pointer-events-none"
                  style={{ top: `${scanLine}%`, transition: "top 0.05s linear" }}
                />
                {/* Overlay tint */}
                <div className="absolute inset-0 bg-[#FACC15]/5 pointer-events-none" />
              </div>

              {/* Corner brackets */}
              {[
                "top-1 left-1 border-t-4 border-l-4 rounded-tl-xl",
                "top-1 right-1 border-t-4 border-r-4 rounded-tr-xl",
                "bottom-1 left-1 border-b-4 border-l-4 rounded-bl-xl",
                "bottom-1 right-1 border-b-4 border-r-4 rounded-br-xl",
              ].map((cls, i) => (
                <div key={i} className={`absolute w-7 h-7 border-[#FACC15] ${cls}`} />
              ))}

              {/* Countdown badge */}
              {phase === "countdown" && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-16 h-16 rounded-full bg-black/60 flex items-center justify-center">
                    <span className="text-[#FACC15] text-3xl font-extrabold">{countdown}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 mb-4">
              <div className="w-2 h-2 rounded-full bg-[#FACC15] animate-ping" />
              <p className="text-sm font-semibold text-[#4A4435]">
                {phase === "countdown" ? `Bersiap... ${countdown}` : "Mendeteksi wajah..."}
              </p>
            </div>
            <p className="text-xs text-[#8C8573] mb-6 text-center max-w-[240px]">
              Hadapkan wajah ke kamera. Sistem akan mendeteksi otomatis.
            </p>
            <button
              onClick={capturePhoto}
              className="w-full h-12 rounded-2xl bg-[#FACC15] text-[#4A4435] font-bold text-sm flex items-center justify-center gap-2 shadow-md mb-3"
            >
              <Camera className="w-4 h-4" />
              Tangkap Sekarang
            </button>
            <button onClick={() => { stopCamera(); setPhase("home"); }} className="text-xs text-[#8C8573] underline">
              Batalkan
            </button>
          </div>
        )}

        {/* PREVIEW */}
        {phase === "preview" && previewUrl && (
          <div className="w-full flex flex-col items-center">
            <p className="text-sm text-[#8C8573] mb-3">Foto berhasil ditangkap — periksa sebelum menyimpan</p>
            <div className="w-64 h-64 rounded-full overflow-hidden border-4 border-[#FACC15] shadow-xl mb-5">
              <img src={previewUrl} alt="preview" className="w-full h-full object-cover" />
            </div>
            <p className="text-sm font-semibold text-[#4A4435] mb-1">Wajah terlihat jelas?</p>
            <p className="text-xs text-[#8C8573] mb-6 text-center max-w-[260px]">
              Pastikan wajah telihat seluruhnya, pencahayaan baik, dan tidak terhalang.
            </p>
            <div className="w-full space-y-3">
              <button
                onClick={savePhoto}
                className="w-full h-14 rounded-2xl bg-[#FACC15] text-[#4A4435] font-bold text-base flex items-center justify-center gap-2 shadow-md"
              >
                <CheckCircle2 className="w-5 h-5" />
                Simpan & Daftarkan Wajah
              </button>
              <button
                onClick={() => { setPreviewUrl(null); setCapturedBase64(null); openCamera(); }}
                className="w-full h-11 rounded-2xl bg-white border border-gray-200 text-[#8C8573] font-semibold text-sm flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" /> Foto Ulang
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
            <p className="text-sm font-semibold text-[#4A4435]">Mendaftarkan wajah ke sistem...</p>
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
            <h2 className="text-xl font-extrabold text-[#4A4435] mb-2">Wajah Terdaftar!</h2>
            <p className="text-sm text-[#8C8573] mb-8 max-w-[260px]">
              Wajah Anda sudah terdaftar. Kini Anda bisa absen dengan scan wajah otomatis.
            </p>
            <div className="w-full space-y-3">
              <button onClick={() => navigate("/absen")}
                className="w-full h-14 rounded-2xl bg-[#FACC15] text-[#4A4435] font-bold text-base">
                Coba Absen Sekarang
              </button>
              <button onClick={() => { setPreviewUrl(null); setCapturedBase64(null); setPhase("home"); }}
                className="w-full h-11 rounded-2xl bg-white border border-gray-200 text-[#8C8573] font-semibold text-sm flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4" /> Daftar Ulang
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
