import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ArrowLeft, MapPin, RefreshCw, Loader2 } from "lucide-react";

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "--:--";
  return new Date(iso).toLocaleTimeString("id-ID", {
    timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

const STATUS_COLOR: Record<string, string> = {
  hadir: "#22c55e", terlambat: "#E57373", lembur: "#FACC15",
  izin: "#64B5F6", sakit: "#64B5F6", alpha: "#9ca3af",
};

const STATUS_LABEL: Record<string, string> = {
  hadir: "Hadir", terlambat: "Terlambat", lembur: "Lembur",
  izin: "Izin", sakit: "Sakit", alpha: "Alpha",
};

export default function AdminMapPage() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);

  const { data: todayData, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin", "attendance", "today"],
    queryFn: () => api.admin.attendanceToday(),
    refetchInterval: 60_000,
  });

  const recordsWithGPS = (todayData?.records ?? []).filter(
    (r) => r.checkInLatitude != null && r.checkInLongitude != null,
  );

  const centerLat = recordsWithGPS.length > 0
    ? recordsWithGPS.reduce((s, r) => s + (r.checkInLatitude ?? 0), 0) / recordsWithGPS.length
    : -8.128241;
  const centerLng = recordsWithGPS.length > 0
    ? recordsWithGPS.reduce((s, r) => s + (r.checkInLongitude ?? 0), 0) / recordsWithGPS.length
    : 113.234113;

  useEffect(() => {
    if (!mapRef.current) return;
    let L: any;

    const initMap = async () => {
      try {
        const leafletModule = await import("leaflet");
        L = leafletModule.default;
        await import("leaflet/dist/leaflet.css");

        if (mapInstanceRef.current) {
          mapInstanceRef.current.remove();
          mapInstanceRef.current = null;
        }

        const map = L.map(mapRef.current!, { zoomControl: true }).setView([centerLat, centerLng], 14);
        mapInstanceRef.current = map;

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
        }).addTo(map);

        const officeIcon = L.divIcon({
          className: "",
          html: `<div style="width:16px;height:16px;background:#4A4435;border:3px solid #FACC15;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.4)"></div>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        });
        L.marker([-8.128241, 113.234113], { icon: officeIcon })
          .addTo(map)
          .bindPopup(`<div style="text-align:center;font-family:sans-serif;min-width:150px"><p style="font-weight:800;margin:0 0 2px;font-size:13px">PT. Lembayung Wanantara Padha</p><p style="font-size:10px;color:#888;margin:0">Kantor Pusat</p></div>`);

        recordsWithGPS.forEach((r) => {
          const color = STATUS_COLOR[r.status] ?? "#9ca3af";
          const nameInitial = (r.user?.name ?? "?").charAt(0).toUpperCase();
          const photoHtml = r.checkInSelfie
            ? `<img src="${r.checkInSelfie}" style="width:56px;height:56px;object-fit:cover;border-radius:50%;display:block;margin:0 auto 6px;border:2px solid ${color}" />`
            : `<div style="width:44px;height:44px;border-radius:50%;background:${color};color:white;font-size:18px;font-weight:800;display:flex;align-items:center;justify-content:center;margin:0 auto 6px">${nameInitial}</div>`;
          const nameLabel = `<div style="display:flex;flex-direction:column;align-items:center"><div style="background:${color};width:12px;height:12px;border-radius:50%;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3)"></div><div style="background:rgba(255,255,255,0.95);color:#4A4435;font-size:8px;font-weight:700;padding:1px 4px;border-radius:3px;margin-top:2px;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,0.15)">${r.user?.name ?? "?"}</div></div>`;
          const icon = L.divIcon({ className: "", html: nameLabel, iconSize: [50, 32], iconAnchor: [25, 6] });
          L.marker([r.checkInLatitude!, r.checkInLongitude!], { icon })
            .addTo(map)
            .bindPopup(
              `<div style="font-family:sans-serif;min-width:160px;text-align:center">
                ${photoHtml}
                <p style="font-weight:800;margin:0 0 2px;font-size:13px">${r.user?.name ?? "—"}</p>
                <p style="font-size:10px;color:#666;margin:0 0 4px">${r.user?.jabatan || "PT. Lembayung Wanantara Padha"}</p>
                <p style="font-size:11px;margin:0 0 3px">Masuk: <strong>${fmtTime(r.checkInTime)}</strong></p>
                <span style="display:inline-block;padding:2px 8px;border-radius:9999px;background:${color}22;color:${color};font-weight:bold;font-size:11px">${STATUS_LABEL[r.status] ?? r.status}</span>
              </div>`,
            );
        });

        setMapReady(true);
      } catch (err) {
        console.error("Leaflet init error:", err);
        setMapError(true);
      }
    };

    initMap();

    return () => {
      if (mapInstanceRef.current) {
        try { mapInstanceRef.current.remove(); } catch {}
        mapInstanceRef.current = null;
      }
    };
  }, [recordsWithGPS.length, centerLat, centerLng]);

  const totalRecords = todayData?.records?.length ?? 0;
  const withGPS = recordsWithGPS.length;

  return (
    <div className="flex flex-col min-h-full">
      <div className="bg-[#FACC15] px-5 pt-12 pb-6 rounded-b-[40px]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="w-8 h-8 rounded-full bg-[#4A4435]/10 flex items-center justify-center">
              <ArrowLeft className="w-4 h-4 text-[#4A4435]" />
            </Link>
            <div>
              <h1 className="text-xl font-extrabold text-[#4A4435]">Peta Karyawan</h1>
              <p className="text-xs text-[#4A4435]/60">
                {isLoading ? "Memuat..." : `${withGPS} dari ${totalRecords} karyawan terlacak hari ini`}
              </p>
            </div>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="w-9 h-9 rounded-full bg-[#4A4435]/10 flex items-center justify-center"
          >
            <RefreshCw className={`w-4 h-4 text-[#4A4435] ${isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="px-5 pt-4 pb-2">
        <div className="bg-white rounded-2xl px-4 py-3 shadow-sm flex items-center gap-4 flex-wrap">
          {Object.entries(STATUS_COLOR).slice(0, 5).map(([key, color]) => (
            <div key={key} className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full border border-white shadow-sm" style={{ background: color }} />
              <span className="text-[10px] text-[#4A4435] font-medium capitalize">{STATUS_LABEL[key]}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full" style={{ background: "#4A4435", border: "2px solid #FACC15" }} />
            <span className="text-[10px] text-[#4A4435] font-medium">Kantor</span>
          </div>
        </div>
      </div>

      {/* Map Container */}
      <div className="flex-1 px-5 pb-24">
        <div className="relative w-full rounded-2xl overflow-hidden shadow-md bg-gray-100" style={{ height: "calc(100vh - 280px)", minHeight: "300px" }}>
          {(isLoading || !mapReady) && !mapError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-gray-50">
              <Loader2 className="w-8 h-8 animate-spin text-[#FACC15] mb-3" />
              <p className="text-sm text-[#8C8573]">Memuat peta...</p>
            </div>
          )}
          {mapError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-gray-50">
              <MapPin className="w-10 h-10 text-gray-300 mb-3" />
              <p className="text-sm text-[#8C8573]">Gagal memuat peta</p>
            </div>
          )}
          {!isLoading && mapReady && withGPS === 0 && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 bg-white/90 rounded-2xl px-5 py-4 text-center shadow">
              <MapPin className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-[#8C8573]">Belum ada karyawan dengan data GPS hari ini</p>
            </div>
          )}
          <div ref={mapRef} className="w-full h-full" />
        </div>
      </div>

      {/* List */}
      {recordsWithGPS.length > 0 && (
        <div className="px-5 pb-24 -mt-20">
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <p className="text-xs font-bold text-[#8C8573] uppercase tracking-widest px-4 pt-3 pb-2">
              Karyawan Terlacak Hari Ini
            </p>
            {recordsWithGPS.map((r) => (
              <div key={r.id} className="flex items-center justify-between px-4 py-2.5 border-t border-gray-50">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: STATUS_COLOR[r.status] ?? "#9ca3af" }} />
                  <div>
                    <p className="text-sm font-semibold text-[#4A4435]">{r.user?.name ?? `User ${r.userId}`}</p>
                    <p className="text-xs text-[#8C8573]">{r.user?.jabatan || r.user?.employeeId || ""}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold text-[#4A4435]">{fmtTime(r.checkInTime)}</p>
                  <p className="text-[10px] text-[#8C8573]">{STATUS_LABEL[r.status] ?? r.status}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
