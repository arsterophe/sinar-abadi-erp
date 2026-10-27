"use client";

import React from "react";
import Link from "next/link";
import {
  Boxes,
  Truck,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  PackageCheck,
  ShieldAlert,
  RotateCcw,
  BarChart3,
  Package,
} from "lucide-react";
import { WarehouseDashboardMetrics } from "@/lib/dashboard/getWarehouseMetrics";
import { WarehouseAnalyticsPayload, DateRangeFilter as IDateRangeFilter } from "@/types/analytics";

import DateRangeFilter from "@/components/dashboard/analytics/DateRangeFilter";
import TopProductsChart from "@/components/dashboard/analytics/TopProductsChart";
import OrderStatusDistribution from "@/components/dashboard/analytics/OrderStatusDistribution";
import StockSummaryWidget from "@/components/dashboard/analytics/StockSummaryWidget";

interface WarehouseDashboardViewProps {
  metrics?: WarehouseDashboardMetrics | null;
  analytics?: WarehouseAnalyticsPayload | null;
  isLoadingAnalytics?: boolean;
  onFilterChange?: (newFilter: IDateRangeFilter) => void;
}

export default function WarehouseDashboardView({
  metrics,
  analytics,
  isLoadingAnalytics = false,
  onFilterChange,
}: WarehouseDashboardViewProps) {
  // 1. Tampilan Akses Dibatasi jika peran pengguna saat ini tidak berwenang mengakses data gudang
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
                Akses Dibatasi ke Data Operasional Gudang
              </h3>
              <span className="rounded bg-amber-200/80 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                Otorisasi Server-Side (BR-12)
              </span>
            </div>
            <p className="text-xs text-amber-800/90 leading-relaxed">
              Sesuai PRD Bab 4 &amp; 7 serta hak akses database, metrik stok fisik, antrean packing barang siap kirim, dan penerimaan PO supplier hanya dapat diakses secara resmi oleh akun dengan peran <strong>Staf Gudang</strong> atau <strong>Manajer</strong>. Sesi aktif Anda saat ini tidak memiliki izin untuk membaca data operasional gudang.
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
                Data Operasional Gudang Tidak Tersedia
              </h3>
              <p className="text-xs text-rose-800/90 mt-0.5">
                Terjadi kendala saat memuat metrik gudang dari server: <span className="font-mono">{metrics.error}</span>
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

  const stokMenipisList = metrics.stokMenipisList;
  const poList = metrics.pembelianMenungguList;

  // Analitik Fisik Gudang Periode
  const kpi = analytics?.kpi;
  const filter = analytics?.filter;

  return (
    <div className="space-y-8">
      {/* ========================================================================= */}
      {/* SECTION 1: ANALITIK PERGERAKAN FISIK & VOLUME GUDANG (NON-MONETER BR-12) */}
      {/* ========================================================================= */}
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-slate-200/80 gap-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-blue-600 p-1.5 text-white shadow-xs">
                <BarChart3 className="h-4 w-4" />
              </div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">
                Analitik Fisik Gudang &amp; Arus Barang Keluar
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Pantau volume fisik barang keluar, antrean packing barang, dan status pengiriman (Non-Finansial)
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

        {/* Baris KPI Fisik Murni (Tanpa Rupiah) */}
        {kpi && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* KPI 1: Pesanan Siap Kirim (Antrean Packing) */}
            <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs transition-shadow hover:shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">
                  Pesanan Siap Kirim
                </span>
                <div className="rounded-lg bg-blue-500/10 p-2 text-blue-600">
                  <PackageCheck className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3">
                <div className="font-mono text-2xl font-bold tracking-tight text-slate-900">
                  {kpi.jumlahPesananSiapKirim} Pesanan
                </div>
                <div className="mt-1 text-xs text-slate-500 font-medium">
                  Status dikonfirmasi, menunggu packing
                </div>
              </div>
            </div>

            {/* KPI 2: Pesanan Terkirim */}
            <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs transition-shadow hover:shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">
                  Pesanan Telah Terkirim
                </span>
                <div className="rounded-lg bg-indigo-500/10 p-2 text-indigo-600">
                  <Truck className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3">
                <div className="font-mono text-2xl font-bold tracking-tight text-slate-900">
                  {kpi.jumlahPesananTerkirim} Pesanan
                </div>
                <div className="mt-1 text-xs text-slate-500 font-medium">
                  Sudah keluar dari gudang
                </div>
              </div>
            </div>

            {/* KPI 3: Total Kuantitas Fisik Barang Keluar */}
            <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs transition-shadow hover:shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">
                  Total Barang Keluar Periode
                </span>
                <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-600">
                  <Package className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3">
                <div className="font-mono text-2xl font-bold tracking-tight text-emerald-700">
                  {kpi.totalKuantitasBarangKeluar} Unit/Dus
                </div>
                <div className="mt-1 text-xs text-slate-500 font-medium">
                  Akumulasi kuantitas fisik terjual
                </div>
              </div>
            </div>

            {/* KPI 4: Total SKU Aktif */}
            <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs transition-shadow hover:shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">
                  Total SKU Inventori
                </span>
                <div className="rounded-lg bg-amber-500/10 p-2 text-amber-600">
                  <Boxes className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3">
                <div className="font-mono text-2xl font-bold tracking-tight text-slate-900">
                  {metrics.totalSkuAktif} Barang
                </div>
                <div className="mt-1 text-xs text-slate-500 font-medium">
                  Barang aktif dalam katalog
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Visualisasi: Distribusi Status & Produk Terbanyak Keluar (Tanpa Rupiah) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {analytics?.orderStatusDistribution && (
            <OrderStatusDistribution
              distribution={analytics.orderStatusDistribution}
              showRevenue={false}
              isLoading={isLoadingAnalytics}
              title="Distribusi Siklus Pesanan Fisik"
              subtitle="Sebaran pesanan gudang dari draf hingga barang terkirim (Non-Moneter)"
            />
          )}

          {analytics?.topProducts && (
            <TopProductsChart
              products={analytics.topProducts}
              showRevenue={false}
              isLoading={isLoadingAnalytics}
              title="Produk Terbanyak Keluar"
              subtitle="Peringkat produk berdasarkan akumulasi kuantitas fisik keluar gudang"
            />
          )}
        </div>

        {/* Radar Stok Widget (Fokus Operasional Gudang) */}
        {analytics?.stockSummary && (
          <StockSummaryWidget summary={analytics.stockSummary} />
        )}
      </div>

      {/* ========================================================================= */}
      {/* SECTION 2: OPERASIONAL GUDANG HARIAN & ANTREAN BARANG MASUK/KELUAR        */}
      {/* ========================================================================= */}
      <div className="space-y-4 pt-4 border-t border-slate-200/80">
        <div>
          <h2 className="text-base font-bold text-slate-900 tracking-tight">
            Operasional Gudang &amp; Antrean Barang
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Daftar stok menipis yang perlu restock dan pembelian supplier yang menunggu penerimaan
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Section: Peringatan Stok Menipis */}
          <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-800 text-sm">
                  Daftar Peringatan Stok Menipis (BR-01)
                </h3>
                <p className="text-xs text-slate-500">
                  Barang dengan sisa stok di bawah batas stok minimum
                </p>
              </div>
              <Link
                href="/barang-dan-stok"
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
              >
                <span>Kelola Stok</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            <div className="mt-4 space-y-3">
              {stokMenipisList.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400 flex flex-col items-center gap-1.5">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  <span>Seluruh barang memiliki stok di atas batas minimum.</span>
                </div>
              ) : (
                stokMenipisList.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/70 p-3 text-xs"
                  >
                    <div>
                      <div className="font-semibold text-slate-900">{item.nama}</div>
                      <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                        [{item.kode}] • Stok Minimum: {item.stokMinimum} {item.satuan}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-bold text-rose-600">
                        Sisa: {item.stok} {item.satuan}
                      </div>
                      <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded bg-rose-100 text-rose-700 mt-0.5">
                        {item.stok === 0 ? "Habis (0)" : "Menipis"}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Section: Pembelian Menunggu Penerimaan Barang */}
          <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-800 text-sm">
                  PO Supplier Menunggu Penerimaan (BR-10)
                </h3>
                <p className="text-xs text-slate-500">
                  Pembelian telah disetujui manajer, siap dicatat penerimaannya
                </p>
              </div>
              <Link
                href="/pembelian"
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
              >
                <span>Buka Pembelian</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            <div className="mt-4 space-y-3">
              {poList.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400 flex flex-col items-center gap-1.5">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  <span>Tidak ada pembelian yang sedang menunggu penerimaan barang.</span>
                </div>
              ) : (
                poList.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/70 p-3 text-xs"
                  >
                    <div>
                      <div className="font-semibold text-slate-900 font-mono">
                        {item.nomor}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {item.namaPemasok} • {item.namaBarang}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-bold text-slate-800">
                        {item.jumlahDipesan} {item.satuan}
                      </div>
                      <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 border border-emerald-100">
                        Disetujui
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
