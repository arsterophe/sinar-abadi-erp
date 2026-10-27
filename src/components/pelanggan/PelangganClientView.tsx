"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Users,
  Search,
  Plus,
  RefreshCw,
  ArrowLeft,
  ChevronRight,
  ShieldCheck,
  AlertTriangle,
  Building2,
  DollarSign,
  CheckCircle2,
  XCircle,
  Lock,
} from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import { UserProfile, mapDbRoleToDashboardRole, roleDisplayLabel } from "@/types/auth";
import { logoutUser } from "@/lib/supabase/auth";
import {
  PelangganItem,
  PelangganFilterStatus,
  formatRupiah,
} from "@/types/pelanggan";
import PelangganTable from "./PelangganTable";
import PelangganModalForm from "./PelangganModalForm";

interface PelangganClientViewProps {
  serverProfile: UserProfile;
  initialPelanggan: PelangganItem[];
  dbError?: string | null;
}

export default function PelangganClientView({
  serverProfile,
  initialPelanggan = [],
  dbError = null,
}: PelangganClientViewProps) {
  const router = useRouter();
  const [pelangganList, setPelangganList] = useState<PelangganItem[]>(initialPelanggan);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState<PelangganFilterStatus>("semua");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedPelanggan, setSelectedPelanggan] = useState<PelangganItem | null>(null);

  // State Pengurutan (Sorting)
  const [sortField, setSortField] = useState<"kode" | "nama_toko" | "batas_kredit" | "piutang_berjalan">("kode");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // State Pagination
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 10;

  // Sinkronkan state lokal saat Server Component mengirim initialPelanggan baru
  useEffect(() => {
    setPelangganList(initialPelanggan);
  }, [initialPelanggan]);

  const dashboardRole = mapDbRoleToDashboardRole(serverProfile.peran);
  const isManager = serverProfile.peran === "manajer";

  const handleLogout = async () => {
    await logoutUser();
    router.push("/login");
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    router.refresh();
    setTimeout(() => setIsRefreshing(false), 600);
  };

  const handleSearchChange = (val: string) => {
    setSearchTerm(val);
    setCurrentPage(1);
  };

  const handleFilterChange = (filter: PelangganFilterStatus) => {
    setActiveFilter(filter);
    setCurrentPage(1);
  };

  const handleSort = (field: "kode" | "nama_toko" | "batas_kredit" | "piutang_berjalan") => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
    setCurrentPage(1);
  };

  const handleOpenAdd = () => {
    setSelectedPelanggan(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item: PelangganItem) => {
    setSelectedPelanggan(item);
    setIsModalOpen(true);
  };

  const handleFormSuccess = (updatedItem?: Partial<PelangganItem> & { id: string }) => {
    if (updatedItem) {
      setPelangganList((prev) =>
        prev.map((item) =>
          item.id === updatedItem.id ? { ...item, ...updatedItem } : item
        )
      );
    }
    router.refresh();
  };

  // Metrik KPI
  const totalCount = pelangganList.length;
  const activeCount = pelangganList.filter((p) => p.aktif).length;
  const totalPiutang = pelangganList.reduce(
    (acc, p) => acc + (Number(p.piutang_berjalan) || 0),
    0
  );
  const overdueCount = pelangganList.filter((p) => p.tagihan_terlambat).length;

  // Filter & Search & Sort
  const filteredAndSortedPelanggan = useMemo(() => {
    const list = pelangganList.filter((item) => {
      // 1. Status Filter
      if (activeFilter === "aktif" && !item.aktif) return false;
      if (activeFilter === "nonaktif" && item.aktif) return false;
      if (activeFilter === "terlambat" && !item.tagihan_terlambat) return false;

      // 2. Text Search
      if (searchTerm.trim() !== "") {
        const query = searchTerm.toLowerCase().trim();
        const matchKode = item.kode.toLowerCase().includes(query);
        const matchNama = item.nama_toko.toLowerCase().includes(query);
        const matchTelp = item.telepon.toLowerCase().includes(query);
        return matchKode || matchNama || matchTelp;
      }

      return true;
    });

    // Pengurutan (Sorting)
    list.sort((a, b) => {
      let comparison = 0;
      if (sortField === "kode") {
        comparison = a.kode.localeCompare(b.kode);
      } else if (sortField === "nama_toko") {
        comparison = a.nama_toko.localeCompare(b.nama_toko);
      } else if (sortField === "batas_kredit") {
        comparison = Number(a.batas_kredit) - Number(b.batas_kredit);
      } else if (sortField === "piutang_berjalan") {
        comparison = Number(a.piutang_berjalan) - Number(b.piutang_berjalan);
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });

    return list;
  }, [pelangganList, activeFilter, searchTerm, sortField, sortDirection]);

  // Data Terpaginasi Nyata
  const totalPages = Math.max(1, Math.ceil(filteredAndSortedPelanggan.length / pageSize));
  const paginatedPelanggan = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAndSortedPelanggan.slice(start, start + pageSize);
  }, [filteredAndSortedPelanggan, currentPage, pageSize]);

  const hasActiveFilters = searchTerm.trim() !== "" || activeFilter !== "semua";

  const handleResetFilters = () => {
    setSearchTerm("");
    setActiveFilter("semua");
    setCurrentPage(1);
  };

  return (
    <AppLayout
      currentRole={dashboardRole}
      activePath="/pelanggan"
      userProfile={serverProfile}
      onLogout={handleLogout}
    >
      <div className="space-y-6">
        {/* Breadcrumb & Action Toolbar */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <nav className="flex items-center gap-2 text-xs text-slate-500 font-medium">
            <Link
              href="/"
              className="flex items-center gap-1 text-slate-600 hover:text-blue-600 transition-colors"
            >
              <span>Dashboard</span>
            </Link>
            <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-slate-900 font-semibold">Pelanggan</span>
          </nav>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition-all disabled:opacity-60 cursor-pointer"
              title="Perbarui Data"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 text-slate-500 ${
                  isRefreshing ? "animate-spin" : ""
                }`}
              />
              <span>Perbarui</span>
            </button>
            <button
              onClick={handleOpenAdd}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-md shadow-blue-500/20 hover:bg-blue-500 transition-all cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>Tambah Pelanggan</span>
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

        {/* Page Banner Header */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3.5">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20 ring-1 ring-blue-500/30 shrink-0">
                <Users className="h-6 w-6" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
                    Manajemen Toko Pelanggan
                  </h1>
                  <span className="rounded bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 border border-blue-200">
                    Modul Distribusi
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  CV Sinar Abadi Niaga • Pengelolaan toko kelontong, plafon batas kredit, termin tempo, dan piutang berjalan.
                </p>
              </div>
            </div>

            {/* Role Security Badge */}
            <div className="flex items-center gap-2.5 rounded-lg bg-slate-50 border border-slate-200 px-3.5 py-2 text-xs">
              {isManager ? (
                <>
                  <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                  <div>
                    <span className="font-semibold text-slate-800">Akses Manajer</span>
                    <p className="text-[11px] text-slate-500">Penuh: Dapat Mengubah Batas Kredit (BR-12)</p>
                  </div>
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4 text-blue-600 shrink-0" />
                  <div>
                    <span className="font-semibold text-slate-800">
                      Akses: {roleDisplayLabel(serverProfile.peran)}
                    </span>
                    <p className="text-[11px] text-slate-500">Pendaftaran toko baru (Plafon Rp 0 - BR-05)</p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Database Error Banner */}
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
                  Pastikan tabel <code className="font-bold">public.pelanggan</code> memiliki hak akses (Grants / RLS) yang sesuai untuk peran Anda.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Summary Metric Cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-semibold uppercase tracking-wider">
                Total Pelanggan
              </span>
              <div className="rounded-lg bg-blue-50 p-1.5 text-blue-600">
                <Building2 className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight text-slate-900">
                {totalCount}
              </span>
              <span className="text-xs text-slate-500">toko</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">Terdaftar di sistem</p>
          </div>

          <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-semibold uppercase tracking-wider">
                Pelanggan Aktif
              </span>
              <div className="rounded-lg bg-emerald-50 p-1.5 text-emerald-600">
                <CheckCircle2 className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight text-slate-900">
                {activeCount}
              </span>
              <span className="text-xs text-emerald-600 font-medium">dapat order</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">Status toko operasional</p>
          </div>

          <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-semibold uppercase tracking-wider">
                Piutang Berjalan
              </span>
              <div className="rounded-lg bg-indigo-50 p-1.5 text-indigo-600">
                <DollarSign className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 font-mono">
                {formatRupiah(totalPiutang)}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">Total pesanan aktif (BR-05)</p>
          </div>

          <div
            className={`rounded-xl border p-4 shadow-xs transition-all ${
              overdueCount > 0
                ? "border-rose-200 bg-rose-50/50"
                : "border-slate-200/90 bg-white"
            }`}
          >
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-semibold uppercase tracking-wider">
                Tagihan Terlambat
              </span>
              <div className={`rounded-lg p-1.5 ${overdueCount > 0 ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-500"}`}>
                <AlertTriangle className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span
                className={`text-2xl font-bold tracking-tight ${
                  overdueCount > 0 ? "text-rose-700" : "text-slate-900"
                }`}
              >
                {overdueCount}
              </span>
              <span className="text-xs text-rose-700 font-medium">toko</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">Lewat jatuh tempo (Blokir)</p>
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
                onClick={() => handleFilterChange("nonaktif")}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                  activeFilter === "nonaktif"
                    ? "bg-white text-slate-800 shadow-xs border border-slate-200"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
                }`}
              >
                Nonaktif ({totalCount - activeCount})
              </button>
              <button
                onClick={() => handleFilterChange("terlambat")}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                  activeFilter === "terlambat"
                    ? "bg-white text-rose-800 shadow-xs border border-slate-200"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
                }`}
              >
                Tagihan Terlambat ({overdueCount})
              </button>
            </div>

            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Cari kode (PLG-...), nama toko, atau telepon..."
                className="w-full rounded-lg border border-slate-200 bg-slate-50/60 py-2 pl-9 pr-8 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
              />
              {searchTerm && (
                <button
                  onClick={() => handleSearchChange("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-600 cursor-pointer"
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
                    Status: {
                      activeFilter === "aktif"
                        ? "Pelanggan Aktif"
                        : activeFilter === "nonaktif"
                        ? "Nonaktif"
                        : "Tagihan Terlambat"
                    }
                  </span>
                )}
                <span className="text-slate-400">
                  (Ditemukan {filteredAndSortedPelanggan.length} data)
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
          <PelangganTable
            pelangganList={paginatedPelanggan}
            userRole={serverProfile.peran}
            onEdit={handleOpenEdit}
            startIndex={(currentPage - 1) * pageSize}
            sortField={sortField}
            sortDirection={sortDirection}
            onSort={handleSort}
          />

          {/* Table Footer with True Pagination */}
          <div className="border-t border-slate-200 bg-slate-50/80 px-6 py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-slate-600">
            <div>
              Menampilkan{" "}
              <strong>
                {filteredAndSortedPelanggan.length === 0
                  ? 0
                  : (currentPage - 1) * pageSize + 1}
              </strong>
              –
              <strong>
                {Math.min(currentPage * pageSize, filteredAndSortedPelanggan.length)}
              </strong>{" "}
              dari <strong>{filteredAndSortedPelanggan.length}</strong> pelanggan
              {filteredAndSortedPelanggan.length !== totalCount && (
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

      {/* Modal Form Tambah / Edit Pelanggan */}
      <PelangganModalForm
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        userRole={serverProfile.peran}
        pelangganToEdit={selectedPelanggan}
        onSuccess={handleFormSuccess}
      />
    </AppLayout>
  );
}
