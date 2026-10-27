"use client";

import React from "react";
import Link from "next/link";
import {
  ShoppingCart,
  Users,
  FileText,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  PlusCircle,
  ShieldAlert,
  RotateCcw,
  BarChart3,
  Receipt,
} from "lucide-react";
import { formatRupiah } from "@/types/pelanggan";
import { SalesDashboardMetrics } from "@/lib/dashboard/getSalesMetrics";
import { SalesAnalyticsPayload, DateRangeFilter as IDateRangeFilter } from "@/types/analytics";

import DateRangeFilter from "@/components/dashboard/analytics/DateRangeFilter";
import SalesTrendChart from "@/components/dashboard/analytics/SalesTrendChart";
import TopProductsChart from "@/components/dashboard/analytics/TopProductsChart";
import OrderStatusDistribution from "@/components/dashboard/analytics/OrderStatusDistribution";
import StockSummaryWidget from "@/components/dashboard/analytics/StockSummaryWidget";

interface SalesDashboardViewProps {
  metrics?: SalesDashboardMetrics | null;
  analytics?: SalesAnalyticsPayload | null;
  isLoadingAnalytics?: boolean;
  onFilterChange?: (newFilter: IDateRangeFilter) => void;
}

export default function SalesDashboardView({
  metrics,
  analytics,
  isLoadingAnalytics = false,
  onFilterChange,
}: SalesDashboardViewProps) {
  // 1. Tampilan Akses Dibatasi jika peran pengguna saat ini tidak berwenang mengakses data penjualan
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
                Akses Dibatasi ke Data Penjualan &amp; Plafon Toko
              </h3>
              <span className="rounded bg-amber-200/80 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                Otorisasi Server-Side (BR-05)
              </span>
            </div>
            <p className="text-xs text-amber-800/90 leading-relaxed">
              Sesuai PRD Bab 4 &amp; 7 serta hak akses database, metrik transaksi pesanan, pemantauan batas kredit toko, dan status tagihan hanya dapat diakses secara resmi oleh akun dengan peran <strong>Staf Penjualan</strong> atau <strong>Manajer</strong>. Sesi aktif Anda saat ini tidak memiliki izin untuk membaca data penjualan.
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
                Data Penjualan Tidak Tersedia
              </h3>
              <p className="text-xs text-rose-800/90 mt-0.5">
                Terjadi kendala saat memuat metrik penjualan dari server: <span className="font-mono">{metrics.error}</span>
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

  const antreanPesanan = metrics.antreanPesananList;
  const statusPelanggan = metrics.statusPelangganList;

  // Analitik Penjualan Periode
  const kpi = analytics?.kpi;
  const filter = analytics?.filter;

  return (
    <div className="space-y-8">
      {/* ========================================================================= */}
      {/* SECTION 1: ANALITIK PENJUALAN PERIODIK                                    */}
      {/* ========================================================================= */}
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-slate-200/80 gap-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-blue-600 p-1.5 text-white shadow-xs">
                <BarChart3 className="h-4 w-4" />
              </div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">
                Analitik Penjualan &amp; Volume Pesanan
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Pantau performa penjualan, pesanan sah, dan produk dengan volume tertinggi
            </p>
          </div>

          {filter && onFilterChange && (
            <DateRangeFilter
              currentFilter={filter}
              onFilterChange={onFilterChange}
              isLoading={isLoadingAnalytics}
            />
          )}
        </div>

        {analytics?.error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50/70 p-3 text-xs text-rose-800 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
            <span>{analytics.error}</span>
          </div>
        )}

        {/* Baris KPI Penjualan */}
        {kpi && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* KPI 1: Total Omzet Penjualan Sah */}
            <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs transition-shadow hover:shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">
                  Omzet Penjualan Sah
                </span>
                <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-600">
                  <ShoppingCart className="h-5 w-5" />
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
                  <span>(Terkirim &amp; Lunas)</span>
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
                  Rata-rata per transaksi sah
                </div>
              </div>
            </div>

            {/* KPI 3: Pipeline Pesanan Draf */}
            <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs transition-shadow hover:shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">
                  Pipeline Pesanan Draf
                </span>
                <div className="rounded-lg bg-amber-500/10 p-2 text-amber-600">
                  <FileText className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3">
                <div className="font-mono text-2xl font-bold tracking-tight text-amber-700">
                  {formatRupiah(kpi.totalNilaiDraf)}
                </div>
                <div className="mt-1 text-xs text-slate-500 font-medium">
                  {kpi.jumlahPesananDraf} pesanan sedang disusun
                </div>
              </div>
            </div>

            {/* KPI 4: Pelanggan Aktif */}
            <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs transition-shadow hover:shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">
                  Total Pelanggan Aktif
                </span>
                <div className="rounded-lg bg-indigo-500/10 p-2 text-indigo-600">
                  <Users className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3">
                <div className="font-mono text-2xl font-bold tracking-tight text-slate-900">
                  {metrics.totalPelangganAktif} Toko
                </div>
                <div className="mt-1 text-xs text-slate-500 font-medium">
                  Kelontong &amp; minimarket binaan
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Grafik Tren Penjualan Harian */}
        {analytics?.trend && (
          <SalesTrendChart
            data={analytics.trend}
            isLoading={isLoadingAnalytics}
            title="Tren Omzet Penjualan Harian"
            subtitle="Grafik nilai pesanan sah per hari dalam zona waktu WIB"
          />
        )}

        {/* Visualisasi Distribusi Status & Produk Terlaris */}
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

        {/* Radar Stok Widget (Membantu Sales Cek Ketersediaan Barang) */}
        {analytics?.stockSummary && (
          <StockSummaryWidget summary={analytics.stockSummary} />
        )}
      </div>

      {/* ========================================================================= */}
      {/* SECTION 2: OPERASIONAL TIM PENJUALAN & STATUS KREDIT TOKO                */}
      {/* ========================================================================= */}
      <div className="space-y-4 pt-4 border-t border-slate-200/80">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 tracking-tight">
              Operasional Penjualan &amp; Plafon Kredit Pelanggan
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Antrean pesanan aktif dan pemantauan toko mendekati batas kredit (BR-05)
            </p>
          </div>
          <Link
            href="/pesanan-jual"
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors shadow-xs"
          >
            <PlusCircle className="h-3.5 w-3.5" />
            <span>Buat Pesanan Jual</span>
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Section: Status Batas Kredit Pelanggan */}
          <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-800 text-sm">
                  Plafon &amp; Tagihan Pelanggan (BR-05)
                </h3>
                <p className="text-xs text-slate-500">
                  Pelanggan dengan piutang mendekati batas kredit atau lewat tempo
                </p>
              </div>
              <Link
                href="/pelanggan"
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
              >
                <span>Data Pelanggan</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            <div className="mt-4 space-y-3">
              {statusPelanggan.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400 flex flex-col items-center gap-1.5">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  <span>Semua toko memiliki status kredit lancar di bawah plafon.</span>
                </div>
              ) : (
                statusPelanggan.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/70 p-3 text-xs"
                  >
                    <div>
                      <div className="font-semibold text-slate-900">{item.namaToko}</div>
                      <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                        Piutang: {formatRupiah(item.piutangBerjalan)} / Plafon: {formatRupiah(item.batasKredit)}
                      </div>
                    </div>
                    <div className="text-right">
                      <span
                        className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded ${
                          item.statusKredit === "Lewat Tempo"
                            ? "bg-rose-100 text-rose-700"
                            : item.statusKredit === "Mendekati Limit"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        {item.statusKredit}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Section: Antrean Pesanan Aktif Saya */}
          <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-800 text-sm">
                  Antrean Pesanan Aktif
                </h3>
                <p className="text-xs text-slate-500">
                  Pesanan draf dan pesanan terkonfirmasi dalam proses
                </p>
              </div>
              <Link
                href="/pesanan-jual"
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
              >
                <span>Semua Pesanan</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            <div className="mt-4 space-y-3">
              {antreanPesanan.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400 flex flex-col items-center gap-1.5">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  <span>Tidak ada pesanan draf aktif saat ini.</span>
                </div>
              ) : (
                antreanPesanan.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/70 p-3 text-xs"
                  >
                    <div>
                      <div className="font-semibold text-slate-900 font-mono">
                        {item.nomor}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {item.namaToko} • {item.tanggal}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-bold text-slate-800">
                        {formatRupiah(item.total)}
                      </div>
                      <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 border border-blue-100">
                        {item.status}
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
