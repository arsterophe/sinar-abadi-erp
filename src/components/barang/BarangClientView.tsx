"use client";

import React, { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Package,
  Search,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  ArrowLeft,
  RefreshCw,
  Boxes,
  Lock,
  Layers,
  ChevronRight,
  SlidersHorizontal,
  FileText,
} from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import { UserProfile, mapDbRoleToDashboardRole, roleDisplayLabel } from "@/types/auth";
import { logoutUser } from "@/lib/supabase/auth";
import {
  BarangItem,
  BarangFilterStatus,
  isStokMenipis,
  formatRupiah,
  PenyesuaianStokResult,
} from "@/types/barang";
import PenyesuaianStokModal from "@/components/barang/PenyesuaianStokModal";
import KartuStokModal from "@/components/barang/KartuStokModal";

interface BarangClientViewProps {
  serverProfile: UserProfile;
  initialBarang: BarangItem[];
  dbError?: string | null;
}

export default function BarangClientView({
  serverProfile,
  initialBarang = [],
  dbError = null,
}: BarangClientViewProps) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState<BarangFilterStatus>("semua");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const dashboardRole = mapDbRoleToDashboardRole(serverProfile.peran);
  const isManager = serverProfile.peran === "manajer";
  const canAdjustStock =
    serverProfile.peran === "manajer" || serverProfile.peran === "gudang";

  // State Modal Penyesuaian Stok
  const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] = useState(false);
  const [selectedBarangForAdjustment, setSelectedBarangForAdjustment] =
    useState<BarangItem | null>(null);

  // State Modal Kartu Stok
  const [isKartuStokModalOpen, setIsKartuStokModalOpen] = useState(false);
  const [selectedBarangForKartuStok, setSelectedBarangForKartuStok] =
    useState<BarangItem | null>(null);

  // Notifikasi Sukses
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const handleLogout = async () => {
    await logoutUser();
    router.push("/login");
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    router.refresh();
    setTimeout(() => setIsRefreshing(false), 600);
  };

  const handleOpenAdjustment = (barang?: BarangItem | null) => {
    setSelectedBarangForAdjustment(barang || null);
    setIsAdjustmentModalOpen(true);
  };

  const handleOpenKartuStok = (barang: BarangItem) => {
    setSelectedBarangForKartuStok(barang);
    setIsKartuStokModalOpen(true);
  };

  const handleAdjustmentSuccess = (res: PenyesuaianStokResult) => {
    const changeSign = res.perubahan > 0 ? `+${res.perubahan}` : `${res.perubahan}`;
    setSuccessToast(
      `Penyesuaian stok berhasil disimpan (${res.nomor_dokumen}): ${res.kode_barang || ""} ${res.nama_barang || ""}. Perubahan: ${changeSign}. Stok kini: ${res.stok_sesudah}.`
    );
    router.refresh();
  };

  // State Pengurutan (Sorting)
  const [sortField, setSortField] = useState<"kode" | "nama" | "harga_jual" | "stok">("kode");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // State Pagination
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 10;

  // Reset page when search or filter changes
  const handleSearchChange = (val: string) => {
    setSearchTerm(val);
    setCurrentPage(1);
  };

  const handleFilterChange = (filter: BarangFilterStatus) => {
    setActiveFilter(filter);
    setCurrentPage(1);
  };

  const handleSort = (field: "kode" | "nama" | "harga_jual" | "stok") => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
    setCurrentPage(1);
  };

  // Metrik ringkasan
  const totalCount = initialBarang.length;
  const activeCount = initialBarang.filter((b) => b.aktif).length;
  const lowStockCount = initialBarang.filter((b) =>
    isStokMenipis(b.stok, b.stok_minimum)
  ).length;
  const totalUnitStock = initialBarang.reduce(
    (acc, b) => acc + (Number(b.stok) || 0),
    0
  );

  // Filter, pencarian, dan pengurutan data
  const filteredAndSortedBarang = useMemo(() => {
    const list = initialBarang.filter((item) => {
      // 1. Filter status
      if (activeFilter === "aktif" && !item.aktif) return false;
      if (activeFilter === "menipis" && !isStokMenipis(item.stok, item.stok_minimum))
        return false;

      // 2. Pencarian teks (kode atau nama)
      if (searchTerm.trim() !== "") {
        const query = searchTerm.toLowerCase().trim();
        const matchKode = item.kode.toLowerCase().includes(query);
        const matchNama = item.nama.toLowerCase().includes(query);
        return matchKode || matchNama;
      }

      return true;
    });

    // Pengurutan
    list.sort((a, b) => {
      let comparison = 0;
      if (sortField === "kode") {
        comparison = a.kode.localeCompare(b.kode);
      } else if (sortField === "nama") {
        comparison = a.nama.localeCompare(b.nama);
      } else if (sortField === "harga_jual") {
        comparison = Number(a.harga_jual) - Number(b.harga_jual);
      } else if (sortField === "stok") {
        comparison = Number(a.stok) - Number(b.stok);
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });

    return list;
  }, [initialBarang, activeFilter, searchTerm, sortField, sortDirection]);

  // Data terpaginasi aktual
  const totalPages = Math.max(1, Math.ceil(filteredAndSortedBarang.length / pageSize));
  const paginatedBarang = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAndSortedBarang.slice(start, start + pageSize);
  }, [filteredAndSortedBarang, currentPage, pageSize]);

  const hasActiveFilters = searchTerm.trim() !== "" || activeFilter !== "semua";

  const handleResetFilters = () => {
    setSearchTerm("");
    setActiveFilter("semua");
    setCurrentPage(1);
  };

  return (
    <AppLayout
      currentRole={dashboardRole}
      activePath="/barang-dan-stok"
      userProfile={serverProfile}
      onLogout={handleLogout}
    >
      <div className="space-y-6">
        {/* Breadcrumb & Navigation */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <nav className="flex items-center gap-2 text-xs text-slate-500 font-medium">
            <Link
              href="/"
              className="flex items-center gap-1 text-slate-600 hover:text-blue-600 transition-colors"
            >
              <span>Dashboard</span>
            </Link>
            <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-slate-900 font-semibold">Barang dan Stok</span>
          </nav>

          <div className="flex items-center gap-2">
            {/* Tombol Penyesuaian Stok Khusus Peran yang Berhak (PRD Bab 4 & 7) */}
            {canAdjustStock && (
              <button
                onClick={() => handleOpenAdjustment(null)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-600 bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-amber-500 transition-all cursor-pointer"
                title="Catat Penyesuaian Stok Fisik / Stock Opname"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span>Penyesuaian Stok</span>
              </button>
            )}

            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition-all disabled:opacity-60 cursor-pointer"
              title="Perbarui Data dari Supabase"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 text-slate-500 ${
                  isRefreshing ? "animate-spin" : ""
                }`}
              />
              <span>Perbarui</span>
            </button>
            <Link
              href="/"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition-all"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Kembali</span>
            </Link>
          </div>
        </div>

        {/* Notifikasi Sukses Penyesuaian Stok */}
        {successToast && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-50 p-4 text-emerald-950 shadow-2xs animate-fadeIn flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-emerald-900">
                  Transaksi Penyesuaian Berhasil
                </h4>
                <p className="mt-0.5 text-xs text-emerald-800 leading-relaxed">
                  {successToast}
                </p>
              </div>
            </div>
            <button
              onClick={() => setSuccessToast(null)}
              className="rounded p-1 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-900 transition-colors"
              aria-label="Tutup notifikasi"
            >
              <XCircle className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Page Title & Context Header */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3.5">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20 ring-1 ring-blue-500/30 shrink-0">
                <Package className="h-6 w-6" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
                    Katalog Barang dan Stok
                  </h1>
                  <span className="rounded bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 border border-blue-200">
                    Modul Persediaan
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  CV Sinar Abadi Niaga • Monitoring fisik barang, harga grosir, dan kontrol minimum stok gudang.
                </p>
              </div>
            </div>

            {/* Role Security Badge */}
            <div className="flex items-center gap-2.5 rounded-lg bg-slate-50 border border-slate-200 px-3.5 py-2 text-xs">
              {isManager ? (
                <>
                  <ShieldAlert className="h-4 w-4 text-emerald-600 shrink-0" />
                  <div>
                    <span className="font-semibold text-slate-800">Akses Manajer</span>
                    <p className="text-[11px] text-slate-500">Harga Pokok &amp; Valuasi ditampilkan</p>
                  </div>
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4 text-blue-600 shrink-0" />
                  <div>
                    <span className="font-semibold text-slate-800">
                      Akses: {roleDisplayLabel(serverProfile.peran)}
                    </span>
                    <p className="text-[11px] text-slate-500">Harga Pokok dilindungi server (BR-12)</p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Database Error Banner (jika koneksi/tabel terkendala) */}
        {dbError && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-950 shadow-xs">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-bold text-rose-900">
                  Kendala Pembacaan Data Supabase
                </h3>
                <p className="mt-1 text-xs text-rose-800 leading-relaxed font-mono">
                  {dbError}
                </p>
                <p className="mt-2 text-xs text-rose-700">
                  Pastikan tabel <code className="font-bold">public.barang</code> telah terisi data dan memiliki kebijakan akses (RLS / Grants) yang sesuai untuk pengguna terotentikasi.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* KPI / Metric Summary Cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-semibold uppercase tracking-wider">
                Total Barang
              </span>
              <div className="rounded-lg bg-blue-50 p-1.5 text-blue-600">
                <Layers className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight text-slate-900">
                {totalCount}
              </span>
              <span className="text-xs text-slate-500">item</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">Semua katalog terdaftar</p>
          </div>

          <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-semibold uppercase tracking-wider">
                Barang Aktif
              </span>
              <div className="rounded-lg bg-emerald-50 p-1.5 text-emerald-600">
                <CheckCircle2 className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight text-slate-900">
                {activeCount}
              </span>
              <span className="text-xs text-emerald-600 font-medium">tersedia</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">Siap dipesan pelanggan</p>
          </div>

          <div
            className={`rounded-xl border p-4 shadow-xs transition-all ${
              lowStockCount > 0
                ? "border-amber-200 bg-amber-50/50"
                : "border-slate-200/90 bg-white"
            }`}
          >
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-semibold uppercase tracking-wider">
                Stok Menipis
              </span>
              <div className={`rounded-lg p-1.5 ${lowStockCount > 0 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}>
                <AlertTriangle className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span
                className={`text-2xl font-bold tracking-tight ${
                  lowStockCount > 0 ? "text-amber-700" : "text-slate-900"
                }`}
              >
                {lowStockCount}
              </span>
              <span className="text-xs text-amber-700 font-medium">perlu restock</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">Stok ≤ Batas minimum (BR-01)</p>
          </div>

          <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-semibold uppercase tracking-wider">
                Total Unit Fisik
              </span>
              <div className="rounded-lg bg-indigo-50 p-1.5 text-indigo-600">
                <Boxes className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight text-slate-900">
                {totalUnitStock.toLocaleString("id-ID")}
              </span>
              <span className="text-xs text-slate-500">unit</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">Akumulasi seluruh barang</p>
          </div>
        </div>

        {/* Filter Bar, Active Filter Indicator & Search Controls */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            {/* Status Tabs */}
            <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 rounded-lg border border-slate-200/80">
              <button
                onClick={() => handleFilterChange("semua")}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                  activeFilter === "semua"
                    ? "bg-white text-slate-900 shadow-xs border border-slate-200"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
                }`}
              >
                Semua ({totalCount})
              </button>
              <button
                onClick={() => handleFilterChange("aktif")}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                  activeFilter === "aktif"
                    ? "bg-white text-emerald-800 shadow-xs border border-slate-200"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
                }`}
              >
                Aktif ({activeCount})
              </button>
              <button
                onClick={() => handleFilterChange("menipis")}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                  activeFilter === "menipis"
                    ? "bg-white text-amber-800 shadow-xs border border-slate-200"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
                }`}
              >
                Stok Menipis ({lowStockCount})
              </button>
            </div>

            {/* Search Box */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Cari kode (BRG-...) atau nama barang..."
                className="w-full rounded-lg border border-slate-200 bg-slate-50/60 py-2 pl-9 pr-8 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
              />
              {searchTerm && (
                <button
                  onClick={() => handleSearchChange("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-600"
                  aria-label="Bersihkan pencarian"
                >
                  <XCircle className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Active Filter Indicators & Reset Button */}
          {hasActiveFilters && (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-slate-100 text-xs">
              <div className="flex flex-wrap items-center gap-2 text-slate-500">
                <span>Filter aktif:</span>
                {searchTerm && (
                  <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 border border-blue-200">
                    Kata kunci: &ldquo;{searchTerm}&rdquo;
                  </span>
                )}
                {activeFilter !== "semua" && (
                  <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 border border-amber-200">
                    Status: {activeFilter === "aktif" ? "Barang Aktif" : "Stok Menipis"}
                  </span>
                )}
                <span className="text-slate-400">
                  (Ditemukan {filteredAndSortedBarang.length} data)
                </span>
              </div>
              <button
                onClick={handleResetFilters}
                className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 cursor-pointer underline underline-offset-2"
              >
                Reset Semua Filter
              </button>
            </div>
          )}
        </div>

        {/* Data Catalog Table */}
        <div className="rounded-xl border border-slate-200/90 bg-white shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-100 text-slate-700 border-b border-slate-200 font-semibold uppercase tracking-wider text-[11px]">
                <tr>
                  <th scope="col" className="px-4 py-3.5 w-12 text-center text-slate-500">
                    No
                  </th>
                  <th
                    scope="col"
                    onClick={() => handleSort("kode")}
                    className="px-4 py-3.5 w-32 cursor-pointer hover:bg-slate-200/70 select-none transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      <span>Kode</span>
                      <span className="text-slate-400">
                        {sortField === "kode" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}
                      </span>
                    </div>
                  </th>
                  <th
                    scope="col"
                    onClick={() => handleSort("nama")}
                    className="px-4 py-3.5 cursor-pointer hover:bg-slate-200/70 select-none transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      <span>Nama Barang</span>
                      <span className="text-slate-400">
                        {sortField === "nama" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}
                      </span>
                    </div>
                  </th>
                  <th scope="col" className="px-3 py-3.5 w-20 text-center text-slate-500">
                    Satuan
                  </th>
                  <th
                    scope="col"
                    onClick={() => handleSort("harga_jual")}
                    className="px-4 py-3.5 text-right w-36 cursor-pointer hover:bg-slate-200/70 select-none transition-colors"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Harga Jual</span>
                      <span className="text-slate-400">
                        {sortField === "harga_jual" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}
                      </span>
                    </div>
                  </th>
                  {isManager && (
                    <th scope="col" className="px-4 py-3.5 text-right w-36 bg-amber-50/60 text-amber-900 border-l border-amber-100">
                      <span className="flex items-center justify-end gap-1">
                        <span>Harga Pokok</span>
                        <Lock className="h-3 w-3 text-amber-600" />
                      </span>
                    </th>
                  )}
                  <th
                    scope="col"
                    onClick={() => handleSort("stok")}
                    className="px-4 py-3.5 text-center w-28 cursor-pointer hover:bg-slate-200/70 select-none transition-colors"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>Stok Fisik</span>
                      <span className="text-slate-400">
                        {sortField === "stok" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}
                      </span>
                    </div>
                  </th>
                  <th scope="col" className="px-4 py-3.5 text-center w-24 text-slate-500">
                    Stok Min.
                  </th>
                  <th scope="col" className="px-4 py-3.5 text-center w-24 text-slate-500">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3.5 text-center w-36 text-slate-500">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {paginatedBarang.length > 0 ? (
                  paginatedBarang.map((item, index) => {
                    const menipis = isStokMenipis(item.stok, item.stok_minimum);
                    const isHabis = Number(item.stok) === 0;
                    const rowIndex = (currentPage - 1) * pageSize + index + 1;

                    return (
                      <tr
                        key={item.id}
                        className={`transition-colors hover:bg-slate-50/80 ${
                          menipis ? "bg-amber-50/20" : ""
                        }`}
                      >
                        <td className="px-4 py-3 text-center text-slate-400 tabular-nums">
                          {rowIndex}
                        </td>
                        <td className="px-4 py-3 font-mono font-bold text-slate-900">
                          {item.kode}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900">
                            {item.nama}
                          </div>
                          {menipis && (
                            <div className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-100/80 px-1.5 py-0.5 rounded">
                              <AlertTriangle className="h-3 w-3" />
                              <span>Stok Menipis (≤ {item.stok_minimum} {item.satuan})</span>
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                            {item.satuan}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-slate-900 tabular-nums">
                          {formatRupiah(item.harga_jual)}
                        </td>
                        {isManager && (
                          <td className="px-4 py-3 text-right font-mono font-semibold text-amber-800 bg-amber-50/30 border-l border-amber-100 tabular-nums">
                            {item.harga_pokok !== undefined && item.harga_pokok !== null
                              ? formatRupiah(item.harga_pokok)
                              : "-"}
                          </td>
                        )}
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`inline-flex items-center justify-center min-w-[2.5rem] rounded-md px-2 py-0.5 font-mono font-bold tabular-nums ${
                              isHabis
                                ? "bg-rose-100 text-rose-800"
                                : menipis
                                ? "bg-amber-100 text-amber-900"
                                : "bg-emerald-100 text-emerald-900"
                            }`}
                          >
                            {item.stok}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center font-mono text-slate-500 tabular-nums">
                          {item.stok_minimum}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {item.aktif ? (
                            <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-600/20">
                              Aktif
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-500/20">
                              Nonaktif
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleOpenKartuStok(item)}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:border-blue-400 hover:bg-blue-50/50 hover:text-blue-700 transition-all cursor-pointer shadow-2xs"
                              title={`Lihat Kartu Stok ${item.nama}`}
                            >
                              <FileText className="h-3 w-3 text-blue-600" />
                              <span>Kartu Stok</span>
                            </button>
                            {canAdjustStock && item.aktif && (
                              <button
                                onClick={() => handleOpenAdjustment(item)}
                                className="inline-flex items-center justify-center rounded-md border border-amber-200 bg-amber-50/60 p-1 text-amber-700 hover:bg-amber-100 hover:border-amber-400 transition-all cursor-pointer shadow-2xs"
                                title={`Sesuaikan Stok ${item.nama}`}
                                aria-label={`Sesuaikan Stok ${item.nama}`}
                              >
                                <SlidersHorizontal className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td
                      colSpan={isManager ? 10 : 9}
                      className="px-6 py-12 text-center text-slate-500"
                    >
                      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400 mb-3">
                        <Package className="h-6 w-6" />
                      </div>
                      <h4 className="text-sm font-bold text-slate-800">
                        Tidak Ada Barang yang Sesuai
                      </h4>
                      <p className="mt-1 text-xs text-slate-400 max-w-sm mx-auto">
                        {searchTerm
                          ? `Tidak ditemukan barang dengan kata kunci "${searchTerm}". Coba ubah pencarian.`
                          : activeFilter === "menipis"
                          ? "Semua barang saat ini berada dalam kondisi aman di atas stok minimum."
                          : "Belum ada data barang di sistem."}
                      </p>
                      {hasActiveFilters && (
                        <button
                          onClick={handleResetFilters}
                          className="mt-4 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-all cursor-pointer"
                        >
                          Reset Pencarian &amp; Filter
                        </button>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Table Footer with True Pagination */}
          <div className="border-t border-slate-200 bg-slate-50/80 px-6 py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-slate-600">
            <div>
              Menampilkan{" "}
              <strong>
                {filteredAndSortedBarang.length === 0
                  ? 0
                  : (currentPage - 1) * pageSize + 1}
              </strong>
              –
              <strong>
                {Math.min(currentPage * pageSize, filteredAndSortedBarang.length)}
              </strong>{" "}
              dari <strong>{filteredAndSortedBarang.length}</strong> barang
              {filteredAndSortedBarang.length !== totalCount && (
                <span className="text-slate-400 ml-1">
                  (terfilter dari total {totalCount})
                </span>
              )}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center gap-1.5 self-center sm:self-auto">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  Sebelumnya
                </button>
                <div className="flex items-center gap-1 px-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`h-7 w-7 rounded-lg text-xs font-semibold transition-all ${
                        currentPage === page
                          ? "bg-blue-600 text-white shadow-xs"
                          : "text-slate-600 hover:bg-slate-200/60"
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  Selanjutnya
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal Dialog Penyesuaian Stok (Hanya untuk Manajer dan Gudang) */}
      {canAdjustStock && isAdjustmentModalOpen && (
        <PenyesuaianStokModal
          key={`adj-${selectedBarangForAdjustment?.id || "general"}`}
          isOpen={isAdjustmentModalOpen}
          onClose={() => setIsAdjustmentModalOpen(false)}
          barangList={initialBarang}
          preselectedBarangId={selectedBarangForAdjustment?.id || null}
          onSuccess={handleAdjustmentSuccess}
        />
      )}

      {/* Modal Dialog Kartu Stok per Barang */}
      {isKartuStokModalOpen && selectedBarangForKartuStok && (
        <KartuStokModal
          key={`card-${selectedBarangForKartuStok.id}`}
          isOpen={isKartuStokModalOpen}
          onClose={() => {
            setIsKartuStokModalOpen(false);
            setSelectedBarangForKartuStok(null);
          }}
          barang={selectedBarangForKartuStok}
        />
      )}
    </AppLayout>
  );
}
