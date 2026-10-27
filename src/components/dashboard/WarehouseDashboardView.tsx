"use client";

import React from "react";
import Link from "next/link";
import {
  Boxes,
  Truck,
  PackagePlus,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  PackageCheck,
  ShieldAlert,
  RotateCcw,
} from "lucide-react";
import { WarehouseDashboardMetrics } from "@/lib/dashboard/getWarehouseMetrics";

interface WarehouseDashboardViewProps {
  metrics?: WarehouseDashboardMetrics | null;
}

export default function WarehouseDashboardView({ metrics }: WarehouseDashboardViewProps) {
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

  // 3. Render Data Aktual jika metrik tersedia
  const stokMenipisCount = metrics.jumlahStokMenipis;
  const siapKirimCount = metrics.jumlahPesananSiapKirim;
  const poMenungguCount = metrics.jumlahPembelianMenunggu;
  const totalSku = metrics.totalSkuAktif;
  const stokMenipisList = metrics.stokMenipisList;
  const poList = metrics.pembelianMenungguList;

  return (
    <div className="space-y-6">
      {/* KPI Cards Row (4 Kartu Metrik Operasional Gudang) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Metric 1: Peringatan Stok Menipis */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs transition-shadow hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Peringatan Stok Menipis
            </span>
            <div className={`rounded-lg p-2 ${stokMenipisCount > 0 ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600"}`}>
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className={`text-2xl font-bold tracking-tight ${stokMenipisCount > 0 ? "text-rose-600" : "text-slate-900"}`}>
              {stokMenipisCount} SKU
            </span>
            <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
              stokMenipisCount > 0 ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"
            }`}>
              {stokMenipisCount > 0 ? "≤ Reorder Point" : "Stok Aman"}
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500 flex items-center gap-1">
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${stokMenipisCount > 0 ? "bg-rose-500" : "bg-emerald-500"}`}></span>
            Item kebutuhan pokok mendekati batas minimum
          </p>
        </div>

        {/* Metric 2: Penerimaan PO Menunggu Barang */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs transition-shadow hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              PO Menunggu Barang
            </span>
            <div className="rounded-lg bg-blue-50 p-2 text-blue-600">
              <Truck className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-slate-900">
              {poMenungguCount} PO
            </span>
            <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-700">
              Supplier
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500 flex items-center gap-1">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-500"></span>
            Pembelian disetujui menunggu fisik barang
          </p>
        </div>

        {/* Metric 3: Antrean Packing Toko (Pesanan Siap Kirim) */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs transition-shadow hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Antrean Packing Toko
            </span>
            <div className={`rounded-lg p-2 ${siapKirimCount > 0 ? "bg-amber-50 text-amber-600" : "bg-slate-100 text-slate-600"}`}>
              <Boxes className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-slate-900">
              {siapKirimCount} Order
            </span>
            <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
              siapKirimCount > 0 ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-700"
            }`}>
              Siap Kirim
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500 flex items-center gap-1">
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${siapKirimCount > 0 ? "bg-amber-500" : "bg-emerald-500"}`}></span>
            Pesanan terkonfirmasi siap disiapkan armada
          </p>
        </div>

        {/* Metric 4: Total SKU Terdaftar */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs transition-shadow hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Total SKU Terdaftar
            </span>
            <div className="rounded-lg bg-slate-100 p-2 text-slate-700">
              <PackagePlus className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-slate-900">
              {totalSku} SKU
            </span>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-700">
              Katalog Aktif
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500 flex items-center gap-1">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-slate-500"></span>
            Katalog barang kelontong &amp; sembako aktif
          </p>
        </div>
      </div>

      {/* Detail Sections for Warehouse */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Section: Reorder Alert Table */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-slate-800 text-sm">
                Barang Di Bawah Minimum Reorder
              </h3>
              <p className="text-xs text-slate-500">
                Peringatan dini pencegahan kekosongan stok sembako (BR-01)
              </p>
            </div>
            <Link
              href="/barang-dan-stok"
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
            >
              <span>Katalog Stok</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="mt-4 space-y-3">
            {stokMenipisList.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400 flex flex-col items-center gap-1.5">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                <span>Seluruh persediaan barang saat ini berada di atas batas minimum.</span>
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
                      {item.kode} • Sisa: <span className="font-bold text-rose-600">{item.stok}</span> {item.satuan} (Min: {item.stokMinimum} {item.satuan})
                    </div>
                  </div>
                  <div className="text-right">
                    <span
                      className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded ${
                        item.status === "Kritis"
                          ? "bg-rose-100 text-rose-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 text-center">
            <p className="text-xs text-slate-400 italic">
              * Perhitungan batas minimum mengacu pada kolom stok_minimum pada tabel master barang.
            </p>
          </div>
        </div>

        {/* Section: Incoming PO Supplier */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-slate-800 text-sm">
                Pembelian Menunggu Kedatangan Fisik
              </h3>
              <p className="text-xs text-slate-500">
                PO pemasok disetujui untuk dicatat penerimaannya di gudang
              </p>
            </div>
            <span className="rounded-md bg-blue-50 border border-blue-200 px-2 py-1 text-[11px] font-semibold text-blue-700">
              Antrean Logistik
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {poList.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400 flex flex-col items-center gap-1.5">
                <PackageCheck className="h-5 w-5 text-emerald-500" />
                <span>Tidak ada pesanan pembelian yang menunggu penerimaan fisik barang saat ini.</span>
              </div>
            ) : (
              poList.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/70 p-3 text-xs"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-blue-700">{item.nomor}</span>
                      <span className="text-slate-400">•</span>
                      <span className="font-medium text-slate-800">{item.namaPemasok}</span>
                    </div>
                    <div className="text-[11px] text-slate-600 mt-1">
                      {item.namaBarang} ({item.jumlahDipesan} {item.satuan})
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="rounded bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 text-[10px] font-medium">
                      Disetujui: {item.tanggalPersetujuan}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 text-center">
            <p className="text-xs text-slate-400 italic">
              * Staf gudang mencatat penerimaan barang fisik pada modul pembelian sesuai PRD Bab 5.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
