import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, XCircle, FileText, Loader2, X } from "lucide-react";
import { format, parseISO, differenceInCalendarDays } from "date-fns";
import { id as localeId } from "date-fns/locale";

const LEAVE_TYPES: Record<string, string> = {
  sakit:    "Sakit",
  pribadi:  "Keperluan Pribadi",
  keluarga: "Keperluan Keluarga",
  dinas:    "Dinas Luar",
};

function fmtDate(d: string) {
  try { return format(parseISO(d), "dd MMM yyyy", { locale: localeId }); }
  catch { return d; }
}

function daysDiff(start: string, end: string) {
  try { return differenceInCalendarDays(parseISO(end), parseISO(start)) + 1; }
  catch { return 0; }
}

const FILTER_OPTIONS = [
  { value: undefined,  label: "Semua" },
  { value: "pending",  label: "Menunggu" },
  { value: "approved", label: "Disetujui" },
  { value: "rejected", label: "Ditolak" },
];

export default function AdminIzinPage() {
  const queryClient = useQueryClient();
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined);
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [adminNote, setAdminNote] = useState("");
  const [processingId, setProcessingId] = useState<number | null>(null);

  const { data: leaves, isLoading } = useQuery({
    queryKey: ["admin", "leave", filterStatus],
    queryFn: () => api.admin.leave(filterStatus),
  });

  const handleApprove = async (id: number) => {
    setProcessingId(id);
    try {
      await api.admin.approveLeave(id);
      queryClient.invalidateQueries({ queryKey: ["admin", "leave"] });
      toast.success("Pengajuan disetujui");
    } catch { toast.error("Gagal menyetujui"); }
    setProcessingId(null);
  };

  const handleReject = async () => {
    if (!rejectId) return;
    setProcessingId(rejectId);
    try {
      await api.admin.rejectLeave(rejectId, adminNote || undefined);
      queryClient.invalidateQueries({ queryKey: ["admin", "leave"] });
      toast.success("Pengajuan ditolak");
      setRejectId(null);
      setAdminNote("");
    } catch { toast.error("Gagal menolak"); }
    setProcessingId(null);
  };

  return (
    <div className="flex flex-col min-h-full">
      <div className="bg-[#FACC15] px-5 pt-12 pb-8 rounded-b-[40px]">
        <div className="flex items-center gap-3 mb-4">
          <Link href="/admin" className="w-8 h-8 rounded-full bg-[#4A4435]/10 flex items-center justify-center">
            <ArrowLeft className="w-4 h-4 text-[#4A4435]" />
          </Link>
          <div>
            <h1 className="text-xl font-extrabold text-[#4A4435]">Persetujuan Izin</h1>
            <p className="text-xs text-[#4A4435]/60">Kelola pengajuan izin karyawan</p>
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-none">
          {FILTER_OPTIONS.map((opt) => (
            <button key={String(opt.value)} onClick={() => setFilterStatus(opt.value as any)}
              className={`flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${filterStatus === opt.value ? "bg-[#4A4435] text-[#FACC15]" : "bg-white/50 text-[#4A4435]"}`}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 pt-5 pb-24 flex-1">
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
        {!isLoading && (!leaves || leaves.length === 0) && (
          <div className="text-center py-12">
            <FileText className="w-12 h-12 text-gray-200 mx-auto mb-3" />
            <p className="text-[#8C8573] text-sm">Tidak ada pengajuan izin</p>
          </div>
        )}
        {!isLoading && leaves && leaves.length > 0 && (
          <div className="space-y-3">
            {leaves.map((leave) => {
              const days = daysDiff(leave.startDate, leave.endDate);
              const typeLabel = LEAVE_TYPES[leave.type] ?? leave.type;
              const isPending = leave.status === "pending";
              const isProcessing = processingId === leave.id;
              return (
                <div key={leave.id} className="bg-white rounded-2xl p-4 shadow-sm">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <p className="text-sm font-bold text-[#4A4435]">{leave.user?.name ?? `User ${leave.userId}`}</p>
                      <p className="text-xs text-[#8C8573]">{leave.user?.jabatan || leave.user?.employeeId}</p>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      leave.status === "approved" ? "bg-green-100 text-green-700" :
                      leave.status === "rejected" ? "bg-red-100 text-[#E57373]" :
                      "bg-yellow-100 text-yellow-700"
                    }`}>
                      {leave.status === "approved" ? "Disetujui" : leave.status === "rejected" ? "Ditolak" : "Menunggu"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="bg-[#FACC15]/20 text-[#4A4435] text-[10px] font-bold px-2 py-0.5 rounded-full">{typeLabel}</span>
                    <span className="text-xs text-[#8C8573]">{fmtDate(leave.startDate)} — {fmtDate(leave.endDate)}</span>
                    <span className="text-xs text-[#FACC15] font-bold">({days} hari)</span>
                  </div>
                  <p className="text-xs text-[#8C8573] leading-relaxed line-clamp-2">{leave.reason}</p>
                  {leave.adminNote && (
                    <div className="mt-2 bg-gray-50 rounded-lg px-3 py-2">
                      <p className="text-xs text-[#8C8573]"><span className="font-semibold">Catatan:</span> {leave.adminNote}</p>
                    </div>
                  )}
                  {isPending && (
                    <div className="flex gap-2 mt-3">
                      <button onClick={() => handleApprove(leave.id)} disabled={!!processingId}
                        className="flex-1 h-9 rounded-xl bg-green-100 text-green-700 font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-50">
                        {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                        Setujui
                      </button>
                      <button onClick={() => { setRejectId(leave.id); setAdminNote(""); }} disabled={!!processingId}
                        className="flex-1 h-9 rounded-xl bg-red-100 text-[#E57373] font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-50">
                        <XCircle className="w-3.5 h-3.5" />
                        Tolak
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {rejectId !== null && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
          <div className="bg-white w-full max-w-[430px] rounded-t-3xl px-5 pt-5 pb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-[#4A4435]">Tolak Pengajuan</h2>
              <button onClick={() => setRejectId(null)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                <X className="w-4 h-4 text-[#8C8573]" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-semibold text-[#4A4435] mb-1.5 block">
                  Catatan untuk Karyawan <span className="font-normal text-[#8C8573]">(opsional)</span>
                </label>
                <textarea value={adminNote} onChange={(e) => setAdminNote(e.target.value)} rows={3}
                  placeholder="Jelaskan alasan penolakan..."
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-[#4A4435] text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#FACC15]" />
              </div>
              <button onClick={handleReject} disabled={!!processingId}
                className="w-full h-11 rounded-2xl bg-red-100 text-[#E57373] font-bold flex items-center justify-center gap-2 disabled:opacity-60">
                {processingId ? <><Loader2 className="w-4 h-4 animate-spin" /> Memproses...</> : "Konfirmasi Tolak"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="text-center pb-20">
        <p className="text-[10px] text-[#8C8573]/40">PT. Lembayung Wanantara Padha</p>
      </div>
    </div>
  );
}
