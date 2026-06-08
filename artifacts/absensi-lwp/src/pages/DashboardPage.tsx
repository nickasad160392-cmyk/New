import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import { api, type AttendanceRecord, type LeaveRequest } from "@/lib/api";
import {
  LogOut, Bell, ChevronRight, X, BellRing, Clock, Timer,
  AlertTriangle, CalendarDays, Music, ScanFace, MapPin,
  Camera, ImagePlus, User, Trash2, Loader2, CheckCircle2,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { MapContainer, TileLayer, Marker, Popup, Circle } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

const OFFICE_LAT = -8.128241;
const OFFICE_LNG = 113.234113;

function getCurrentMonthStart(): string {
  const now = new Date();
  const jakartaStr = now.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
  const [year, month] = jakartaStr.split("-").map(Number) as [number, number, number];
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function formatTime(d: Date) {
  return d.toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}
function formatDate(d: Date) {
  return d.toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta", weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "--:--";
  return new Date(iso).toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hour12: false });
}
function fmtDateShort(d: string) {
  try { return format(parseISO(d), "EEE, dd MMM", { locale: localeId }); } catch { return d; }
}

// ── IndexedDB helpers for 10MB music storage ─────────────────────────────
const IDB_NAME = "absensi_alarm_db";
const IDB_STORE = "alarm_music";

function openMusicDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = (e) => (e.target as IDBOpenDBRequest).result.createObjectStore(IDB_STORE);
    req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
    req.onerror = reject;
  });
}
async function saveMusicToIDB(file: File) {
  const db = await openMusicDB();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put({ blob: file, name: file.name }, "current");
    tx.oncomplete = () => res(); tx.onerror = rej;
  });
  db.close();
}
async function loadMusicFromIDB(): Promise<{ blob: Blob; name: string } | null> {
  const db = await openMusicDB();
  return new Promise((resolve) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).get("current");
    req.onsuccess = (e) => { db.close(); resolve((e.target as IDBRequest).result ?? null); };
    req.onerror = () => { db.close(); resolve(null); };
  });
}
async function clearMusicFromIDB() {
  const db = await openMusicDB();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).delete("current");
    tx.oncomplete = () => res(); tx.onerror = rej;
  });
  db.close();
}
// ─────────────────────────────────────────────────────────────────────────

function compressProfilePhoto(dataUrl: string, maxSize = 320): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const size = Math.min(maxSize, img.width, img.height);
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext("2d")!;
      const srcX = (img.width - size) / 2;
      const srcY = (img.height - size) / 2;
      ctx.drawImage(img, srcX, srcY, size, size, 0, 0, size, size);
      resolve(canvas.toDataURL("image/jpeg", 0.78));
    };
    img.src = dataUrl;
  });
}

function playAlarmSoundUrl(objectUrl?: string | null) {
  if (objectUrl) {
    try { new Audio(objectUrl).play().catch(() => {}); return; } catch {}
  }
  try {
    const ctx = new AudioContext();
    const play = (freq: number, start: number, dur: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = freq; osc.type = "sine";
      gain.gain.setValueAtTime(0.6, start);
      gain.gain.exponentialRampToValueAtTime(0.01, start + dur);
      osc.start(start); osc.stop(start + dur);
    };
    const t = ctx.currentTime;
    play(880, t, 0.25); play(1100, t + 0.3, 0.25);
    play(880, t + 0.6, 0.25); play(1100, t + 0.9, 0.25);
    play(1320, t + 1.2, 0.6);
  } catch {}
}
function playAlarmSound(base64?: string | null) {
  playAlarmSoundUrl(base64 ?? null);
}

const STATUS_MAP: Record<string, { label: string; bg: string; text: string }> = {
  hadir:     { label: "Hadir",     bg: "bg-green-100",  text: "text-green-700"  },
  terlambat: { label: "Terlambat", bg: "bg-red-100",    text: "text-[#E57373]"  },
  izin:      { label: "Izin",      bg: "bg-blue-100",   text: "text-[#64B5F6]"  },
  sakit:     { label: "Sakit",     bg: "bg-blue-100",   text: "text-[#64B5F6]"  },
  alpha:     { label: "Alpha",     bg: "bg-gray-100",   text: "text-gray-500"   },
  lembur:    { label: "Lembur",    bg: "bg-yellow-100", text: "text-[#FACC15]"  },
};

const STATUS_LABEL: Record<string, string> = {
  hadir: "Hadir", terlambat: "Terlambat", izin: "Izin", sakit: "Sakit", alpha: "Alpha", lembur: "Lembur",
};

type MetricKey = "jam-kerja" | "lembur" | "terlambat" | "izin";

function MetricModal({
  metricKey, onClose, history, leaves, summary,
}: {
  metricKey: MetricKey;
  onClose: () => void;
  history: AttendanceRecord[] | undefined;
  leaves: LeaveRequest[] | undefined;
  summary: import("@/lib/api").CycleSummary | undefined;
}) {
  const configs: Record<MetricKey, {
    title: string; icon: typeof Clock;
    iconBg: string; iconColor: string;
    totalLabel: string; totalValue: string;
    filterFn: (r: AttendanceRecord) => boolean;
    rowLabel: (r: AttendanceRecord) => string;
    rowColor: string;
  }> = {
    "jam-kerja": {
      title: "Jam Kerja", icon: Clock, iconBg: "bg-green-100", iconColor: "text-green-600",
      totalLabel: "Total jam kerja bulan ini",
      totalValue: summary ? `${Math.floor(summary.totalWorkMinutes / 60)}j ${summary.totalWorkMinutes % 60}m` : "--",
      filterFn: (r) => !!(r.workMinutes && r.workMinutes > 0),
      rowLabel: (r) => `${Math.floor((r.workMinutes ?? 0) / 60)}j ${(r.workMinutes ?? 0) % 60}m`,
      rowColor: "text-green-700",
    },
    "lembur": {
      title: "Lembur", icon: Timer, iconBg: "bg-yellow-100", iconColor: "text-yellow-600",
      totalLabel: "Total lembur bulan ini",
      totalValue: summary ? `${Math.floor(summary.totalOvertimeMinutes / 60)}j ${summary.totalOvertimeMinutes % 60}m` : "--",
      filterFn: (r) => !!(r.overtimeMinutes && r.overtimeMinutes > 0),
      rowLabel: (r) => `+${Math.floor((r.overtimeMinutes ?? 0) / 60)}j ${(r.overtimeMinutes ?? 0) % 60}m`,
      rowColor: "text-yellow-600",
    },
    "terlambat": {
      title: "Terlambat", icon: AlertTriangle, iconBg: "bg-red-100", iconColor: "text-red-500",
      totalLabel: "Total keterlambatan bulan ini",
      totalValue: summary ? `${summary.totalLatenessMinutes} menit` : "--",
      filterFn: (r) => !!(r.latenessMinutes && r.latenessMinutes > 0),
      rowLabel: (r) => `+${r.latenessMinutes ?? 0} menit`,
      rowColor: "text-red-500",
    },
    "izin": {
      title: "Izin", icon: CalendarDays, iconBg: "bg-blue-100", iconColor: "text-blue-500",
      totalLabel: "Total hari izin bulan ini",
      totalValue: summary ? `${summary.permitDays} hari` : "--",
      filterFn: (r) => r.status === "izin" || r.status === "sakit",
      rowLabel: (r) => STATUS_LABEL[r.status] ?? r.status,
      rowColor: "text-blue-600",
    },
  };
  const cfg = configs[metricKey];
  const Icon = cfg.icon;
  const filteredHistory = history ? [...history].filter(cfg.filterFn).reverse() : [];
  const filteredLeaves = metricKey === "izin" && leaves
    ? leaves.filter((l) => l.status === "approved" || l.status === "pending").reverse()
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white w-full max-w-[430px] rounded-t-3xl px-5 pt-5 pb-8 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${cfg.iconBg} flex items-center justify-center`}>
              <Icon className={`w-5 h-5 ${cfg.iconColor}`} />
            </div>
            <h2 className="text-base font-bold text-[#4A4435]">{cfg.title}</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
            <X className="w-4 h-4 text-[#8C8573]" />
          </button>
        </div>
        <div className={`${cfg.iconBg} rounded-2xl px-5 py-4 mb-5 text-center`}>
          <p className="text-[11px] text-[#8C8573] uppercase tracking-wider mb-1">{cfg.totalLabel}</p>
          <p className={`text-3xl font-extrabold ${cfg.iconColor}`}>{cfg.totalValue}</p>
        </div>
        <h3 className="text-xs font-bold text-[#8C8573] uppercase tracking-widest mb-3">Riwayat</h3>
        {metricKey !== "izin" && filteredHistory.length === 0 && (
          <p className="text-sm text-[#8C8573] text-center py-4">Belum ada catatan untuk bulan ini</p>
        )}
        {metricKey !== "izin" && filteredHistory.map((r) => (
          <div key={r.id} className="flex items-center justify-between py-2.5 border-b border-gray-50">
            <div>
              <p className="text-sm font-semibold text-[#4A4435]">{fmtDateShort(r.date)}</p>
              <p className="text-xs text-[#8C8573]">{fmtTime(r.checkInTime)} – {fmtTime(r.checkOutTime)}</p>
            </div>
            <span className={`text-sm font-bold ${cfg.rowColor}`}>{cfg.rowLabel(r)}</span>
          </div>
        ))}
        {metricKey === "izin" && filteredLeaves.length === 0 && filteredHistory.length === 0 && (
          <p className="text-sm text-[#8C8573] text-center py-4">Tidak ada izin untuk bulan ini</p>
        )}
        {metricKey === "izin" && filteredLeaves.map((l) => (
          <div key={l.id} className="flex items-center justify-between py-2.5 border-b border-gray-50">
            <div>
              <p className="text-sm font-semibold text-[#4A4435] capitalize">{l.type}</p>
              <p className="text-xs text-[#8C8573]">{l.startDate} – {l.endDate}</p>
            </div>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
              l.status === "approved" ? "bg-green-100 text-green-700" :
              l.status === "pending" ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-600"
            }`}>{l.status === "approved" ? "Disetujui" : l.status === "pending" ? "Menunggu" : "Ditolak"}</span>
          </div>
        ))}
        {metricKey === "izin" && filteredHistory.map((r) => (
          <div key={r.id} className="flex items-center justify-between py-2.5 border-b border-gray-50">
            <div><p className="text-sm font-semibold text-[#4A4435]">{fmtDateShort(r.date)}</p></div>
            <span className="text-xs font-bold text-blue-600">{STATUS_LABEL[r.status]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AlarmModal({ onClose }: { onClose: () => void }) {
  const [enabled, setEnabled] = useState(() => localStorage.getItem("absensi_alarm") === "1");
  const [alarmTime, setAlarmTime] = useState(() => localStorage.getItem("absensi_alarm_time") || "07:50");
  const [musicName, setMusicName] = useState("");
  const [musicUrl, setMusicUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadMusicFromIDB().then((data) => {
      if (data) {
        setMusicName(data.name);
        const url = URL.createObjectURL(data.blob);
        setMusicUrl(url);
      }
    });
    return () => { if (musicUrl) URL.revokeObjectURL(musicUrl); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMusicFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      alert("Ukuran file maksimal 10MB. Pilih file yang lebih kecil.");
      return;
    }
    await saveMusicToIDB(file);
    if (musicUrl) URL.revokeObjectURL(musicUrl);
    setMusicUrl(URL.createObjectURL(file));
    setMusicName(file.name);
  };

  const removeMusic = async () => {
    await clearMusicFromIDB();
    if (musicUrl) URL.revokeObjectURL(musicUrl);
    setMusicUrl(null);
    setMusicName("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const save = async () => {
    setSaving(true);
    localStorage.setItem("absensi_alarm", enabled ? "1" : "0");
    localStorage.setItem("absensi_alarm_time", alarmTime);
    if (enabled && Notification.permission === "default") await Notification.requestPermission();
    setSaving(false);
    onClose();
  };

  const testSound = () => playAlarmSoundUrl(musicUrl);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white w-full max-w-[430px] rounded-t-3xl px-5 pt-5 pb-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#FACC15]/20 flex items-center justify-center">
              <BellRing className="w-5 h-5 text-[#FACC15]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#4A4435]">Alarm Pengingat</h2>
              <p className="text-xs text-[#8C8573]">Bunyi otomatis sebelum jam masuk</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
            <X className="w-4 h-4 text-[#8C8573]" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-[#4A4435]">Aktifkan Alarm</p>
              <p className="text-xs text-[#8C8573]">Notifikasi + bunyi alarm</p>
            </div>
            <button
              onClick={() => setEnabled(!enabled)}
              className={`w-12 h-6 rounded-full transition-colors relative ${enabled ? "bg-[#FACC15]" : "bg-gray-300"}`}
            >
              <div className={`w-5 h-5 rounded-full bg-white shadow absolute top-0.5 transition-all ${enabled ? "left-6" : "left-0.5"}`} />
            </button>
          </div>

          {enabled && (
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-[#4A4435]">Waktu Alarm</label>
              <input
                type="time"
                value={alarmTime}
                onChange={(e) => setAlarmTime(e.target.value)}
                className="w-full h-11 px-4 rounded-xl border border-gray-200 bg-gray-50 text-[#4A4435] text-sm focus:outline-none focus:ring-2 focus:ring-[#FACC15]"
              />
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-[#4A4435]">Musik Alarm</p>
                <p className="text-xs text-[#8C8573]">Dari galeri musik perangkat (maks 10MB)</p>
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FACC15]/20 text-[#4A4435] text-xs font-semibold"
              >
                <Music className="w-3.5 h-3.5" />
                🎵 Galeri Musik
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={handleMusicFile}
            />
            {musicName ? (
              <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Music className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
                  <span className="text-xs text-green-700 font-medium truncate">{musicName}</span>
                </div>
                <button onClick={removeMusic} className="text-xs text-red-400 font-semibold ml-2 flex-shrink-0">Hapus</button>
              </div>
            ) : (
              <p className="text-xs text-[#8C8573] bg-gray-50 rounded-xl px-3 py-2">🔔 Default: nada alarm bawaan</p>
            )}
          </div>

          <button
            onClick={testSound}
            className="w-full h-11 rounded-xl border border-[#FACC15] text-[#4A4435] font-semibold text-sm flex items-center justify-center gap-2"
          >
            <BellRing className="w-4 h-4" />
            Test Suara Alarm
          </button>

          <button onClick={save} disabled={saving} className="w-full h-11 rounded-2xl bg-[#FACC15] text-[#4A4435] font-bold disabled:opacity-60">
            {saving ? "Menyimpan..." : "Simpan Pengaturan"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Profile Photo Modal ────────────────────────────────────────────────────
function ProfilePhotoModal({ onClose, onUpdated }: { onClose: () => void; onUpdated: () => void }) {
  const { user } = useAuth();
  const [phase, setPhase] = useState<"menu" | "camera" | "preview" | "saving">("menu");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [capturedBase64, setCapturedBase64] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const openCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      streamRef.current = stream;
      setPhase("camera");
      setTimeout(() => {
        if (videoRef.current && streamRef.current) {
          videoRef.current.srcObject = streamRef.current;
          videoRef.current.play().catch(() => {});
        }
      }, 80);
    } catch { alert("Kamera tidak dapat diakses"); }
  };

  const capturePhoto = async () => {
    const video = videoRef.current; const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth || 320; canvas.height = video.videoHeight || 320;
    const ctx = canvas.getContext("2d")!;
    ctx.save(); ctx.scale(-1, 1); ctx.drawImage(video, -canvas.width, 0); ctx.restore();
    const raw = canvas.toDataURL("image/jpeg", 0.9);
    const compressed = await compressProfilePhoto(raw, 320);
    setPreviewUrl(compressed);
    setCapturedBase64(compressed.split(",")[1]!);
    stopCamera(); setPhase("preview");
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string;
      const compressed = await compressProfilePhoto(dataUrl, 320);
      setPreviewUrl(compressed); setCapturedBase64(compressed.split(",")[1]!); setPhase("preview");
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const savePhoto = async () => {
    if (!capturedBase64) return;
    setPhase("saving");
    try {
      await api.auth.uploadPhoto(capturedBase64);
      onUpdated(); onClose();
    } catch { setPhase("preview"); alert("Gagal menyimpan foto"); }
  };

  const deletePhoto = async () => {
    if (!confirm("Hapus foto profil?")) return;
    setDeleting(true);
    try { await api.auth.deletePhoto(); onUpdated(); onClose(); }
    catch { alert("Gagal menghapus foto"); }
    setDeleting(false);
  };

  const currentPhoto = user?.profilePhoto ? `data:image/jpeg;base64,${user.profilePhoto}` : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white w-full max-w-[430px] rounded-t-3xl px-5 pt-5 pb-8" onClick={(e) => e.stopPropagation()}>
        <canvas ref={canvasRef} className="hidden" />
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#FACC15]/20 flex items-center justify-center">
              <User className="w-5 h-5 text-[#4A4435]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#4A4435]">Foto Profil</h2>
              <p className="text-xs text-[#8C8573]">Foto tampilan di beranda</p>
            </div>
          </div>
          <button onClick={() => { stopCamera(); onClose(); }} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
            <X className="w-4 h-4 text-[#8C8573]" />
          </button>
        </div>

        {phase === "menu" && (
          <div className="space-y-3">
            <div className="flex justify-center mb-4">
              <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-[#FACC15] shadow-lg bg-gray-100 flex items-center justify-center">
                {currentPhoto ? <img src={currentPhoto} alt="profil" className="w-full h-full object-cover" /> : <User className="w-10 h-10 text-gray-300" />}
              </div>
            </div>
            <button onClick={openCamera} className="w-full h-12 rounded-2xl bg-[#FACC15] text-[#4A4435] font-bold text-sm flex items-center justify-center gap-2">
              <Camera className="w-4 h-4" /> Ambil Foto Selfie
            </button>
            <label className="w-full h-12 rounded-2xl bg-white border-2 border-[#FACC15]/50 text-[#4A4435] font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer">
              <ImagePlus className="w-4 h-4" /> Upload dari Galeri
              <input type="file" accept="image/*" className="hidden" onChange={handleUpload} />
            </label>
            {currentPhoto && (
              <button onClick={deletePhoto} disabled={deleting} className="w-full h-10 rounded-2xl bg-white border border-red-200 text-red-500 font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50">
                <Trash2 className="w-3.5 h-3.5" /> {deleting ? "Menghapus..." : "Hapus Foto Profil"}
              </button>
            )}
            <div className="mt-2 pt-2 border-t border-gray-100">
              <Link href="/face-register" onClick={onClose} className="flex items-center justify-between w-full py-2">
                <div className="flex items-center gap-2">
                  <ScanFace className="w-4 h-4 text-[#4A4435]" />
                  <div>
                    <p className="text-sm font-semibold text-[#4A4435]">Daftar/Perbarui Wajah Absensi</p>
                    <p className="text-xs text-[#8C8573]">Foto wajah terpisah dari foto profil</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-[#8C8573]" />
              </Link>
            </div>
          </div>
        )}

        {phase === "camera" && (
          <div className="flex flex-col items-center">
            <div className="w-64 h-64 rounded-full overflow-hidden border-4 border-[#FACC15] shadow-xl mb-4 bg-black">
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
            </div>
            <button onClick={capturePhoto} className="w-full h-12 rounded-2xl bg-[#FACC15] text-[#4A4435] font-bold flex items-center justify-center gap-2 mb-2">
              <Camera className="w-4 h-4" /> Ambil Foto
            </button>
            <button onClick={() => { stopCamera(); setPhase("menu"); }} className="text-xs text-[#8C8573] underline">Batalkan</button>
          </div>
        )}

        {phase === "preview" && previewUrl && (
          <div className="flex flex-col items-center">
            <div className="w-40 h-40 rounded-full overflow-hidden border-4 border-[#FACC15] shadow-xl mb-4">
              <img src={previewUrl} alt="preview" className="w-full h-full object-cover" />
            </div>
            <p className="text-sm font-semibold text-[#4A4435] mb-1">Foto terlihat baik?</p>
            <p className="text-xs text-[#8C8573] mb-4 text-center">Pastikan wajah jelas sebelum menyimpan</p>
            <button onClick={savePhoto} className="w-full h-12 rounded-2xl bg-[#FACC15] text-[#4A4435] font-bold flex items-center justify-center gap-2 mb-2">
              <CheckCircle2 className="w-4 h-4" /> Simpan Foto Profil
            </button>
            <button onClick={() => { setPreviewUrl(null); setCapturedBase64(null); openCamera(); }} className="w-full h-10 rounded-2xl bg-white border border-gray-200 text-[#8C8573] font-semibold text-sm flex items-center justify-center gap-2">
              Foto Ulang
            </button>
          </div>
        )}

        {phase === "saving" && (
          <div className="flex flex-col items-center py-6">
            <Loader2 className="w-10 h-10 text-[#FACC15] animate-spin mb-3" />
            <p className="text-sm font-semibold text-[#4A4435]">Menyimpan foto profil...</p>
          </div>
        )}
      </div>
    </div>
  );
}

const officeIcon = L.divIcon({
  html: `<div style="display:flex;flex-direction:column;align-items:center;gap:2px"><div style="background:#4A4435;width:14px;height:14px;border-radius:50%;border:2px solid #FACC15;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div><div style="background:rgba(74,68,53,0.9);color:#FACC15;font-size:8px;font-weight:800;padding:1px 5px;border-radius:4px;white-space:nowrap;letter-spacing:0.3px">PT. LWP</div></div>`,
  className: "", iconAnchor: [7, 7],
});

function makeEmployeeIcon(color: string, name?: string) {
  const label = name
    ? `<div style="background:rgba(255,255,255,0.95);color:#4A4435;font-size:8px;font-weight:700;padding:1px 5px;border-radius:4px;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,0.2);margin-top:2px;max-width:80px;overflow:hidden;text-overflow:ellipsis">${name}</div>`
    : "";
  return L.divIcon({
    html: `<div style="display:flex;flex-direction:column;align-items:center"><div style="background:${color};width:12px;height:12px;border-radius:50%;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3)"></div>${label}</div>`,
    className: "", iconAnchor: [6, 6],
  });
}

function MiniMap({ isAdmin, ownGps }: {
  isAdmin: boolean;
  ownGps: { lat: number; lng: number } | null;
}) {
  const { data: todayData } = useQuery({
    queryKey: ["admin", "attendance-today-map"],
    queryFn: () => api.admin.attendanceToday(),
    enabled: isAdmin,
    refetchInterval: 60_000,
  });

  const center: [number, number] = ownGps
    ? [ownGps.lat, ownGps.lng]
    : (isAdmin && todayData?.records?.[0]?.checkInLatitude)
      ? [todayData.records[0].checkInLatitude!, todayData.records[0].checkInLongitude!]
      : [OFFICE_LAT, OFFICE_LNG];

  const statusColors: Record<string, string> = {
    hadir: "#22c55e", terlambat: "#ef4444", lembur: "#FACC15",
    izin: "#64B5F6", sakit: "#64B5F6", alpha: "#9ca3af",
  };

  return (
    <div className="w-full h-48 rounded-2xl overflow-hidden border border-gray-100 shadow-sm">
      <MapContainer
        center={center}
        zoom={15}
        style={{ width: "100%", height: "100%" }}
        scrollWheelZoom={false}
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Marker position={[OFFICE_LAT, OFFICE_LNG]} icon={officeIcon}>
          <Popup><span className="text-xs font-bold">Kantor LWP</span></Popup>
        </Marker>
        <Circle center={[OFFICE_LAT, OFFICE_LNG]} radius={500} color="#FACC15" fillColor="#FACC15" fillOpacity={0.08} />

        {isAdmin && todayData?.records?.filter((r) => r.checkInLatitude && r.checkInLongitude).map((r) => (
          <Marker
            key={r.id}
            position={[r.checkInLatitude!, r.checkInLongitude!]}
            icon={makeEmployeeIcon(statusColors[r.status] ?? "#9ca3af", r.user?.name)}
          >
            <Popup>
              <div style={{ fontFamily: "sans-serif", minWidth: 140 }}>
                {r.checkInSelfie && (
                  <img src={r.checkInSelfie} alt="selfie"
                    style={{ width: 64, height: 64, objectFit: "cover", borderRadius: "50%", margin: "0 auto 6px", display: "block", border: "2px solid #FACC15" }} />
                )}
                <p style={{ fontWeight: "bold", margin: "0 0 2px", textAlign: "center" }}>{r.user?.name ?? "—"}</p>
                <p style={{ fontSize: 11, color: "#666", margin: "0 0 2px", textAlign: "center" }}>{r.user?.jabatan || "PT. Lembayung Wanantara Padha"}</p>
                <p style={{ fontSize: 10, color: "#888", margin: 0, textAlign: "center" }}>Masuk: {r.checkInTime ? new Date(r.checkInTime).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false }) : "--"}</p>
              </div>
            </Popup>
          </Marker>
        ))}

        {!isAdmin && ownGps && (
          <Marker position={[ownGps.lat, ownGps.lng]} icon={makeEmployeeIcon("#FACC15", "Anda")}>
            <Popup>
              <div style={{ fontFamily: "sans-serif", textAlign: "center" }}>
                <p style={{ fontWeight: "bold", margin: "0 0 2px" }}>Posisi Anda</p>
                <p style={{ fontSize: 11, color: "#888", margin: 0 }}>PT. Lembayung Wanantara Padha</p>
              </div>
            </Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}

export default function DashboardPage() {
  const { user, logout, refreshUser } = useAuth();
  const [, navigate] = useLocation();
  const [now, setNow] = useState(new Date());
  const [metricModal, setMetricModal] = useState<MetricKey | null>(null);
  const [alarmModal, setAlarmModal] = useState(false);
  const [profileModal, setProfileModal] = useState(false);
  const [ownGps, setOwnGps] = useState<{ lat: number; lng: number } | null>(null);
  const [showMap, setShowMap] = useState(false);
  const alarmFiredRef = useRef<string>("");
  const monthStart = getCurrentMonthStart();
  const isAdmin = user?.role === "admin" || user?.role === "hr";

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setOwnGps({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {},
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
      );
    }
  }, []);

  useEffect(() => {
    const checkAlarm = () => {
      const enabled = localStorage.getItem("absensi_alarm") === "1";
      if (!enabled) return;
      const alarmTime = localStorage.getItem("absensi_alarm_time") || "07:50";
      const [alarmH, alarmM] = alarmTime.split(":").map(Number) as [number, number];
      const jakartaStr = new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" });
      const jakartaDate = new Date(jakartaStr);
      const h = jakartaDate.getHours(); const m = jakartaDate.getMinutes();
      const dateKey = jakartaDate.toLocaleDateString("en-CA");
      const fireKey = `${dateKey}-${alarmH}-${alarmM}`;
      if (h === alarmH && m === alarmM && alarmFiredRef.current !== fireKey) {
        alarmFiredRef.current = fireKey;
        loadMusicFromIDB().then((musicData) => {
          let url: string | null = null;
          if (musicData) { url = URL.createObjectURL(musicData.blob); }
          playAlarmSoundUrl(url);
          if (url) setTimeout(() => URL.revokeObjectURL(url!), 120_000);
        }).catch(() => playAlarmSoundUrl(null));
        if (Notification.permission === "granted") {
          new Notification("⏰ Pengingat Jam Masuk", { body: "Jam masuk kerja sebentar lagi! Segera bersiap.", icon: "/favicon.ico" });
        }
      }
    };
    checkAlarm();
    const interval = setInterval(checkAlarm, 30000);
    return () => clearInterval(interval);
  }, []);

  const { data: today, isLoading: loadingToday } = useQuery({
    queryKey: ["attendance", "today"],
    queryFn: () => api.attendance.today(),
    refetchInterval: 60_000,
  });

  const { data: cycle, isLoading: loadingCycle } = useQuery({
    queryKey: ["attendance", "cycle-summary", monthStart],
    queryFn: () => api.attendance.cycleSummary(monthStart),
  });

  const { data: historyData } = useQuery({
    queryKey: ["attendance", "history", monthStart],
    queryFn: () => api.attendance.history(monthStart),
    enabled: metricModal !== null && metricModal !== "izin",
  });

  const { data: leaveData } = useQuery({
    queryKey: ["leave", "list"],
    queryFn: () => api.leave.list(),
    enabled: metricModal === "izin",
  });

  const handleLogout = () => { logout(); navigate("/login"); };
  const hasCheckedIn = !!today?.checkInTime;
  const hasCheckedOut = !!today?.checkOutTime;
  const status = today?.status;
  const statusInfo = status ? STATUS_MAP[status] : null;
  const alarmEnabled = localStorage.getItem("absensi_alarm") === "1";

  const metrics: Array<{ key: MetricKey; label: string; todayValue: string; cycleValue: string; cycleLabel: string; color: string; bgColor: string }> = [
    {
      key: "jam-kerja", label: "JAM KERJA",
      todayValue: today?.workMinutes ? `${Math.floor(today.workMinutes / 60)}j ${today.workMinutes % 60}m` : "--",
      cycleValue: cycle ? `${Math.floor((cycle.totalWorkMinutes ?? 0) / 60)}j` : "--",
      cycleLabel: "total bulan", color: "text-green-600", bgColor: "bg-green-50",
    },
    {
      key: "lembur", label: "LEMBUR",
      todayValue: today?.overtimeMinutes ? `${Math.floor(today.overtimeMinutes / 60)}j ${today.overtimeMinutes % 60}m` : "--",
      cycleValue: cycle ? `${Math.floor((cycle.totalOvertimeMinutes ?? 0) / 60)}j` : "--",
      cycleLabel: "total bulan", color: "text-[#FACC15]", bgColor: "bg-yellow-50",
    },
    {
      key: "terlambat", label: "TERLAMBAT",
      todayValue: today?.latenessMinutes ? `${today.latenessMinutes}m` : "--",
      cycleValue: cycle ? `${cycle.totalLatenessMinutes ?? 0}m` : "--",
      cycleLabel: "total bulan", color: "text-[#E57373]", bgColor: "bg-red-50",
    },
    {
      key: "izin", label: "IZIN",
      todayValue: "--",
      cycleValue: cycle ? `${cycle.permitDays ?? 0} hari` : "--",
      cycleLabel: "bulan ini", color: "text-[#64B5F6]", bgColor: "bg-blue-50",
    },
  ];

  return (
    <div className="flex flex-col min-h-full">
      <div className="bg-[#FACC15] px-5 pt-12 pb-10 rounded-b-[48px] relative z-10 shadow-md">
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-3">
            {/* Profile photo avatar — tap to change */}
            <button
              onClick={() => setProfileModal(true)}
              className="relative flex-shrink-0 w-14 h-14 rounded-full overflow-hidden border-2 border-[#4A4435]/20 bg-[#4A4435] flex items-center justify-center shadow-md active:scale-95 transition-transform"
            >
              {user?.profilePhoto ? (
                <img src={`data:image/jpeg;base64,${user.profilePhoto}`} alt="profil" className="w-full h-full object-cover" />
              ) : (
                <span className="text-[#FACC15] font-extrabold text-lg">
                  {(user?.name ?? "?").split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()}
                </span>
              )}
              <div className="absolute bottom-0 right-0 w-4 h-4 rounded-full bg-[#FACC15] border border-white flex items-center justify-center">
                <Camera className="w-2.5 h-2.5 text-[#4A4435]" />
              </div>
            </button>
            <div>
              <p className="text-[#4A4435]/60 text-[10px] font-medium uppercase tracking-widest">Selamat Datang</p>
              <h2 className="text-[#4A4435] text-lg font-extrabold leading-tight mt-0.5">{user?.name ?? "Karyawan"}</h2>
              <p className="text-[#4A4435]/70 text-[11px] mt-0.5">{user?.jabatan || user?.position || "Karyawan"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAlarmModal(true)}
              className="w-8 h-8 rounded-full bg-[#4A4435]/10 flex items-center justify-center relative"
            >
              <Bell className="w-4 h-4 text-[#4A4435]" />
              {alarmEnabled && <div className="absolute top-0 right-0 w-2 h-2 rounded-full bg-green-500 border border-white" />}
            </button>
            <button onClick={handleLogout} className="w-8 h-8 rounded-full bg-[#4A4435]/10 flex items-center justify-center">
              <LogOut className="w-4 h-4 text-[#4A4435]" />
            </button>
          </div>
        </div>

        <div className="text-center">
          <div className="text-[#4A4435] text-5xl font-extrabold tabular-nums tracking-tight">{formatTime(now)}</div>
          <p className="text-[#4A4435]/70 text-xs mt-1.5 font-medium">{formatDate(now)}</p>
        </div>

        <div className="mt-4 bg-white/40 backdrop-blur-sm rounded-2xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex flex-col">
              <span className="text-[10px] text-[#4A4435]/60 uppercase tracking-wider font-medium">Datang</span>
              <span className="text-[#4A4435] font-bold text-lg">{fmtTime(today?.checkInTime)}</span>
            </div>
            <div className="w-px h-8 bg-[#4A4435]/20" />
            <div className="flex flex-col">
              <span className="text-[10px] text-[#4A4435]/60 uppercase tracking-wider font-medium">Pulang</span>
              <span className="text-[#4A4435] font-bold text-lg">{fmtTime(today?.checkOutTime)}</span>
            </div>
            {today?.workMinutes && (
              <>
                <div className="w-px h-8 bg-[#4A4435]/20" />
                <div className="flex flex-col">
                  <span className="text-[10px] text-[#4A4435]/60 uppercase tracking-wider font-medium">Jam Kerja</span>
                  <span className="font-bold text-lg text-green-700">
                    {Math.floor(today.workMinutes / 60)}j{today.workMinutes % 60 > 0 ? ` ${today.workMinutes % 60}m` : ""}
                  </span>
                </div>
              </>
            )}
          </div>
          {statusInfo ? (
            <span className={`text-xs font-bold px-3 py-1 rounded-full ${statusInfo.bg} ${statusInfo.text}`}>{statusInfo.label}</span>
          ) : !loadingToday ? (
            <span className="text-xs font-medium text-[#8C8573] bg-gray-100 px-3 py-1 rounded-full">Belum Absen</span>
          ) : null}
        </div>
      </div>

      <div className="px-5 pt-6 flex-1">
        {cycle && (
          <p className="text-xs text-[#8C8573] uppercase tracking-widest font-semibold mb-1">Bulan {cycle.cycleLabel}</p>
        )}
        <p className="text-[10px] text-[#8C8573] mb-4">Ketuk ikon untuk lihat riwayat lengkap</p>

        <div className="grid grid-cols-2 gap-4 mb-6">
          {metrics.map((m) => (
            <button
              key={m.key}
              onClick={() => setMetricModal(m.key)}
              className="flex flex-col items-center active:scale-95 transition-transform"
            >
              <div className={`w-[88px] h-[88px] rounded-full ${m.bgColor} shadow-md border-2 border-white flex flex-col items-center justify-center relative`}>
                {loadingCycle ? (
                  <div className="w-8 h-4 bg-gray-200 rounded animate-pulse" />
                ) : (
                  <>
                    <span className={`text-xl font-extrabold ${m.color}`}>{m.cycleValue}</span>
                    <span className="text-[9px] text-[#8C8573] font-medium">{m.cycleLabel}</span>
                    {m.todayValue !== "--" && (
                      <span className="text-[9px] text-[#8C8573] font-semibold">hari ini: {m.todayValue}</span>
                    )}
                  </>
                )}
              </div>
              <p className="text-[10px] text-[#8C8573] uppercase tracking-widest font-semibold mt-2">{m.label}</p>
            </button>
          ))}
        </div>

        {/* Shortcut wajah */}
        {!user?.hasFaceDescriptor && (
          <Link href="/face-register" className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3.5 mb-3 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center">
                <ScanFace className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-amber-800">Daftarkan Wajah Anda</p>
                <p className="text-xs text-amber-600">Wajib untuk absen menggunakan pemindai wajah</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-amber-400" />
          </Link>
        )}

        {/* Peta Lokasi */}
        <div className="mb-3">
          <button
            onClick={() => setShowMap((v) => !v)}
            className="flex items-center justify-between w-full bg-white rounded-2xl px-4 py-3.5 shadow-sm mb-2"
          >
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-[#8C8573]" />
              <div>
                <p className="text-sm font-semibold text-[#4A4435]">
                  {isAdmin ? "Peta Karyawan Hari Ini" : "Peta Lokasi Saya"}
                </p>
                <p className="text-xs text-[#8C8573]">
                  {isAdmin ? "Posisi real-time seluruh karyawan" : ownGps ? "GPS aktif" : "Tap untuk lihat peta"}
                </p>
              </div>
            </div>
            <ChevronRight className={`w-5 h-5 text-[#8C8573] transition-transform ${showMap ? "rotate-90" : ""}`} />
          </button>
          {showMap && <MiniMap isAdmin={isAdmin} ownGps={ownGps} />}
        </div>

        <div className="space-y-3">
          <Link href="/riwayat" className="flex items-center justify-between bg-white rounded-2xl px-4 py-3.5 shadow-sm">
            <div>
              <p className="text-sm font-semibold text-[#4A4435]">Riwayat Absensi</p>
              <p className="text-xs text-[#8C8573]">Lihat catatan kehadiran + unduh PDF</p>
            </div>
            <ChevronRight className="w-5 h-5 text-[#8C8573]" />
          </Link>
          <Link href="/izin" className="flex items-center justify-between bg-white rounded-2xl px-4 py-3.5 shadow-sm">
            <div>
              <p className="text-sm font-semibold text-[#4A4435]">Pengajuan Izin</p>
              <p className="text-xs text-[#8C8573]">Ajukan atau cek status izin Anda</p>
            </div>
            <ChevronRight className="w-5 h-5 text-[#8C8573]" />
          </Link>
          {isAdmin && (
            <Link href="/admin" className="flex items-center justify-between bg-[#4A4435] rounded-2xl px-4 py-3.5 shadow-sm">
              <div>
                <p className="text-sm font-semibold text-[#FACC15]">Panel Admin / HRD</p>
                <p className="text-xs text-[#FACC15]/70">Kelola karyawan, izin, dan rekap</p>
              </div>
              <ChevronRight className="w-5 h-5 text-[#FACC15]" />
            </Link>
          )}
        </div>

        <div className="mt-6 pb-8 text-center">
          <p className="text-[10px] text-[#8C8573]/40">PT. Lembayung Wanantara Padha</p>
        </div>
      </div>

      {metricModal && (
        <MetricModal
          metricKey={metricModal}
          onClose={() => setMetricModal(null)}
          history={historyData}
          leaves={leaveData}
          summary={cycle}
        />
      )}
      {alarmModal && <AlarmModal onClose={() => setAlarmModal(false)} />}
      {profileModal && (
        <ProfilePhotoModal
          onClose={() => setProfileModal(false)}
          onUpdated={() => { refreshUser?.(); }}
        />
      )}
    </div>
  );
}
