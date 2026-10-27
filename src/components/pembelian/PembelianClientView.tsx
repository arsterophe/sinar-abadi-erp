"use client";

import React, { useState, useMemo } from "react";
import {
  Truck,
  ShoppingCart,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  PackageCheck,
  Building2,
  Phone,
  MapPin,
  Plus,
  Eye,
  CheckCircle,
  XCircle,
  X,
  AlertCircle,
  ChevronRight,
  ChevronLeft,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RotateCcw,
} from "lucide-react";
import {
  PembelianItem,
  PemasokItem,
  PembelianFilterStatus,
  canCreatePembelian,
  canReceivePembelian,
  canCancelPembelian,
} from "@/types/pembelian";
import { formatRupiah } from "@/types/barang";
import { DbUserRole } from "@/types/auth";
import BuatPembelianModal from "./BuatPembelianModal";
import SetujuiPembelianModal from "./SetujuiPembelianModal";
import TolakPembelianModal from "./TolakPembelianModal";
import TerimaBarangModal from "./TerimaBarangModal";
import DetailPembelianModal from "./DetailPembelianModal";
import { batalkanPembelianAction } from "@/app/pembelian/actions";

interface BarangOption {
  id: string;
  kode: string;
  nama: string;
  satuan: string;
  stok: number;
}

interface PembelianClientViewProps {
  initialPembelian: PembelianItem[];
  pemasokList: PemasokItem[];
  barangList: BarangOption[];
  userRole: DbUserRole;
  currentUserId: string;
}

export default function PembelianClientView({
  initialPembelian,
  pemasokList,
  barangList,
  userRole,
  currentUserId,
}: PembelianClientViewProps) {
  // State Data
  const [pembelianList, setPembelianList] = useState<PembelianItem[]>(initialPembelian);
  const [activeTab, setActiveTab] = useState<"pembelian" | "pemasok">("pembelian");

  // State Filter & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<PembelianFilterStatus>("semua");

  // State Pengurutan (Sorting) & Paginasi (Pagination)
  const [sortField, setSortField] = useState<"nomor" | "pemasok" | "barang" | "jumlah" | "harga" | "status">("nomor");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 10;

  const handleSort = (field: "nomor" | "pemasok" | "barang" | "jumlah" | "harga" | "status") => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
    setCurrentPage(1);
  };

  const handleResetFilters = () => {
    setSearchQuery("");
    setStatusFilter("semua");
    setCurrentPage(1);
  };

  const isFilterActive = searchQuery.trim() !== "" || statusFilter !== "semua";

  // State Modals
  const [isBuatModalOpen, setIsBuatModalOpen] = useState(false);
  const [selectedPOForDetail, setSelectedPOForDetail] = useState<PembelianItem | null>(null);
  const [selectedPOForSetujui, setSelectedPOForSetujui] = useState<PembelianItem | null>(null);
  const [selectedPOForTolak, setSelectedPOForTolak] = useState<PembelianItem | null>(null);
  const [selectedPOForTerima, setSelectedPOForTerima] = useState<PembelianItem | null>(null);

  // State Notification Alert
  const [alertSuccess, setAlertSuccess] = useState<string | null>(null);
  const [alertError, setAlertError] = useState<string | null>(null);
  const [batalLoadingId, setBatalLoadingId] = useState<string | null>(null);

  const isManajer = userRole === "manajer";

  // KPI Calculations
  const metrics = useMemo(() => {
    let diajukan = 0;
    let disetujui = 0;
    let diterima = 0;
    let totalNilaiSelesai = 0;

    pembelianList.forEach((po) => {
      if (po.status === "diajukan") diajukan++;
      else if (po.status === "disetujui") disetujui++;
      else if (po.status === "diterima") {
        diterima++;
        if (po.harga_beli_satuan && po.jumlah_diterima) {
          totalNilaiSelesai += po.harga_beli_satuan * po.jumlah_diterima;
        }
      }
    });

    return {
      total: pembelianList.length,
      diajukan,
      disetujui,
      diterima,
      totalNilaiSelesai,
    };
  }, [pembelianList]);

  // Filtered & Sorted List
  const filteredAndSortedPembelian = useMemo(() => {
    const list = pembelianList.filter((po) => {
      // 1. Status Filter
      if (statusFilter !== "semua" && po.status !== statusFilter) {
        return false;
      }

      // 2. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const no = po.nomor.toLowerCase();
        const pemNama = (po.pemasok?.nama || "").toLowerCase();
        const brgNama = (po.barang?.nama || "").toLowerCase();
        const brgKode = (po.barang?.kode || "").toLowerCase();

        if (
          !no.includes(q) &&
          !pemNama.includes(q) &&
          !brgNama.includes(q) &&
          !brgKode.includes(q)
        ) {
          return false;
        }
      }

      return true;
    });

    list.sort((a, b) => {
      let comparison = 0;
      if (sortField === "nomor") {
        comparison = (a.diajukan_pada || "").localeCompare(b.diajukan_pada || "");
      } else if (sortField === "pemasok") {
        comparison = (a.pemasok?.nama || "").localeCompare(b.pemasok?.nama || "");
      } else if (sortField === "barang") {
        comparison = (a.barang?.nama || "").localeCompare(b.barang?.nama || "");
      } else if (sortField === "jumlah") {
        comparison = a.jumlah_dipesan - b.jumlah_dipesan;
      } else if (sortField === "harga") {
        const hA = a.harga_beli_satuan || 0;
        const hB = b.harga_beli_satuan || 0;
        comparison = hA - hB;
      } else if (sortField === "status") {
        comparison = a.status.localeCompare(b.status);
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });

    return list;
  }, [pembelianList, statusFilter, searchQuery, sortField, sortDirection]);

  // Pagination Sejati (True Pagination)
  const totalPages = Math.max(1, Math.ceil(filteredAndSortedPembelian.length / pageSize));
  const paginatedPembelian = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAndSortedPembelian.slice(start, start + pageSize);
  }, [filteredAndSortedPembelian, currentPage, pageSize]);

  // Helper status badge UI
  const renderStatusBadge = (status: string) => {
    switch (status) {
      case "diajukan":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-700 border border-amber-200">
            <Clock className="h-3 w-3" />
            Diajukan
          </span>
        );
      case "disetujui":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700 border border-blue-200">
            <CheckCircle2 className="h-3 w-3" />
            Disetujui
          </span>
        );
      case "diterima":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700 border border-emerald-200">
            <PackageCheck className="h-3 w-3" />
            Diterima
          </span>
        );
      case "ditolak":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-bold text-rose-700 border border-rose-200">
            <XCircle className="h-3 w-3" />
            Ditolak
          </span>
        );
      case "dibatalkan":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-600 border border-slate-300">
            <X className="h-3 w-3" />
            Dibatalkan
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
            {status}
          </span>
        );
    }
  };

  const formatTanggalWIB = (dateString: string | null | undefined) => {
    if (!dateString) return "-";
    try {
      const d = new Date(dateString);
      return d.toLocaleDateString("id-ID", {
        timeZone: "Asia/Jakarta",
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return dateString;
    }
  };

  // Handlers untuk hasil modal
  const handleSuccessBuatPO = (data: { id: string; nomor: string }) => {
    setAlertSuccess(`Pengajuan pembelian baru ${data.nomor} berhasil dibuat dan dikirim ke Manajer.`);
    setAlertError(null);
    // Refresh otomatis via Next.js router atau update state lokal
    setTimeout(() => {
      window.location.reload();
    }, 1200);
  };

  const handleSuccessSetujui = (pembelianId: string, hargaBeliSatuan: number) => {
    setPembelianList((prev) =>
      prev.map((item) =>
        item.id === pembelianId
          ? {
              ...item,
              status: "disetujui",
              harga_beli_satuan: hargaBeliSatuan,
              diputuskan_pada: new Date().toISOString(),
            }
          : item
      )
    );
    setAlertSuccess("Pengajuan pembelian berhasil disetujui. Gudang kini siap menerima kedatangan fisik barang.");
    setAlertError(null);
  };

  const handleSuccessTolak = (pembelianId: string, alasanTolak: string) => {
    setPembelianList((prev) =>
      prev.map((item) =>
        item.id === pembelianId
          ? {
              ...item,
              status: "ditolak",
              alasan_tolak: alasanTolak,
              diputuskan_pada: new Date().toISOString(),
            }
          : item
      )
    );
    setAlertSuccess("Pengajuan pembelian berhasil ditolak dan dicatat ke audit log.");
    setAlertError(null);
  };

  const handleSuccessTerima = (data: {
    id: string;
    nomor: string;
    stok_sebelum: number;
    stok_sesudah: number;
    jumlah_diterima: number;
  }) => {
    setPembelianList((prev) =>
      prev.map((item) =>
        item.id === data.id
          ? {
              ...item,
              status: "diterima",
              jumlah_diterima: data.jumlah_diterima,
              diterima_pada: new Date().toISOString(),
            }
          : item
      )
    );
    setAlertSuccess(
      `Penerimaan barang PO ${data.nomor} berhasil dicatat! Saldo stok bertambah ${data.jumlah_diterima} unit (dari ${data.stok_sebelum} menjadi ${data.stok_sesudah}).`
    );
    setAlertError(null);
  };

  const handleBatalkanPO = async (po: PembelianItem) => {
    if (
      !confirm(
        `Apakah Anda yakin ingin membatalkan transaksi pembelian ${po.nomor}? Tindakan ini tidak dapat diurungkan.`
      )
    ) {
      return;
    }

    setBatalLoadingId(po.id);
    setAlertError(null);

    try {
      const res = await batalkanPembelianAction({ pembelian_id: po.id });
      if (!res.success) {
        setAlertError(res.error || "Gagal membatalkan pembelian.");
        setBatalLoadingId(null);
        return;
      }

      setPembelianList((prev) =>
        prev.map((item) =>
          item.id === po.id
            ? {
                ...item,
                status: "dibatalkan",
                diputuskan_pada: new Date().toISOString(),
              }
            : item
        )
      );
      setAlertSuccess(`Pembelian ${po.nomor} berhasil dibatalkan.`);
    } catch (err) {
      setAlertError(
        err instanceof Error ? err.message : "Terjadi kesalahan koneksi saat membatalkan PO."
      );
    } finally {
      setBatalLoadingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Alert Notifikasi Sukses */}
      {alertSuccess && (
        <div className="flex items-start justify-between rounded-2xl bg-emerald-50 border border-emerald-200 p-4 text-xs text-emerald-800 shadow-sm animate-fade-in">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
            <p className="font-semibold text-sm leading-relaxed">{alertSuccess}</p>
          </div>
          <button
            onClick={() => setAlertSuccess(null)}
            className="text-emerald-600 hover:text-emerald-900 p-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Alert Notifikasi Error */}
      {alertError && (
        <div className="flex items-start justify-between rounded-2xl bg-rose-50 border border-rose-200 p-4 text-xs text-rose-800 shadow-sm animate-fade-in">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
            <p className="font-semibold text-sm leading-relaxed">{alertError}</p>
          </div>
          <button
            onClick={() => setAlertError(null)}
            className="text-rose-600 hover:text-rose-900 p-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Header Halaman Banner & Tombol Aksi */}
      <div className="rounded-xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600 border border-blue-100 shrink-0">
              <ShoppingCart className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
                  Pengadaan &amp; Pembelian (PO)
                </h1>
                <span className="rounded-full bg-blue-50 border border-blue-200/60 px-2.5 py-0.5 text-[11px] font-bold text-blue-700">
                  {isManajer ? "Akses Manajer" : "Akses Gudang"}
                </span>
              </div>
              <p className="mt-1 text-xs sm:text-sm text-slate-500 max-w-2xl">
                Kelola pengajuan pembelian barang ke pemasok resmi, persetujuan harga beli satuan, dan pencatatan penerimaan fisik gudang.
              </p>
            </div>
          </div>

          {canCreatePembelian(userRole) && (
            <button
              onClick={() => setIsBuatModalOpen(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm shadow-blue-500/20 hover:bg-blue-500 transition-all cursor-pointer shrink-0"
            >
              <Plus className="h-4 w-4" />
              <span>Buat Pengajuan PO</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        {/* Card 1: Total Pengajuan */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Total Transaksi PO
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <ShoppingCart className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-extrabold text-slate-900">
            {metrics.total}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Pengajuan tercatat pada sistem
          </p>
        </div>

        {/* Card 2: Menunggu Persetujuan */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-700">
              Menunggu Approval
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-extrabold text-slate-900">
            {metrics.diajukan}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Status diajukan menanti Manajer
          </p>
        </div>

        {/* Card 3: Menunggu Barang */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-700">
              Menunggu Kedatangan
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <Truck className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-extrabold text-slate-900">
            {metrics.disetujui}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            PO disetujui, belum diterima fisik
          </p>
        </div>

        {/* Card 4: Selesai Diterima */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">
              Selesai Diterima
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <PackageCheck className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-extrabold text-slate-900">
            {metrics.diterima}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {isManajer
              ? `Realisasi: ${formatRupiah(metrics.totalNilaiSelesai)}`
              : "Stok fisik telah masuk gudang"}
          </p>
        </div>
      </div>

      {/* Tab Switcher: Daftar Pembelian vs Data Mitra Pemasok */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab("pembelian")}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-bold border-b-2 transition-all ${
            activeTab === "pembelian"
              ? "border-blue-600 text-blue-600 bg-blue-50/50 rounded-t-xl"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <ShoppingCart className="h-4 w-4" />
          <span>Daftar Transaksi Pembelian</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
            {pembelianList.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("pemasok")}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-bold border-b-2 transition-all ${
            activeTab === "pemasok"
              ? "border-blue-600 text-blue-600 bg-blue-50/50 rounded-t-xl"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Building2 className="h-4 w-4" />
          <span>Data Mitra Pemasok</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
            {pemasokList.length}
          </span>
        </button>
      </div>

      {/* CONTENT TAB 1: DAFTAR PEMBELIAN */}
      {activeTab === "pembelian" && (
        <div className="space-y-4">
          {/* Filter Bar & Search */}
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              {/* Search Input */}
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="Cari nomor PO, pemasok, atau nama barang..."
                  className="w-full rounded-xl border border-slate-300 pl-10 pr-8 py-2 text-xs font-medium text-slate-900 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-hidden"
                />
                {searchQuery && (
                  <button
                    onClick={() => {
                      setSearchQuery("");
                      setCurrentPage(1);
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Status Pills Filter */}
              <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                <span className="text-xs font-semibold text-slate-400 mr-1 flex items-center gap-1">
                  <Filter className="h-3 w-3" /> Status:
                </span>
                {(
                  [
                    "semua",
                    "diajukan",
                    "disetujui",
                    "diterima",
                    "ditolak",
                    "dibatalkan",
                  ] as PembelianFilterStatus[]
                ).map((status) => {
                  const isActive = statusFilter === status;
                  return (
                    <button
                      key={status}
                      onClick={() => {
                        setStatusFilter(status);
                        setCurrentPage(1);
                      }}
                      className={`rounded-lg px-3 py-1 text-xs font-semibold capitalize transition-colors cursor-pointer ${
                        isActive
                          ? "bg-slate-900 text-white shadow-xs"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {status}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Indikator Filter Aktif */}
            {isFilterActive && (
              <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2.5">
                <span className="text-[11px] font-semibold text-slate-500 mr-1">Filter Aktif:</span>
                {searchQuery && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 border border-blue-200">
                    Cari: &ldquo;{searchQuery}&rdquo;
                    <button
                      onClick={() => {
                        setSearchQuery("");
                        setCurrentPage(1);
                      }}
                      className="hover:text-blue-900 cursor-pointer"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}
                {statusFilter !== "semua" && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 border border-blue-200">
                    Status: {statusFilter}
                    <button
                      onClick={() => {
                        setStatusFilter("semua");
                        setCurrentPage(1);
                      }}
                      className="hover:text-blue-900 cursor-pointer"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}
                <button
                  onClick={handleResetFilters}
                  className="text-[11px] font-semibold text-rose-600 hover:text-rose-800 ml-1.5 cursor-pointer underline underline-offset-2"
                >
                  Reset Semua Filter
                </button>
              </div>
            )}
          </div>

          {/* Tabel Pembelian */}
          <div className="rounded-xl border border-slate-200/90 bg-white shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-100/90 text-[11px] font-semibold uppercase tracking-wider text-slate-700 border-b border-slate-200">
                  <tr>
                    <th className="px-5 py-3.5">
                      <button
                        type="button"
                        onClick={() => handleSort("nomor")}
                        className="inline-flex items-center gap-1.5 font-semibold text-slate-700 hover:text-blue-600 transition-colors cursor-pointer"
                      >
                        <span>Nomor PO &amp; Tanggal</span>
                        {sortField === "nomor" ? (
                          sortDirection === "asc" ? (
                            <ArrowUp className="h-3.5 w-3.5 text-blue-600" />
                          ) : (
                            <ArrowDown className="h-3.5 w-3.5 text-blue-600" />
                          )
                        ) : (
                          <ArrowUpDown className="h-3 w-3 text-slate-400" />
                        )}
                      </button>
                    </th>
                    <th className="px-5 py-3.5">
                      <button
                        type="button"
                        onClick={() => handleSort("pemasok")}
                        className="inline-flex items-center gap-1.5 font-semibold text-slate-700 hover:text-blue-600 transition-colors cursor-pointer"
                      >
                        <span>Mitra Pemasok</span>
                        {sortField === "pemasok" ? (
                          sortDirection === "asc" ? (
                            <ArrowUp className="h-3.5 w-3.5 text-blue-600" />
                          ) : (
                            <ArrowDown className="h-3.5 w-3.5 text-blue-600" />
                          )
                        ) : (
                          <ArrowUpDown className="h-3 w-3 text-slate-400" />
                        )}
                      </button>
                    </th>
                    <th className="px-5 py-3.5">
                      <button
                        type="button"
                        onClick={() => handleSort("barang")}
                        className="inline-flex items-center gap-1.5 font-semibold text-slate-700 hover:text-blue-600 transition-colors cursor-pointer"
                      >
                        <span>Barang Dipesan</span>
                        {sortField === "barang" ? (
                          sortDirection === "asc" ? (
                            <ArrowUp className="h-3.5 w-3.5 text-blue-600" />
                          ) : (
                            <ArrowDown className="h-3.5 w-3.5 text-blue-600" />
                          )
                        ) : (
                          <ArrowUpDown className="h-3 w-3 text-slate-400" />
                        )}
                      </button>
                    </th>
                    <th className="px-5 py-3.5 text-center">
                      <button
                        type="button"
                        onClick={() => handleSort("jumlah")}
                        className="inline-flex items-center gap-1.5 font-semibold text-slate-700 hover:text-blue-600 transition-colors cursor-pointer"
                      >
                        <span>Kuantitas</span>
                        {sortField === "jumlah" ? (
                          sortDirection === "asc" ? (
                            <ArrowUp className="h-3.5 w-3.5 text-blue-600" />
                          ) : (
                            <ArrowDown className="h-3.5 w-3.5 text-blue-600" />
                          )
                        ) : (
                          <ArrowUpDown className="h-3 w-3 text-slate-400" />
                        )}
                      </button>
                    </th>
                    {isManajer && (
                      <th className="px-5 py-3.5 text-right">
                        <button
                          type="button"
                          onClick={() => handleSort("harga")}
                          className="inline-flex items-center gap-1.5 font-semibold text-slate-700 hover:text-blue-600 transition-colors cursor-pointer ml-auto"
                        >
                          <span>Harga Satuan &amp; Total (BR-12)</span>
                          {sortField === "harga" ? (
                            sortDirection === "asc" ? (
                              <ArrowUp className="h-3.5 w-3.5 text-blue-600" />
                            ) : (
                              <ArrowDown className="h-3.5 w-3.5 text-blue-600" />
                            )
                          ) : (
                            <ArrowUpDown className="h-3 w-3 text-slate-400" />
                          )}
                        </button>
                      </th>
                    )}
                    <th className="px-5 py-3.5 text-center">
                      <button
                        type="button"
                        onClick={() => handleSort("status")}
                        className="inline-flex items-center gap-1.5 font-semibold text-slate-700 hover:text-blue-600 transition-colors cursor-pointer"
                      >
                        <span>Status</span>
                        {sortField === "status" ? (
                          sortDirection === "asc" ? (
                            <ArrowUp className="h-3.5 w-3.5 text-blue-600" />
                          ) : (
                            <ArrowDown className="h-3.5 w-3.5 text-blue-600" />
                          )
                        ) : (
                          <ArrowUpDown className="h-3 w-3 text-slate-400" />
                        )}
                      </button>
                    </th>
                    <th className="px-5 py-3.5 text-right text-slate-700">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {filteredAndSortedPembelian.length === 0 ? (
                    <tr>
                      <td
                        colSpan={isManajer ? 7 : 6}
                        className="py-12 text-center text-slate-400"
                      >
                        <div className="flex flex-col items-center justify-center">
                          <ShoppingCart className="h-10 w-10 text-slate-300 mb-2" />
                          <p className="font-semibold text-slate-700">
                            Tidak ada transaksi pembelian yang cocok
                          </p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            Coba sesuaikan kata kunci pencarian atau filter status transaksi.
                          </p>
                          {isFilterActive && (
                            <button
                              onClick={handleResetFilters}
                              className="mt-3 inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                            >
                              <RotateCcw className="h-3 w-3" />
                              <span>Reset Semua Filter</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    paginatedPembelian.map((po) => {
                      const isCreator = po.diajukan_oleh === currentUserId;
                      const canApprove = po.status === "diajukan" && isManajer;
                      const canReceive =
                        po.status === "disetujui" &&
                        canReceivePembelian(userRole);
                      const canCancel = canCancelPembelian(
                        userRole,
                        isCreator,
                        po.status
                      );

                      const totalPO =
                        po.harga_beli_satuan && po.harga_beli_satuan > 0
                          ? po.harga_beli_satuan * (po.jumlah_diterima || po.jumlah_dipesan)
                          : null;

                      return (
                        <tr
                          key={po.id}
                          className="hover:bg-slate-50/80 transition-colors"
                        >
                          {/* 1. Nomor PO & Tanggal */}
                          <td className="px-5 py-4">
                            <span className="font-bold text-slate-900 block font-mono">
                              {po.nomor}
                            </span>
                            <span className="text-[11px] text-slate-400 block mt-0.5">
                              {formatTanggalWIB(po.diajukan_pada)}
                            </span>
                          </td>

                          {/* 2. Pemasok */}
                          <td className="px-5 py-4">
                            <span className="font-bold text-slate-800 block">
                              {po.pemasok?.nama || "Pemasok"}
                            </span>
                            <span className="text-[11px] text-slate-400 font-mono">
                              {po.pemasok?.kode || "-"}
                            </span>
                          </td>

                          {/* 3. Barang */}
                          <td className="px-5 py-4">
                            <span className="font-semibold text-slate-800 block">
                              {po.barang?.nama || "Barang"}
                            </span>
                            <span className="text-[11px] text-slate-400 font-mono">
                              {po.barang?.kode || "-"}
                            </span>
                          </td>

                          {/* 4. Kuantitas */}
                          <td className="px-5 py-4 text-center">
                            <div className="inline-block text-center">
                              <span className="font-bold text-slate-900">
                                {po.jumlah_dipesan} {po.barang?.satuan}
                              </span>
                              {po.jumlah_diterima !== null && (
                                <span className="block text-[11px] text-emerald-600 font-semibold">
                                  Diterima: {po.jumlah_diterima} {po.barang?.satuan}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* 5. Harga Beli & Total (Khusus Manajer BR-12) */}
                          {isManajer && (
                            <td className="px-5 py-4 text-right">
                              {po.harga_beli_satuan ? (
                                <>
                                  <span className="font-bold text-slate-900 block">
                                    {formatRupiah(totalPO)}
                                  </span>
                                  <span className="text-[11px] text-slate-500 block">
                                    @ {formatRupiah(po.harga_beli_satuan)}
                                  </span>
                                </>
                              ) : (
                                <span className="text-[11px] text-slate-400 italic">
                                  Menunggu Persetujuan
                                </span>
                              )}
                            </td>
                          )}

                          {/* 6. Status Badge */}
                          <td className="px-5 py-4 text-center">
                            {renderStatusBadge(po.status)}
                          </td>

                          {/* 7. Action Buttons */}
                          <td className="px-5 py-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Detail Button */}
                              <button
                                onClick={() => setSelectedPOForDetail(po)}
                                title="Lihat Detail Transaksi"
                                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer"
                              >
                                <Eye className="h-4 w-4" />
                              </button>

                              {/* Tombol Setujui & Tolak (Manajer) */}
                              {canApprove && (
                                <>
                                  <button
                                    onClick={() => setSelectedPOForSetujui(po)}
                                    title="Setujui Pembelian & Tetapkan Harga Beli (BR-09)"
                                    className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-emerald-700 transition-colors shadow-xs cursor-pointer"
                                  >
                                    <CheckCircle className="h-3.5 w-3.5" />
                                    <span>Setujui</span>
                                  </button>
                                  <button
                                    onClick={() => setSelectedPOForTolak(po)}
                                    title="Tolak Pengajuan (BR-09)"
                                    className="rounded-lg border border-rose-200 bg-rose-50 p-1.5 text-rose-700 hover:bg-rose-100 transition-colors cursor-pointer"
                                  >
                                    <XCircle className="h-3.5 w-3.5" />
                                  </button>
                                </>
                              )}

                              {/* Tombol Terima Barang (Gudang / Manajer) */}
                              {canReceive && (
                                <button
                                  onClick={() => setSelectedPOForTerima(po)}
                                  title="Catat Kedatangan Fisik Barang (BR-10, BR-11)"
                                  className="flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-blue-700 transition-colors shadow-xs cursor-pointer"
                                >
                                  <PackageCheck className="h-3.5 w-3.5" />
                                  <span>Terima Barang</span>
                                </button>
                              )}

                              {/* Tombol Batal */}
                              {canCancel && po.status !== "dibatalkan" && po.status !== "diterima" && (
                                <button
                                  disabled={batalLoadingId === po.id}
                                  onClick={() => handleBatalkanPO(po)}
                                  title="Batalkan Pengajuan Pembelian"
                                  className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition-colors disabled:opacity-50 cursor-pointer"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Table Footer dengan Paginasi Sejati */}
            <div className="border-t border-slate-200/80 bg-slate-50/50 px-5 py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-slate-500">
              <div>
                {filteredAndSortedPembelian.length === 0 ? (
                  <span>Menampilkan 0 transaksi</span>
                ) : (
                  <span>
                    Menampilkan{" "}
                    <strong>{(currentPage - 1) * pageSize + 1}</strong>
                    {" - "}
                    <strong>
                      {Math.min(currentPage * pageSize, filteredAndSortedPembelian.length)}
                    </strong>{" "}
                    dari <strong>{filteredAndSortedPembelian.length}</strong> transaksi pembelian
                    {filteredAndSortedPembelian.length !== pembelianList.length && (
                      <span className="text-slate-400"> (total {pembelianList.length})</span>
                    )}
                  </span>
                )}
              </div>

              {/* Tombol Paginasi */}
              {totalPages > 1 && (
                <div className="flex items-center gap-1.5 self-center sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Sebelumnya</span>
                  </button>

                  <div className="flex items-center gap-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                      if (
                        page === 1 ||
                        page === totalPages ||
                        (page >= currentPage - 1 && page <= currentPage + 1)
                      ) {
                        return (
                          <button
                            key={page}
                            type="button"
                            onClick={() => setCurrentPage(page)}
                            className={`min-w-[32px] h-8 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                              currentPage === page
                                ? "bg-blue-600 text-white shadow-2xs"
                                : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                            }`}
                          >
                            {page}
                          </button>
                        );
                      }
                      if (page === currentPage - 2 || page === currentPage + 2) {
                        return (
                          <span key={page} className="px-1 text-slate-400">
                            ...
                          </span>
                        );
                      }
                      return null;
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span className="hidden sm:inline">Selanjutnya</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CONTENT TAB 2: DATA MITRA PEMASOK (PRD Bab 7) */}
      {activeTab === "pemasok" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Katalog Mitra Pemasok Resmi
                </h3>
                <p className="text-xs text-slate-500">
                  Daftar penyedia barang kebutuhan toko kelontong rekanan CV Sinar Abadi Niaga (PRD Bab 1 &amp; Bab 7).
                </p>
              </div>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700 border border-blue-200">
                {pemasokList.length} Pemasok Terdaftar
              </span>
            </div>

            {/* Grid Kartu Pemasok */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {pemasokList.map((pemasok) => (
                <div
                  key={pemasok.id}
                  className="rounded-xl border border-slate-200/80 p-4 bg-slate-50/40 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700 font-bold text-xs ring-1 ring-blue-200">
                        {pemasok.kode}
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900">
                          {pemasok.nama}
                        </h4>
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.2 rounded-full border border-emerald-200 mt-0.5">
                          {pemasok.aktif ? "Mitra Aktif" : "Nonaktif"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 space-y-1.5 text-xs text-slate-600 border-t border-slate-200/60 pt-3">
                    <div className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span className="font-medium text-slate-800">
                        {pemasok.telepon || "Tidak ada telepon"}
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                      <span className="leading-relaxed">
                        {pemasok.alamat || "Alamat belum tercatat"}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: Buat Pengajuan PO */}
      <BuatPembelianModal
        isOpen={isBuatModalOpen}
        onClose={() => setIsBuatModalOpen(false)}
        pemasokList={pemasokList}
        barangList={barangList}
        userRole={userRole}
        onSuccess={handleSuccessBuatPO}
      />

      {/* MODAL 2: Setujui PO (Manajer) */}
      <SetujuiPembelianModal
        isOpen={Boolean(selectedPOForSetujui)}
        onClose={() => setSelectedPOForSetujui(null)}
        pembelian={selectedPOForSetujui}
        onSuccess={handleSuccessSetujui}
      />

      {/* MODAL 3: Tolak PO (Manajer) */}
      <TolakPembelianModal
        isOpen={Boolean(selectedPOForTolak)}
        onClose={() => setSelectedPOForTolak(null)}
        pembelian={selectedPOForTolak}
        onSuccess={handleSuccessTolak}
      />

      {/* MODAL 4: Terima Barang PO (Gudang & Manajer) */}
      <TerimaBarangModal
        isOpen={Boolean(selectedPOForTerima)}
        onClose={() => setSelectedPOForTerima(null)}
        pembelian={selectedPOForTerima}
        onSuccess={handleSuccessTerima}
      />

      {/* MODAL 5: Detail PO */}
      <DetailPembelianModal
        isOpen={Boolean(selectedPOForDetail)}
        onClose={() => setSelectedPOForDetail(null)}
        pembelian={selectedPOForDetail}
        userRole={userRole}
        currentUserId={currentUserId}
        onOpenSetujui={(p) => setSelectedPOForSetujui(p)}
        onOpenTolak={(p) => setSelectedPOForTolak(p)}
        onOpenTerima={(p) => setSelectedPOForTerima(p)}
        onOpenBatal={(p) => handleBatalkanPO(p)}
      />
    </div>
  );
}
