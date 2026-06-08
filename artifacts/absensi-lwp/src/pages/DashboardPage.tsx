import { useState, useEffect, useRef } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type AttendanceRecord, type LeaveRequest } from "@/lib/api";
import FaceScanModal from "@/components/FaceScanModal";
import {
  Bell, BellRing, ChevronRight, X, Clock, Timer,
  AlertTriangle, CalendarDays, CheckCircle2, Loader2,
  Sunrise, Sunset, LogOut, ScanFace, User,
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
  const [year, month] = jakartaStr.split("-").map(Number) as [number, number];
  return `${year}-${String(month).padStart(2, "0")}-01`;
}
function formatClock(d: Date) {
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

// ── IDB helpers for alarm music ───────────────────────────────────────────────
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
async function loadMusicFromIDB(): Promise<{ blob: Blob; name: string } | null> {
  const db = await openMusicDB();
  return new Promise((resolve) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).get("current");
    req.onsuccess = (e) => { db.close(); resolve((e.target as IDBRequest).result ?? null); };
    req.onerror = () => { db.close(); resolve(null); };
  });
}
function playAlarmSoundUrl(objectUrl?: string | null) {
  if (objectUrl) { try { new Audio(objectUrl).play().catch(() => {}); return; } catch {} }
  try {
    const ctx = new AudioContext();
    const play = (freq: number, start: number, dur: number) => {
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = freq; osc.type = "sine";
      gain.gain.setValueAtTime(0.6, start);
      gain.gain.exponentialRampToValueAtTime(0.01, start + dur);
      osc.start(start); osc.stop(start + dur);
    };
    const t = ctx.currentTime;
    play(880, t, 0.25); play(1100, t + 0.3, 0.25); play(880, t + 0.6, 0.25); play(1320, t + 0.9, 0.5);
  } catch {}
}

// ── Status map ────────────────────────────────────────────────────────────────
const STATUS_MAP: Record<string, { label: string; bg: string; text: string }> = {
  hadir:     { label: "Hadir",     bg: "bg-green-100",  text: "text-green-700"  },
  terlambat: { label: "Terlambat", bg: "bg-red-100",    text: "text-red-600"    },
  izin:      { label: "Izin",      bg: "bg-blue-100",   text: "text-blue-600"   },
  sakit:     { label: "Sakit",     bg: "bg-blue-100",   text: "text-blue-600"   },
  alpha:     { label: "Alpha",     bg: "bg-gray-100",   text: "text-gray-500"   },
  lembur:    { label: "Lembur",    bg: "bg-yellow-100", text: "text-yellow-700" },
};
const STATUS_LABEL: Record<string, string> = {
  hadir: "Hadir", terlambat: "Terlambat", izin: "Izin", sakit: "Sakit", alpha: "Alpha", lembur: "Lembur",
};

type MetricKey = "jam-kerja" | "lembur" | "terlambat" | "izin";

// ── Metric Modal ──────────────────────────────────────────────────────────────
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
            <p className="text-sm font-semibold text-[#4A4435]">{fmtDateShort(r.date)}</p>
            <span className="text-xs font-bold text-blue-600">{STATUS_LABEL[r.status]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Alarm Modal (quick access from header bell) ───────────────────────────────
function AlarmModal({ onClose }: { onClose: () => void }) {
  const [enabled, setEnabled] = useState(() => localStorage.getItem("absensi_alarm") === "1");
  const [alarmTime, setAlarmTime] = useState(() => localStorage.getItem("absensi_alarm_time") || "07:50");
  const [musicName, setMusicName] = useState("");
  const [musicUrl, setMusicUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadMusicFromIDB().then((data) => {
      if (data) { setMusicName(data.name); setMusicUrl(URL.createObjectURL(data.blob)); }
    });
  }, []);

  const save = () => {
    localStorage.setItem("absensi_alarm", enabled ? "1" : "0");
    localStorage.setItem("absensi_alarm_time", alarmTime);
    if (enabled && Notification.permission === "default") Notification.requestPermission();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white w-full max-w-[430px] rounded-t-3xl px-5 pt-5 pb-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#FACC15]/20 flex items-center justify-center">
              <BellRing className="w-5 h-5 text-[#4A4435]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#4A4435]">Alarm Pengingat</h2>
              <p className="text-xs text-[#8C8573]">Atur pengingat jam masuk</p>
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
            <button onClick={() => setEnabled(!enabled)} className={`w-12 h-6 rounded-full transition-colors relative ${enabled ? "bg-[#FACC15]" : "bg-gray-300"}`}>
              <div className={`w-5 h-5 rounded-full bg-white shadow absolute top-0.5 transition-all ${enabled ? "left-6" : "left-0.5"}`} />
            </button>
          </div>
          {enabled && (
            <div>
              <label className="text-sm font-semibold text-[#4A4435] block mb-1.5">Waktu Alarm</label>
              <input type="time" value={alarmTime} onChange={(e) => setAlarmTime(e.target.value)}
                className="w-full h-11 px-4 rounded-xl border border-gray-200 bg-gray-50 text-[#4A4435] text-sm focus:outline-none focus:ring-2 focus:ring-[#FACC15]" />
            </div>
          )}
          <div className="flex items-center gap-3">
            <button onClick={() => playAlarmSoundUrl(musicUrl)} className="flex-1 h-11 rounded-xl border border-[#FACC15] text-[#4A4435] font-semibold text-sm flex items-center justify-center gap-2">
              <BellRing className="w-4 h-4" /> Test Suara
            </button>
            <button onClick={save} className="flex-1 h-11 rounded-xl bg-[#FACC15] text-[#4A4435] font-bold text-sm">
              Simpan
            </button>
          </div>
          <p className="text-center text-xs text-[#8C8573]">
            Pengaturan lengkap di <Link href="/profil" onClick={onClose} className="text-[#4A4435] font-semibold underline">halaman Profil</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Maps component (always visible, current positions only) ───────────────────
type GpsPos = { lat: number; lng: number; accuracy?: number };
type AdminRecord = import("@/lib/api").AdminAttendanceRecord;

const officeIcon = L.divIcon({
  html: `<div style="width:32px;height:32px;background:#4A4435;border:3px solid #FACC15;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,0.3)">🏢</div>`,
  className: "", iconSize: [32, 32], iconAnchor: [16, 16],
});
const makeEmployeeIcon = (photo?: string | null) => L.divIcon({
  html: photo
    ? `<div style="width:30px;height:30px;border:2px solid #FACC15;border-radius:50%;overflow:hidden;box-shadow:0 2px 6px rgba(0,0,0,0.3)"><img src="data:image/jpeg;base64,${photo}" style="width:100%;height:100%;object-fit:cover"/></div>`
    : `<div style="width:30px;height:30px;background:#FACC15;border:2px solid #4A4435;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:12px">👤</div>`,
  className: "", iconSize: [30, 30], iconAnchor: [15, 15],
});
const selfIcon = L.divIcon({
  html: `<div style="width:24px;height:24px;background:#3B82F6;border:3px solid white;border-radius:50%;box-shadow:0 0 0 4px rgba(59,130,246,0.3)"></div>`,
  className: "", iconSize: [24, 24], iconAnchor: [12, 12],
});

function MapsSection({
  isAdmin,
  ownGps,
  adminRecords,
}: {
  isAdmin: boolean;
  ownGps: GpsPos | null;
  adminRecords?: AdminRecord[];
}) {
  const center: [number, number] = ownGps
    ? [ownGps.lat, ownGps.lng]
    : [OFFICE_LAT, OFFICE_LNG];

  // Only show employees who checked in today (current position only, no history)
  const checkedInEmployees = (adminRecords ?? []).filter(
    (r) => r.checkInLatitude != null && r.checkInLongitude != null,
  );

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-[#FACC15]/15 flex items-center justify-center">
            <span className="text-base">📍</span>
          </div>
          <div>
            <p className="text-sm font-bold text-[#4A4435]">Maps</p>
            <p className="text-[11px] text-[#8C8573]">
              {isAdmin
                ? `${checkedInEmployees.length} karyawan hadir hari ini`
                : ownGps ? `Akurasi ±${Math.round(ownGps.accuracy ?? 0)}m` : "Menunggu GPS..."}
            </p>
          </div>
        </div>
        {ownGps && (
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <span className="text-[11px] text-blue-500 font-semibold">GPS Aktif</span>
          </div>
        )}
      </div>
      <div style={{ height: "220px" }}>
        <MapContainer
          center={center}
          zoom={15}
          style={{ height: "100%", width: "100%" }}
          zoomControl={false}
          scrollWheelZoom={false}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="© OpenStreetMap contributors"
          />
          {/* Office marker */}
          <Marker position={[OFFICE_LAT, OFFICE_LNG]} icon={officeIcon}>
            <Popup>
              <div className="text-xs font-semibold">🏢 Kantor LWP</div>
            </Popup>
          </Marker>
          {/* Office radius */}
          <Circle center={[OFFICE_LAT, OFFICE_LNG]} radius={500} pathOptions={{ color: "#FACC15", fillColor: "#FACC15", fillOpacity: 0.08, weight: 2 }} />
          {/* User's own live GPS (non-admin or combined) */}
          {ownGps && (
            <Marker position={[ownGps.lat, ownGps.lng]} icon={selfIcon}>
              <Popup><div className="text-xs font-semibold">📍 Posisi Anda (live)</div></Popup>
            </Marker>
          )}
          {/* Admin: current check-in positions (no history trail) */}
          {isAdmin && checkedInEmployees.map((r) => (
            <Marker
              key={r.id}
              position={[r.checkInLatitude!, r.checkInLongitude!]}
              icon={makeEmployeeIcon(r.user?.profilePhoto)}
            >
              <Popup>
                <div className="text-xs">
                  <p className="font-bold">{r.user?.name ?? `Karyawan ${r.userId}`}</p>
                  <p className="text-gray-500">{r.user?.jabatan || "Karyawan"}</p>
                  <p className="text-green-600 font-semibold mt-1">Masuk: {fmtTime(r.checkInTime)}</p>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}

// ── GPS helper ────────────────────────────────────────────────────────────────
function calcDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

type AbsenMode = "check-in" | "check-out" | "overtime-in" | null;

// ── Main DashboardPage ────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const [now, setNow] = useState(new Date());
  const [metricModal, setMetricModal] = useState<MetricKey | null>(null);
  const [alarmModal, setAlarmModal] = useState(false);
  const [scanMode, setScanMode] = useState<AbsenMode>(null);
  const [ownGps, setOwnGps] = useState<GpsPos | null>(null);
  const alarmFiredRef = useRef<string>("");
  const monthStart = getCurrentMonthStart();
  const isAdmin = user?.role === "admin" || user?.role === "hr";
  const watchRef = useRef<number | null>(null);

  // Clock tick
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Continuous GPS watch (real-time position for map)
  useEffect(() => {
    if (!navigator.geolocation) return;
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => setOwnGps({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      () => {},
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
    );
    return () => { if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current); };
  }, []);

  // Alarm check
  useEffect(() => {
    const checkAlarm = async () => {
      const enabled = localStorage.getItem("absensi_alarm") === "1";
      const alarmTime = localStorage.getItem("absensi_alarm_time") || "07:50";
      if (!enabled) return;
      const nowJkt = new Date().toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hour12: false });
      const todayKey = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
      const fireKey = `${todayKey}_${alarmTime}`;
      if (nowJkt === alarmTime && alarmFiredRef.current !== fireKey) {
        alarmFiredRef.current = fireKey;
        const music = await loadMusicFromIDB().catch(() => null);
        const url = music ? URL.createObjectURL(music.blob) : null;
        playAlarmSoundUrl(url);
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

  const { data: adminRecords } = useQuery({
    queryKey: ["admin", "attendance", "today"],
    queryFn: () => api.admin.attendanceToday(),
    enabled: isAdmin,
    refetchInterval: 60_000,
  });

  // Attendance state
  const hasNoFace = !user?.hasFaceDescriptor;
  const hasCheckedIn = !!today?.checkInTime;
  const hasCheckedOut = !!today?.checkOutTime;
  const hasOvertimeIn = !!today?.overtimeCheckInTime;
  const hasOvertimeOut = !!today?.overtimeCheckOutTime;
  const statusInfo = today?.status ? STATUS_MAP[today.status] : null;

  // Distance from office
  const distMeters = ownGps ? Math.round(calcDistance(ownGps.lat, ownGps.lng, OFFICE_LAT, OFFICE_LNG)) : null;

  // Determine what absen action is available
  const getAbsenMode = (): AbsenMode => {
    if (!hasCheckedIn) return "check-in";
    if (hasCheckedIn && !hasCheckedOut) return "check-out";
    if (hasCheckedOut && !hasOvertimeIn) return null; // show option via "Mulai Lembur" button
    if (hasOvertimeIn && !hasOvertimeOut) return null; // overtime in progress
    return null;
  };
  const absenMode = getAbsenMode();

  const handleOvertimeCheckOut = async () => {
    try {
      await api.attendance.overtimeCheckOut();
      qc.invalidateQueries({ queryKey: ["attendance"] });
    } catch {}
  };

  const profilePhoto = user?.profilePhoto ? `data:image/jpeg;base64,${user.profilePhoto}` : null;
  const facePhoto = user?.facePhoto ?? null;
  const initials = (name: string) => name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  const metrics: Array<{ key: MetricKey; label: string; todayValue: string; cycleValue: string; color: string; bgColor: string }> = [
    {
      key: "jam-kerja", label: "JAM KERJA",
      todayValue: today?.workMinutes ? `${Math.floor(today.workMinutes / 60)}j${today.workMinutes % 60}m` : "--",
      cycleValue: cycle ? `${Math.floor((cycle.totalWorkMinutes ?? 0) / 60)}j` : "--",
      color: "text-green-600", bgColor: "bg-green-50",
    },
    {
      key: "lembur", label: "LEMBUR",
      todayValue: today?.overtimeMinutes ? `${Math.floor(today.overtimeMinutes / 60)}j${today.overtimeMinutes % 60}m` : "--",
      cycleValue: cycle ? `${Math.floor((cycle.totalOvertimeMinutes ?? 0) / 60)}j` : "--",
      color: "text-[#FACC15]", bgColor: "bg-yellow-50",
    },
    {
      key: "terlambat", label: "TERLAMBAT",
      todayValue: today?.latenessMinutes ? `${today.latenessMinutes}m` : "--",
      cycleValue: cycle ? `${cycle.totalLatenessMinutes ?? 0}m` : "--",
      color: "text-red-500", bgColor: "bg-red-50",
    },
    {
      key: "izin", label: "IZIN",
      todayValue: "--",
      cycleValue: cycle ? `${cycle.permitDays ?? 0}h` : "--",
      color: "text-blue-500", bgColor: "bg-blue-50",
    },
  ];

  return (
    <div className="flex flex-col min-h-full bg-[#FBF9F3]">

      {/* ── Yellow header ── */}
      <div className="bg-[#FACC15] px-5 pt-12 pb-6 rounded-b-[40px] shadow-md">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            {/* Profile avatar - tap goes to Profile tab */}
            <button onClick={() => navigate("/profil")} className="relative w-12 h-12 rounded-full overflow-hidden border-2 border-[#4A4435]/20 bg-[#4A4435] flex items-center justify-center shadow-md flex-shrink-0">
              {profilePhoto ? (
                <img src={profilePhoto} className="w-full h-full object-cover" alt="" />
              ) : (
                <span className="text-[#FACC15] font-extrabold text-base">{initials(user?.name ?? "?")}</span>
              )}
              <div className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-[#FACC15] border border-white flex items-center justify-center">
                <User className="w-2 h-2 text-[#4A4435]" />
              </div>
            </button>
            <div>
              <p className="text-[#4A4435]/60 text-[10px] font-medium uppercase tracking-widest leading-none">Selamat Datang</p>
              <p className="text-[#4A4435] text-base font-extrabold leading-tight mt-0.5">{user?.name ?? "Karyawan"}</p>
              <p className="text-[#4A4435]/60 text-[11px]">{user?.jabatan || "PT. Lembayung Wanantara Padha"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setAlarmModal(true)} className="w-9 h-9 rounded-full bg-[#4A4435]/10 flex items-center justify-center relative">
              <Bell className="w-4 h-4 text-[#4A4435]" />
              {localStorage.getItem("absensi_alarm") === "1" && (
                <div className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-green-500 border border-[#FACC15]" />
              )}
            </button>
          </div>
        </div>

        {/* Clock */}
        <div className="text-center mb-3">
          <p className="text-[#4A4435] text-5xl font-black tabular-nums tracking-tight">{formatClock(now)}</p>
          <p className="text-[#4A4435]/60 text-xs mt-1">{formatDate(now)}</p>
        </div>

        {/* Attendance times bar */}
        <div className="bg-white/40 backdrop-blur-sm rounded-2xl px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="text-center">
              <p className="text-[9px] text-[#4A4435]/60 font-bold uppercase tracking-wider">Masuk</p>
              <p className="text-[#4A4435] font-bold text-sm">{fmtTime(today?.checkInTime)}</p>
            </div>
            <div className="w-px h-6 bg-[#4A4435]/20" />
            <div className="text-center">
              <p className="text-[9px] text-[#4A4435]/60 font-bold uppercase tracking-wider">Pulang</p>
              <p className="text-[#4A4435] font-bold text-sm">{fmtTime(today?.checkOutTime)}</p>
            </div>
            {today?.workMinutes && (
              <>
                <div className="w-px h-6 bg-[#4A4435]/20" />
                <div className="text-center">
                  <p className="text-[9px] text-[#4A4435]/60 font-bold uppercase tracking-wider">Kerja</p>
                  <p className="font-bold text-sm text-green-700">
                    {Math.floor(today.workMinutes / 60)}j{today.workMinutes % 60 > 0 ? `${today.workMinutes % 60}m` : ""}
                  </p>
                </div>
              </>
            )}
          </div>
          {statusInfo && (
            <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${statusInfo.bg} ${statusInfo.text}`}>
              {statusInfo.label}
            </span>
          )}
          {!statusInfo && !loadingToday && (
            <span className="text-[10px] font-medium text-[#8C8573] bg-white/60 px-2.5 py-1 rounded-full">Belum Absen</span>
          )}
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="px-5 pt-5 pb-24 space-y-4">

        {/* ── ABSEN CARD (priority #1) ── */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {/* No face registered warning */}
          {hasNoFace && (
            <div className="bg-amber-50 border-b border-amber-100 px-4 py-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                <ScanFace className="w-4.5 h-4.5 text-amber-600" style={{ width: "18px", height: "18px" }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-amber-800">Wajah belum terdaftar</p>
                <p className="text-[11px] text-amber-600">Daftarkan wajah untuk bisa absen</p>
              </div>
              <Link href="/face-register" className="flex-shrink-0 text-xs font-bold text-amber-700 bg-amber-100 px-3 py-1.5 rounded-xl">
                Daftar
              </Link>
            </div>
          )}

          <div className="px-4 py-4">
            {/* All done state */}
            {hasCheckedIn && hasCheckedOut && hasOvertimeIn && hasOvertimeOut && (
              <div className="flex items-center gap-3 py-1">
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-bold text-[#4A4435]">Semua absensi selesai hari ini</p>
                  <p className="text-xs text-[#8C8573]">Termasuk sesi lembur — kerja keras! 💪</p>
                </div>
              </div>
            )}

            {/* Check-in done, check-out done, no overtime yet */}
            {hasCheckedIn && hasCheckedOut && !hasOvertimeIn && (
              <div className="space-y-3">
                <div className="flex items-center gap-3 py-1">
                  <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                    <CheckCircle2 className="w-6 h-6 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[#4A4435]">Absensi hari ini selesai</p>
                    <p className="text-xs text-[#8C8573]">Masuk: {fmtTime(today?.checkInTime)} · Pulang: {fmtTime(today?.checkOutTime)}</p>
                  </div>
                </div>
                <button
                  onClick={() => setScanMode("overtime-in")}
                  disabled={hasNoFace}
                  className="w-full h-12 rounded-xl bg-orange-50 border-2 border-orange-200 text-orange-700 font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40"
                >
                  <Timer className="w-4 h-4" /> Mulai Lembur
                </button>
              </div>
            )}

            {/* Overtime in progress */}
            {hasCheckedIn && hasCheckedOut && hasOvertimeIn && !hasOvertimeOut && (
              <div className="space-y-3">
                <div className="flex items-center gap-3 py-1">
                  <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0 animate-pulse">
                    <Timer className="w-5 h-5 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[#4A4435]">Sesi lembur aktif</p>
                    <p className="text-xs text-[#8C8573]">Mulai: {fmtTime(today?.overtimeCheckInTime)}</p>
                  </div>
                </div>
                <button
                  onClick={handleOvertimeCheckOut}
                  className="w-full h-12 rounded-xl bg-orange-500 text-white font-bold text-sm flex items-center justify-center gap-2"
                >
                  <LogOut className="w-4 h-4" /> Selesai Lembur
                </button>
              </div>
            )}

            {/* Normal absen actions (check-in or check-out) */}
            {(!hasCheckedIn || (hasCheckedIn && !hasCheckedOut)) && (
              <div className="space-y-3">
                {/* GPS distance indicator */}
                {distMeters !== null && (
                  <div className={`flex items-center gap-2 rounded-xl px-3 py-2 ${
                    distMeters <= 500 ? "bg-green-50" : "bg-red-50"
                  }`}>
                    <div className={`w-2 h-2 rounded-full ${distMeters <= 500 ? "bg-green-500" : "bg-red-400"}`} />
                    <p className={`text-xs font-semibold ${distMeters <= 500 ? "text-green-700" : "text-red-600"}`}>
                      {distMeters <= 500 ? `${distMeters}m dari kantor — Dalam area ✓` : `${distMeters}m dari kantor — Di luar area`}
                    </p>
                  </div>
                )}

                {/* Check-in button */}
                {!hasCheckedIn && (
                  <button
                    onClick={() => setScanMode("check-in")}
                    disabled={hasNoFace}
                    className="w-full h-16 rounded-2xl bg-[#FACC15] text-[#4A4435] font-black text-lg flex items-center justify-center gap-3 shadow-lg shadow-[#FACC15]/30 active:scale-[0.98] transition-transform disabled:opacity-40 disabled:shadow-none"
                  >
                    <Sunrise className="w-6 h-6" />
                    Absen Masuk
                  </button>
                )}

                {/* Check-out button */}
                {hasCheckedIn && !hasCheckedOut && (
                  <button
                    onClick={() => setScanMode("check-out")}
                    disabled={hasNoFace}
                    className="w-full h-16 rounded-2xl bg-blue-500 text-white font-black text-lg flex items-center justify-center gap-3 shadow-lg shadow-blue-500/30 active:scale-[0.98] transition-transform disabled:opacity-40 disabled:shadow-none"
                  >
                    <Sunset className="w-6 h-6" />
                    Absen Pulang
                  </button>
                )}

                <p className="text-center text-[11px] text-[#8C8573]">
                  {hasNoFace ? "Daftarkan wajah terlebih dahulu untuk absen" : "Scan wajah otomatis — pastikan pencahayaan cukup"}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── Stats grid ── */}
        <div>
          <p className="text-[10px] font-bold text-[#8C8573] uppercase tracking-widest mb-2 px-1">
            Statistik Bulan Ini · {cycle?.cycleLabel ?? ""}
          </p>
          <div className="grid grid-cols-4 gap-2">
            {metrics.map((m) => (
              <button
                key={m.key}
                onClick={() => setMetricModal(m.key)}
                className={`flex flex-col items-center ${m.bgColor} rounded-2xl py-3 px-1 active:scale-95 transition-transform shadow-sm`}
              >
                {loadingCycle ? (
                  <div className="w-8 h-4 bg-gray-200 rounded animate-pulse mb-1" />
                ) : (
                  <span className={`text-lg font-extrabold ${m.color}`}>{m.cycleValue}</span>
                )}
                <span className="text-[8.5px] text-[#8C8573] font-bold uppercase tracking-wider text-center leading-tight mt-0.5">{m.label}</span>
                {m.todayValue !== "--" && (
                  <span className="text-[8.5px] text-[#8C8573] mt-0.5">hari ini: {m.todayValue}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── Maps (always visible, real-time) ── */}
        <MapsSection
          isAdmin={isAdmin}
          ownGps={ownGps}
          adminRecords={adminRecords?.records}
        />

        {/* ── Quick links ── */}
        <div className="space-y-2.5">
          <Link href="/riwayat" className="flex items-center justify-between bg-white rounded-2xl px-4 py-3.5 shadow-sm active:bg-gray-50">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#FACC15]/15 flex items-center justify-center">
                <CalendarDays className="w-4.5 h-4.5 text-[#4A4435]" style={{ width: "18px", height: "18px" }} />
              </div>
              <div>
                <p className="text-sm font-semibold text-[#4A4435]">Riwayat Absensi</p>
                <p className="text-xs text-[#8C8573]">Catatan kehadiran + unduh PDF</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300" />
          </Link>
          <Link href="/izin" className="flex items-center justify-between bg-white rounded-2xl px-4 py-3.5 shadow-sm active:bg-gray-50">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
                <CalendarDays className="w-4.5 h-4.5 text-blue-500" style={{ width: "18px", height: "18px" }} />
              </div>
              <div>
                <p className="text-sm font-semibold text-[#4A4435]">Pengajuan Izin</p>
                <p className="text-xs text-[#8C8573]">Ajukan atau cek status izin</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300" />
          </Link>
          {isAdmin && (
            <Link href="/admin" className="flex items-center justify-between bg-[#4A4435] rounded-2xl px-4 py-3.5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#FACC15]/20 flex items-center justify-center">
                  <ScanFace className="w-4.5 h-4.5 text-[#FACC15]" style={{ width: "18px", height: "18px" }} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#FACC15]">Panel Admin / HRD</p>
                  <p className="text-xs text-[#FACC15]/60">Kelola karyawan, izin & rekap</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-[#FACC15]/60" />
            </Link>
          )}
        </div>

        <p className="text-center text-[10px] text-[#8C8573]/40 pb-2">PT. Lembayung Wanantara Padha</p>
      </div>

      {/* ── Face Scan Modal ── */}
      {scanMode && (
        <FaceScanModal
          mode={scanMode}
          facePhotoBase64={facePhoto}
          gps={ownGps}
          onSuccess={() => setScanMode(null)}
          onClose={() => setScanMode(null)}
        />
      )}

      {/* ── Metric Modals ── */}
      {metricModal && (
        <MetricModal
          metricKey={metricModal}
          onClose={() => setMetricModal(null)}
          history={historyData}
          leaves={leaveData}
          summary={cycle}
        />
      )}

      {/* ── Alarm Modal ── */}
      {alarmModal && <AlarmModal onClose={() => setAlarmModal(false)} />}
    </div>
  );
}
