"use client";

import React from "react";
import Link from "next/link";
import {
  DollarSign,
  Clock,
  ArrowRight,
  FileText,
  AlertCircle,
  CheckCircle2,
  ShieldAlert,
  RotateCcw,
  BarChart3,
  Receipt,
  Wallet,
} from "lucide-react";
import { formatRupiah } from "@/types/pelanggan";
import { ManagerDashboardMetrics } from "@/lib/dashboard/getManagerMetrics";
import { ManagerAnalyticsPayload, DateRangeFilter as IDateRangeFilter } from "@/types/analytics";

import DateRangeFilter from "@/components/dashboard/analytics/DateRangeFilter";
import SalesTrendChart from "@/components/dashboard/analytics/SalesTrendChart";
import TopProductsChart from "@/components/dashboard/analytics/TopProductsChart";
import OrderStatusDistribution from "@/components/dashboard/analytics/OrderStatusDistribution";
import StockSummaryWidget from "@/components/dashboard/analytics/StockSummaryWidget";

interface ManagerDashboardViewProps {
  metrics?: ManagerDashboardMetrics | null;
  analytics?: ManagerAnalyticsPayload | null;
  isLoadingAnalytics?: boolean;
  onFilterChange?: (newFilter: IDateRangeFilter) => void;
}

export default function ManagerDashboardView({
  metrics,
  analytics,
  isLoadingAnalytics = false,
  onFilterChange,
}: ManagerDashboardViewProps) {
  // 1. Tampilan Akses Dibatasi jika peran pengguna saat ini bukan Manajer (BR-12)
  if (!metrics) {
    return (
      <div className="rounded-xl border border-amber-200/90 bg-amber-50/70 p-6 text-amber-950 shadow-xs">
        <div className="flex items-start gap-4">
          <div className="rounded-lg bg-amber-500/10 p-3 text-amber-700 shrink-0">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-base text-amber-900">
                Akses Dibatasi ke Data Eksekutif Manajer
              </h3>
              <span className="rounded bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-800">
                Kerahasiaan Finansial (BR-12)
              </span>
            </div>
            <p className="text-xs text-amber-800/90 leading-relaxed">
              Sesuai PRD Bab 4, 7 &amp; Aturan Bisnis BR-12, data omzet finansial, margin distributor, kontrol piutang perusahaan, dan valuasi persediaan hanya dapat diakses secara resmi oleh pemilik usaha (<strong>Manajer</strong>). Akun Staf Gudang dan Penjualan dilarang mengakses data rahasia ini.
            </p>
            <p className="text-xs text-amber-700/80 italic pt-1">
              Gunakan pemilih peran di atas untuk kembali ke dashboard sesuai wewenang akun Anda.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 2. Tampilan Error jika query data dari Supabase mengalami kendala
  if (metrics.error) {
    return (
      <div className="rounded-xl border border-rose-300 bg-rose-50 p-6 text-rose-950 shadow-xs">
        <div className="flex items-start gap-3.5">
          <div className="rounded-lg bg-rose-600/10 p-2.5 text-rose-700 shrink-0">
            <AlertCircle className="h-6 w-6" />
          </div>
          <div className="space-y-2.5">
            <div>
              <h3 className="font-bold text-sm text-rose-900">
                Data Eksekutif Manajer Tidak Tersedia
              </h3>
              <p className="text-xs text-rose-800/90 mt-0.5">
                Terjadi kendala saat memuat metrik eksekutif dari server: <span className="font-mono">{metrics.error}</span>
              </p>
            </div>
            <div>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-700 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-rose-800 transition-colors shadow-xs cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Coba Muat Ulang</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const piutangList = metrics.piutangJatuhTempoList;
  const drafList = metrics.antreanDrafList;

  // Nilai KPI Analitik Periode Terpilih
  const kpi = analytics?.kpi;
  const filter = analytics?.filter;

  return (
    <div className="space-y-8">
      {/* ========================================================================= */}
      {/* SECTION 1: HEADER & ANALITIK BISNIS EKSEKUTIF (PERIODIK)                 */}
      {/* ========================================================================= */}
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-slate-200/80 gap-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-blue-600 p-1.5 text-white shadow-xs">
                <BarChart3 className="h-4 w-4" />
              </div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">
                Analitik &amp; Performa Bisnis
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Pantau tren penjualan, arus kas masuk, piutang berjalan, dan efisiensi produk
            </p>
          </div>

          {/* Filter Rentang Tanggal Interaktif */}
          {filter && onFilterChange && (
            <DateRangeFilter
              currentFilter={filter}
              onFilterChange={onFilterChange}
              isLoading={isLoadingAnalytics}
            />
          )}
        </div>

        {/* Notifikasi Error Analitik Spesifik (Jika Ada) */}
        {analytics?.error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50/70 p-3 text-xs text-rose-800 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
            <span>{analytics.error}</span>
          </div>
        )}

        {/* Baris Kartu Ringkasan KPI Analitik Periode */}
        {kpi && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* KPI 1: Penjualan Sah (Omzet Sah) */}
            <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs transition-shadow hover:shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">
                  Omzet Penjualan Sah
                </span>
                <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-600">
                  <DollarSign className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3">
                <div className="font-mono text-2xl font-bold tracking-tight text-slate-900">
                  {formatRupiah(kpi.totalNilaiPenjualanSah)}
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                  <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700 font-semibold">
                    {kpi.jumlahPesananSah} Pesanan
                  </span>
                  <span>(Dikirim &amp; Lunas)</span>
                </div>
              </div>
            </div>

            {/* KPI 2: Rata-Rata Nilai Pesanan (AOV) */}
            <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs transition-shadow hover:shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">
                  Rata-Rata Nilai Pesanan (AOV)
                </span>
                <div className="rounded-lg bg-blue-500/10 p-2 text-blue-600">
                  <Receipt className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3">
                <div className="font-mono text-2xl font-bold tracking-tight text-slate-900">
                  {formatRupiah(kpi.rataRataNilaiPesanan)}
                </div>
                <div className="mt-1 text-xs text-slate-500 font-medium">
                  Rata-rata per pesanan sah
                </div>
              </div>
            </div>

            {/* KPI 3: Kas Masuk Terverifikasi */}
            <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs transition-shadow hover:shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">
                  Kas Masuk Terverifikasi
                </span>
                <div className="rounded-lg bg-indigo-500/10 p-2 text-indigo-600">
                  <Wallet className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3">
                <div className="font-mono text-2xl font-bold tracking-tight text-slate-900">
                  {formatRupiah(kpi.kasMasukTerverifikasi)}
                </div>
                <div className="mt-1 text-xs text-slate-500 font-medium">
                  Dana tunai/transfer dari pesanan lunas
                </div>
              </div>
            </div>

            {/* KPI 4: Total Piutang Berjalan */}
            <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs transition-shadow hover:shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">
                  Piutang Berjalan Periode
                </span>
                <div className="rounded-lg bg-amber-500/10 p-2 text-amber-600">
                  <Clock className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3">
                <div className="font-mono text-2xl font-bold tracking-tight text-amber-700">
                  {formatRupiah(kpi.totalPiutangBerjalan)}
                </div>
                <div className="mt-1 text-xs text-slate-500 font-medium">
                  Pesanan dikonfirmasi &amp; dikirim
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Visualisasi 1: Grafik Tren Penjualan Harian */}
        {analytics?.trend && (
          <SalesTrendChart
            data={analytics.trend}
            isLoading={isLoadingAnalytics}
            title="Tren Omzet Penjualan Harian"
            subtitle="Grafik omzet penjualan sah dari pesanan berstatus dikirim dan lunas (WIB)"
          />
        )}

        {/* Visualisasi 2: Distribusi Status & Produk Terlaris */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {analytics?.orderStatusDistribution && (
            <OrderStatusDistribution
              distribution={analytics.orderStatusDistribution}
              showRevenue={true}
              isLoading={isLoadingAnalytics}
            />
          )}

          {analytics?.topProducts && (
            <TopProductsChart
              products={analytics.topProducts}
              showRevenue={true}
              isLoading={isLoadingAnalytics}
            />
          )}
        </div>

        {/* Visualisasi 3: Widget Radar Stok & Peringatan Inventori */}
        {analytics?.stockSummary && (
          <StockSummaryWidget summary={analytics.stockSummary} />
        )}
      </div>

      {/* ========================================================================= */}
      {/* SECTION 2: OPERASIONAL BERJALAN & KONTROL PIUTANG PERUSAHAAN               */}
      {/* ========================================================================= */}
      <div className="space-y-4 pt-4 border-t border-slate-200/80">
        <div>
          <h2 className="text-base font-bold text-slate-900 tracking-tight">
            Operasional &amp; Kontrol Piutang Jatuh Tempo
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Daftar pesanan menunggak dan antrean pesanan draf yang memerlukan peninjauan langsung
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Section: Piutang Mendekati / Lewat Jatuh Tempo */}
          <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-800 text-sm">
                  Piutang Pelanggan Jatuh Tempo
                </h3>
                <p className="text-xs text-slate-500">
                  Pesanan terkirim yang memerlukan penagihan segera
                </p>
              </div>
              <Link
                href="/laporan"
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
              >
                <span>Lihat Laporan</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            <div className="mt-4 space-y-3">
              {piutangList.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400 flex flex-col items-center gap-1.5">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  <span>Tidak ada piutang yang terlambat atau mendekati jatuh tempo.</span>
                </div>
              ) : (
                piutangList.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/70 p-3 text-xs"
                  >
                    <div>
                      <div className="font-semibold text-slate-900">{item.namaToko}</div>
                      <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                        {item.nomor} • {item.statusTeks}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-bold text-slate-800">
                        {formatRupiah(item.nominal)}
                      </div>
                      <span
                        className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded mt-0.5 ${
                          item.statusWarna === "Merah"
                            ? "bg-rose-100 text-rose-700"
                            : item.statusWarna === "Kuning"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-slate-200 text-slate-700"
                        }`}
                      >
                        {item.statusWarna === "Merah"
                          ? "Terlambat"
                          : item.statusWarna === "Kuning"
                          ? "Mendekati Tempo"
                          : "Lancar"}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Section: Antrean Pesanan Draf Menunggu Konfirmasi */}
          <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-800 text-sm">
                  Antrean Pesanan Menunggu Konfirmasi
                </h3>
                <p className="text-xs text-slate-500">
                  Pesanan draf dari tim penjualan yang menunggu persetujuan
                </p>
              </div>
              <Link
                href="/pesanan-jual"
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
              >
                <span>Buka Pesanan</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            <div className="mt-4 space-y-3">
              {drafList.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400 flex flex-col items-center gap-1.5">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  <span>Seluruh pesanan jual telah dikonfirmasi (tidak ada antrean draf).</span>
                </div>
              ) : (
                drafList.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/70 p-3 text-xs"
                  >
                    <div className="flex items-start gap-2">
                      <FileText className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-semibold text-slate-900 font-mono">
                          {item.nomor}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {item.namaToko} • {item.tanggal}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-bold text-slate-800">
                        {formatRupiah(item.total)}
                      </div>
                      <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 border border-blue-100">
                        Draf
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
