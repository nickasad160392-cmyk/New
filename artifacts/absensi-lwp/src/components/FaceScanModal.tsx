import { useState, useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { X, Camera, Loader2, CheckCircle2, AlertCircle, ScanFace } from "lucide-react";

type ScanPhase = "opening" | "scanning" | "detected" | "captured" | "submitting" | "success" | "error";

interface Gps {
  lat: number;
  lng: number;
  accuracy?: number;
}

interface Props {
  mode: "check-in" | "check-out" | "overtime-in";
  facePhotoBase64: string | null;
  gps: Gps | null;
  onSuccess: () => void;
  onClose: () => void;
}

const MODE_LABEL: Record<Props["mode"], string> = {
  "check-in": "Absen Masuk",
  "check-out": "Absen Pulang",
  "overtime-in": "Mulai Lembur",
};

const MODE_COLOR: Record<Props["mode"], string> = {
  "check-in": "border-[#FACC15]",
  "check-out": "border-blue-400",
  "overtime-in": "border-orange-400",
};

export default function FaceScanModal({ mode, facePhotoBase64, gps, onSuccess, onClose }: Props) {
  const qc = useQueryClient();
  const [phase, setPhase] = useState<ScanPhase>("opening");
  const [errorMsg, setErrorMsg] = useState("");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedDataUrl, setCapturedDataUrl] = useState<string | null>(null);
  const [capturedBase64, setCapturedBase64] = useState<string | null>(null);
  const [faceDetected, setFaceDetected] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const [scanLine, setScanLine] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scanAnimRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const faceLoopRef = useRef<number | null>(null);
  const countdownRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const captureScheduledRef = useRef(false);

  // KEY FIX: assign stream to video via useEffect (not setTimeout)
  // This ensures the video DOM element exists before srcObject is set
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (stream) {
      video.srcObject = stream;
      video.play().catch(() => {});
    } else {
      video.srcObject = null;
    }
  }, [stream]);

  // Scan line animation (always runs when scanning)
  useEffect(() => {
    if (phase !== "scanning" && phase !== "detected") {
      if (scanAnimRef.current) clearInterval(scanAnimRef.current);
      return;
    }
    let pos = 0; let dir = 1;
    scanAnimRef.current = setInterval(() => {
      pos += dir * 2.5;
      if (pos >= 100) dir = -1;
      if (pos <= 0) dir = 1;
      setScanLine(pos);
    }, 16);
    return () => { if (scanAnimRef.current) clearInterval(scanAnimRef.current); };
  }, [phase]);

  const capturePhoto = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    if (faceLoopRef.current) cancelAnimationFrame(faceLoopRef.current);
    if (countdownRef.current) clearTimeout(countdownRef.current);

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 640;
    const ctx = canvas.getContext("2d")!;
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(video, -canvas.width, 0);
    ctx.restore();

    const dataUrl = canvas.toDataURL("image/jpeg", 0.80);
    const base64 = dataUrl.split(",")[1]!;
    setCapturedDataUrl(dataUrl);
    setCapturedBase64(base64);

    // Stop camera stream
    if (stream) { stream.getTracks().forEach((t) => t.stop()); setStream(null); }
    setPhase("captured");
  }, [stream]);

  // FaceDetector / countdown detection (starts after scanning)
  useEffect(() => {
    if (phase !== "scanning" || !stream) return;
    captureScheduledRef.current = false;
    let cancelled = false;

    if ("FaceDetector" in window) {
      const detector = new (window as any).FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
      let frameId: number;
      const detect = async () => {
        if (cancelled || !videoRef.current) return;
        try {
          const faces = await detector.detect(videoRef.current);
          if (!cancelled) {
            if (faces.length > 0) {
              setFaceDetected(true);
              setPhase("detected");
              if (!captureScheduledRef.current) {
                captureScheduledRef.current = true;
                setTimeout(() => { if (!cancelled) capturePhoto(); }, 900);
              }
              return;
            } else {
              setFaceDetected(false);
            }
          }
        } catch {}
        if (!cancelled) frameId = requestAnimationFrame(detect);
      };
      frameId = requestAnimationFrame(detect);
      faceLoopRef.current = frameId;
      return () => {
        cancelled = true;
        cancelAnimationFrame(frameId);
      };
    } else {
      // Fallback: 3-second countdown
      let count = 3;
      setCountdown(count);
      const tick = () => {
        if (cancelled) return;
        count--;
        setCountdown(count);
        if (count <= 0) {
          setFaceDetected(true);
          setPhase("detected");
          setTimeout(() => { if (!cancelled) capturePhoto(); }, 400);
        } else {
          countdownRef.current = setTimeout(tick, 1000);
        }
      };
      countdownRef.current = setTimeout(tick, 1000);
      return () => {
        cancelled = true;
        if (countdownRef.current) clearTimeout(countdownRef.current);
      };
    }
  }, [phase, stream, capturePhoto]);

  // Auto-submit after capture
  useEffect(() => {
    if (phase !== "captured" || !capturedBase64) return;
    const timer = setTimeout(() => submitAttendance(), 600);
    return () => clearTimeout(timer);
  }, [phase, capturedBase64]);

  const submitAttendance = useCallback(async () => {
    if (!capturedBase64) return;
    setPhase("submitting");
    try {
      if (mode === "check-in") {
        await api.attendance.checkIn({
          selfieBase64: capturedBase64,
          latitude: gps?.lat ?? 0,
          longitude: gps?.lng ?? 0,
          accuracy: gps?.accuracy,
        });
        toast.success("✅ Absen masuk berhasil!");
      } else if (mode === "check-out") {
        await api.attendance.checkOut({ selfieBase64: capturedBase64 });
        toast.success("🎉 Absen keluar berhasil!");
      } else {
        await api.attendance.overtimeCheckIn({ selfieBase64: capturedBase64 });
        toast.success("⏰ Sesi lembur dimulai!");
      }
      qc.invalidateQueries({ queryKey: ["attendance"] });
      setPhase("success");
      setTimeout(() => onSuccess(), 1200);
    } catch (err: any) {
      setErrorMsg(err?.data?.error || err?.message || "Gagal menyimpan absensi");
      setPhase("error");
    }
  }, [capturedBase64, mode, gps, qc, onSuccess]);

  // Open camera on mount
  useEffect(() => {
    let mounted = true;
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 640 } },
      audio: false,
    }).then((s) => {
      if (mounted) { setStream(s); setPhase("scanning"); }
      else s.getTracks().forEach((t) => t.stop());
    }).catch((err) => {
      if (mounted) {
        const msg = err.name === "NotAllowedError"
          ? "Izin kamera ditolak. Buka pengaturan browser dan izinkan akses kamera."
          : err.name === "NotFoundError"
            ? "Kamera tidak ditemukan di perangkat ini."
            : `Kamera tidak dapat diakses: ${err.message}`;
        setErrorMsg(msg);
        setPhase("error");
      }
    });
    return () => {
      mounted = false;
      if (faceLoopRef.current) cancelAnimationFrame(faceLoopRef.current);
      if (countdownRef.current) clearTimeout(countdownRef.current);
    };
  }, []);

  const handleClose = useCallback(() => {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    if (faceLoopRef.current) cancelAnimationFrame(faceLoopRef.current);
    if (countdownRef.current) clearTimeout(countdownRef.current);
    if (scanAnimRef.current) clearInterval(scanAnimRef.current);
    onClose();
  }, [stream, onClose]);

  const refPhoto = facePhotoBase64 ? `data:image/jpeg;base64,${facePhotoBase64}` : null;
  const borderColor = MODE_COLOR[mode];

  return (
    <div className="fixed inset-0 z-[60] bg-black flex flex-col items-center justify-between">
      <canvas ref={canvasRef} className="hidden" />

      {/* Top bar */}
      <div className="w-full flex items-center justify-between px-5 pt-12 pb-4 bg-black/60">
        <div>
          <p className="text-[#FACC15] text-xs font-bold uppercase tracking-widest">{MODE_LABEL[mode]}</p>
          <p className="text-white/60 text-xs mt-0.5">
            {phase === "scanning" ? "Arahkan wajah ke kamera..."
              : phase === "detected" ? "Wajah terdeteksi!"
              : phase === "captured" ? "Memverifikasi..."
              : phase === "submitting" ? "Menyimpan..."
              : phase === "success" ? "Berhasil!"
              : phase === "error" ? "Gagal"
              : "Membuka kamera..."}
          </p>
        </div>
        {phase !== "submitting" && phase !== "success" && (
          <button onClick={handleClose} className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
            <X className="w-5 h-5 text-white" />
          </button>
        )}
      </div>

      {/* Camera viewport */}
      <div className="flex-1 flex flex-col items-center justify-center w-full px-6">
        {/* Face scanner circle */}
        <div className="relative mb-6">
          <div className={`relative w-72 h-72 rounded-full overflow-hidden border-4 shadow-2xl bg-black ${
            faceDetected ? "border-green-400" : borderColor
          } transition-colors duration-300`}>
            {/* Live video - always mounted, hidden when not scanning */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
                (phase === "scanning" || phase === "detected") ? "opacity-100" : "opacity-0"
              }`}
              style={{ transform: "scaleX(-1)" }}
            />

            {/* Captured photo */}
            {capturedDataUrl && (phase === "captured" || phase === "submitting") && (
              <img
                src={capturedDataUrl}
                alt="captured"
                className="absolute inset-0 w-full h-full object-cover"
              />
            )}

            {/* Scan line animation */}
            {(phase === "scanning" || phase === "detected") && (
              <div
                className="absolute left-0 right-0 pointer-events-none"
                style={{
                  top: `${scanLine}%`,
                  height: "2px",
                  background: faceDetected
                    ? "rgba(74, 222, 128, 0.9)"
                    : "rgba(250, 204, 21, 0.9)",
                  boxShadow: faceDetected
                    ? "0 0 10px 3px rgba(74, 222, 128, 0.5)"
                    : "0 0 10px 3px rgba(250, 204, 21, 0.5)",
                  transition: "top 0.016s linear",
                }}
              />
            )}

            {/* Face detected overlay */}
            {phase === "detected" && (
              <div className="absolute inset-0 bg-green-400/10 flex items-end justify-center pb-4 pointer-events-none">
                <div className="bg-green-500/90 text-white text-xs font-bold px-3 py-1 rounded-full">
                  ✓ Wajah terdeteksi
                </div>
              </div>
            )}

            {/* Submitting overlay */}
            {phase === "submitting" && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <Loader2 className="w-12 h-12 text-[#FACC15] animate-spin" />
              </div>
            )}

            {/* Success overlay */}
            {phase === "success" && capturedDataUrl && (
              <div className="absolute inset-0 bg-green-500/30 flex items-center justify-center">
                <div className="w-20 h-20 rounded-full bg-green-500/80 flex items-center justify-center">
                  <CheckCircle2 className="w-12 h-12 text-white" />
                </div>
              </div>
            )}

            {/* Error state */}
            {phase === "error" && (
              <div className="absolute inset-0 bg-black flex items-center justify-center">
                <AlertCircle className="w-16 h-16 text-red-400" />
              </div>
            )}

            {/* Opening state */}
            {phase === "opening" && (
              <div className="absolute inset-0 bg-black flex items-center justify-center">
                <Loader2 className="w-12 h-12 text-[#FACC15] animate-spin" />
              </div>
            )}
          </div>

          {/* Corner brackets (face ID style) */}
          {(phase === "scanning" || phase === "detected") && (
            <>
              {[
                "top-0 left-0 border-t-4 border-l-4 rounded-tl-2xl",
                "top-0 right-0 border-t-4 border-r-4 rounded-tr-2xl",
                "bottom-0 left-0 border-b-4 border-l-4 rounded-bl-2xl",
                "bottom-0 right-0 border-b-4 border-r-4 rounded-br-2xl",
              ].map((cls, i) => (
                <div
                  key={i}
                  className={`absolute w-8 h-8 transition-colors duration-300 ${cls} ${
                    faceDetected ? "border-green-400" : "border-[#FACC15]"
                  }`}
                />
              ))}
            </>
          )}

          {/* Countdown badge (fallback mode) */}
          {phase === "scanning" && !("FaceDetector" in window) && countdown > 0 && (
            <div className="absolute -top-4 -right-4 w-12 h-12 rounded-full bg-[#FACC15] flex items-center justify-center shadow-lg">
              <span className="text-[#4A4435] text-xl font-black">{countdown}</span>
            </div>
          )}
        </div>

        {/* Reference photo row */}
        {refPhoto && (phase === "scanning" || phase === "detected") && (
          <div className="flex items-center gap-3 bg-white/10 rounded-2xl px-4 py-2.5 mb-4">
            <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-[#FACC15] flex-shrink-0">
              <img src={refPhoto} alt="wajah terdaftar" className="w-full h-full object-cover" />
            </div>
            <div>
              <p className="text-white text-xs font-semibold">Wajah terdaftar</p>
              <p className="text-white/50 text-[10px]">Sesuaikan posisi wajah Anda</p>
            </div>
          </div>
        )}

        {/* Status text */}
        <div className="text-center">
          {phase === "opening" && (
            <p className="text-white/70 text-sm">Membuka kamera...</p>
          )}
          {phase === "scanning" && (
            <div className="flex items-center gap-2 justify-center">
              <div className="w-2 h-2 rounded-full bg-[#FACC15] animate-ping" />
              <p className="text-white/80 text-sm font-medium">
                {"FaceDetector" in window ? "Mendeteksi wajah secara otomatis..." : `Mengambil foto dalam ${countdown}...`}
              </p>
            </div>
          )}
          {phase === "detected" && (
            <p className="text-green-400 text-sm font-semibold">Wajah terdeteksi — memproses...</p>
          )}
          {(phase === "captured" || phase === "submitting") && (
            <div className="flex items-center gap-2 justify-center">
              <Loader2 className="w-4 h-4 text-[#FACC15] animate-spin" />
              <p className="text-white/80 text-sm">Memverifikasi & menyimpan absensi...</p>
            </div>
          )}
          {phase === "success" && (
            <p className="text-green-400 text-base font-bold">Absensi berhasil dicatat! ✓</p>
          )}
          {phase === "error" && (
            <div className="text-center max-w-[280px]">
              <p className="text-red-400 text-sm font-semibold mb-1">Gagal</p>
              <p className="text-white/60 text-xs">{errorMsg}</p>
            </div>
          )}
        </div>
      </div>

      {/* Bottom actions */}
      <div className="w-full px-6 pb-10 space-y-3">
        {(phase === "scanning" || phase === "detected") && (
          <button
            onClick={() => capturePhoto()}
            className="w-full h-14 rounded-2xl bg-[#FACC15] text-[#4A4435] font-bold text-base flex items-center justify-center gap-2"
          >
            <Camera className="w-5 h-5" />
            Tangkap Manual
          </button>
        )}
        {phase === "error" && (
          <button
            onClick={() => {
              setErrorMsg("");
              setStream(null);
              setCapturedDataUrl(null);
              setCapturedBase64(null);
              setFaceDetected(false);
              captureScheduledRef.current = false;
              setPhase("opening");
              // Retry camera
              navigator.mediaDevices.getUserMedia({
                video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 640 } },
                audio: false,
              }).then((s) => {
                setStream(s);
                setPhase("scanning");
              }).catch(() => {
                setErrorMsg("Kamera masih tidak dapat diakses");
                setPhase("error");
              });
            }}
            className="w-full h-14 rounded-2xl bg-[#FACC15] text-[#4A4435] font-bold text-base flex items-center justify-center gap-2"
          >
            <ScanFace className="w-5 h-5" />
            Coba Lagi
          </button>
        )}
        {phase !== "success" && (
          <button
            onClick={handleClose}
            className="w-full h-11 rounded-2xl bg-white/10 text-white/70 font-semibold text-sm"
          >
            Batal
          </button>
        )}
      </div>
    </div>
  );
}
