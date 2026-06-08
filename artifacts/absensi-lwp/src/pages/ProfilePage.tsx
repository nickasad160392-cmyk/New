import { useState, useRef, useEffect, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  User, Camera, ImagePlus, Trash2, ScanFace, Bell, BellRing,
  History, FileText, Shield, LogOut, ChevronRight, X,
  CheckCircle2, Loader2, Edit3, Music,
} from "lucide-react";

// ─── IDB helpers (for alarm music, duplicated here for self-containment) ─────
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
function playAlarmSoundUrl(url?: string | null) {
  if (url) { try { new Audio(url).play().catch(() => {}); return; } catch {} }
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
    play(880, t + 0.6, 0.25); play(1320, t + 0.9, 0.5);
  } catch {}
}

function compressPhoto(dataUrl: string, maxSize = 320): Promise<string> {
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
      resolve(canvas.toDataURL("image/jpeg", 0.80));
    };
    img.src = dataUrl;
  });
}

// ─── Change Name Modal ────────────────────────────────────────────────────────
function ChangeNameModal({ currentName, onClose, onSaved }: { currentName: string; onClose: () => void; onSaved: (name: string) => void }) {
  const [name, setName] = useState(currentName);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (trimmed.length < 2) { toast.error("Nama minimal 2 karakter"); return; }
    setSaving(true);
    try {
      const updated = await api.auth.updateName(trimmed);
      onSaved(updated.name);
      toast.success("Nama berhasil diperbarui");
      onClose();
    } catch (err: any) {
      toast.error(err?.data?.error || "Gagal memperbarui nama");
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white w-full max-w-[430px] rounded-t-3xl px-5 pt-5 pb-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#FACC15]/20 flex items-center justify-center">
              <Edit3 className="w-5 h-5 text-[#4A4435]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#4A4435]">Ganti Nama</h2>
              <p className="text-xs text-[#8C8573]">Nama Anda akan diperbarui</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
            <X className="w-4 h-4 text-[#8C8573]" />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-semibold text-[#4A4435] block mb-2">Nama Lengkap</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              placeholder="Masukkan nama lengkap..."
              className="w-full h-12 px-4 rounded-2xl border border-gray-200 bg-gray-50 text-[#4A4435] text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#FACC15]"
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
            />
          </div>
          <button
            onClick={handleSave}
            disabled={saving || name.trim().length < 2}
            className="w-full h-12 rounded-2xl bg-[#FACC15] text-[#4A4435] font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Menyimpan...</> : <><CheckCircle2 className="w-4 h-4" /> Simpan Nama</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Profile Photo Modal ──────────────────────────────────────────────────────
function ProfilePhotoModal({ onClose, onUpdated }: { onClose: () => void; onUpdated: () => void }) {
  const { user } = useAuth();
  const [phase, setPhase] = useState<"menu" | "camera" | "preview" | "saving">("menu");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [capturedBase64, setCapturedBase64] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (stream) { video.srcObject = stream; video.play().catch(() => {}); }
    else video.srcObject = null;
  }, [stream]);

  const stopCamera = useCallback(() => {
    if (stream) { stream.getTracks().forEach((t) => t.stop()); setStream(null); }
  }, [stream]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const openCamera = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      setStream(s);
      setPhase("camera");
    } catch { toast.error("Kamera tidak dapat diakses"); }
  };

  const capturePhoto = async () => {
    const video = videoRef.current; const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth || 320; canvas.height = video.videoHeight || 320;
    const ctx = canvas.getContext("2d")!;
    ctx.save(); ctx.scale(-1, 1); ctx.drawImage(video, -canvas.width, 0); ctx.restore();
    const raw = canvas.toDataURL("image/jpeg", 0.9);
    const compressed = await compressPhoto(raw, 320);
    setPreviewUrl(compressed); setCapturedBase64(compressed.split(",")[1]!);
    stopCamera(); setPhase("preview");
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const compressed = await compressPhoto(ev.target?.result as string, 320);
      setPreviewUrl(compressed); setCapturedBase64(compressed.split(",")[1]!); setPhase("preview");
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const savePhoto = async () => {
    if (!capturedBase64) return;
    setPhase("saving");
    try { await api.auth.uploadPhoto(capturedBase64); onUpdated(); onClose(); }
    catch { setPhase("preview"); toast.error("Gagal menyimpan foto"); }
  };

  const deletePhoto = async () => {
    if (!confirm("Hapus foto profil?")) return;
    setDeleting(true);
    try { await api.auth.deletePhoto(); onUpdated(); onClose(); }
    catch { toast.error("Gagal menghapus foto"); }
    finally { setDeleting(false); }
  };

  const currentPhoto = user?.profilePhoto ? `data:image/jpeg;base64,${user.profilePhoto}` : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white w-full max-w-[430px] rounded-t-3xl px-5 pt-5 pb-8" onClick={(e) => e.stopPropagation()}>
        <canvas ref={canvasRef} className="hidden" />
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#FACC15]/20 flex items-center justify-center">
              <Camera className="w-5 h-5 text-[#4A4435]" />
            </div>
            <h2 className="text-base font-bold text-[#4A4435]">Foto Profil</h2>
          </div>
          <button onClick={() => { stopCamera(); onClose(); }} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
            <X className="w-4 h-4 text-[#8C8573]" />
          </button>
        </div>

        {phase === "menu" && (
          <div className="space-y-3">
            <div className="flex justify-center mb-5">
              <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-[#FACC15] shadow-lg bg-gray-100 flex items-center justify-center">
                {currentPhoto ? <img src={currentPhoto} className="w-full h-full object-cover" alt="" /> : <User className="w-10 h-10 text-gray-300" />}
              </div>
            </div>
            <button onClick={openCamera} className="w-full h-12 rounded-2xl bg-[#FACC15] text-[#4A4435] font-bold text-sm flex items-center justify-center gap-2">
              <Camera className="w-4 h-4" /> Ambil Foto Selfie
            </button>
            <label className="w-full h-12 rounded-2xl bg-white border-2 border-gray-200 text-[#4A4435] font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer">
              <ImagePlus className="w-4 h-4" /> Upload dari Galeri
              <input type="file" accept="image/*" className="hidden" onChange={handleUpload} />
            </label>
            {currentPhoto && (
              <button onClick={deletePhoto} disabled={deleting} className="w-full h-10 rounded-2xl border border-red-200 text-red-500 font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50">
                <Trash2 className="w-3.5 h-3.5" /> {deleting ? "Menghapus..." : "Hapus Foto"}
              </button>
            )}
          </div>
        )}

        {phase === "camera" && (
          <div className="flex flex-col items-center">
            <div className="w-64 h-64 rounded-full overflow-hidden border-4 border-[#FACC15] shadow-xl mb-4 bg-black">
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" style={{ transform: "scaleX(-1)" }} />
            </div>
            <button onClick={capturePhoto} className="w-full h-12 rounded-2xl bg-[#FACC15] text-[#4A4435] font-bold flex items-center justify-center gap-2 mb-2">
              <Camera className="w-4 h-4" /> Ambil Foto
            </button>
            <button onClick={() => { stopCamera(); setPhase("menu"); }} className="text-sm text-[#8C8573] underline">Batalkan</button>
          </div>
        )}

        {phase === "preview" && previewUrl && (
          <div className="flex flex-col items-center">
            <div className="w-40 h-40 rounded-full overflow-hidden border-4 border-[#FACC15] shadow-xl mb-4">
              <img src={previewUrl} className="w-full h-full object-cover" alt="" />
            </div>
            <p className="text-sm font-semibold text-[#4A4435] mb-4">Foto sudah bagus?</p>
            <button onClick={savePhoto} className="w-full h-12 rounded-2xl bg-[#FACC15] text-[#4A4435] font-bold flex items-center justify-center gap-2 mb-2">
              <CheckCircle2 className="w-4 h-4" /> Simpan
            </button>
            <button onClick={() => { setPreviewUrl(null); openCamera(); }} className="w-full h-10 rounded-2xl bg-gray-100 text-[#8C8573] text-sm font-semibold">
              Foto Ulang
            </button>
          </div>
        )}

        {phase === "saving" && (
          <div className="flex flex-col items-center py-6">
            <Loader2 className="w-10 h-10 text-[#FACC15] animate-spin mb-3" />
            <p className="text-sm font-semibold text-[#4A4435]">Menyimpan foto...</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Alarm Modal ──────────────────────────────────────────────────────────────
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
        setMusicUrl(URL.createObjectURL(data.blob));
      }
    });
  }, []);

  const handleMusicFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error("Ukuran file maksimal 10MB"); return; }
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
    toast.success("Pengaturan alarm disimpan");
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
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-[#4A4435]">Musik Alarm</p>
                <p className="text-xs text-[#8C8573]">Dari galeri perangkat (maks 10MB)</p>
              </div>
              <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FACC15]/20 text-[#4A4435] text-xs font-semibold">
                <Music className="w-3.5 h-3.5" /> Pilih Musik
              </button>
            </div>
            <input ref={fileInputRef} type="file" accept="audio/*" className="hidden" onChange={handleMusicFile} />
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
          <button onClick={() => playAlarmSoundUrl(musicUrl)} className="w-full h-11 rounded-xl border border-[#FACC15] text-[#4A4435] font-semibold text-sm flex items-center justify-center gap-2">
            <BellRing className="w-4 h-4" /> Test Suara
          </button>
          <button onClick={save} disabled={saving} className="w-full h-11 rounded-2xl bg-[#FACC15] text-[#4A4435] font-bold disabled:opacity-60">
            {saving ? "Menyimpan..." : "Simpan Pengaturan"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main ProfilePage ─────────────────────────────────────────────────────────
export default function ProfilePage() {
  const { user, logout, refreshUser } = useAuth();
  const [, navigate] = useLocation();
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [showNameModal, setShowNameModal] = useState(false);
  const [showAlarmModal, setShowAlarmModal] = useState(false);

  const handleLogout = () => { logout(); navigate("/login"); };

  const profilePhoto = user?.profilePhoto ? `data:image/jpeg;base64,${user.profilePhoto}` : null;
  const isAdmin = user?.role === "admin" || user?.role === "hr";
  const alarmEnabled = localStorage.getItem("absensi_alarm") === "1";
  const alarmTime = localStorage.getItem("absensi_alarm_time") || "07:50";

  const initials = (name: string) =>
    name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  const menuItems = [
    {
      section: "Akun",
      items: [
        {
          icon: Edit3, label: "Ganti Nama", value: user?.name,
          onClick: () => setShowNameModal(true),
        },
        {
          icon: Camera, label: "Foto Profil",
          value: user?.profilePhoto ? "Foto terpasang" : "Belum ada foto",
          onClick: () => setShowPhotoModal(true),
        },
        {
          icon: ScanFace, label: "Wajah Absensi",
          value: user?.hasFaceDescriptor ? "Sudah terdaftar ✓" : "Belum terdaftar",
          onClick: () => navigate("/face-register"),
        },
      ],
    },
    {
      section: "Pengaturan",
      items: [
        {
          icon: Bell, label: "Alarm Pengingat",
          value: alarmEnabled ? `Aktif · ${alarmTime}` : "Tidak aktif",
          onClick: () => setShowAlarmModal(true),
        },
      ],
    },
    {
      section: "Riwayat & Izin",
      items: [
        { icon: History, label: "Riwayat Absensi", value: "Lihat catatan kehadiran", onClick: () => navigate("/riwayat") },
        { icon: FileText, label: "Pengajuan Izin", value: "Ajukan atau cek status izin", onClick: () => navigate("/izin") },
      ],
    },
  ];

  return (
    <div className="flex flex-col min-h-full bg-[#FBF9F3]">
      {/* Header */}
      <div className="bg-[#FACC15] px-5 pt-12 pb-8 rounded-b-[40px]">
        <div className="flex flex-col items-center text-center">
          <button
            onClick={() => setShowPhotoModal(true)}
            className="relative mb-4"
          >
            <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-white shadow-xl bg-[#4A4435] flex items-center justify-center">
              {profilePhoto ? (
                <img src={profilePhoto} className="w-full h-full object-cover" alt="" />
              ) : (
                <span className="text-[#FACC15] text-2xl font-extrabold">
                  {initials(user?.name ?? "?")}
                </span>
              )}
            </div>
            <div className="absolute bottom-1 right-1 w-7 h-7 rounded-full bg-[#4A4435] border-2 border-white flex items-center justify-center shadow">
              <Camera className="w-3.5 h-3.5 text-[#FACC15]" />
            </div>
          </button>

          <h1 className="text-xl font-extrabold text-[#4A4435] leading-tight">{user?.name}</h1>
          <p className="text-[#4A4435]/70 text-sm mt-0.5">{user?.jabatan || "Karyawan"}</p>
          {user?.employeeId && (
            <p className="text-[#4A4435]/50 text-xs mt-0.5">ID: {user.employeeId}</p>
          )}

          <div className="flex items-center gap-2 mt-3">
            <span className={`px-3 py-1 rounded-full text-xs font-bold ${
              isAdmin ? "bg-[#4A4435] text-[#FACC15]" : "bg-[#4A4435]/10 text-[#4A4435]"
            }`}>
              {user?.role === "admin" ? "Admin" : user?.role === "hr" ? "HRD" : "Karyawan"}
            </span>
            {user?.isActive && (
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700">Aktif</span>
            )}
          </div>
        </div>
      </div>

      <div className="px-5 pt-5 pb-28 space-y-5">
        {/* Menu sections */}
        {menuItems.map((section) => (
          <div key={section.section}>
            <p className="text-[10px] font-bold text-[#8C8573] uppercase tracking-widest mb-2 px-1">
              {section.section}
            </p>
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden divide-y divide-gray-50">
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.label}
                    onClick={item.onClick}
                    className="flex items-center justify-between w-full px-4 py-3.5 hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-[#FACC15]/15 flex items-center justify-center flex-shrink-0">
                        <Icon className="w-4.5 h-4.5 text-[#4A4435]" style={{ width: "18px", height: "18px" }} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-[#4A4435]">{item.label}</p>
                        {item.value && <p className="text-xs text-[#8C8573] mt-0.5">{item.value}</p>}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {/* Admin panel */}
        {isAdmin && (
          <div>
            <p className="text-[10px] font-bold text-[#8C8573] uppercase tracking-widest mb-2 px-1">Panel HRD</p>
            <Link href="/admin" className="flex items-center justify-between bg-[#4A4435] rounded-2xl px-4 py-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#FACC15]/20 flex items-center justify-center">
                  <Shield className="w-4.5 h-4.5 text-[#FACC15]" style={{ width: "18px", height: "18px" }} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#FACC15]">Panel Admin / HRD</p>
                  <p className="text-xs text-[#FACC15]/60">Kelola karyawan, izin & rekap</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-[#FACC15]/60" />
            </Link>
          </div>
        )}

        {/* User info */}
        <div className="bg-white rounded-2xl shadow-sm px-4 py-4">
          <p className="text-[10px] font-bold text-[#8C8573] uppercase tracking-widest mb-3">Informasi Akun</p>
          <div className="space-y-2.5">
            {[
              { label: "Email", value: user?.email },
              { label: "No. HP", value: user?.phone || "-" },
              { label: "ID Karyawan", value: user?.employeeId || "-" },
            ].map((info) => (
              <div key={info.label} className="flex justify-between items-center">
                <span className="text-xs text-[#8C8573] font-medium">{info.label}</span>
                <span className="text-xs font-semibold text-[#4A4435]">{info.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 h-12 rounded-2xl bg-white border border-red-100 text-red-500 font-semibold text-sm shadow-sm"
        >
          <LogOut className="w-4 h-4" />
          Keluar dari Akun
        </button>

        <p className="text-center text-[10px] text-[#8C8573]/40 pb-2">PT. Lembayung Wanantara Padha</p>
      </div>

      {showPhotoModal && (
        <ProfilePhotoModal
          onClose={() => setShowPhotoModal(false)}
          onUpdated={() => refreshUser()}
        />
      )}
      {showNameModal && (
        <ChangeNameModal
          currentName={user?.name ?? ""}
          onClose={() => setShowNameModal(false)}
          onSaved={() => refreshUser()}
        />
      )}
      {showAlarmModal && <AlarmModal onClose={() => setShowAlarmModal(false)} />}
    </div>
  );
}
