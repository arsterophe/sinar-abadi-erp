"use client";

import React, { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Radar,
  Search,
  AlertTriangle,
  Flame,
  Clock,
  CheckCircle2,
  PauseCircle,
  XCircle,
  RefreshCw,
  Package,
  ArrowUpDown,
  Info,
  Truck,
  RotateCcw,
  AlertCircle,
  ShoppingCart,
  ExternalLink,
  X,
} from "lucide-react";
import Link from "next/link";
import AppLayout from "@/components/layout/AppLayout";
import { UserProfile, mapDbRoleToDashboardRole } from "@/types/auth";
import { logoutUser } from "@/lib/supabase/auth";
import {
  RadarStokDataPayload,
  StatusRadarStok,
  RadarStokItem,
  SortOptionRadarStok,
} from "@/types/radar_stok";
import { sortRadarStokItems } from "@/lib/radar-stok/getRadarStokData";
import { PemasokItem, canCreatePembelian } from "@/types/pembelian";
import BuatPembelianModal from "@/components/pembelian/BuatPembelianModal";
import SmartStockAlertPanel from "@/components/radar-stok/SmartStockAlertPanel";

interface RadarStokClientViewProps {
  serverProfile: UserProfile;
  initialData: RadarStokDataPayload;
  pemasokList?: PemasokItem[];
}

export default function RadarStokClientView({
  serverProfile,
  initialData,
  pemasokList = [],
}: RadarStokClientViewProps) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string>("semua");
  const [sortBy, setSortBy] = useState<SortOptionRadarStok>("urgensi");
  const [isRefreshing, setIsRefreshing] = useState(false);

  // State untuk Quick PO dari Radar Stok
  const [selectedItemForPO, setSelectedItemForPO] = useState<RadarStokItem | null>(null);
  const [isPOModalOpen, setIsPOModalOpen] = useState(false);
  const [toastSuccess, setToastSuccess] = useState<{ message: string; poNomor: string } | null>(null);

  const canCreatePO = canCreatePembelian(serverProfile.peran);

  const dashboardRole = mapDbRoleToDashboardRole(serverProfile.peran);

  // Siapkan opsi barang untuk modal pengajuan PO
  const barangListForModal = useMemo(() => {
    return (initialData.items || [])
      .filter((b) => b.aktif)
      .map((b) => ({
        id: b.barangId,
        kode: b.kodeBarang,
        nama: b.namaBarang,
        satuan: b.satuan,
        stok: b.stokFisik,
      }));
  }, [initialData.items]);

  const handleOpenQuickPO = (item: RadarStokItem) => {
    setSelectedItemForPO(item);
    setIsPOModalOpen(true);
  };

  const handleSuccessQuickPO = (data: { id: string; nomor: string }) => {
    setToastSuccess({
      message: `Pengajuan pembelian ${data.nomor} berhasil dibuat dengan status 'diajukan'. Stok fisik tidak bertambah sampai barang diterima di gudang (BR-10).`,
      poNomor: data.nomor,
    });
    handleRefresh();
  };

  const handleLogout = async () => {
    await logoutUser();
    router.push("/login");
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    router.refresh();
    setTimeout(() => setIsRefreshing(false), 600);
  };

  // Format angka ribuan Indonesia
  const formatAngka = (val: number | null | undefined): string => {
    if (val === null || val === undefined || isNaN(Number(val))) return "0";
    return Number(val).toLocaleString("id-ID");
  };

  // Format desimal dengan koma
  const formatDesimal = (val: number | null | undefined): string => {
    if (val === null || val === undefined || isNaN(Number(val))) return "0";
    return Number(val).toLocaleString("id-ID", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
  };

  // Format tanggal WIB
  const formatWIB = (isoString?: string | null): string => {
    if (!isoString) return "-";
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Jakarta",
      }) + " WIB";
    } catch {
      return "-";
    }
  };

  // Filter & Sorting barang
  const filteredAndSortedItems = useMemo(() => {
    if (!initialData.items || initialData.items.length === 0) return [];

    let list = initialData.items;

    // 1. Filter status
    if (selectedStatus !== "semua") {
      list = list.filter((item) => item.status === selectedStatus);
    }

    // 2. Filter pencarian (kode atau nama barang)
    if (searchTerm.trim()) {
      const term = searchTerm.trim().toLowerCase();
      list = list.filter(
        (item) =>
          item.kodeBarang.toLowerCase().includes(term) ||
          item.namaBarang.toLowerCase().includes(term)
      );
    }

    // 3. Pengurutan menggunakan pure function sortRadarStokItems
    return sortRadarStokItems(list, sortBy);
  }, [initialData.items, selectedStatus, searchTerm, sortBy]);

  const summary = initialData.summary || {
    totalBarang: 0,
    jumlahHabis: 0,
    jumlahKritis: 0,
    jumlahWaspada: 0,
    jumlahAman: 0,
    jumlahStagnan: 0,
    jumlahNonaktif: 0,
    totalRekomendasiOrder: 0,
  };

  const totalBarangAktif = summary.totalBarang - summary.jumlahNonaktif;

  // Render badge status radar dengan gaya konsisten
  const renderStatusBadge = (status: StatusRadarStok) => {
    switch (status) {
      case "Habis":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-800 border border-red-300">
            <XCircle className="h-3.5 w-3.5 text-red-600" />
            <span>Habis</span>
          </span>
        );
      case "Kritis":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-900 border border-rose-300 animate-pulse">
            <Flame className="h-3.5 w-3.5 text-rose-600" />
            <span>Kritis (&le; 7 hari)</span>
          </span>
        );
      case "Waspada":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900 border border-amber-300">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
            <span>Waspada</span>
          </span>
        );
      case "Aman":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-900 border border-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            <span>Aman</span>
          </span>
        );
      case "Stagnan":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 border border-slate-300">
            <PauseCircle className="h-3.5 w-3.5 text-slate-500" />
            <span>Stagnan</span>
          </span>
        );
      case "Nonaktif":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600 border border-zinc-300">
            <span>Nonaktif</span>
          </span>
        );
      default:
        return <span className="text-xs text-slate-500">{status}</span>;
    }
  };

  return (
    <AppLayout
      currentRole={dashboardRole}
      userProfile={serverProfile}
      onLogout={handleLogout}
      activePath="/radar-stok"
    >
      <div className="space-y-6">
        {/* 1. Header Halaman */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20">
                <Radar className="h-5 w-5" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                Radar Stok — Prediksi Kapan Barang Habis
              </h1>
            </div>
            <p className="text-sm text-slate-600">
              Analitik cerdas laju konsumsi barang, estimasi sisa hari ketersediaan stok fisik, dan rekomendasi kuantitas pengadaan.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden md:flex flex-col text-right">
              <span className="text-[11px] font-medium text-slate-400">Pembaruan Terakhir</span>
              <span className="text-xs font-semibold text-slate-700">
                {formatWIB(initialData.tanggalDihitung)}
              </span>
            </div>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 disabled:opacity-60 transition-all cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin text-blue-600" : ""}`} />
              <span>{isRefreshing ? "Menyinkronkan..." : "Segarkan"}</span>
            </button>
          </div>
        </div>

        {/* Banner Sukses Pembuatan Pengajuan PO */}
        {toastSuccess && (
          <div className="flex items-start justify-between gap-3 rounded-xl border border-emerald-300 bg-emerald-50/90 p-4 text-xs text-emerald-950 shadow-xs">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold text-emerald-950">Pengajuan PO Berhasil Disimpan</p>
                <p className="leading-relaxed text-emerald-800">{toastSuccess.message}</p>
                {canCreatePO && (
                  <div className="pt-1">
                    <Link
                      href="/pembelian"
                      className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:text-blue-900 hover:underline"
                    >
                      <span>Buka Halaman Modul Pembelian</span>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setToastSuccess(null)}
              className="text-emerald-700 hover:text-emerald-900 p-1 rounded-md hover:bg-emerald-100 transition-colors cursor-pointer"
              title="Tutup notifikasi"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Banner Penanganan Error Query Database */}
        {initialData.error && (
          <div className="rounded-xl border border-rose-300 bg-rose-50 p-5 text-rose-950 shadow-xs">
            <div className="flex items-start gap-3.5">
              <div className="rounded-lg bg-rose-600/10 p-2 text-rose-700 shrink-0">
                <AlertCircle className="h-5 w-5" />
              </div>
              <div className="space-y-2">
                <h3 className="font-bold text-sm text-rose-900">
                  Gagal Memuat Data Prediksi Radar Stok
                </h3>
                <p className="text-xs text-rose-800 leading-relaxed">
                  Terjadi kendala saat mengambil data riwayat penjualan atau stok dari database:{" "}
                  <span className="font-mono bg-rose-100 px-1 py-0.5 rounded">{initialData.error}</span>
                </p>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-800 transition-colors cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Coba Muat Ulang Halaman</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 2. Kartu Ringkasan KPI (5 Status Prioritas) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 sm:gap-4">
          {/* A. Kritis */}
          <div
            onClick={() => setSelectedStatus(selectedStatus === "Kritis" ? "semua" : "Kritis")}
            className={`cursor-pointer rounded-xl border p-4 transition-all shadow-xs ${
              selectedStatus === "Kritis"
                ? "border-rose-500 bg-rose-50/90 ring-2 ring-rose-500/20"
                : "border-slate-200 bg-white hover:border-rose-300 hover:bg-rose-50/40"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-rose-800">
                Kritis
              </span>
              <div className="rounded-lg bg-rose-100 p-1.5 text-rose-700">
                <Flame className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-extrabold text-rose-900">
                {summary.jumlahKritis}
              </div>
              <p className="mt-0.5 text-[11px] font-medium text-rose-700">
                Habis dalam &le; 7 hari
              </p>
            </div>
          </div>

          {/* B. Habis */}
          <div
            onClick={() => setSelectedStatus(selectedStatus === "Habis" ? "semua" : "Habis")}
            className={`cursor-pointer rounded-xl border p-4 transition-all shadow-xs ${
              selectedStatus === "Habis"
                ? "border-red-500 bg-red-50/90 ring-2 ring-red-500/20"
                : "border-slate-200 bg-white hover:border-red-300 hover:bg-red-50/40"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-red-800">
                Habis
              </span>
              <div className="rounded-lg bg-red-100 p-1.5 text-red-700">
                <XCircle className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-extrabold text-red-900">
                {summary.jumlahHabis}
              </div>
              <p className="mt-0.5 text-[11px] font-medium text-red-700">
                Stok fisik 0 di gudang
              </p>
            </div>
          </div>

          {/* C. Waspada */}
          <div
            onClick={() => setSelectedStatus(selectedStatus === "Waspada" ? "semua" : "Waspada")}
            className={`cursor-pointer rounded-xl border p-4 transition-all shadow-xs ${
              selectedStatus === "Waspada"
                ? "border-amber-500 bg-amber-50/90 ring-2 ring-amber-500/20"
                : "border-slate-200 bg-white hover:border-amber-300 hover:bg-amber-50/40"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-800">
                Waspada
              </span>
              <div className="rounded-lg bg-amber-100 p-1.5 text-amber-700">
                <Clock className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-extrabold text-amber-900">
                {summary.jumlahWaspada}
              </div>
              <p className="mt-0.5 text-[11px] font-medium text-amber-700">
                Habis 8-14 hari / &le; Min
              </p>
            </div>
          </div>

          {/* D. Aman */}
          <div
            onClick={() => setSelectedStatus(selectedStatus === "Aman" ? "semua" : "Aman")}
            className={`cursor-pointer rounded-xl border p-4 transition-all shadow-xs ${
              selectedStatus === "Aman"
                ? "border-emerald-500 bg-emerald-50/90 ring-2 ring-emerald-500/20"
                : "border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/40"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                Aman
              </span>
              <div className="rounded-lg bg-emerald-100 p-1.5 text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-extrabold text-emerald-900">
                {summary.jumlahAman}
              </div>
              <p className="mt-0.5 text-[11px] font-medium text-emerald-700">
                Stok aman &gt; 14 hari
              </p>
            </div>
          </div>

          {/* E. Stagnan */}
          <div
            onClick={() => setSelectedStatus(selectedStatus === "Stagnan" ? "semua" : "Stagnan")}
            className={`cursor-pointer rounded-xl border p-4 transition-all shadow-xs col-span-2 sm:col-span-1 ${
              selectedStatus === "Stagnan"
                ? "border-slate-500 bg-slate-100 ring-2 ring-slate-400/20"
                : "border-slate-200 bg-white hover:border-slate-400 hover:bg-slate-50"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Stagnan
              </span>
              <div className="rounded-lg bg-slate-200 p-1.5 text-slate-700">
                <PauseCircle className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-extrabold text-slate-800">
                {summary.jumlahStagnan}
              </div>
              <p className="mt-0.5 text-[11px] font-medium text-slate-600">
                Tanpa penjualan 30 hari
              </p>
            </div>
          </div>
        </div>

        {/* Panel Notifikasi Stok Pintar (Smart Stock Alerts) */}
        <SmartStockAlertPanel
          items={initialData.items || []}
          canCreatePO={canCreatePO}
          onQuickPO={handleOpenQuickPO}
        />

        {/* 3. Panel Kontrol: Pencarian, Filter Status & Sorting */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-3.5">
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Cari kode barang atau nama barang..."
                className="w-full rounded-lg border border-slate-300 pl-10 pr-4 py-2 text-xs font-medium text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                >
                  &times;
                </button>
              )}
            </div>

            {/* Sorting Dropdown */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <ArrowUpDown className="h-3.5 w-3.5" />
                <span>Urutkan:</span>
              </div>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOptionRadarStok)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
              >
                <option value="urgensi">Tingkat Urgensi (Habis &amp; Kritis Dahulu)</option>
                <option value="estimasi_asc">Estimasi Habis Tercepat (&le; Habis)</option>
                <option value="stok_asc">Sisa Stok Fisik Terendah</option>
                <option value="penjualan_desc">Penjualan 30 Hari Tertinggi</option>
                <option value="rekomendasi_desc">Rekomendasi Order Terbesar</option>
                <option value="nama_asc">Nama Barang (A - Z)</option>
              </select>
            </div>
          </div>

          {/* Status Tabs Filter */}
          <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100 text-xs">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mr-1">
              Filter:
            </span>
            {[
              { id: "semua", label: "Semua", count: initialData.items.length },
              { id: "Kritis", label: "Kritis", count: summary.jumlahKritis },
              { id: "Habis", label: "Habis", count: summary.jumlahHabis },
              { id: "Waspada", label: "Waspada", count: summary.jumlahWaspada },
              { id: "Stagnan", label: "Stagnan", count: summary.jumlahStagnan },
              { id: "Aman", label: "Aman", count: summary.jumlahAman },
              { id: "Nonaktif", label: "Nonaktif", count: summary.jumlahNonaktif },
            ].map((tab) => {
              const isActive = selectedStatus === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setSelectedStatus(tab.id)}
                  className={`rounded-full px-3 py-1 font-semibold transition-all cursor-pointer ${
                    isActive
                      ? "bg-blue-600 text-white shadow-xs"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {tab.label} ({tab.count})
                </button>
              );
            })}
          </div>
        </div>

        {/* 4. Tabel Radar Stok */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  <th scope="col" className="py-3.5 pl-6 pr-3">
                    Barang
                  </th>
                  <th scope="col" className="py-3.5 px-3 text-right">
                    Stok Fisik
                  </th>
                  <th scope="col" className="py-3.5 px-3 text-right">
                    Batas Min
                  </th>
                  <th scope="col" className="py-3.5 px-3 text-right">
                    Jual 30 Hari
                  </th>
                  <th scope="col" className="py-3.5 px-3 text-right">
                    Laju Harian
                  </th>
                  <th scope="col" className="py-3.5 px-3 text-center">
                    Estimasi Habis
                  </th>
                  <th scope="col" className="py-3.5 px-3 text-right">
                    PO Berjalan
                  </th>
                  <th scope="col" className="py-3.5 px-3 text-right">
                    Rekomendasi Order
                  </th>
                  <th scope="col" className="py-3.5 px-3 text-center">
                    Status
                  </th>
                  <th scope="col" className="py-3.5 pl-3 pr-6 text-center">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAndSortedItems.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center">
                      <div className="flex flex-col items-center justify-center space-y-2">
                        <div className="rounded-full bg-slate-100 p-3 text-slate-400">
                          <Package className="h-6 w-6" />
                        </div>
                        <h4 className="font-bold text-sm text-slate-800">
                          Tidak Ada Data Barang yang Sesuai
                        </h4>
                        <p className="text-xs text-slate-500 max-w-sm">
                          Tidak ditemukan barang yang memenuhi kata kunci &quot;{searchTerm}&quot; atau filter status yang dipilih.
                        </p>
                        {(searchTerm || selectedStatus !== "semua") && (
                          <button
                            onClick={() => {
                              setSearchTerm("");
                              setSelectedStatus("semua");
                            }}
                            className="mt-2 text-xs font-semibold text-blue-600 hover:text-blue-700 underline cursor-pointer"
                          >
                            Reset Seluruh Filter
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredAndSortedItems.map((item) => {
                    const isHabis = item.status === "Habis";
                    const isKritis = item.status === "Kritis";

                    return (
                      <tr
                        key={item.barangId}
                        className={`hover:bg-slate-50/80 transition-colors ${
                          isHabis
                            ? "bg-red-50/30"
                            : isKritis
                            ? "bg-rose-50/30"
                            : ""
                        }`}
                      >
                        {/* 1. Barang (Kode & Nama) */}
                        <td className="py-3.5 pl-6 pr-3 font-medium">
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-900 leading-tight">
                              {item.namaBarang}
                            </span>
                            <span className="font-mono text-[11px] text-slate-500 mt-0.5">
                              {item.kodeBarang}
                            </span>
                          </div>
                        </td>

                        {/* 2. Stok Fisik & Satuan */}
                        <td className="py-3.5 px-3 text-right">
                          <span
                            className={`font-bold ${
                              item.stokFisik === 0
                                ? "text-red-600"
                                : item.stokFisik <= item.stokMinimum
                                ? "text-amber-600"
                                : "text-slate-900"
                            }`}
                          >
                            {formatAngka(item.stokFisik)}
                          </span>
                          <span className="text-[11px] text-slate-500 ml-1">
                            {item.satuan}
                          </span>
                        </td>

                        {/* 3. Batas Stok Minimum */}
                        <td className="py-3.5 px-3 text-right font-medium text-slate-600">
                          {formatAngka(item.stokMinimum)}
                          <span className="text-[11px] text-slate-400 ml-1">
                            {item.satuan}
                          </span>
                        </td>

                        {/* 4. Total Penjualan 30 Hari */}
                        <td className="py-3.5 px-3 text-right font-semibold text-slate-800">
                          {formatAngka(item.totalPenjualan30Hari)}
                          <span className="text-[11px] text-slate-500 ml-1">
                            {item.satuan}
                          </span>
                        </td>

                        {/* 5. Rata-Rata Penjualan Harian */}
                        <td className="py-3.5 px-3 text-right font-medium text-slate-600">
                          {item.totalPenjualan30Hari > 0 ? (
                            <span>{formatDesimal(item.rataRataPenjualanHarian)} / hari</span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>

                        {/* 6. Estimasi Hari Sampai Habis */}
                        <td className="py-3.5 px-3 text-center">
                          {item.estimasiHariHabis === null ? (
                            <span className="inline-block text-[11px] font-medium text-slate-500 italic bg-slate-100 px-2.5 py-0.5 rounded-md">
                              Belum ada penjualan 30 hari
                            </span>
                          ) : item.estimasiHariHabis === 0 ? (
                            <span className="inline-block text-xs font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded-md">
                              0 hari (Habis)
                            </span>
                          ) : item.estimasiHariHabis <= 7 ? (
                            <span className="inline-block text-xs font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-md">
                              {formatDesimal(item.estimasiHariHabis)} hari
                            </span>
                          ) : item.estimasiHariHabis <= 14 ? (
                            <span className="inline-block text-xs font-semibold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md">
                              {formatDesimal(item.estimasiHariHabis)} hari
                            </span>
                          ) : (
                            <span className="inline-block text-xs font-medium text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md">
                              {formatDesimal(item.estimasiHariHabis)} hari
                            </span>
                          )}
                        </td>

                        {/* 7. Kuantitas PO Berjalan */}
                        <td className="py-3.5 px-3 text-right font-medium">
                          {item.incomingPO > 0 ? (
                            <span className="inline-flex items-center gap-1 text-purple-700 font-semibold bg-purple-50 px-2 py-0.5 rounded border border-purple-200 text-[11px]">
                              <Truck className="h-3 w-3" />
                              <span>+{formatAngka(item.incomingPO)} {item.satuan}</span>
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>

                        {/* 8. Rekomendasi Kuantitas Pengadaan */}
                        <td className="py-3.5 px-3 text-right">
                          {!item.aktif ? (
                            <span className="text-[11px] text-zinc-500 italic">0 (Nonaktif)</span>
                          ) : item.rekomendasiOrder > 0 ? (
                            <span className="inline-block font-extrabold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                              +{formatAngka(item.rekomendasiOrder)} {item.satuan}
                            </span>
                          ) : (
                            <span className="text-[11px] font-semibold text-emerald-700">
                              Tercukupi (0)
                            </span>
                          )}
                        </td>

                        {/* 9. Status Radar */}
                        <td className="py-3.5 px-3 text-center">
                          {renderStatusBadge(item.status)}
                        </td>

                        {/* 10. Aksi Quick PO */}
                        <td className="py-3.5 pl-3 pr-6 text-center">
                          {!item.aktif ? (
                            <span className="text-[11px] text-zinc-400 italic">Nonaktif</span>
                          ) : item.rekomendasiOrder <= 0 ? (
                            <span className="inline-block text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                              Tercukupi
                            </span>
                          ) : canCreatePO ? (
                            <button
                              type="button"
                              onClick={() => handleOpenQuickPO(item)}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-blue-700 active:scale-95 transition-all cursor-pointer"
                              title={`Ajukan PO untuk ${item.namaBarang} (+${formatAngka(item.rekomendasiOrder)} ${item.satuan})`}
                            >
                              <ShoppingCart className="h-3.5 w-3.5" />
                              <span>Buat PO</span>
                            </button>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 bg-slate-100 px-2 py-1 rounded-md"
                              title="Hanya Staf Gudang dan Manajer yang berwenang mengajukan pembelian (BR-09)"
                            >
                              <ShoppingCart className="h-3 w-3 text-slate-300" />
                              <span>Perlu PO</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Footer Tabel: Keterangan Logika Rekomendasi */}
          <div className="bg-slate-50 border-t border-slate-200 px-6 py-3 text-[11px] text-slate-500 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Info className="h-3.5 w-3.5 text-blue-500 shrink-0" />
              <span>
                Rumus Pengadaan: <strong>Target Stok = max(Stok Minimum &times; 2, Penjualan 30 Hari)</strong> dikurangi Stok Fisik &amp; PO Berjalan.
              </span>
            </div>
            <div className="font-medium text-slate-600">
              Menampilkan {filteredAndSortedItems.length} barang ({totalBarangAktif} barang aktif, {summary.jumlahNonaktif} nonaktif)
            </div>
          </div>
        </div>

        {/* Modal Quick PO dari Radar Stok */}
        {isPOModalOpen && selectedItemForPO && (
          <BuatPembelianModal
            key={selectedItemForPO.barangId}
            isOpen={isPOModalOpen}
            onClose={() => {
              setIsPOModalOpen(false);
              setSelectedItemForPO(null);
            }}
            pemasokList={pemasokList}
            barangList={barangListForModal}
            userRole={serverProfile.peran}
            initialBarangId={selectedItemForPO.barangId}
            initialJumlahDipesan={selectedItemForPO.rekomendasiOrder}
            radarContext={{
              stokFisik: selectedItemForPO.stokFisik,
              stokMinimum: selectedItemForPO.stokMinimum,
              incomingPO: selectedItemForPO.incomingPO,
              rekomendasiOrder: selectedItemForPO.rekomendasiOrder,
              satuan: selectedItemForPO.satuan,
            }}
            onSuccess={handleSuccessQuickPO}
          />
        )}
      </div>
    </AppLayout>
  );
}
