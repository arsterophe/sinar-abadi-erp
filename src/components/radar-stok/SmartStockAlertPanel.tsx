"use client";

import React, { useState, useMemo } from "react";
import {
  AlertTriangle,
  Flame,
  XCircle,
  CheckCircle2,
  BellRing,
  ChevronDown,
  ChevronUp,
  ShoppingCart,
  Clock,
  Package,
} from "lucide-react";
import {
  RadarStokItem,
  SmartStockAlert,
  SmartStockBadgeSummary,
} from "@/types/radar_stok";
import {
  getSmartStockAlerts,
  hitungSmartStockBadge,
} from "@/lib/radar-stok/getRadarStokData";

interface SmartStockAlertPanelProps {
  items: RadarStokItem[];
  canCreatePO?: boolean;
  onQuickPO?: (item: RadarStokItem) => void;
}

export default function SmartStockAlertPanel({
  items,
  canCreatePO = false,
  onQuickPO,
}: SmartStockAlertPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [filterKategori, setFilterKategori] = useState<"semua" | "darurat" | "peringatan">("semua");

  // 1. Ekstraksi daftar alert menggunakan helper murni Tahap 1 sebagai satu-satunya sumber kebenaran
  const alerts: SmartStockAlert[] = useMemo(() => {
    return getSmartStockAlerts(items);
  }, [items]);

  // 2. Hitung badge ringkasan lokal menggunakan helper murni Tahap 1 (bebas duplikasi barang)
  const badge: SmartStockBadgeSummary = useMemo(() => {
    return hitungSmartStockBadge(alerts);
  }, [alerts]);

  // Map untuk mencari item asli RadarStokItem jika pengguna menekan aksi Quick PO
  const itemMap = useMemo(() => {
    const map = new Map<string, RadarStokItem>();
    for (const it of items) {
      map.set(it.barangId, it);
    }
    return map;
  }, [items]);

  // Filter tampilan berdasarkan kategori alert yang dipilih pengguna di panel
  const displayedAlerts = useMemo(() => {
    if (filterKategori === "semua") return alerts;
    return alerts.filter((a) => a.kategori === filterKategori);
  }, [alerts, filterKategori]);

  const formatAngka = (val: number | null | undefined): string => {
    if (val === null || val === undefined || isNaN(Number(val))) return "0";
    return Number(val).toLocaleString("id-ID");
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden transition-all">
      {/* Header Panel Notifikasi */}
      <div className="p-4 sm:p-5 border-b border-slate-100 bg-gradient-to-r from-slate-50 via-white to-slate-50/50">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3">
            <div className={`p-2 rounded-xl shrink-0 ${
              badge.emergencyCount > 0
                ? "bg-rose-100 text-rose-700 ring-4 ring-rose-50"
                : badge.warningCount > 0
                ? "bg-amber-100 text-amber-700 ring-4 ring-amber-50"
                : "bg-emerald-100 text-emerald-700 ring-4 ring-emerald-50"
            }`}>
              <BellRing className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-bold text-slate-900 tracking-tight">
                  Notifikasi Stok Pintar
                </h2>
                {/* Badge Ringkasan Lokal */}
                <div className="flex items-center gap-1.5">
                  {badge.emergencyCount > 0 && (
                    <span
                      title={`${badge.emergencyCount} barang berstatus Habis atau Kritis`}
                      className="inline-flex items-center gap-1 rounded-full bg-rose-600 px-2.5 py-0.5 text-[11px] font-bold text-white shadow-xs"
                    >
                      <Flame className="h-3 w-3" />
                      <span>{badge.emergencyCount} Darurat</span>
                    </span>
                  )}
                  {badge.warningCount > 0 && (
                    <span
                      title={`${badge.warningCount} barang berstatus Waspada`}
                      className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-2.5 py-0.5 text-[11px] font-bold text-white shadow-xs"
                    >
                      <AlertTriangle className="h-3 w-3" />
                      <span>{badge.warningCount} Peringatan</span>
                    </span>
                  )}
                  {alerts.length === 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-0.5 text-[11px] font-semibold text-white">
                      <CheckCircle2 className="h-3 w-3" />
                      <span>Stok Terkendali</span>
                    </span>
                  )}
                </div>
              </div>
              <p className="mt-0.5 text-xs text-slate-500 leading-relaxed">
                Prioritas tindakan pengadaan berdasarkan estimasi sisa hari stok habis dan batas minimum persediaan.
              </p>
            </div>
          </div>

          {/* Tombol Toggle Buka/Tutup Panel */}
          {alerts.length > 0 && (
            <div className="flex items-center gap-2 self-end sm:self-center">
              <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <span>{isExpanded ? "Tutup Panel" : `Lihat ${alerts.length} Notifikasi`}</span>
                {isExpanded ? (
                  <ChevronUp className="h-3.5 w-3.5 text-slate-500" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
                )}
              </button>
            </div>
          )}
        </div>

        {/* Tab Filter Kategori Alert Lokal (Hanya saat ada alert dan panel dibuka) */}
        {alerts.length > 0 && isExpanded && (
          <div className="flex items-center gap-2 pt-3 mt-3 border-t border-slate-200/60">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Tampilkan:
            </span>
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <button
                type="button"
                onClick={() => setFilterKategori("semua")}
                className={`px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                  filterKategori === "semua"
                    ? "bg-slate-900 text-white shadow-xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                Semua ({alerts.length})
              </button>
              {badge.emergencyCount > 0 && (
                <button
                  type="button"
                  onClick={() => setFilterKategori("darurat")}
                  className={`px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                    filterKategori === "darurat"
                      ? "bg-rose-700 text-white shadow-xs"
                      : "bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200"
                  }`}
                >
                  Darurat Saja ({badge.emergencyCount})
                </button>
              )}
              {badge.warningCount > 0 && (
                <button
                  type="button"
                  onClick={() => setFilterKategori("peringatan")}
                  className={`px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                    filterKategori === "peringatan"
                      ? "bg-amber-600 text-white shadow-xs"
                      : "bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200"
                  }`}
                >
                  Peringatan Saja ({badge.warningCount})
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Konten Daftar Notifikasi */}
      {isExpanded && (
        <div className="divide-y divide-slate-100">
          {/* Empty State: Tidak ada alert stok */}
          {alerts.length === 0 ? (
            <div className="p-8 text-center bg-slate-50/40">
              <div className="mx-auto w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-3">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">
                Semua Persediaan Stok Terkendali
              </h3>
              <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                Tidak ada barang aktif yang berstatus Habis, Kritis, atau Waspada saat ini. Laju konsumsi barang berada dalam batas aman persediaan.
              </p>
            </div>
          ) : displayedAlerts.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">
              Tidak ada notifikasi pada kategori filter yang dipilih.
            </div>
          ) : (
            displayedAlerts.map((alert) => {
              const originalItem = itemMap.get(alert.barangId);

              // Styling spesifik per status
              const isHabis = alert.status === "Habis";
              const isKritis = alert.status === "Kritis";

              let badgeStyle = "bg-amber-50 text-amber-800 border-amber-200";
              let StatusIcon = AlertTriangle;

              if (isHabis) {
                badgeStyle = "bg-rose-100 text-rose-900 border-rose-300";
                StatusIcon = XCircle;
              } else if (isKritis) {
                badgeStyle = "bg-rose-50 text-rose-800 border-rose-200";
                StatusIcon = Flame;
              }

              return (
                <div
                  key={alert.barangId}
                  className={`p-4 transition-colors hover:bg-slate-50/70 flex flex-col md:flex-row md:items-center justify-between gap-3.5 ${
                    isHabis
                      ? "bg-rose-50/30"
                      : isKritis
                      ? "bg-amber-50/20"
                      : ""
                  }`}
                >
                  {/* Kolom Informasi Barang & Status */}
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className={`mt-0.5 p-1.5 rounded-lg shrink-0 border ${badgeStyle}`}>
                      <StatusIcon className="h-4 w-4" />
                    </div>

                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[11px] font-semibold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                          {alert.kodeBarang}
                        </span>
                        <h3 className="text-xs font-bold text-slate-900 truncate" title={alert.namaBarang}>
                          {alert.namaBarang}
                        </h3>
                        <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${badgeStyle}`}>
                          <span>{alert.status}</span>
                        </span>
                      </div>

                      <p className="text-xs text-slate-600 leading-snug">
                        {alert.pesan}
                      </p>

                      {/* Detail Metrik Singkat */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-0.5 text-[11px] text-slate-500">
                        <span className="inline-flex items-center gap-1">
                          <Package className="h-3.5 w-3.5 text-slate-400" />
                          <span>Stok Fisik:</span>
                          <strong className={`font-semibold ${alert.stokFisik <= alert.stokMinimum ? "text-rose-700" : "text-slate-800"}`}>
                            {formatAngka(alert.stokFisik)} {alert.satuan}
                          </strong>
                          <span className="text-slate-400">(Min: {formatAngka(alert.stokMinimum)})</span>
                        </span>

                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5 text-slate-400" />
                          <span>Estimasi Habis:</span>
                          <strong className="font-semibold text-slate-800">
                            {alert.status === "Habis"
                              ? "Sudah Habis"
                              : alert.estimasiHariHabis !== null
                              ? `${alert.estimasiHariHabis} hari`
                              : "Tanpa riwayat penjualan"}
                          </strong>
                        </span>

                        {alert.rekomendasiOrder > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <span>Rekomendasi Order:</span>
                            <strong className="font-semibold text-blue-700">
                              +{formatAngka(alert.rekomendasiOrder)} {alert.satuan}
                            </strong>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Kolom Aksi Cepat (Quick PO) jika berhak */}
                  {canCreatePO && alert.rekomendasiOrder > 0 && originalItem && onQuickPO && (
                    <div className="shrink-0 self-end md:self-center">
                      <button
                        type="button"
                        onClick={() => onQuickPO(originalItem)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 active:bg-blue-800 transition-colors cursor-pointer"
                        title={`Buat pengajuan pembelian untuk ${alert.namaBarang}`}
                      >
                        <ShoppingCart className="h-3.5 w-3.5" />
                        <span>Buat Pengajuan PO</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
