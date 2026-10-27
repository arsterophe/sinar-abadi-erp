"use client";

import React from "react";
import Link from "next/link";
import {
  ShoppingCart,
  Users,
  CreditCard,
  FileText,
  Store,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  PlusCircle,
  ShieldAlert,
  RotateCcw,
} from "lucide-react";
import { formatRupiah } from "@/types/pelanggan";
import { SalesDashboardMetrics } from "@/lib/dashboard/getSalesMetrics";

interface SalesDashboardViewProps {
  metrics?: SalesDashboardMetrics | null;
}

export default function SalesDashboardView({ metrics }: SalesDashboardViewProps) {
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

  // 3. Render Data Aktual jika metrik tersedia
  const pesananHariIni = metrics.pesananHariIni;
  const pelangganAktif = metrics.totalPelangganAktif;
  const pelangganLewatTempo = metrics.pelangganLewatJatuhTempo;
  const drafCount = metrics.pesananDrafSaya;
  const antreanPesanan = metrics.antreanPesananList;
  const statusPelanggan = metrics.statusPelangganList;

  return (
    <div className="space-y-6">
      {/* KPI Cards Row (4 Kartu Metrik Penjualan) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Metric 1: Pesanan Masuk Hari Ini */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs transition-shadow hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Pesanan Hari Ini
            </span>
            <div className="rounded-lg bg-blue-50 p-2 text-blue-600">
              <ShoppingCart className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-slate-900">
              {pesananHariIni} SO
            </span>
            <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-700">
              Hari Ini (WIB)
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500 flex items-center gap-1">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-500"></span>
            Total pesanan masuk dari toko mitra hari ini
          </p>
        </div>

        {/* Metric 2: Pelanggan Toko Aktif */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs transition-shadow hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Pelanggan Toko Aktif
            </span>
            <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-slate-900">
              {pelangganAktif} Toko
            </span>
            <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">
              Langganan
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500 flex items-center gap-1">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
            Toko kelontong terdaftar &amp; repeat order
          </p>
        </div>

        {/* Metric 3: Peringatan Tagihan Lewat Tempo */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs transition-shadow hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Toko Lewat Jatuh Tempo
            </span>
            <div className={`rounded-lg p-2 ${pelangganLewatTempo > 0 ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600"}`}>
              <CreditCard className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className={`text-2xl font-bold tracking-tight ${pelangganLewatTempo > 0 ? "text-rose-600" : "text-slate-900"}`}>
              {pelangganLewatTempo} Mitra
            </span>
            <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
              pelangganLewatTempo > 0 ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"
            }`}>
              {pelangganLewatTempo > 0 ? "Blokir Order" : "Lancar"}
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500 flex items-center gap-1">
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${pelangganLewatTempo > 0 ? "bg-rose-500" : "bg-emerald-500"}`}></span>
            Toko yang menunggak dan diblokir sistem (BR-05)
          </p>
        </div>

        {/* Metric 4: Pesanan Menunggu Konfirmasi / Draf */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs transition-shadow hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Pesanan Draf Aktif
            </span>
            <div className={`rounded-lg p-2 ${drafCount > 0 ? "bg-indigo-50 text-indigo-600" : "bg-slate-100 text-slate-600"}`}>
              <FileText className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-slate-900">
              {drafCount} Draf
            </span>
            <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
              drafCount > 0 ? "bg-indigo-50 text-indigo-700" : "bg-slate-100 text-slate-700"
            }`}>
              {drafCount > 0 ? "Siap Konfirmasi" : "Selesai"}
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500 flex items-center gap-1">
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${drafCount > 0 ? "bg-indigo-500" : "bg-emerald-500"}`}></span>
            Pesanan draf menunggu kelengkapan / konfirmasi
          </p>
        </div>
      </div>

      {/* Detail Sections for Sales */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Section: Antrean Pesanan Jual Terkini */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-slate-800 text-sm">
                Antrean Pesanan Jual Toko
              </h3>
              <p className="text-xs text-slate-500">
                Daftar sales order terkini dari tim penjualan lapangan
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
            {antreanPesanan.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400 flex flex-col items-center gap-1.5">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                <span>Belum ada transaksi pesanan penjualan yang tercatat.</span>
              </div>
            ) : (
              antreanPesanan.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/70 p-3 text-xs"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-blue-700">{item.nomor}</span>
                      <span className="text-slate-400">•</span>
                      <span className="font-medium text-slate-800">{item.namaToko}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono mt-1">
                      {formatRupiah(item.total)} • {item.tanggal}
                    </div>
                  </div>
                  <div className="text-right">
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-semibold border ${
                        item.status === "draf"
                          ? "bg-slate-100 text-slate-700 border-slate-200"
                          : item.status === "dikonfirmasi"
                          ? "bg-blue-50 text-blue-700 border-blue-200"
                          : item.status === "dikirim"
                          ? "bg-amber-50 text-amber-700 border-amber-200"
                          : item.status === "lunas"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-rose-50 text-rose-700 border-rose-200"
                      }`}
                    >
                      {item.status.toUpperCase()}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-400 italic">
              * Pesanan dapat dikonfirmasi langsung oleh staf penjualan jika plafon aman.
            </span>
            <Link
              href="/pesanan-jual"
              className="inline-flex items-center gap-1 text-blue-600 font-semibold hover:text-blue-700"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              <span>Buat Pesanan</span>
            </Link>
          </div>
        </div>

        {/* Section: Monitoring Pelanggan & Plafon Kredit */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-slate-800 text-sm">
                Status Limit &amp; Tagihan Pelanggan
              </h3>
              <p className="text-xs text-slate-500">
                Pencegahan gagal bayar melalui kontrol plafon &amp; jatuh tempo (BR-05)
              </p>
            </div>
            <Link
              href="/pelanggan"
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
            >
              <span>Katalog Toko</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="mt-4 space-y-3">
            {statusPelanggan.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400 flex flex-col items-center gap-1.5">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                <span>Semua toko pelanggan dalam kondisi limit dan pembayaran lancar.</span>
              </div>
            ) : (
              statusPelanggan.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/70 p-3 text-xs"
                >
                  <div className="flex items-start gap-2.5">
                    <div className="rounded-lg bg-slate-200/70 p-2 text-slate-600 mt-0.5 shrink-0">
                      <Store className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <div className="font-semibold text-slate-900">{item.namaToko}</div>
                      <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                        {item.kode} • Piutang: {formatRupiah(item.piutangBerjalan)}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span
                      className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded border ${
                        item.statusKredit === "Lewat Tempo"
                          ? "bg-rose-100 text-rose-700 border-rose-200"
                          : item.statusKredit === "Mendekati Limit"
                          ? "bg-amber-100 text-amber-700 border-amber-200"
                          : "bg-emerald-50 text-emerald-700 border-emerald-200"
                      }`}
                    >
                      {item.statusKredit}
                    </span>
                    <div className="text-[10px] text-slate-400 font-mono mt-1">
                      Limit: {item.batasKredit > 0 ? formatRupiah(item.batasKredit) : "Non-Kredit"}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 text-center">
            <p className="text-xs text-slate-400 italic">
              * Toko dengan status &quot;Lewat Tempo&quot; otomatis ditolak konfirmasi pesanannya hingga pelunasan dicatat.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
