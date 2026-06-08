import { useState, useRef, useEffect, useCallback } from "react";
import { Link } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  ArrowLeft, Loader2, MapPin, AlertCircle, CheckCircle2,
  LogOut, Clock, Camera, Sunrise, Sunset, Timer, UserX, ScanFace,
} from "lucide-react";

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

async function getAddressFromCoords(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=id`,
      { headers: { "User-Agent": "AbsensiLWP/1.0" } },
    );
    const data = await res.json();
    if (data.display_name) {
      const parts = data.display_name.split(",").map((s: string) => s.trim());
      return parts.slice(0, 4).join(", ");
    }
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  } catch {
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }
}

type CameraPhase = "idle" | "starting" | "live" | "preview" | "submitting" | "done";
type Mode = "check-in" | "check-out" | "overtime-option" | "overtime-in-progress" | "done-all";

function getMode(today: import("@/lib/api").AttendanceRecord | null | undefined): Mode {
  if (!today || !today.checkInTime) return "check-in";
  if (!today.checkOutTime) return "check-out";
  if (today.overtimeCheckInTime && !today.overtimeCheckOutTime) return "overtime-in-progress";
  if (!today.overtimeCheckInTime) return "overtime-option";
  return "done-all";
}

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "--:--";
  return new Date(iso).toLocaleTimeString("id-ID", {
    timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

const MODE_CONFIG: Record<"check-in" | "check-out" | "overtime-option", {
  label: string; desc: string; icon: typeof Sunrise;
  iconBg: string; iconColor: string; btnBg: string; btnText: string; borderColor: string;
}> = {
  "check-in": {
    label: "Absen Datang", desc: "Ambil foto selfie untuk clock-in pagi",
    icon: Sunrise, iconBg: "bg-[#FACC15]/20", iconColor: "text-[#FACC15]",
    btnBg: "bg-[#FACC15]", btnText: "text-[#4A4435]", borderColor: "border-[#FACC15]",
  },
  "check-out": {
    label: "Absen Pulang", desc: "Ambil foto selfie untuk clock-out",
    icon: Sunset, iconBg: "bg-blue-50", iconColor: "text-blue-500",
    btnBg: "bg-blue-500", btnText: "text-white", borderColor: "border-blue-400",
  },
  "overtime-option": {
    label: "Lembur Tambahan", desc: "Ambil foto selfie untuk mulai lembur",
    icon: Timer, iconBg: "bg-orange-50", iconColor: "text-orange-500",
    btnBg: "bg-orange-500", btnText: "text-white", borderColor: "border-orange-400",
  },
};

export default function AbsenPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraPhase, setCameraPhase] = useState<CameraPhase>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [gps, setGps] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [distanceMeters, setDistanceMeters] = useState<number | null>(null);
  const [capturedDataUrl, setCapturedDataUrl] = useState<string | null>(null);
  const [capturedBase64, setCapturedBase64] = useState<string | null>(null);

  const { data: today, isLoading: loadingToday } = useQuery({
    queryKey: ["attendance", "today"],
    queryFn: () => api.attendance.today(),
    refetchInterval: 30_000,
  });

  const hasNoFace = !user?.hasFaceDescriptor;
  const mode: Mode = getMode(today);

  const stopCamera = useCallback(() => {
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const openCamera = useCallback(async () => {
    setCameraPhase("starting");
    setErrorMsg("");
    setCapturedDataUrl(null);
    setCapturedBase64(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 720 } }, audio: false,
      });
      streamRef.current = stream;
      setCameraPhase("live");
      setTimeout(() => {
        if (videoRef.current && streamRef.current) {
          videoRef.current.srcObject = streamRef.current;
          videoRef.current.play().catch(() => {});
        }
      }, 80);
    } catch (err: any) {
      if (err.name === "NotAllowedError") setErrorMsg("Izin kamera ditolak. Buka Pengaturan Browser > Izin > Kamera.");
      else if (err.name === "NotFoundError") setErrorMsg("Kamera tidak ditemukan.");
      else setErrorMsg(`Kamera tidak dapat diakses: ${err.message || err.name}`);
      setCameraPhase("idle");
      return;
    }

    if (navigator.geolocation && !gps) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
          setGps(coords);
          const dist = calcDistanceMeters(coords.lat, coords.lng, OFFICE_LAT, OFFICE_LNG);
          setDistanceMeters(dist);
          const addr = await getAddressFromCoords(coords.lat, coords.lng);
          setAddress(addr);
        },
        () => {},
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
      );
    }
  }, [gps]);

  const capturePhoto = useCallback(() => {
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
    const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
    const base64 = dataUrl.split(",")[1]!;
    setCapturedDataUrl(dataUrl);
    setCapturedBase64(base64);
    stopCamera();
    setCameraPhase("preview");
  }, [stopCamera]);

  const retakePhoto = useCallback(() => {
    setCapturedDataUrl(null);
    setCapturedBase64(null);
    openCamera();
  }, [openCamera]);

  const submitPhoto = useCallback(async () => {
    if (!capturedBase64 && mode !== "overtime-in-progress") return;
    setCameraPhase("submitting");
    try {
      if (mode === "check-in") {
        await api.attendance.checkIn({
          selfieBase64: capturedBase64 ?? undefined,
          latitude: gps?.lat ?? 0, longitude: gps?.lng ?? 0, accuracy: gps?.accuracy,
        });
        toast.success("✅ Absen masuk berhasil!");
      } else if (mode === "check-out") {
        await api.attendance.checkOut({ selfieBase64: capturedBase64 ?? undefined });
        toast.success("🎉 Absen keluar berhasil!");
      } else if (mode === "overtime-option") {
        await api.attendance.overtimeCheckIn({ selfieBase64: capturedBase64 ?? undefined });
        toast.success("⏰ Sesi lembur dimulai!");
      }
      queryClient.invalidateQueries({ queryKey: ["attendance", "today"] });
      queryClient.invalidateQueries({ queryKey: ["attendance", "cycle-summary"] });
      setCameraPhase("done");
    } catch (err: any) {
      toast.error(err?.data?.error || err?.message || "Gagal menyimpan absensi.");
      setCameraPhase("idle");
    }
  }, [capturedBase64, mode, gps, queryClient]);

  const handleOvertimeCheckOut = useCallback(async () => {
    setCameraPhase("submitting");
    try {
      await api.attendance.overtimeCheckOut();
      toast.success("✅ Sesi lembur selesai!");
      queryClient.invalidateQueries({ queryKey: ["attendance", "today"] });
      queryClient.invalidateQueries({ queryKey: ["attendance", "cycle-summary"] });
      setCameraPhase("done");
    } catch (err: any) {
      toast.error(err?.data?.error || err?.message || "Gagal menyimpan.");
      setCameraPhase("idle");
    }
  }, [queryClient]);

  const cancelCamera = useCallback(() => {
    stopCamera();
    setCameraPhase("idle");
    setErrorMsg("");
    setCapturedDataUrl(null);
    setCapturedBase64(null);
  }, [stopCamera]);

  if (loadingToday) {
    return <div className="flex items-center justify-center min-h-full"><Loader2 className="w-8 h-8 animate-spin text-[#FACC15]" /></div>;
  }

  const showCameraUI = cameraPhase === "starting" || cameraPhase === "live";
  const modeLabel =
    mode === "check-in" ? "Absen Datang"
    : mode === "check-out" ? "Absen Pulang"
    : mode === "overtime-option" ? "Lembur Tambahan"
    : mode === "overtime-in-progress" ? "Selesai Lembur"
    : "Selesai";
  const modeCfg = mode in MODE_CONFIG ? MODE_CONFIG[mode as keyof typeof MODE_CONFIG] : null;
  const profilePhotoSrc = user?.profilePhoto ? `data:image/jpeg;base64,${user.profilePhoto}` : null;

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <div className="bg-[#FACC15] px-5 pt-12 pb-6 rounded-b-[40px]">
        <div className="flex items-center gap-3 mb-3">
          <Link href="/dashboard" className="w-8 h-8 rounded-full bg-[#4A4435]/10 flex items-center justify-center">
            <ArrowLeft className="w-4 h-4 text-[#4A4435]" />
          </Link>
          <div>
            <h1 className="text-lg font-extrabold text-[#4A4435]">{modeLabel}</h1>
            <p className="text-xs text-[#4A4435]/60">Ambil foto selfie untuk absen</p>
          </div>
          {profilePhotoSrc && (
            <div className="ml-auto w-9 h-9 rounded-full overflow-hidden border-2 border-[#4A4435]/20">
              <img src={profilePhotoSrc} alt="profil" className="w-full h-full object-cover" />
            </div>
          )}
        </div>

        {today?.checkInTime && (
          <div className="bg-white/40 rounded-xl px-4 py-2.5 flex items-center justify-around text-xs text-[#4A4435]">
            <div className="text-center">
              <p className="text-[10px] font-medium text-[#4A4435]/60 uppercase tracking-wide">Datang</p>
              <p className="font-bold text-sm">{fmtTime(today.checkInTime)}</p>
            </div>
            {today.checkOutTime && (
              <>
                <div className="w-px h-6 bg-[#4A4435]/20" />
                <div className="text-center">
                  <p className="text-[10px] font-medium text-[#4A4435]/60 uppercase tracking-wide">Pulang</p>
                  <p className="font-bold text-sm">{fmtTime(today.checkOutTime)}</p>
                </div>
              </>
            )}
            {today.workMinutes && (
              <>
                <div className="w-px h-6 bg-[#4A4435]/20" />
                <div className="text-center">
                  <p className="text-[10px] font-medium text-[#4A4435]/60 uppercase tracking-wide">Jam Kerja</p>
                  <p className="font-bold text-sm text-green-700">{Math.floor(today.workMinutes / 60)}j {today.workMinutes % 60}m</p>
                </div>
              </>
            )}
          </div>
        )}

        {gps && (
          <div className="mt-2 space-y-1">
            <div className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 ${
              distanceMeters !== null && distanceMeters <= MAX_DISTANCE_METERS ? "bg-white/40" :
              distanceMeters !== null ? "bg-red-400/30" : "bg-white/30"
            }`}>
              <MapPin className="w-3.5 h-3.5 text-[#4A4435] flex-shrink-0" />
              <span className="text-xs text-[#4A4435] font-medium truncate">
                {distanceMeters !== null
                  ? distanceMeters <= MAX_DISTANCE_METERS
                    ? `${Math.round(distanceMeters)}m dari kantor ✓`
                    : `${Math.round(distanceMeters)}m — di luar area kantor`
                  : `${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)}`}
              </span>
            </div>
            {address && (
              <div className="flex items-start gap-1.5 bg-white/30 rounded-xl px-3 py-1.5">
                <MapPin className="w-3.5 h-3.5 text-[#4A4435] flex-shrink-0 mt-0.5" />
                <span className="text-[11px] text-[#4A4435]/80 leading-tight">{address}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Hidden canvas for capture */}
      <canvas ref={canvasRef} className="hidden" />

      <div className="flex-1 px-5 pt-6 flex flex-col items-center pb-24">

        {/* No Face Registered */}
        {hasNoFace && cameraPhase === "idle" && mode !== "done-all" && (
          <div className="flex flex-col items-center justify-center flex-1 text-center">
            <div className="w-24 h-24 rounded-full bg-amber-50 border-4 border-dashed border-amber-300 flex items-center justify-center mb-6">
              <UserX className="w-12 h-12 text-amber-500" />
            </div>
            <h2 className="text-lg font-extrabold text-[#4A4435] mb-2">Foto Belum Terdaftar</h2>
            <p className="text-sm text-[#8C8573] mb-8 max-w-[260px] leading-relaxed">
              Daftarkan foto selfie terlebih dahulu sebelum bisa absen.
            </p>
            <Link
              href="/face-register"
              className="flex items-center justify-center gap-2 w-full h-14 rounded-2xl bg-[#FACC15] text-[#4A4435] font-bold text-base shadow-lg"
            >
              <ScanFace className="w-5 h-5" />
              Daftarkan Foto Sekarang
            </Link>
          </div>
        )}

        {/* Error */}
        {errorMsg && cameraPhase === "idle" && (
          <div className="w-full bg-red-50 border border-red-200 rounded-2xl p-4 mb-5 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-700">Kamera Tidak Dapat Diakses</p>
              <p className="text-xs text-red-600 mt-1">{errorMsg}</p>
            </div>
          </div>
        )}

        {/* DONE ALL */}
        {mode === "done-all" && cameraPhase !== "submitting" && (
          <div className="flex flex-col items-center justify-center flex-1 text-center">
            <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-5">
              <CheckCircle2 className="w-11 h-11 text-green-600" />
            </div>
            <h2 className="text-xl font-bold text-[#4A4435] mb-2">Absensi Selesai!</h2>
            <p className="text-sm text-[#8C8573] mb-1">Anda sudah absen datang, pulang, dan lembur hari ini.</p>
            {today?.overtimeExtraMinutes && (
              <p className="text-sm font-semibold text-[#FACC15] mb-5">
                Lembur tambahan: {Math.floor(today.overtimeExtraMinutes / 60)}j {today.overtimeExtraMinutes % 60}m
              </p>
            )}
            <Link href="/dashboard" className="bg-[#FACC15] text-[#4A4435] font-bold px-8 py-3 rounded-2xl">
              Kembali ke Beranda
            </Link>
          </div>
        )}

        {/* OVERTIME IN PROGRESS */}
        {mode === "overtime-in-progress" && cameraPhase === "idle" && (
          <div className="flex flex-col items-center justify-center flex-1 text-center">
            <div className="w-20 h-20 rounded-full bg-[#FACC15]/20 border-4 border-dashed border-[#FACC15] flex items-center justify-center mb-5">
              <Clock className="w-10 h-10 text-[#FACC15]" />
            </div>
            <h2 className="text-lg font-bold text-[#4A4435] mb-1">Sesi Lembur Aktif</h2>
            <p className="text-sm text-[#8C8573] mb-2">Mulai: {fmtTime(today?.overtimeCheckInTime)}</p>
            <p className="text-xs text-[#8C8573] mb-8 max-w-[260px]">Tekan tombol di bawah jika sudah selesai lembur.</p>
            <button
              onClick={handleOvertimeCheckOut}
              className="flex items-center justify-center gap-2 bg-[#FACC15] text-[#4A4435] font-bold h-14 px-10 rounded-2xl shadow-md"
            >
              <LogOut className="w-5 h-5" />
              Selesai Lembur
            </button>
          </div>
        )}

        {/* OVERTIME OPTION */}
        {mode === "overtime-option" && cameraPhase === "idle" && !hasNoFace && (
          <div className="flex flex-col items-center justify-center flex-1 text-center">
            <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-4">
              <CheckCircle2 className="w-11 h-11 text-green-600" />
            </div>
            <h2 className="text-lg font-bold text-[#4A4435] mb-1">Absen Keluar Berhasil!</h2>
            <p className="text-sm text-[#8C8573] mb-6">Apakah Anda akan kembali bekerja lembur hari ini?</p>
            <div className="w-full space-y-3">
              <button
                onClick={() => openCamera()}
                className="w-full flex items-center justify-center gap-2 h-13 px-6 py-3 rounded-2xl bg-orange-500 text-white font-bold shadow-md"
              >
                <Camera className="w-5 h-5" />
                Ya, Mulai Lembur Tambahan
              </button>
              <Link
                href="/dashboard"
                className="flex items-center justify-center w-full h-12 px-6 rounded-2xl bg-white border border-gray-200 text-[#8C8573] font-semibold text-sm"
              >
                Tidak, Kembali ke Beranda
              </Link>
            </div>
          </div>
        )}

        {/* IDLE check-in / check-out */}
        {(mode === "check-in" || mode === "check-out") && cameraPhase === "idle" && !hasNoFace && (
          <div className="flex flex-col items-center justify-center flex-1 text-center">
            {modeCfg && (
              <>
                {/* Show registered profile photo as reference */}
                {profilePhotoSrc ? (
                  <div className="relative mb-8">
                    <div className={`w-36 h-36 rounded-full overflow-hidden border-4 shadow-lg ${modeCfg.borderColor}`}>
                      <img src={profilePhotoSrc} alt="Foto terdaftar" className="w-full h-full object-cover" />
                    </div>
                    <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-green-500 border-2 border-white flex items-center justify-center">
                      <CheckCircle2 className="w-4 h-4 text-white" />
                    </div>
                    <p className="text-xs text-[#8C8573] mt-2">Foto terdaftar</p>
                  </div>
                ) : (
                  <div className={`w-36 h-36 rounded-full border-4 border-dashed flex items-center justify-center mb-8 ${modeCfg.iconBg} ${modeCfg.borderColor}`}>
                    <modeCfg.icon className={`w-16 h-16 ${modeCfg.iconColor}`} />
                  </div>
                )}

                <h2 className="text-xl font-extrabold text-[#4A4435] mb-2">{modeCfg.label}</h2>
                <p className="text-sm text-[#8C8573] mb-6 max-w-[260px]">{modeCfg.desc}</p>

                <div className="w-full grid grid-cols-2 gap-3 mb-6">
                  {[
                    { key: "check-in", label: "Absen Datang", Icon: Sunrise, active: mode === "check-in", color: "bg-[#FACC15]/10 border-[#FACC15]", text: "text-[#4A4435]" },
                    { key: "check-out", label: "Absen Pulang", Icon: Sunset, active: mode === "check-out", color: "bg-blue-50 border-blue-300", text: "text-blue-600" },
                  ].map((item) => (
                    <div key={item.key} className={`flex flex-col items-center py-3 rounded-xl border-2 ${item.active ? item.color : "bg-gray-50 border-gray-200 opacity-40"}`}>
                      <item.Icon className={`w-6 h-6 mb-1 ${item.active ? item.text : "text-gray-400"}`} />
                      <span className={`text-[10px] font-bold uppercase tracking-wider ${item.active ? item.text : "text-gray-400"}`}>{item.label}</span>
                      {item.active && <div className="w-1.5 h-1.5 rounded-full bg-green-500 mt-1.5" />}
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => openCamera()}
                  className={`flex items-center justify-center gap-2 font-bold text-base h-14 w-full rounded-2xl shadow-md active:scale-[0.98] transition-transform ${modeCfg.btnBg} ${modeCfg.btnText}`}
                >
                  <Camera className="w-5 h-5" />
                  Buka Kamera & Foto Selfie
                </button>
              </>
            )}
          </div>
        )}

        {/* STARTING */}
        {cameraPhase === "starting" && (
          <div className="flex flex-col items-center justify-center flex-1 text-center">
            <Loader2 className="w-12 h-12 text-[#FACC15] animate-spin mb-4" />
            <p className="text-sm font-semibold text-[#4A4435]">Membuka kamera...</p>
          </div>
        )}

        {/* LIVE CAMERA */}
        {cameraPhase === "live" && (
          <div className="w-full flex flex-col items-center">
            <div className="relative w-72 h-72 rounded-full overflow-hidden shadow-xl mb-2 bg-black border-4 border-[#FACC15]">
              <video
                ref={videoRef}
                autoPlay playsInline muted
                className="absolute inset-0 w-full h-full object-cover"
              />
            </div>

            {/* Show registered photo for comparison */}
            {profilePhotoSrc && (
              <div className="flex items-center gap-3 mb-4 bg-white rounded-2xl px-4 py-2 shadow-sm">
                <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-[#FACC15]">
                  <img src={profilePhotoSrc} alt="terdaftar" className="w-full h-full object-cover" />
                </div>
                <p className="text-xs text-[#8C8573]">Pastikan wajah sesuai foto terdaftar</p>
              </div>
            )}

            <button
              onClick={capturePhoto}
              className="w-full h-14 rounded-2xl bg-[#FACC15] text-[#4A4435] font-bold text-base flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] transition-all mb-3"
            >
              <Camera className="w-5 h-5" />
              Ambil Foto
            </button>
            <button onClick={cancelCamera} className="text-xs text-[#8C8573] underline">Batalkan</button>
          </div>
        )}

        {/* PREVIEW */}
        {cameraPhase === "preview" && capturedDataUrl && (
          <div className="w-full flex flex-col items-center">
            <div className="w-72 h-72 rounded-full overflow-hidden border-4 border-[#FACC15] shadow-xl mb-4">
              <img src={capturedDataUrl} alt="selfie" className="w-full h-full object-cover" />
            </div>
            {profilePhotoSrc && (
              <div className="flex items-center gap-3 mb-4 bg-white rounded-2xl px-4 py-2 shadow-sm w-full">
                <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-[#FACC15]">
                  <img src={profilePhotoSrc} alt="terdaftar" className="w-full h-full object-cover" />
                </div>
                <p className="text-xs text-[#8C8573]">Foto terdaftar untuk perbandingan</p>
              </div>
            )}
            <p className="text-sm font-semibold text-[#4A4435] mb-1">Foto terlihat baik?</p>
            <p className="text-xs text-[#8C8573] mb-5 text-center">Tekan "Simpan Absensi" untuk melanjutkan</p>
            <div className="w-full space-y-3">
              <button
                onClick={submitPhoto}
                className={`w-full h-14 rounded-2xl font-bold text-base flex items-center justify-center gap-2 shadow-md ${modeCfg?.btnBg ?? "bg-[#FACC15]"} ${modeCfg?.btnText ?? "text-[#4A4435]"}`}
              >
                <CheckCircle2 className="w-5 h-5" />
                Simpan Absensi
              </button>
              <button
                onClick={retakePhoto}
                className="w-full h-11 rounded-2xl bg-white border border-gray-200 text-[#8C8573] font-semibold text-sm flex items-center justify-center gap-1.5"
              >
                <Camera className="w-4 h-4" /> Ambil Ulang
              </button>
            </div>
          </div>
        )}

        {/* SUBMITTING */}
        {cameraPhase === "submitting" && (
          <div className="flex flex-col items-center justify-center flex-1 text-center">
            <Loader2 className="w-12 h-12 text-[#FACC15] animate-spin mb-4" />
            <p className="text-sm font-semibold text-[#4A4435]">Menyimpan absensi...</p>
          </div>
        )}

        {/* DONE */}
        {cameraPhase === "done" && (
          <div className="flex flex-col items-center justify-center flex-1 text-center">
            <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-5">
              <CheckCircle2 className="w-11 h-11 text-green-600" />
            </div>
            <h2 className="text-xl font-bold text-[#4A4435] mb-2">Absensi Tersimpan!</h2>
            <p className="text-sm text-[#8C8573] mb-8 max-w-[260px]">
              {mode === "check-in" ? "Selamat bekerja! Semangat hari ini." :
               mode === "check-out" ? "Selamat beristirahat! Sampai besok." :
               "Sesi lembur dimulai. Semangat!"}
            </p>
            <Link href="/dashboard" className="bg-[#FACC15] text-[#4A4435] font-bold px-8 py-3 rounded-2xl">
              Kembali ke Beranda
            </Link>
          </div>
        )}

        {/* SUBMITTING for overtime checkout */}
        {cameraPhase === "submitting" && mode === "overtime-in-progress" && (
          <div className="flex flex-col items-center justify-center flex-1 text-center">
            <Loader2 className="w-12 h-12 text-[#FACC15] animate-spin mb-4" />
            <p className="text-sm font-semibold text-[#4A4435]">Menyimpan sesi lembur...</p>
          </div>
        )}

      </div>
    </div>
  );
}
