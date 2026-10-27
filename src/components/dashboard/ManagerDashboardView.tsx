"use client";

import React from "react";
import Link from "next/link";
import {
  DollarSign,
  AlertTriangle,
  PackageCheck,
  Clock,
  ArrowRight,
  FileText,
  AlertCircle,
  CheckCircle2,
  ShieldAlert,
  RotateCcw,
  BarChart3,
} from "lucide-react";
import { formatRupiah } from "@/types/pelanggan";
import { ManagerDashboardMetrics } from "@/lib/dashboard/getManagerMetrics";

interface ManagerDashboardViewProps {
  metrics?: ManagerDashboardMetrics | null;
}

export default function ManagerDashboardView({ metrics }: ManagerDashboardViewProps) {
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

  // 3. Render Data Aktual jika metrik tersedia
  const omzet = metrics.omzetBulanIni;
  const piutang = metrics.totalPiutangBerjalan;
  const valuasi = metrics.valuasiPersediaan;
  const drafCount = metrics.pesananMenungguKonfirmasi;
  const piutangList = metrics.piutangJatuhTempoList;
  const drafList = metrics.antreanDrafList;

  return (
    <div className="space-y-6">
      {/* KPI Cards Row (4 Kartu Metrik Utama) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Metric 1: Omzet Penjualan (Bulan Ini) */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs transition-shadow hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Omzet Penjualan
            </span>
            <div className="rounded-lg bg-blue-50 p-2 text-blue-600">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-slate-900">
              {formatRupiah(omzet)}
            </span>
            <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-700">
              Bulan Berjalan
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500 flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-500"></span>
            Pesanan dikirim &amp; lunas (PRD Bab 9)
          </p>
        </div>

        {/* Metric 2: Total Piutang Berjalan */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs transition-shadow hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Piutang Berjalan
            </span>
            <div className="rounded-lg bg-amber-50 p-2 text-amber-600">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-amber-700 font-mono">
              {formatRupiah(piutang)}
            </span>
            <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
              Piutang Toko
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500 flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500"></span>
            Status dikonfirmasi &amp; dikirim (BR-05)
          </p>
        </div>

        {/* Metric 3: Nilai Valuasi Persediaan */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs transition-shadow hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Valuasi Persediaan
            </span>
            <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600">
              <PackageCheck className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-slate-900 font-mono">
              {formatRupiah(valuasi)}
            </span>
            <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">
              HPP Fisik
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500 flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
            Akumulasi HPP barang gudang (BR-12)
          </p>
        </div>

        {/* Metric 4: Pesanan Jual Menunggu Konfirmasi */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs transition-shadow hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Menunggu Konfirmasi
            </span>
            <div className={`rounded-lg p-2 ${drafCount > 0 ? "bg-rose-50 text-rose-600" : "bg-slate-100 text-slate-600"}`}>
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-slate-900">
              {drafCount} Pesanan
            </span>
            <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
              drafCount > 0 ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-700"
            }`}>
              {drafCount > 0 ? "Perlu Tindakan" : "Terkendali"}
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500 flex items-center gap-1.5">
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${drafCount > 0 ? "bg-rose-500" : "bg-emerald-500"}`}></span>
            Pesanan draf menunggu verifikasi manajer
          </p>
        </div>
      </div>

      {/* Banner Analisis Tren Penjualan Mingguan & Laporan Finansial */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-blue-100 bg-linear-to-r from-blue-50/70 via-slate-50 to-white p-4 sm:p-5 shadow-xs">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="rounded-lg bg-blue-600/10 p-2.5 text-blue-700 shrink-0">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-900">
              Grafik &amp; Analisis Tren Penjualan 8 Pekan Terakhir
            </h4>
            <p className="text-xs text-slate-600 mt-0.5">
              Visualisasi tren mingguan, rincian pergerakan omzet, margin kotor, dan rasio piutang terintegrasi di Laporan Eksekutif.
            </p>
          </div>
        </div>
        <Link
          href="/laporan"
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition-colors shadow-xs shrink-0"
        >
          <span>Buka Laporan &amp; Grafik</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Detail Sections for Manager */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Section: Piutang Jatuh Tempo */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-slate-800 text-sm">
                Pantauan Piutang Jatuh Tempo
              </h3>
              <p className="text-xs text-slate-500">
                Daftar tagihan toko yang mendekati batas tempo pembayaran (BR-05)
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
            {piutangList.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400 flex flex-col items-center gap-1.5">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                <span>Tidak ada tagihan piutang toko yang mendekati jatuh tempo saat ini.</span>
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
                Pesanan draf dari tim penjualan yang menunggu peninjauan manajer
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
  );
}
