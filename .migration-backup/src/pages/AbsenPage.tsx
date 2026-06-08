import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { ArrowLeft, Camera, Loader2, MapPin, AlertCircle, CheckCircle2 } from "lucide-react";

const MODEL_URL = "https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/weights";

const OFFICE_LAT = -8.128241;
const OFFICE_LNG = 113.234113;
const MAX_DISTANCE_METERS = 500;

function calcDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

type AbsenStatus =
  | "idle"
  | "starting"
  | "camera-error"
  | "live"
  | "capturing"
  | "submitting"
  | "done";

export default function AbsenPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectLoopRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);
  const faceApiRef = useRef<any>(null);

  const [status, setStatus] = useState<AbsenStatus>("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [faceDetected, setFaceDetected] = useState(false);
  const [faceApiReady, setFaceApiReady] = useState(false);
  const [gps, setGps] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [distanceMeters, setDistanceMeters] = useState<number | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);

  const { data: today } = useQuery({
    queryKey: ["attendance", "today"],
    queryFn: () => api.attendance.today(),
  });

  const hasCheckedIn = !!today?.checkInTime;
  const hasCheckedOut = !!today?.checkOutTime;

  const stopCamera = useCallback(() => {
    if (detectLoopRef.current) {
      cancelAnimationFrame(detectLoopRef.current);
      detectLoopRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  // Assign stream to video whenever video element mounts and stream exists
  const videoCallbackRef = useCallback((el: HTMLVideoElement | null) => {
    (videoRef as any).current = el;
    if (el && streamRef.current) {
      el.srcObject = streamRef.current;
      el.play().catch(() => {});
    }
  }, []);

  const startDetectionLoop = useCallback((faceapi: any) => {
    if (detectLoopRef.current) cancelAnimationFrame(detectLoopRef.current);
    const loop = async () => {
      const video = videoRef.current;
      if (!video || video.readyState < 2) {
        detectLoopRef.current = requestAnimationFrame(loop);
        return;
      }
      try {
        const opts = new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.5 });
        const det = await faceapi.detectSingleFace(video, opts);
        setFaceDetected(!!(det && det.score >= 0.5));
      } catch {
        // ignore detection errors
      }
      detectLoopRef.current = requestAnimationFrame(loop);
    };
    detectLoopRef.current = requestAnimationFrame(loop);
  }, []);

  const handleStart = useCallback(async () => {
    if (hasCheckedOut) { toast.info("Absensi hari ini sudah selesai."); return; }

    // 1. Immediately show the camera UI (video element will mount)
    setStatus("starting");
    setFaceDetected(false);
    setFaceApiReady(false);

    // 2. Start camera
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      // Attach to video element (it should be mounted now)
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try { await videoRef.current.play(); } catch {}
      }
      setStatus("live");
    } catch (err: any) {
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setErrorMsg("Izin kamera ditolak. Buka Pengaturan Browser > Izin > Kamera, lalu refresh halaman.");
      } else if (err.name === "NotFoundError") {
        setErrorMsg("Kamera tidak ditemukan. Perangkat Anda tidak memiliki kamera depan.");
      } else {
        setErrorMsg(`Kamera tidak dapat diakses: ${err.message || err.name}`);
      }
      setStatus("camera-error");
      return;
    }

    // 3. Get GPS (non-blocking, fire and update)
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
          setGps(coords);
          const dist = calcDistanceMeters(coords.lat, coords.lng, OFFICE_LAT, OFFICE_LNG);
          setDistanceMeters(dist);
        },
        () => {},
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
      );
    }

    // 4. Load face-api model in background (non-blocking)
    try {
      const faceapi = await import("face-api.js");
      faceApiRef.current = faceapi;
      await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
      setFaceApiReady(true);
      startDetectionLoop(faceapi);
    } catch {
      // face-api unavailable — manual capture still works
      setFaceApiReady(false);
      setFaceDetected(true); // allow capture even without detection
    }
  }, [hasCheckedOut, startDetectionLoop]);

  const captureAndSubmit = useCallback(async () => {
    if (status === "submitting" || status === "done") return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    setStatus("capturing");
    if (detectLoopRef.current) {
      cancelAnimationFrame(detectLoopRef.current);
      detectLoopRef.current = null;
    }

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 640;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
    const base64 = dataUrl.split(",")[1]!;
    setCapturedImage(dataUrl);
    stopCamera();
    setStatus("submitting");

    try {
      if (hasCheckedIn) {
        await api.attendance.checkOut();
      } else {
        await api.attendance.checkIn({ selfieBase64: base64, latitude: gps?.lat ?? 0, longitude: gps?.lng ?? 0, accuracy: gps?.accuracy });
      }
      queryClient.invalidateQueries({ queryKey: ["attendance", "today"] });
      setStatus("done");
      toast.success(hasCheckedIn ? "Absen keluar berhasil! 🎉" : "Absen masuk berhasil! ✅");
      setTimeout(() => navigate("/dashboard"), 2000);
    } catch (err: any) {
      const msg = err?.data?.error || err?.message || "Gagal menyimpan absensi.";
      toast.error(msg);
      setStatus("idle");
      setCapturedImage(null);
    }
  }, [status, gps, hasCheckedIn, queryClient, navigate, stopCamera]);

  const handleCancel = useCallback(() => {
    stopCamera();
    setStatus("idle");
    setFaceDetected(false);
    setGps(null);
    setDistanceMeters(null);
  }, [stopCamera]);

  if (hasCheckedOut && status === "idle") {
    return (
      <div className="flex flex-col items-center justify-center min-h-full px-6 text-center">
        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-5">
          <CheckCircle2 className="w-10 h-10 text-green-600" />
        </div>
        <h2 className="text-xl font-bold text-[#4A4435] mb-2">Absensi Selesai!</h2>
        <p className="text-[#8C8573] text-sm mb-6">Anda sudah absen masuk dan keluar hari ini.</p>
        <Link href="/dashboard" className="bg-[#FACC15] text-[#4A4435] font-bold px-8 py-3 rounded-2xl">
          Kembali ke Beranda
        </Link>
        <p className="mt-8 text-xs text-[#8C8573]/40">PT. Lembayung Wanantara Padha</p>
      </div>
    );
  }

  const showCamera = status === "starting" || status === "live" || status === "capturing" || status === "submitting";
  const canCapture = (status === "live") && (faceDetected || !faceApiReady);

  return (
    <div className="flex flex-col min-h-full">
      <div className="bg-[#FACC15] px-5 pt-12 pb-8 rounded-b-[40px]">
        <div className="flex items-center gap-3 mb-4">
          <Link href="/dashboard" className="w-8 h-8 rounded-full bg-[#4A4435]/10 flex items-center justify-center">
            <ArrowLeft className="w-4 h-4 text-[#4A4435]" />
          </Link>
          <div>
            <h1 className="text-lg font-extrabold text-[#4A4435]">
              {hasCheckedIn ? "Absen Keluar" : "Absen Masuk"}
            </h1>
            <p className="text-xs text-[#4A4435]/60">
              {hasCheckedIn ? "Pindai wajah untuk clock-out" : "Pindai wajah untuk clock-in"}
            </p>
          </div>
        </div>
        {gps && distanceMeters !== null && (
          <div className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 ${distanceMeters <= MAX_DISTANCE_METERS ? "bg-white/40" : "bg-red-400/30"}`}>
            <MapPin className="w-3.5 h-3.5 text-[#4A4435]" />
            <span className="text-xs text-[#4A4435] font-medium">
              {distanceMeters <= MAX_DISTANCE_METERS
                ? `${Math.round(distanceMeters)}m dari kantor ✓`
                : `${Math.round(distanceMeters)}m dari kantor — terlalu jauh`}
            </span>
          </div>
        )}
        {gps && distanceMeters === null && (
          <div className="flex items-center gap-1.5 bg-white/40 rounded-xl px-3 py-1.5">
            <MapPin className="w-3.5 h-3.5 text-[#4A4435]" />
            <span className="text-xs text-[#4A4435] font-medium">{gps.lat.toFixed(5)}, {gps.lng.toFixed(5)}</span>
          </div>
        )}
      </div>

      <div className="flex-1 px-5 pt-6 flex flex-col items-center">

        {/* IDLE */}
        {status === "idle" && (
          <div className="flex flex-col items-center justify-center flex-1 text-center">
            <div className="w-32 h-32 rounded-full bg-[#FACC15]/20 border-4 border-dashed border-[#FACC15] flex items-center justify-center mb-6">
              <Camera className="w-12 h-12 text-[#FACC15]" />
            </div>
            <h2 className="text-lg font-bold text-[#4A4435] mb-2">
              {hasCheckedIn ? "Siap untuk Absen Keluar?" : "Siap untuk Absen Masuk?"}
            </h2>
            <p className="text-sm text-[#8C8573] mb-8 max-w-[260px]">
              Kamera depan akan dibuka untuk mengambil foto selfie Anda.
            </p>
            <button
              onClick={handleStart}
              className="flex items-center justify-center gap-2 bg-[#FACC15] text-[#4A4435] font-bold text-base h-14 px-10 rounded-2xl shadow-md active:scale-[0.98] transition-transform"
            >
              <Camera className="w-5 h-5" />
              Buka Kamera
            </button>
          </div>
        )}

        {/* CAMERA ERROR */}
        {status === "camera-error" && (
          <div className="flex flex-col items-center justify-center flex-1 text-center px-4">
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-4">
              <AlertCircle className="w-8 h-8 text-red-500" />
            </div>
            <h2 className="text-lg font-bold text-[#4A4435] mb-2">Kamera Tidak Dapat Diakses</h2>
            <p className="text-sm text-[#8C8573] leading-relaxed mb-6">{errorMsg}</p>
            <button
              onClick={() => { setStatus("idle"); setErrorMsg(""); }}
              className="bg-[#FACC15] text-[#4A4435] font-bold px-8 py-3 rounded-2xl"
            >
              Coba Lagi
            </button>
          </div>
        )}

        {/* CAMERA VIEW: starting, live, capturing, submitting */}
        {showCamera && (
          <div className="w-full flex flex-col items-center">
            <div className="relative w-72 h-72 rounded-full overflow-hidden border-4 border-[#FACC15] shadow-xl mb-5 bg-black">
              <video
                ref={videoCallbackRef}
                autoPlay
                playsInline
                muted
                className="absolute inset-0 w-full h-full object-cover scale-x-[-1]"
              />

              {/* Loading overlay saat "starting" */}
              {status === "starting" && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-full">
                  <div className="text-center">
                    <Loader2 className="w-10 h-10 text-[#FACC15] animate-spin mx-auto mb-2" />
                    <p className="text-white text-xs">Membuka kamera...</p>
                  </div>
                </div>
              )}

              {/* Overlay saat submitting */}
              {status === "submitting" && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-full">
                  <Loader2 className="w-12 h-12 text-white animate-spin" />
                </div>
              )}

              {/* Border indikator wajah */}
              {status === "live" && (
                faceDetected && faceApiReady ? (
                  <div className="absolute inset-0 border-4 border-green-400 rounded-full pointer-events-none" />
                ) : (
                  <div className="absolute inset-0 border-4 border-[#FACC15]/60 rounded-full pointer-events-none animate-pulse" />
                )
              )}
            </div>

            <canvas ref={canvasRef} className="hidden" />

            {/* Status deteksi wajah */}
            <div className="flex items-center gap-2 mb-5">
              {status === "starting" ? (
                <>
                  <div className="w-2.5 h-2.5 rounded-full bg-gray-400 animate-pulse" />
                  <span className="text-sm text-[#8C8573]">Menginisialisasi kamera...</span>
                </>
              ) : faceApiReady ? (
                faceDetected ? (
                  <>
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-sm font-semibold text-green-600">Wajah Terdeteksi ✓</span>
                  </>
                ) : (
                  <>
                    <div className="w-2.5 h-2.5 rounded-full bg-[#FACC15] animate-pulse" />
                    <span className="text-sm text-[#8C8573]">Posisikan wajah di dalam lingkaran...</span>
                  </>
                )
              ) : (
                <>
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                  <span className="text-sm font-semibold text-[#4A4435]">Kamera aktif — siap foto</span>
                </>
              )}
            </div>

            {faceApiReady && !faceDetected && status === "live" && (
              <p className="text-xs text-[#8C8573] text-center max-w-[240px] mb-4">
                Pastikan wajah Anda berada di tengah frame dengan pencahayaan yang cukup
              </p>
            )}

            <button
              onClick={captureAndSubmit}
              disabled={status !== "live" || (faceApiReady && !faceDetected)}
              className="w-full h-14 rounded-2xl bg-[#FACC15] text-[#4A4435] font-bold text-base flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] transition-transform disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {(status as string) === "submitting" || (status as string) === "capturing" ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Menyimpan...</>
              ) : (
                <><Camera className="w-5 h-5" /> Ambil Foto &amp; {hasCheckedIn ? "Keluar" : "Masuk"}</>
              )}
            </button>

            <button
              onClick={handleCancel}
              className="mt-3 text-sm text-[#8C8573] underline"
            >
              Batalkan
            </button>
          </div>
        )}

        {/* DONE */}
        {status === "done" && (
          <div className="flex flex-col items-center justify-center flex-1 text-center">
            {capturedImage && (
              <div className="w-28 h-28 rounded-full overflow-hidden border-4 border-green-400 mb-5 shadow-lg">
                <img src={capturedImage} alt="Selfie" className="w-full h-full object-cover scale-x-[-1]" />
              </div>
            )}
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
              <CheckCircle2 className="w-9 h-9 text-green-600" />
            </div>
            <h2 className="text-xl font-bold text-[#4A4435] mb-1">
              {hasCheckedIn ? "Berhasil Keluar!" : "Berhasil Masuk!"}
            </h2>
            <p className="text-sm text-[#8C8573]">Mengalihkan ke beranda...</p>
          </div>
        )}
      </div>

      <div className="pb-24 text-center pt-4">
        <p className="text-[10px] text-[#8C8573]/40">PT. Lembayung Wanantara Padha</p>
      </div>
    </div>
  );
}
