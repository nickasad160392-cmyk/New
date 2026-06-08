import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Loader2, FileText, X, ChevronDown } from "lucide-react";
import { format, parseISO, differenceInCalendarDays } from "date-fns";
import { id as localeId } from "date-fns/locale";

const LEAVE_TYPES = [
  { value: "sakit", label: "Sakit" },
  { value: "pribadi", label: "Keperluan Pribadi" },
  { value: "keluarga", label: "Keperluan Keluarga" },
  { value: "dinas", label: "Dinas Luar" },
];

const STATUS_MAP: Record<string, { label: string; bg: string; text: string }> = {
  pending:  { label: "Menunggu", bg: "bg-yellow-100", text: "text-yellow-700" },
  approved: { label: "Disetujui", bg: "bg-green-100", text: "text-green-700" },
  rejected: { label: "Ditolak",  bg: "bg-red-100",   text: "text-[#E57373]" },
};

function fmtDate(d: string) {
  try { return format(parseISO(d), "dd MMM yyyy", { locale: localeId }); }
  catch { return d; }
}

function daysDiff(start: string, end: string) {
  try {
    const diff = differenceInCalendarDays(parseISO(end), parseISO(start)) + 1;
    return `${diff} hari`;
  } catch { return ""; }
}

export default function IzinPage() {
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [type, setType] = useState("sakit");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: requests, isLoading } = useQuery({
    queryKey: ["leave", "list"],
    queryFn: () => api.leave.list(),
  });

  const resetForm = () => { setType("sakit"); setStartDate(""); setEndDate(""); setReason(""); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startDate || !endDate || !reason.trim()) { toast.error("Semua field wajib diisi"); return; }
    if (new Date(endDate) < new Date(startDate)) { toast.error("Tanggal selesai tidak boleh sebelum tanggal mulai"); return; }
    setIsSubmitting(true);
    try {
      await api.leave.create({ type, startDate, endDate, reason });
      queryClient.invalidateQueries({ queryKey: ["leave", "list"] });
      toast.success("Pengajuan izin berhasil dikirim!");
      resetForm();
      setIsFormOpen(false);
    } catch (err: any) {
      toast.error(err?.data?.error || err?.message || "Gagal mengajukan izin.");
    }
    setIsSubmitting(false);
  };

  return (
    <div className="flex flex-col min-h-full">
      <div className="bg-[#FACC15] px-5 pt-12 pb-8 rounded-b-[40px]">
        <h1 className="text-2xl font-extrabold text-[#4A4435]">Izin & Cuti</h1>
        <p className="text-[#4A4435]/60 text-sm mt-1">Kelola pengajuan izin dan cuti Anda</p>
      </div>

      <div className="px-5 pt-5 pb-24 flex-1">
        <button
          onClick={() => setIsFormOpen(true)}
          className="w-full flex items-center justify-center gap-2 h-12 rounded-2xl bg-[#FACC15] text-[#4A4435] font-bold shadow-sm mb-5 active:scale-[0.98] transition-transform"
        >
          <Plus className="w-5 h-5" />
          Ajukan Izin Baru
        </button>

        {isFormOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
            <div className="bg-white w-full max-w-[430px] rounded-t-3xl px-5 pt-5 pb-8 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-bold text-[#4A4435]">Form Pengajuan Izin</h2>
                <button onClick={() => { setIsFormOpen(false); resetForm(); }} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                  <X className="w-4 h-4 text-[#8C8573]" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-[#4A4435]">Jenis Izin</label>
                  <div className="relative">
                    <select
                      value={type}
                      onChange={(e) => setType(e.target.value)}
                      className="w-full h-12 px-4 pr-10 rounded-xl border border-gray-200 bg-gray-50 text-[#4A4435] text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-[#FACC15]"
                    >
                      {LEAVE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8C8573] pointer-events-none" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-[#4A4435]">Tanggal Mulai</label>
                    <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); if (!endDate) setEndDate(e.target.value); }}
                      className="w-full h-12 px-3 rounded-xl border border-gray-200 bg-gray-50 text-[#4A4435] text-sm focus:outline-none focus:ring-2 focus:ring-[#FACC15]" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-[#4A4435]">Tanggal Selesai</label>
                    <input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)}
                      className="w-full h-12 px-3 rounded-xl border border-gray-200 bg-gray-50 text-[#4A4435] text-sm focus:outline-none focus:ring-2 focus:ring-[#FACC15]" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-[#4A4435]">Keterangan / Alasan</label>
                  <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Jelaskan alasan izin Anda..."
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-[#4A4435] text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#FACC15]" />
                </div>
                <button type="submit" disabled={isSubmitting}
                  className="w-full h-12 rounded-2xl bg-[#FACC15] text-[#4A4435] font-bold flex items-center justify-center gap-2 shadow-md disabled:opacity-60">
                  {isSubmitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Mengirim...</> : "Kirim Pengajuan"}
                </button>
              </form>
            </div>
          </div>
        )}

        <div>
          <h2 className="text-sm font-bold text-[#8C8573] uppercase tracking-widest mb-3">Riwayat Pengajuan</h2>
          {isLoading && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-white rounded-2xl p-4 shadow-sm animate-pulse">
                  <div className="h-4 bg-gray-100 rounded w-1/2 mb-2" />
                  <div className="h-3 bg-gray-100 rounded w-2/3" />
                </div>
              ))}
            </div>
          )}
          {!isLoading && (!requests || requests.length === 0) && (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 text-gray-200 mx-auto mb-3" />
              <p className="text-[#8C8573] text-sm">Belum ada pengajuan izin</p>
            </div>
          )}
          {!isLoading && requests && requests.length > 0 && (
            <div className="space-y-3">
              {[...requests].reverse().map((r) => {
                const st = STATUS_MAP[r.status] ?? { label: r.status, bg: "bg-gray-100", text: "text-gray-600" };
                const typeLabel = LEAVE_TYPES.find((t) => t.value === r.type)?.label ?? r.type;
                return (
                  <div key={r.id} className="bg-white rounded-2xl p-4 shadow-sm">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="text-sm font-bold text-[#4A4435]">{typeLabel}</p>
                        <p className="text-xs text-[#8C8573] mt-0.5">
                          {fmtDate(r.startDate)} — {fmtDate(r.endDate)}
                          <span className="ml-1 text-[#FACC15] font-semibold">({daysDiff(r.startDate, r.endDate)})</span>
                        </p>
                      </div>
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${st.bg} ${st.text}`}>{st.label}</span>
                    </div>
                    <p className="text-xs text-[#8C8573] leading-relaxed line-clamp-2">{r.reason}</p>
                    {r.adminNote && (
                      <div className="mt-2 bg-gray-50 rounded-lg px-3 py-2">
                        <p className="text-xs text-[#8C8573]"><span className="font-semibold">Catatan Admin:</span> {r.adminNote}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="text-center pb-20">
        <p className="text-[10px] text-[#8C8573]/40">PT. Lembayung Wanantara Padha</p>
      </div>
    </div>
  );
}
