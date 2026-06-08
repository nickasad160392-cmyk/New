import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { api, type AdminAttendanceRecord } from "@/lib/api";
import { ArrowLeft, ChevronDown, Download, BarChart2, Loader2, FileDown } from "lucide-react";
import { format, parseISO } from "date-fns";
import { id as localeId } from "date-fns/locale";

function getCycleOptions(): Array<{ label: string; start: string }> {
  const options: Array<{ label: string; start: string }> = [];
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const year = now.getMonth() - i < 0 ? now.getFullYear() - 1 : now.getFullYear();
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
  try { return format(parseISO(d), "dd/MM", { locale: localeId }); } catch { return d; }
}

const STATUS_LABEL: Record<string, string> = {
  hadir: "Hadir", terlambat: "Terlambat", izin: "Izin",
  sakit: "Sakit", alpha: "Alpha", lembur: "Lembur",
};

async function generateAllPDF(
  records: AdminAttendanceRecord[],
  cycleLabel: string,
) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const doc = new jsPDF({ orientation: "landscape", format: "a4" });

  doc.setFillColor(250, 204, 21);
  doc.rect(0, 0, 297, 28, "F");
  doc.setTextColor(74, 68, 53);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("PT. Lembayung Wanantara Padha — Rekap Absensi Seluruh Karyawan", 148.5, 12, { align: "center" });
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Siklus: ${cycleLabel}`, 148.5, 21, { align: "center" });

  const grouped = records.reduce<Record<number, { name: string; employeeId: string; jabatan: string; recs: AdminAttendanceRecord[] }>>((acc, r) => {
    if (!acc[r.userId]) acc[r.userId] = { name: r.user?.name ?? `User ${r.userId}`, employeeId: r.user?.employeeId || "-", jabatan: r.user?.jabatan || "-", recs: [] };
    acc[r.userId]!.recs.push(r);
    return acc;
  }, {});

  autoTable(doc, {
    startY: 33,
    head: [["Nama", "ID", "Jabatan", "Hadir", "Terlambat", "Izin", "Alpha", "Jam Kerja Total", "Lembur Total", "Total Terlambat"]],
    body: Object.values(grouped).map((g) => {
      const hadir = g.recs.filter((r) => r.status === "hadir" || r.status === "terlambat" || r.status === "lembur").length;
      const terlambat = g.recs.filter((r) => r.status === "terlambat").length;
      const izin = g.recs.filter((r) => r.status === "izin" || r.status === "sakit").length;
      const alpha = g.recs.filter((r) => r.status === "alpha").length;
      const totalWork = g.recs.reduce((s, r) => s + (r.workMinutes ?? 0), 0);
      const totalOvertime = g.recs.reduce((s, r) => s + (r.overtimeMinutes ?? 0), 0);
      const totalLate = g.recs.reduce((s, r) => s + (r.latenessMinutes ?? 0), 0);
      return [
        g.name, g.employeeId, g.jabatan,
        hadir, terlambat, izin, alpha,
        `${Math.floor(totalWork / 60)}j ${totalWork % 60}m`,
        `${Math.floor(totalOvertime / 60)}j ${totalOvertime % 60}m`,
        `${totalLate}m`,
      ];
    }),
    headStyles: { fillColor: [250, 204, 21], textColor: [74, 68, 53], fontStyle: "bold", fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    alternateRowStyles: { fillColor: [253, 251, 245] },
    margin: { left: 10, right: 10 },
  });

  const ph = doc.internal.pageSize.height;
  doc.setFontSize(7);
  doc.setTextColor(150);
  doc.text(`Dicetak: ${new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}`, 148.5, ph - 8, { align: "center" });

  doc.save(`rekap-semua-karyawan-${cycleLabel.replace(/\s+/g, "-")}.pdf`);
}

async function generateUserPDF(
  userName: string,
  employeeId: string,
  jabatan: string,
  recs: AdminAttendanceRecord[],
  cycleLabel: string,
) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const doc = new jsPDF({ orientation: "portrait", format: "a4" });

  doc.setFillColor(250, 204, 21);
  doc.rect(0, 0, 210, 32, "F");
  doc.setTextColor(74, 68, 53);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("PT. Lembayung Wanantara Padha", 105, 13, { align: "center" });
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Rekap Absensi — Siklus: ${cycleLabel}`, 105, 22, { align: "center" });

  doc.setTextColor(0);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Data Karyawan", 14, 42);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`Nama   : ${userName}`, 14, 49);
  doc.text(`ID     : ${employeeId}`, 14, 55);
  doc.text(`Jabatan: ${jabatan}`, 14, 61);

  const totalWork = recs.reduce((s, r) => s + (r.workMinutes ?? 0), 0);
  const totalOvertime = recs.reduce((s, r) => s + (r.overtimeMinutes ?? 0), 0);
  const totalLate = recs.reduce((s, r) => s + (r.latenessMinutes ?? 0), 0);
  const hadir = recs.filter((r) => ["hadir", "terlambat", "lembur"].includes(r.status)).length;
  const permit = recs.filter((r) => ["izin", "sakit"].includes(r.status)).length;

  const summaryItems = [
    { label: "Hadir",    value: `${hadir} hr`                            },
    { label: "Izin",     value: `${permit} hr`                           },
    { label: "Jam Kerja", value: `${Math.floor(totalWork / 60)}j ${totalWork % 60}m` },
    { label: "Lembur",   value: `${Math.floor(totalOvertime / 60)}j ${totalOvertime % 60}m` },
    { label: "Terlambat", value: `${totalLate}m`                         },
  ];
  const bw = 36;
  summaryItems.forEach((item, i) => {
    const x = 14 + i * (bw + 1.5);
    doc.setFillColor(245, 245, 245);
    doc.rect(x, 68, bw, 18, "F");
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(74, 68, 53);
    doc.text(item.value, x + bw / 2, 77, { align: "center" });
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.text(item.label, x + bw / 2, 82, { align: "center" });
  });

  autoTable(doc, {
    startY: 92,
    head: [["Tanggal", "Status", "Datang", "Pulang", "Jam Kerja", "Lembur", "Terlambat"]],
    body: [...recs].reverse().map((r) => [
      r.date, STATUS_LABEL[r.status] || r.status,
      r.checkInTime ? fmtTime(r.checkInTime) : "-",
      r.checkOutTime ? fmtTime(r.checkOutTime) : "-",
      r.workMinutes ? `${Math.floor(r.workMinutes / 60)}j ${r.workMinutes % 60}m` : "-",
      r.overtimeMinutes ? `${Math.floor(r.overtimeMinutes / 60)}j ${r.overtimeMinutes % 60}m` : "-",
      r.latenessMinutes ? `${r.latenessMinutes}m` : "-",
    ]),
    headStyles: { fillColor: [250, 204, 21], textColor: [74, 68, 53], fontStyle: "bold", fontSize: 7 },
    bodyStyles: { fontSize: 7 },
    alternateRowStyles: { fillColor: [253, 251, 245] },
    margin: { left: 14, right: 14 },
  });

  const ph = doc.internal.pageSize.height;
  doc.setFontSize(7); doc.setTextColor(150);
  doc.text(`Dicetak: ${new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}`, 105, ph - 10, { align: "center" });

  doc.save(`rekap-${userName.replace(/\s+/g, "-")}-${cycleLabel.replace(/\s+/g, "-")}.pdf`);
}

export default function AdminRekapPage() {
  const cycles = getCycleOptions();
  const [selectedCycle, setSelectedCycle] = useState(cycles[0]?.start ?? "");
  const [search, setSearch] = useState("");
  const [expandedUser, setExpandedUser] = useState<number | null>(null);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [downloadingUser, setDownloadingUser] = useState<number | null>(null);

  const { data: records, isLoading } = useQuery({
    queryKey: ["admin", "attendance", selectedCycle],
    queryFn: () => api.admin.attendance(selectedCycle),
    enabled: !!selectedCycle,
  });

  const cycleLabel = cycles.find((c) => c.start === selectedCycle)?.label ?? selectedCycle;

  const grouped = (records ?? []).reduce<
    Record<number, { userName: string; employeeId: string; jabatan: string; records: AdminAttendanceRecord[] }>
  >((acc, r) => {
    if (!acc[r.userId]) {
      acc[r.userId] = {
        userName: r.user?.name ?? `User ${r.userId}`,
        employeeId: r.user?.employeeId || "-",
        jabatan: r.user?.jabatan || "-",
        records: [],
      };
    }
    acc[r.userId]!.records.push(r);
    return acc;
  }, {});

  const filteredGroups = Object.entries(grouped).filter(([, g]) =>
    !search || g.userName.toLowerCase().includes(search.toLowerCase()) || g.employeeId.toLowerCase().includes(search.toLowerCase()),
  );

  const handleDownloadAll = async () => {
    if (!records || records.length === 0) return;
    setIsDownloadingAll(true);
    try { await generateAllPDF(records, cycleLabel); } catch (e) { console.error(e); }
    setIsDownloadingAll(false);
  };

  const handleDownloadUser = async (userId: number, g: typeof grouped[number]) => {
    setDownloadingUser(userId);
    try { await generateUserPDF(g.userName, g.employeeId, g.jabatan, g.records, cycleLabel); } catch (e) { console.error(e); }
    setDownloadingUser(null);
  };

  const STATUS_DOT: Record<string, string> = {
    hadir: "bg-green-500", terlambat: "bg-[#E57373]", izin: "bg-[#64B5F6]",
    sakit: "bg-[#64B5F6]", alpha: "bg-gray-400", lembur: "bg-[#FACC15]",
  };

  return (
    <div className="flex flex-col min-h-full">
      <div className="bg-[#FACC15] px-5 pt-12 pb-8 rounded-b-[40px]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="w-8 h-8 rounded-full bg-[#4A4435]/10 flex items-center justify-center">
              <ArrowLeft className="w-4 h-4 text-[#4A4435]" />
            </Link>
            <div>
              <h1 className="text-xl font-extrabold text-[#4A4435]">Rekap Absensi</h1>
              <p className="text-xs text-[#4A4435]/60">{records?.length ?? 0} catatan</p>
            </div>
          </div>
          {records && records.length > 0 && (
            <button
              onClick={handleDownloadAll} disabled={isDownloadingAll}
              className="flex items-center gap-1.5 bg-[#4A4435] text-[#FACC15] text-xs font-bold px-3 py-2 rounded-xl disabled:opacity-60"
            >
              {isDownloadingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              PDF Semua
            </button>
          )}
        </div>
        <div className="relative mb-3">
          <select
            value={selectedCycle} onChange={(e) => setSelectedCycle(e.target.value)}
            className="w-full h-11 pl-4 pr-10 rounded-xl bg-white/60 border border-[#4A4435]/10 text-[#4A4435] font-semibold text-sm appearance-none focus:outline-none"
          >
            {cycles.map((c) => <option key={c.start} value={c.start}>{c.label}</option>)}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4A4435] pointer-events-none" />
        </div>
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari nama atau ID karyawan..."
          className="w-full h-10 px-4 rounded-xl bg-white/60 border border-[#4A4435]/10 text-[#4A4435] text-sm placeholder-[#8C8573] focus:outline-none"
        />
      </div>

      <div className="px-5 pt-5 pb-24 flex-1">
        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-2xl p-4 shadow-sm animate-pulse">
                <div className="h-4 bg-gray-100 rounded w-1/3 mb-2" />
                <div className="h-3 bg-gray-100 rounded w-1/2" />
              </div>
            ))}
          </div>
        )}
        {!isLoading && filteredGroups.length === 0 && (
          <div className="text-center py-12">
            <BarChart2 className="w-12 h-12 text-gray-200 mx-auto mb-3" />
            <p className="text-[#8C8573] text-sm">Tidak ada data rekap</p>
          </div>
        )}
        {!isLoading && filteredGroups.length > 0 && (
          <div className="space-y-3">
            {filteredGroups.map(([userId, g]) => {
              const uId = Number(userId);
              const isExpanded = expandedUser === uId;
              const recs = g.records;
              const hadir = recs.filter((r) => ["hadir", "terlambat", "lembur"].includes(r.status)).length;
              const alpha = recs.filter((r) => r.status === "alpha").length;
              const totalWork = recs.reduce((s, r) => s + (r.workMinutes ?? 0), 0);
              return (
                <div key={userId} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                  <div className="w-full px-4 py-3.5 flex items-center justify-between">
                    <button
                      onClick={() => setExpandedUser(isExpanded ? null : uId)}
                      className="flex items-center gap-3 text-left flex-1"
                    >
                      <div className="w-9 h-9 rounded-full bg-[#FACC15]/30 flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-bold text-[#4A4435]">{g.userName.charAt(0)}</span>
                      </div>
                      <div>
                        <p className="text-sm font-bold text-[#4A4435]">{g.userName}</p>
                        <p className="text-xs text-[#8C8573]">
                          {g.jabatan !== "-" ? g.jabatan : g.employeeId}
                          <span className="ml-1 text-[#4A4435] font-semibold">· {hadir} hadir, {alpha} alpha</span>
                        </p>
                      </div>
                    </button>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-green-700 font-semibold">{Math.floor(totalWork / 60)}j</span>
                      <button
                        onClick={() => handleDownloadUser(uId, g)}
                        disabled={downloadingUser === uId}
                        className="w-7 h-7 rounded-lg bg-[#FACC15]/20 flex items-center justify-center"
                        title="Unduh PDF"
                      >
                        {downloadingUser === uId
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin text-[#4A4435]" />
                          : <FileDown className="w-3.5 h-3.5 text-[#4A4435]" />}
                      </button>
                      <ChevronDown
                        className={`w-4 h-4 text-[#8C8573] transition-transform cursor-pointer ${isExpanded ? "rotate-180" : ""}`}
                        onClick={() => setExpandedUser(isExpanded ? null : uId)}
                      />
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="px-4 pb-3 border-t border-gray-50">
                      <div className="mt-3 space-y-1.5">
                        {[...recs].reverse().map((r) => (
                          <div key={r.id} className="flex items-center justify-between text-xs py-1">
                            <div className="flex items-center gap-2">
                              <div className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[r.status] ?? "bg-gray-400"} flex-shrink-0`} />
                              <span className="text-[#4A4435] font-medium w-12">{fmtDateShort(r.date)}</span>
                              <span className="text-[#8C8573]">{fmtTime(r.checkInTime)} – {fmtTime(r.checkOutTime)}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {r.workMinutes ? <span className="text-green-700 font-semibold">{Math.floor(r.workMinutes / 60)}j</span> : null}
                              <span className="text-[#4A4435] font-semibold">{STATUS_LABEL[r.status] ?? r.status}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="text-center pb-20">
        <p className="text-[10px] text-[#8C8573]/40">PT. Lembayung Wanantara Padha</p>
      </div>
    </div>
  );
}
