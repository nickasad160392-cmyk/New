import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type AttendanceRecord, type CycleSummary } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { format, parseISO } from "date-fns";
import { id as localeId } from "date-fns/locale";
import {
  ChevronDown, Clock, Camera, LogIn, LogOut, FileDown, Loader2,
} from "lucide-react";

function getMonthOptions(): Array<{ label: string; start: string }> {
  const options: Array<{ label: string; start: string }> = [];
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const year = now.getMonth() - i < 0
      ? now.getFullYear() - 1
      : now.getFullYear();
    const month = ((now.getMonth() - i) % 12 + 12) % 12;
    const start = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const label = new Date(year, month, 1).toLocaleDateString("id-ID", { month: "long", year: "numeric" });
    options.push({ label, start });
  }
  const seen = new Set<string>();
  return options.filter((o) => { if (seen.has(o.start)) return false; seen.add(o.start); return true; });
}

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "--:--";
  return new Date(iso).toLocaleTimeString("id-ID", {
    timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hour12: false,
  });
}
function fmtDateShort(d: string) {
  try { return format(parseISO(d), "EEE, dd MMM", { locale: localeId }); } catch { return d; }
}

const STATUS_MAP: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  hadir:     { label: "Hadir",     bg: "bg-green-100",  text: "text-green-700",  dot: "bg-green-500"  },
  terlambat: { label: "Terlambat", bg: "bg-red-100",    text: "text-[#E57373]",  dot: "bg-[#E57373]"  },
  izin:      { label: "Izin",      bg: "bg-blue-100",   text: "text-[#64B5F6]",  dot: "bg-[#64B5F6]"  },
  sakit:     { label: "Sakit",     bg: "bg-blue-100",   text: "text-[#64B5F6]",  dot: "bg-[#64B5F6]"  },
  alpha:     { label: "Alpha",     bg: "bg-gray-100",   text: "text-gray-500",   dot: "bg-gray-400"   },
  lembur:    { label: "Lembur",    bg: "bg-yellow-100", text: "text-yellow-600", dot: "bg-[#FACC15]"  },
};

const STATUS_COLORS: Record<string, [number, number, number]> = {
  hadir:     [34, 197, 94],
  terlambat: [229, 115, 115],
  izin:      [100, 181, 246],
  sakit:     [100, 181, 246],
  alpha:     [156, 163, 175],
  lembur:    [250, 204, 21],
};

async function generatePDF(
  userName: string,
  employeeId: string | null | undefined,
  jabatan: string | null | undefined,
  records: AttendanceRecord[],
  summary: CycleSummary,
) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const doc = new jsPDF({ orientation: "portrait", format: "a4" });

  doc.setFillColor(250, 204, 21);
  doc.rect(0, 0, 210, 32, "F");
  doc.setTextColor(74, 68, 53);
  doc.setFontSize(15);
  doc.setFont("helvetica", "bold");
  doc.text("PT. Lembayung Wanantara Padha", 105, 13, { align: "center" });
  doc.setFontSize(10);
  doc.text("Rekap Absensi Karyawan", 105, 21, { align: "center" });
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text(`Bulan: ${summary.cycleLabel}`, 105, 28, { align: "center" });

  doc.setTextColor(0);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Data Karyawan", 14, 42);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`Nama   : ${userName}`, 14, 49);
  doc.text(`ID     : ${employeeId || "-"}`, 14, 55);
  doc.text(`Jabatan: ${jabatan || "-"}`, 14, 61);

  const summaryItems = [
    { label: "Hadir",     value: `${summary.presentDays} hr`,  fillColor: [220, 252, 231] as [number,number,number], textColor: [21, 128, 61] as [number,number,number] },
    { label: "Terlambat", value: `${summary.lateDays} hr`,     fillColor: [254, 226, 226] as [number,number,number], textColor: [185, 28, 28] as [number,number,number] },
    { label: "Izin",      value: `${summary.permitDays} hr`,   fillColor: [219, 234, 254] as [number,number,number], textColor: [29, 78, 216] as [number,number,number] },
    { label: "Jam Kerja", value: `${Math.floor(summary.totalWorkMinutes / 60)}j ${summary.totalWorkMinutes % 60}m`, fillColor: [220, 252, 231] as [number,number,number], textColor: [21, 128, 61] as [number,number,number] },
    { label: "Lembur",    value: `${Math.floor(summary.totalOvertimeMinutes / 60)}j ${summary.totalOvertimeMinutes % 60}m`, fillColor: [254, 249, 195] as [number,number,number], textColor: [133, 77, 14] as [number,number,number] },
  ];
  const bw = 36;
  summaryItems.forEach((item, i) => {
    const x = 14 + i * (bw + 1.5);
    doc.setFillColor(...item.fillColor);
    doc.rect(x, 68, bw, 18, "F");
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...item.textColor);
    doc.text(item.value, x + bw / 2, 77, { align: "center" });
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text(item.label, x + bw / 2, 82, { align: "center" });
  });

  const sortedRecords = [...records].reverse();

  autoTable(doc, {
    startY: 92,
    head: [["Tanggal", "Status", "Datang", "Pulang", "Jam Kerja", "Lembur", "Terlambat"]],
    body: sortedRecords.map((r) => [
      r.date,
      STATUS_MAP[r.status]?.label || r.status,
      r.checkInTime ? fmtTime(r.checkInTime) : "-",
      r.checkOutTime ? fmtTime(r.checkOutTime) : "-",
      r.workMinutes ? `${Math.floor(r.workMinutes / 60)}j ${r.workMinutes % 60}m` : "-",
      r.overtimeMinutes ? `${Math.floor(r.overtimeMinutes / 60)}j ${r.overtimeMinutes % 60}m` : "-",
      r.latenessMinutes ? `${r.latenessMinutes}m` : "-",
    ]),
    headStyles: { fillColor: [74, 68, 53], textColor: [250, 204, 21], fontStyle: "bold", fontSize: 7 },
    bodyStyles: { fontSize: 7, textColor: [60, 60, 60] },
    alternateRowStyles: { fillColor: [251, 249, 243] },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 22 },
      2: { cellWidth: 16 },
      3: { cellWidth: 16 },
      4: { cellWidth: 26 },
      5: { cellWidth: 22 },
      6: { cellWidth: 22 },
    },
    margin: { left: 14, right: 14 },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 1) {
        const status = sortedRecords[data.row.index]?.status ?? "";
        const color = STATUS_COLORS[status];
        if (color) {
          data.cell.styles.textColor = color;
          data.cell.styles.fontStyle = "bold";
        }
      }
      if (data.section === "body" && data.column.index === 4 && data.cell.raw !== "-") {
        data.cell.styles.textColor = [21, 128, 61];
        data.cell.styles.fontStyle = "bold";
      }
      if (data.section === "body" && data.column.index === 5 && data.cell.raw !== "-") {
        data.cell.styles.textColor = [133, 77, 14];
      }
      if (data.section === "body" && data.column.index === 6 && data.cell.raw !== "-") {
        data.cell.styles.textColor = [185, 28, 28];
      }
    },
  });

  const ph = doc.internal.pageSize.height;
  doc.setFontSize(7);
  doc.setTextColor(150);
  doc.text(
    `Dicetak: ${new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}`,
    105, ph - 10, { align: "center" },
  );

  doc.save(`rekap-${userName.replace(/\s+/g, "-")}-${summary.cycleLabel.replace(/\s+/g, "-")}.pdf`);
}

export default function RiwayatPage() {
  const { user } = useAuth();
  const months = getMonthOptions();
  const [selectedMonth, setSelectedMonth] = useState(months[0]?.start ?? "");
  const [isPdfLoading, setIsPdfLoading] = useState(false);
  const [photoModal, setPhotoModal] = useState<{ src: string; label: string } | null>(null);

  const { data: history, isLoading: loadingHistory } = useQuery({
    queryKey: ["attendance", "history", selectedMonth],
    queryFn: () => api.attendance.history(selectedMonth),
    enabled: !!selectedMonth,
  });

  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ["attendance", "cycle-summary", selectedMonth],
    queryFn: () => api.attendance.cycleSummary(selectedMonth),
    enabled: !!selectedMonth,
  });

  const handleDownloadPDF = async () => {
    if (!history || !summary || !user) return;
    setIsPdfLoading(true);
    try { await generatePDF(user.name, user.employeeId, user.jabatan, history, summary); } catch (e) { console.error(e); }
    setIsPdfLoading(false);
  };

  return (
    <div className="flex flex-col min-h-full">
      <div className="bg-[#FACC15] px-5 pt-12 pb-8 rounded-b-[40px]">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-2xl font-extrabold text-[#4A4435]">Riwayat Absensi</h1>
          {summary && history && (
            <button
              onClick={handleDownloadPDF}
              disabled={isPdfLoading}
              className="flex items-center gap-1.5 bg-[#4A4435] text-[#FACC15] text-xs font-bold px-3 py-2 rounded-xl disabled:opacity-60"
            >
              {isPdfLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
              PDF
            </button>
          )}
        </div>
        <div className="relative">
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="w-full h-11 pl-4 pr-10 rounded-xl bg-white/60 border border-[#4A4435]/10 text-[#4A4435] font-semibold text-sm appearance-none focus:outline-none"
          >
            {months.map((m) => <option key={m.start} value={m.start}>{m.label}</option>)}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4A4435] pointer-events-none" />
        </div>
      </div>

      <div className="px-5 pt-5 pb-24 flex-1">
        {(loadingSummary || summary) && (
          <div className="grid grid-cols-4 gap-2 mb-5">
            {[
              { label: "Hadir",     value: summary?.presentDays ?? 0, color: "text-green-600"  },
              { label: "Terlambat", value: summary?.lateDays ?? 0,    color: "text-[#E57373]"  },
              { label: "Izin",      value: summary?.permitDays ?? 0,  color: "text-[#64B5F6]"  },
              { label: "Alpha",     value: summary?.absentDays ?? 0,  color: "text-gray-400"   },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded-xl p-2.5 shadow-sm text-center">
                {loadingSummary ? <div className="h-5 bg-gray-100 rounded animate-pulse mx-auto w-6 mb-1" /> : (
                  <p className={`text-xl font-extrabold ${s.color}`}>{s.value}</p>
                )}
                <p className="text-[9px] text-[#8C8573] uppercase tracking-wider font-semibold">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {summary && (
          <div className="bg-white rounded-2xl p-4 shadow-sm mb-5 flex items-center justify-around">
            <div className="text-center">
              <p className="text-lg font-extrabold text-green-700">
                {Math.floor((summary.totalWorkMinutes ?? 0) / 60)}<span className="text-xs font-medium ml-0.5">j</span>
                {(summary.totalWorkMinutes ?? 0) % 60 > 0 && <> {(summary.totalWorkMinutes ?? 0) % 60}<span className="text-xs font-medium ml-0.5">m</span></>}
              </p>
              <p className="text-[10px] text-[#8C8573] uppercase tracking-wider">Jam Kerja</p>
            </div>
            <div className="w-px h-8 bg-gray-100" />
            <div className="text-center">
              <p className="text-lg font-extrabold text-[#FACC15]">
                {Math.floor((summary.totalOvertimeMinutes ?? 0) / 60)}<span className="text-xs font-medium ml-0.5">j</span>
              </p>
              <p className="text-[10px] text-[#8C8573] uppercase tracking-wider">Lembur</p>
            </div>
            <div className="w-px h-8 bg-gray-100" />
            <div className="text-center">
              <p className="text-lg font-extrabold text-[#E57373]">
                {summary.totalLatenessMinutes ?? 0}<span className="text-xs font-medium ml-0.5">m</span>
              </p>
              <p className="text-[10px] text-[#8C8573] uppercase tracking-wider">Terlambat</p>
            </div>
          </div>
        )}

        <h2 className="text-xs font-bold text-[#8C8573] uppercase tracking-widest mb-3">Catatan Harian</h2>

        {loadingHistory && (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white rounded-2xl p-4 shadow-sm animate-pulse">
                <div className="flex justify-between"><div className="h-4 bg-gray-100 rounded w-1/3" /><div className="h-4 bg-gray-100 rounded w-16" /></div>
                <div className="h-3 bg-gray-100 rounded w-1/2 mt-2" />
              </div>
            ))}
          </div>
        )}

        {!loadingHistory && (!history || history.length === 0) && (
          <div className="text-center py-10">
            <Clock className="w-12 h-12 text-gray-200 mx-auto mb-3" />
            <p className="text-[#8C8573] text-sm">Tidak ada catatan untuk bulan ini</p>
          </div>
        )}

        {!loadingHistory && history && history.length > 0 && (
          <div className="space-y-2">
            {[...history].reverse().map((r) => {
              const st = STATUS_MAP[r.status] ?? { label: r.status, bg: "bg-gray-100", text: "text-gray-600", dot: "bg-gray-400" };
              return (
                <div key={r.id} className="bg-white rounded-2xl p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${st.dot}`} />
                      <p className="text-sm font-bold text-[#4A4435]">{fmtDateShort(r.date)}</p>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${st.bg} ${st.text}`}>{st.label}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-[#8C8573] mb-1.5">
                    <span>Datang: <strong className="text-[#4A4435]">{fmtTime(r.checkInTime)}</strong></span>
                    <span>Pulang: <strong className="text-[#4A4435]">{fmtTime(r.checkOutTime)}</strong></span>
                  </div>
                  {(r.latenessMinutes || r.overtimeMinutes || r.workMinutes) ? (
                    <div className="flex items-center gap-3 text-[10px] text-[#8C8573] mb-2">
                      {r.workMinutes ? <span>Kerja: <strong className="text-green-700">{Math.floor(r.workMinutes / 60)}j {r.workMinutes % 60}m</strong></span> : null}
                      {r.latenessMinutes ? <span className="text-[#E57373]">+{r.latenessMinutes}m terlambat</span> : null}
                      {r.overtimeMinutes ? <span className="text-yellow-600 font-semibold">+{Math.floor(r.overtimeMinutes / 60)}j lembur</span> : null}
                    </div>
                  ) : null}
                  <div className="flex items-center gap-3 mt-1">
                    {r.checkInSelfie ? (
                      <button
                        onClick={() => setPhotoModal({ src: `data:image/jpeg;base64,${r.checkInSelfie}`, label: "Foto Datang" })}
                        className="flex items-center gap-1 text-[10px] text-[#8C8573] bg-gray-50 rounded-lg px-2 py-1 hover:bg-gray-100 transition-colors"
                      >
                        <LogIn className="w-3 h-3 text-green-600" /><span>Foto Datang</span>
                      </button>
                    ) : null}
                    {r.checkOutSelfie ? (
                      <button
                        onClick={() => setPhotoModal({ src: `data:image/jpeg;base64,${r.checkOutSelfie}`, label: "Foto Pulang" })}
                        className="flex items-center gap-1 text-[10px] text-[#8C8573] bg-gray-50 rounded-lg px-2 py-1 hover:bg-gray-100 transition-colors"
                      >
                        <LogOut className="w-3 h-3 text-blue-500" /><span>Foto Pulang</span>
                      </button>
                    ) : null}
                    {r.overtimeCheckInSelfie ? (
                      <button
                        onClick={() => setPhotoModal({ src: `data:image/jpeg;base64,${r.overtimeCheckInSelfie}`, label: "Foto Lembur" })}
                        className="flex items-center gap-1 text-[10px] text-[#8C8573] bg-yellow-50 rounded-lg px-2 py-1 hover:bg-yellow-100 transition-colors"
                      >
                        <Camera className="w-3 h-3 text-yellow-600" /><span>Foto Lembur</span>
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="text-center pb-20">
        <p className="text-[10px] text-[#8C8573]/40">PT. Lembayung Wanantara Padha</p>
      </div>

      {photoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-6" onClick={() => setPhotoModal(null)}>
          <div className="relative max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <p className="text-white text-sm font-bold text-center mb-3">{photoModal.label}</p>
            <img src={photoModal.src} alt={photoModal.label} className="w-full rounded-2xl scale-x-[-1] shadow-2xl" />
            <button onClick={() => setPhotoModal(null)} className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-white flex items-center justify-center shadow">
              <span className="text-[#4A4435] font-bold text-sm">✕</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
