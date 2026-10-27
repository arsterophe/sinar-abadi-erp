"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  X,
  FileText,
  Package,
  ArrowUpRight,
  ArrowDownLeft,
  RotateCcw,
  SlidersHorizontal,
  Clock,
  Search,
  RefreshCw,
  AlertCircle,
  Loader2,
  UserCheck,
  ChevronLeft,
  ChevronRight,
  Calendar,
} from "lucide-react";
import { BarangItem, MutasiStokItem, JenisMutasiStok } from "@/types/barang";
import { ambilKartuStokAction } from "@/app/barang-dan-stok/actions";

interface KartuStokModalProps {
  isOpen: boolean;
  onClose: () => void;
  barang: BarangItem | null;
}

export default function KartuStokModal({
  isOpen,
  onClose,
  barang,
}: KartuStokModalProps) {
  const [mutasiList, setMutasiList] = useState<MutasiStokItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [filterJenis, setFilterJenis] = useState<string>("semua");
  const [searchQuery, setSearchQuery] = useState("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 10;

  const refreshKartuStok = async () => {
    if (!barang?.id) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await ambilKartuStokAction(barang.id);
      if (!res.success) {
        setErrorMessage(res.error || "Gagal memuat kartu stok.");
        setMutasiList([]);
      } else {
        setMutasiList(res.data || []);
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Terjadi kendala saat memuat riwayat mutasi stok."
      );
      setMutasiList([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let ignore = false;
    const currentBarangId = barang?.id;

    if (isOpen && currentBarangId) {
      ambilKartuStokAction(currentBarangId)
        .then((res) => {
          if (!ignore) {
            if (!res.success) {
              setErrorMessage(res.error || "Gagal memuat kartu stok.");
              setMutasiList([]);
            } else {
              setMutasiList(res.data || []);
            }
            setIsLoading(false);
          }
        })
        .catch((err) => {
          if (!ignore) {
            setErrorMessage(
              err instanceof Error ? err.message : "Terjadi kendala saat memuat riwayat mutasi stok."
            );
            setMutasiList([]);
            setIsLoading(false);
          }
        });
    }

    return () => {
      ignore = true;
    };
  }, [isOpen, barang?.id]);

  // Status validasi rentang tanggal
  const isDateRangeInvalid = Boolean(
    startDate && endDate && startDate > endDate
  );

  // Status apakah filter aktif
  const isFilterActive =
    searchQuery.trim() !== "" ||
    filterJenis !== "semua" ||
    startDate !== "" ||
    endDate !== "";

  // Filter mutasi
  const filteredMutasi = useMemo(() => {
    // Jika rentang tanggal tidak valid, jangan tampilkan data yang seolah-olah valid (Instruksi 6)
    if (isDateRangeInvalid) {
      return [];
    }

    return mutasiList.filter((m) => {
      // 1. Filter jenis
      if (filterJenis !== "semua" && m.jenis !== filterJenis) {
        return false;
      }

      // 2. Filter rentang tanggal (Inklusif berdasarkan waktu lokal pengguna)
      if (startDate || endDate) {
        const itemTime = m.dibuat_pada ? new Date(m.dibuat_pada).getTime() : NaN;
        if (!isNaN(itemTime)) {
          if (startDate) {
            const startTime = new Date(`${startDate}T00:00:00`).getTime();
            if (!isNaN(startTime) && itemTime < startTime) {
              return false;
            }
          }
          if (endDate) {
            const endTime = new Date(`${endDate}T23:59:59.999`).getTime();
            if (!isNaN(endTime) && itemTime > endTime) {
              return false;
            }
          }
        }
      }

      // 3. Pencarian teks
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchDoc = (m.nomor_dokumen || "").toLowerCase().includes(q);
        const matchAlasan = (m.alasan || "").toLowerCase().includes(q);
        const matchPelaku = (m.pelaku_nama || "").toLowerCase().includes(q);
        return matchDoc || matchAlasan || matchPelaku;
      }
      return true;
    });
  }, [mutasiList, filterJenis, startDate, endDate, isDateRangeInvalid, searchQuery]);

  // Hitung total halaman dan safePage
  const totalPages = Math.max(1, Math.ceil(filteredMutasi.length / pageSize));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);

  // Sesuaikan currentPage jika jumlah hasil berkurang sehingga currentPage melebihi totalPages (Instruksi 9)
  if (currentPage > totalPages) {
    setCurrentPage(totalPages);
  }

  // Handler filter dan pencarian yang otomatis mereset currentPage ke 1 (Instruksi 7 & 8)
  const handleFilterJenis = (jenis: string) => {
    setFilterJenis(jenis);
    setCurrentPage(1);
  };

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    setCurrentPage(1);
  };

  const handleStartDateChange = (val: string) => {
    setStartDate(val);
    setCurrentPage(1);
  };

  const handleEndDateChange = (val: string) => {
    setEndDate(val);
    setCurrentPage(1);
  };

  const handleResetFilters = () => {
    setFilterJenis("semua");
    setSearchQuery("");
    setStartDate("");
    setEndDate("");
    setCurrentPage(1);
  };

  // Potong data mutasi untuk halaman aktif (Instruksi 2)
  const paginatedMutasi = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredMutasi.slice(start, start + pageSize);
  }, [filteredMutasi, safePage, pageSize]);

  // Hitung saldo stok terbaru dari riwayat mutasi (fallback ke barang.stok jika riwayat mutasi kosong)
  const stokTerkini = useMemo(() => {
    if (!mutasiList || mutasiList.length === 0) {
      return barang?.stok ?? 0;
    }

    // Cari mutasi paling baru berdasarkan waktu dibuat_pada secara kronologis (dengan tie-breaker id terbesar)
    const mutasiTerbaru = [...mutasiList].sort((a, b) => {
      const timeA = a.dibuat_pada ? new Date(a.dibuat_pada).getTime() : 0;
      const timeB = b.dibuat_pada ? new Date(b.dibuat_pada).getTime() : 0;
      const validTimeA = isNaN(timeA) ? 0 : timeA;
      const validTimeB = isNaN(timeB) ? 0 : timeB;

      if (validTimeA !== validTimeB) {
        return validTimeB - validTimeA;
      }
      return Number(b.id) - Number(a.id);
    })[0];

    return typeof mutasiTerbaru?.stok_sesudah === "number"
      ? mutasiTerbaru.stok_sesudah
      : (barang?.stok ?? 0);
  }, [mutasiList, barang?.stok]);

  if (!isOpen || !barang) return null;

  // Format tanggal Indonesia
  const formatTanggalWaktu = (isoString: string) => {
    if (!isoString) return "-";
    try {
      const d = new Date(isoString);
      return new Intl.DateTimeFormat("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(d);
    } catch {
      return isoString;
    }
  };

  // Badge jenis mutasi
  const renderBadgeJenis = (jenis: JenisMutasiStok) => {
    switch (jenis) {
      case "masuk":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[11px] font-semibold text-emerald-400">
            <ArrowDownLeft className="h-3 w-3" />
            <span>Masuk</span>
          </span>
        );
      case "keluar":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 border border-blue-500/30 px-2 py-0.5 text-[11px] font-semibold text-blue-300">
            <ArrowUpRight className="h-3 w-3" />
            <span>Keluar</span>
          </span>
        );
      case "batal":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/15 border border-purple-500/30 px-2 py-0.5 text-[11px] font-semibold text-purple-300">
            <RotateCcw className="h-3 w-3" />
            <span>Batal SO</span>
          </span>
        );
      case "penyesuaian":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
            <SlidersHorizontal className="h-3 w-3" />
            <span>Penyesuaian</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center rounded-full bg-slate-700 px-2 py-0.5 text-[11px] font-semibold text-slate-300">
            {jenis}
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-xs animate-fadeIn">
      <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl border border-slate-700/80 bg-[#0d162f] text-slate-100 shadow-2xl overflow-hidden">
        {/* Header Modal */}
        <div className="flex items-start justify-between border-b border-slate-800 bg-[#0b1329] px-6 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30 shrink-0">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">
                  Kartu Stok Barang
                </h2>
                <span className="rounded-md bg-blue-500/20 px-2 py-0.5 text-[11px] font-mono font-bold text-blue-300 border border-blue-500/30">
                  {barang.kode}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5 font-medium">
                {barang.nama} • Satuan: <strong className="text-white">{barang.satuan}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={refreshKartuStok}
              disabled={isLoading}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 hover:text-white transition-all disabled:opacity-50 cursor-pointer"
              title="Perbarui Data Mutasi"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`}
              />
              <span className="hidden sm:inline">Segarkan</span>
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer"
              aria-label="Tutup modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Info Box Stok Terkini */}
        <div className="border-b border-slate-800/80 bg-slate-900/60 px-6 py-3 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-slate-300">
              <Package className="h-4 w-4 text-emerald-400" />
              <span>Stok Fisik Saat Ini:</span>
              <span className="font-mono text-sm font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded-md">
                {stokTerkini} {barang.satuan}
              </span>
            </div>
            <div className="text-slate-400 text-[11px]">
              Batas Minimum: <span className="font-mono text-white">{barang.stok_minimum}</span> {barang.satuan}
            </div>
          </div>
          <div className="text-slate-400 text-[11px] flex items-center gap-1">
            <Clock className="h-3.5 w-3.5 text-slate-500" />
            <span>Total Catatan Mutasi: <strong className="text-white">{mutasiList.length}</strong></span>
          </div>
        </div>

        {/* Filter Bar & Search Controls */}
        <div className="px-6 py-3 border-b border-slate-800 bg-[#0d162f] flex flex-col gap-3 shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-900 rounded-lg border border-slate-800 text-xs">
              <button
                onClick={() => handleFilterJenis("semua")}
                className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                  filterJenis === "semua"
                    ? "bg-blue-600 text-white shadow-xs"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Semua ({mutasiList.length})
              </button>
              <button
                onClick={() => handleFilterJenis("masuk")}
                className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                  filterJenis === "masuk"
                    ? "bg-emerald-600 text-white shadow-xs"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Masuk
              </button>
              <button
                onClick={() => handleFilterJenis("keluar")}
                className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                  filterJenis === "keluar"
                    ? "bg-blue-600 text-white shadow-xs"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Keluar
              </button>
              <button
                onClick={() => handleFilterJenis("penyesuaian")}
                className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                  filterJenis === "penyesuaian"
                    ? "bg-amber-600 text-white shadow-xs"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Penyesuaian
              </button>
              <button
                onClick={() => handleFilterJenis("batal")}
                className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                  filterJenis === "batal"
                    ? "bg-purple-600 text-white shadow-xs"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Batal
              </button>
            </div>

            {/* Search Box */}
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Cari no. dokumen, alasan..."
                className="w-full rounded-lg border border-slate-700/80 bg-slate-900/90 py-1.5 pl-8 pr-3 text-xs text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all font-medium"
              />
            </div>
          </div>

          {/* Sub-bar Filter Rentang Tanggal */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-slate-800/60 text-xs">
            <div className="flex flex-wrap items-center gap-2 text-slate-300">
              <span className="flex items-center gap-1.5 text-slate-400 text-[11px] font-medium">
                <Calendar className="h-3.5 w-3.5 text-blue-400" />
                <span>Rentang Tanggal:</span>
              </span>

              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={startDate}
                  max={endDate || undefined}
                  onChange={(e) => handleStartDateChange(e.target.value)}
                  className={`rounded-lg border bg-slate-900/90 px-2.5 py-1 text-xs font-mono text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 transition-all ${
                    isDateRangeInvalid
                      ? "border-rose-500/80 focus:border-rose-500 focus:ring-rose-500 text-rose-300"
                      : "border-slate-700/80 focus:border-blue-500 focus:ring-blue-500"
                  }`}
                  aria-label="Tanggal Mulai"
                  title="Tanggal Mulai"
                />
                <span className="text-slate-500 text-xs">s/d</span>
                <input
                  type="date"
                  value={endDate}
                  min={startDate || undefined}
                  onChange={(e) => handleEndDateChange(e.target.value)}
                  className={`rounded-lg border bg-slate-900/90 px-2.5 py-1 text-xs font-mono text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 transition-all ${
                    isDateRangeInvalid
                      ? "border-rose-500/80 focus:border-rose-500 focus:ring-rose-500 text-rose-300"
                      : "border-slate-700/80 focus:border-blue-500 focus:ring-blue-500"
                  }`}
                  aria-label="Tanggal Akhir"
                  title="Tanggal Akhir"
                />
              </div>

              {(startDate || endDate) && (
                <button
                  type="button"
                  onClick={() => {
                    setStartDate("");
                    setEndDate("");
                    setCurrentPage(1);
                  }}
                  className="text-[11px] text-slate-400 hover:text-rose-300 transition-colors cursor-pointer underline underline-offset-2 ml-1"
                >
                  Hapus Tanggal
                </button>
              )}
            </div>

            {isDateRangeInvalid && (
              <span className="text-rose-400 text-[11px] font-medium flex items-center gap-1">
                <AlertCircle className="h-3.5 w-3.5" />
                <span>Tanggal mulai tidak boleh melewati tanggal akhir</span>
              </span>
            )}
          </div>
        </div>

        {/* Content Body / Scrollable Table */}
        <div className="flex-1 overflow-y-auto min-h-[250px] p-6">
          {errorMessage && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-950/50 p-4 text-xs text-rose-200 mb-4">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-bold text-rose-300">Gagal Membaca Data</h4>
                  <p className="mt-0.5 leading-relaxed">{errorMessage}</p>
                </div>
              </div>
            </div>
          )}

          {isDateRangeInvalid && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-950/50 p-4 text-xs text-rose-200 mb-4">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-bold text-rose-300">Rentang Tanggal Tidak Valid</h4>
                  <p className="mt-0.5 leading-relaxed">
                    Tanggal mulai (<strong>{startDate}</strong>) tidak boleh melewati tanggal akhir (<strong>{endDate}</strong>). Silakan sesuaikan kembali rentang tanggal untuk melihat data mutasi.
                  </p>
                </div>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="py-16 text-center space-y-3">
              <Loader2 className="h-8 w-8 animate-spin text-blue-400 mx-auto" />
              <p className="text-xs text-slate-400">
                Memuat data riwayat kartu stok dari database...
              </p>
            </div>
          ) : filteredMutasi.length > 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/80 overflow-hidden shadow-inner">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-[#0b1329] text-slate-300 border-b border-slate-800 uppercase font-semibold text-[10px] tracking-wider">
                    <tr>
                      <th scope="col" className="px-3.5 py-3 w-10 text-center">
                        No
                      </th>
                      <th scope="col" className="px-3.5 py-3 w-36">
                        Waktu
                      </th>
                      <th scope="col" className="px-3 py-3 w-28">
                        Jenis
                      </th>
                      <th scope="col" className="px-3.5 py-3 text-right w-24">
                        Perubahan
                      </th>
                      <th scope="col" className="px-3.5 py-3 text-center w-24">
                        Stok Akhir
                      </th>
                      <th scope="col" className="px-3.5 py-3 w-32">
                        No. Dokumen
                      </th>
                      <th scope="col" className="px-3.5 py-3">
                        Alasan / Keterangan
                      </th>
                      <th scope="col" className="px-3.5 py-3 w-32">
                        Dicatat Oleh
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 font-medium">
                    {paginatedMutasi.map((item, index) => {
                      const isPositive = Number(item.jumlah) > 0;
                      return (
                        <tr
                          key={item.id}
                          className="hover:bg-slate-800/50 transition-colors"
                        >
                          <td className="px-3.5 py-2.5 text-center text-slate-500 tabular-nums">
                            {(safePage - 1) * pageSize + index + 1}
                          </td>
                          <td className="px-3.5 py-2.5 whitespace-nowrap text-slate-300 font-mono text-[11px]">
                            {formatTanggalWaktu(item.dibuat_pada)}
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            {renderBadgeJenis(item.jenis)}
                          </td>
                          <td className="px-3.5 py-2.5 text-right font-mono font-bold tabular-nums">
                            <span
                              className={
                                isPositive
                                  ? "text-emerald-400"
                                  : "text-rose-400"
                              }
                            >
                              {isPositive ? `+${item.jumlah}` : item.jumlah}
                            </span>
                          </td>
                          <td className="px-3.5 py-2.5 text-center font-mono font-bold text-white tabular-nums">
                            <span className="rounded bg-slate-800 px-2 py-0.5">
                              {item.stok_sesudah}
                            </span>
                          </td>
                          <td className="px-3.5 py-2.5 font-mono text-slate-300 text-[11px] whitespace-nowrap">
                            {item.nomor_dokumen || "-"}
                          </td>
                          <td className="px-3.5 py-2.5 text-slate-300 max-w-xs break-words">
                            {item.alasan || "-"}
                          </td>
                          <td className="px-3.5 py-2.5 text-slate-400 text-[11px] whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <UserCheck className="h-3 w-3 text-slate-500 shrink-0" />
                              <span className="truncate">
                                {item.pelaku_nama || "Sistem"}
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="py-16 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-800 text-slate-400 mb-3">
                <FileText className="h-6 w-6" />
              </div>
              <h4 className="text-sm font-bold text-white">
                Belum Ada Riwayat Mutasi Stok
              </h4>
              <p className="mt-1 text-xs text-slate-400 max-w-sm mx-auto">
                {isDateRangeInvalid
                  ? "Rentang tanggal tidak valid. Mohon sesuaikan tanggal mulai dan tanggal akhir."
                  : isFilterActive
                  ? "Tidak ada mutasi yang cocok dengan filter atau pencarian Anda."
                  : "Barang ini belum memiliki catatan mutasi masuk, keluar, atau penyesuaian."}
              </p>
              {isFilterActive && (
                <button
                  onClick={handleResetFilters}
                  className="mt-3 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 transition-all cursor-pointer"
                >
                  Reset Filter
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer Modal */}
        <div className="border-t border-slate-800 bg-[#0b1329] px-6 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-slate-400 shrink-0">
          <div>
            {filteredMutasi.length === 0 ? (
              <span>Menampilkan 0 dari 0 catatan</span>
            ) : (
              <span>
                Menampilkan{" "}
                <strong className="text-white">
                  {(safePage - 1) * pageSize + 1}–
                  {Math.min(safePage * pageSize, filteredMutasi.length)}
                </strong>{" "}
                dari <strong className="text-white">{filteredMutasi.length}</strong>{" "}
                catatan
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 self-end sm:self-auto">
            {/* Navigasi Pagination */}
            <div className="flex items-center gap-1.5 bg-slate-900/80 border border-slate-800 rounded-lg p-1">
              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={safePage <= 1}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-300 transition-colors cursor-pointer disabled:cursor-not-allowed"
                aria-label="Halaman sebelumnya"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span>Previous</span>
              </button>

              <span className="px-2 text-xs font-medium text-slate-300 tabular-nums">
                Halaman <strong className="text-white">{safePage}</strong> dari{" "}
                <strong className="text-white">{totalPages}</strong>
              </span>

              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={safePage >= totalPages}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-300 transition-colors cursor-pointer disabled:cursor-not-allowed"
                aria-label="Halaman berikutnya"
              >
                <span>Next</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>

            <button
              onClick={onClose}
              className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 hover:text-white transition-all cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
