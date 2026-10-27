"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  X,
  ShoppingCart,
  Plus,
  Trash2,
  AlertTriangle,
  AlertCircle,
  Info,
  Loader2,
  CheckCircle2,
  Building2,
  Calendar,
  CreditCard,
  Phone,
  MapPin,
} from "lucide-react";
import { DbUserRole } from "@/types/auth";
import {
  BuatPesananJualInput,
  PESANAN_JUAL_LIMITS,
  getMaxDiskonByRole,
  hitungSubtotalItem,
} from "@/types/pesanan_jual";
import { formatRupiah } from "@/types/pelanggan";
import {
  buatPesananJualDrafAction,
  SimpanDrafSuccessData,
} from "@/app/pesanan-jual/actions";

export interface PelangganOption {
  id: string;
  kode: string;
  nama_toko: string;
  telepon: string;
  alamat: string;
  termin_hari: number;
  batas_kredit: number;
  aktif: boolean;
}

export interface BarangOption {
  id: string;
  kode: string;
  nama: string;
  satuan: string;
  harga_jual: number;
  stok: number;
  aktif: boolean;
}

interface FormRowItem {
  rowId: string;
  barang_id: string;
  jumlah: number | "";
  diskon_persen: number | "";
}

interface BuatPesananModalProps {
  isOpen: boolean;
  onClose: () => void;
  userRole: DbUserRole;
  pelangganList: PelangganOption[];
  barangList: BarangOption[];
  pelangganError?: string | null;
  barangError?: string | null;
  onSuccess: (data: SimpanDrafSuccessData) => void;
}

export default function BuatPesananModal({
  isOpen,
  onClose,
  userRole,
  pelangganList = [],
  barangList = [],
  pelangganError = null,
  barangError = null,
  onSuccess,
}: BuatPesananModalProps) {
  const maxDiskon = getMaxDiskonByRole(userRole);
  const isManager = userRole === "manajer";

  const [selectedPelangganId, setSelectedPelangganId] = useState<string>("");
  const [items, setItems] = useState<FormRowItem[]>([
    {
      rowId: "row-init-1",
      barang_id: "",
      jumlah: 1,
      diskon_persen: 0,
    },
  ]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Synchronous mutex lock untuk mencegah double submit
  const isSubmittingRef = useRef<boolean>(false);

  // Reset form saat modal dibuka
  useEffect(() => {
    if (isOpen) {
      setSelectedPelangganId("");
      setItems([
        {
          rowId: `row-${Date.now()}-1`,
          barang_id: "",
          jumlah: 1,
          diskon_persen: 0,
        },
      ]);
      setErrorMessage(null);
      setIsSubmitting(false);
      isSubmittingRef.current = false;
    }
  }, [isOpen]);

  // Handle Escape key & scroll lock
  useEffect(() => {
    if (!isOpen) return;

    const originalBodyOverflow = document.body.style.overflow;
    const originalHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSubmitting && !isSubmittingRef.current) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalBodyOverflow;
      document.documentElement.style.overflow = originalHtmlOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, isSubmitting, onClose]);

  // Detail pelanggan terpilih
  const selectedPelanggan = useMemo(() => {
    return pelangganList.find((p) => p.id === selectedPelangganId) || null;
  }, [pelangganList, selectedPelangganId]);

  // Tambah baris barang baru (maksimal 20 item sesuai BR-02)
  const handleAddRow = () => {
    if (items.length >= PESANAN_JUAL_LIMITS.MAX_ITEMS) {
      setErrorMessage(
        `Batas maksimal ${PESANAN_JUAL_LIMITS.MAX_ITEMS} baris barang per transaksi pesanan telah tercapai (BR-02).`
      );
      return;
    }
    setErrorMessage(null);
    setItems((prev) => [
      ...prev,
      {
        rowId: `row-${Date.now()}-${prev.length + 1}`,
        barang_id: "",
        jumlah: 1,
        diskon_persen: 0,
      },
    ]);
  };

  // Hapus baris barang (minimal 1 item sesuai BR-02)
  const handleRemoveRow = (index: number) => {
    if (items.length <= PESANAN_JUAL_LIMITS.MIN_ITEMS) {
      setErrorMessage(
        `Pesanan jual harus memiliki minimal ${PESANAN_JUAL_LIMITS.MIN_ITEMS} baris barang (BR-02).`
      );
      return;
    }
    setErrorMessage(null);
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Update data spesifik pada baris item
  const handleItemChange = (
    index: number,
    field: keyof FormRowItem,
    value: string | number
  ) => {
    setErrorMessage(null);
    setItems((prev) => {
      const next = [...prev];
      const target = { ...next[index] };

      if (field === "barang_id") {
        target.barang_id = String(value);
      } else if (field === "jumlah") {
        if (value === "") {
          target.jumlah = "";
        } else {
          const num = parseInt(String(value), 10);
          target.jumlah = isNaN(num) ? "" : Math.max(1, num);
        }
      } else if (field === "diskon_persen") {
        if (value === "") {
          target.diskon_persen = "";
        } else {
          const num = parseFloat(String(value));
          if (isNaN(num)) {
            target.diskon_persen = "";
          } else {
            // Batasi antara 0 dan maxDiskon
            const clamped = Math.max(0, Math.min(maxDiskon, num));
            target.diskon_persen = clamped;
          }
        }
      }

      next[index] = target;
      return next;
    });
  };

  // Kalkulasi estimasi pratinjau tiap baris dan total (hanya estimasi client)
  const calculatedRows = useMemo(() => {
    return items.map((row) => {
      const barang = barangList.find((b) => b.id === row.barang_id) || null;
      const hargaJual = barang ? Number(barang.harga_jual) || 0 : 0;
      const jumlahNum = typeof row.jumlah === "number" ? row.jumlah : 0;
      const diskonNum = typeof row.diskon_persen === "number" ? row.diskon_persen : 0;

      const subtotal =
        barang && jumlahNum >= 1
          ? hitungSubtotalItem(jumlahNum, hargaJual, diskonNum)
          : 0;

      const isStockInsufficient = barang ? jumlahNum > Number(barang.stok) : false;

      return {
        ...row,
        barang,
        hargaJual,
        subtotal,
        isStockInsufficient,
      };
    });
  }, [items, barangList]);

  // Estimasi total keseluruhan (pratinjau)
  const estimatedTotal = useMemo(() => {
    return calculatedRows.reduce((sum, r) => sum + r.subtotal, 0);
  }, [calculatedRows]);

  // Handle submit form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isSubmitting || isSubmittingRef.current) return;

    // 1. Validasi Pelanggan
    if (!selectedPelangganId) {
      setErrorMessage("Silakan pilih toko pelanggan aktif terlebih dahulu.");
      return;
    }

    // 2. Validasi Batas Baris Item (BR-02: 1-20 baris)
    if (
      items.length < PESANAN_JUAL_LIMITS.MIN_ITEMS ||
      items.length > PESANAN_JUAL_LIMITS.MAX_ITEMS
    ) {
      setErrorMessage(
        `Jumlah baris barang harus antara ${PESANAN_JUAL_LIMITS.MIN_ITEMS} sampai ${PESANAN_JUAL_LIMITS.MAX_ITEMS} item (BR-02).`
      );
      return;
    }

    // 3. Validasi Tiap Baris Item
    const barangIdSet = new Set<string>();
    const payloadItems = [];

    for (let i = 0; i < items.length; i++) {
      const row = items[i];
      const rowNum = i + 1;

      if (!row.barang_id) {
        setErrorMessage(`Baris #${rowNum}: Silakan pilih barang dari katalog.`);
        return;
      }

      if (barangIdSet.has(row.barang_id)) {
        const dupBarang = barangList.find((b) => b.id === row.barang_id);
        setErrorMessage(
          `Baris #${rowNum}: Barang "${dupBarang?.nama || row.barang_id}" dipilih lebih dari satu kali. Duplikasi barang dilarang (BR-02).`
        );
        return;
      }
      barangIdSet.add(row.barang_id);

      if (typeof row.jumlah !== "number" || row.jumlah < 1 || !Number.isInteger(row.jumlah)) {
        setErrorMessage(
          `Baris #${rowNum}: Kuantitas barang harus berupa bilangan bulat positif minimal 1.`
        );
        return;
      }

      if (
        typeof row.diskon_persen !== "number" ||
        row.diskon_persen < 0 ||
        row.diskon_persen > maxDiskon
      ) {
        setErrorMessage(
          `Baris #${rowNum}: Diskon (${row.diskon_persen}%) melebihi batas hak akses peran Anda (maksimal ${maxDiskon}%).`
        );
        return;
      }

      payloadItems.push({
        barang_id: row.barang_id,
        jumlah: row.jumlah,
        diskon_persen: row.diskon_persen,
      });
    }

    // Siapkan payload
    const payload: BuatPesananJualInput = {
      pelanggan_id: selectedPelangganId,
      items: payloadItems,
    };

    setIsSubmitting(true);
    isSubmittingRef.current = true;
    setErrorMessage(null);

    try {
      const result = await buatPesananJualDrafAction(payload);

      if (!result.success || !result.data) {
        setErrorMessage(
          result.error || "Gagal menyimpan draf pesanan jual ke sistem."
        );
        setIsSubmitting(false);
        isSubmittingRef.current = false;
        return;
      }

      // Berhasil
      onSuccess(result.data);
    } catch (err) {
      console.error("Error pada saat memanggil buatPesananJualDrafAction:", err);
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Terjadi kesalahan sistem saat menghubungi server."
      );
      setIsSubmitting(false);
      isSubmittingRef.current = false;
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-buat-pesanan-title"
    >
      <div className="relative w-full max-w-4xl my-auto rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Header Modal */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
              <ShoppingCart className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="modal-buat-pesanan-title"
                className="text-base sm:text-lg font-bold text-slate-900 tracking-tight"
              >
                Buat Pesanan Jual Baru (Draf)
              </h2>
              <p className="text-xs text-slate-500">
                Penyusunan transaksi penjualan • Batas 1–20 baris barang (BR-02)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors disabled:opacity-50 cursor-pointer"
            aria-label="Tutup Formulir"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body Scrollable */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-5 sm:p-6 space-y-6 overflow-y-auto flex-1">
            {/* Notifikasi Error Database / Query Pelanggan / Barang jika ada */}
            {pelangganError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-rose-800 flex items-start gap-2.5 text-xs">
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">Kendala Data Pelanggan:</span> {pelangganError}
                </div>
              </div>
            )}

            {barangError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-rose-800 flex items-start gap-2.5 text-xs">
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">Kendala Katalog Barang:</span> {barangError}
                </div>
              </div>
            )}

            {/* Error Message Pengiriman Form */}
            {errorMessage && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-800 flex items-start gap-3 text-xs shadow-2xs">
                <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="font-bold text-rose-900">Validasi Formulir Draf Gagal</h4>
                  <p className="text-rose-700 leading-relaxed">{errorMessage}</p>
                </div>
              </div>
            )}

            {/* BAGIAN 1: PEMILIHAN PELANGGAN */}
            <div className="space-y-3">
              <label
                htmlFor="select-pelanggan"
                className="block text-xs font-bold uppercase tracking-wider text-slate-700"
              >
                1. Pilih Toko Mitra / Pelanggan <span className="text-rose-500">*</span>
              </label>

              {pelangganList.length === 0 && !pelangganError ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  Belum ada data pelanggan aktif yang terdaftar di sistem. Silakan daftarkan pelanggan terlebih dahulu di menu Pelanggan.
                </div>
              ) : (
                <select
                  id="select-pelanggan"
                  value={selectedPelangganId}
                  onChange={(e) => {
                    setSelectedPelangganId(e.target.value);
                    setErrorMessage(null);
                  }}
                  disabled={isSubmitting || pelangganList.length === 0}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs text-slate-800 shadow-2xs focus:border-blue-500 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-100 disabled:text-slate-400"
                >
                  <option value="">-- Pilih Toko Pelanggan Aktif --</option>
                  {pelangganList.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.kode} - {p.nama_toko} ({p.telepon || "Tanpa Telp"})
                    </option>
                  ))}
                </select>
              )}

              {/* Kartu Informasi Pelanggan Terpilih */}
              {selectedPelanggan && (
                <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3.5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                  <div className="space-y-0.5">
                    <span className="text-[11px] font-medium text-slate-500 flex items-center gap-1">
                      <Building2 className="h-3 w-3 text-blue-600" />
                      Nama Toko & Kode:
                    </span>
                    <p className="font-bold text-slate-900">
                      {selectedPelanggan.nama_toko}
                    </p>
                    <span className="font-mono text-[11px] text-slate-600">
                      {selectedPelanggan.kode}
                    </span>
                  </div>

                  <div className="space-y-0.5">
                    <span className="text-[11px] font-medium text-slate-500 flex items-center gap-1">
                      <Calendar className="h-3 w-3 text-blue-600" />
                      Termin Pembayaran:
                    </span>
                    <p className="font-semibold text-slate-900">
                      {selectedPelanggan.termin_hari} Hari
                      {selectedPelanggan.termin_hari === 0 ? " (Cash / COD)" : " Tempo"}
                    </p>
                    <span className="text-[11px] text-slate-500">
                      {selectedPelanggan.termin_hari > 0 ? "Penjualan Kredit" : "Bayar Tunai"}
                    </span>
                  </div>

                  <div className="space-y-0.5">
                    <span className="text-[11px] font-medium text-slate-500 flex items-center gap-1">
                      <CreditCard className="h-3 w-3 text-blue-600" />
                      Batas Kredit (Limit):
                    </span>
                    <p className="font-semibold text-slate-900">
                      {formatRupiah(selectedPelanggan.batas_kredit)}
                    </p>
                    <span className="text-[11px] text-slate-500">
                      Divalidasi saat konfirmasi
                    </span>
                  </div>

                  <div className="space-y-0.5">
                    <span className="text-[11px] font-medium text-slate-500 flex items-center gap-1">
                      <MapPin className="h-3 w-3 text-blue-600" />
                      Alamat & Kontak:
                    </span>
                    <p className="text-[11px] text-slate-700 truncate" title={selectedPelanggan.alamat}>
                      {selectedPelanggan.alamat || "-"}
                    </p>
                    <span className="text-[11px] text-slate-600 flex items-center gap-1">
                      <Phone className="h-2.5 w-2.5" />
                      {selectedPelanggan.telepon || "-"}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* BAGIAN 2: DAFTAR BARIS ITEM BARANG */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                    2. Rincian Barang Pesanan <span className="text-rose-500">*</span>
                  </label>
                  <p className="text-[11px] text-slate-500">
                    Batas 1–20 baris barang tanpa duplikasi • Diskon maksimal {maxDiskon}% untuk peran {userRole}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleAddRow}
                  disabled={isSubmitting || items.length >= PESANAN_JUAL_LIMITS.MAX_ITEMS}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-blue-600 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer self-start sm:self-auto"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Tambah Baris Barang ({items.length}/20)</span>
                </button>
              </div>

              {/* Tabel Item Baris */}
              <div className="rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100/90 border-b border-slate-200 text-slate-700 font-semibold uppercase text-[10px] tracking-wider">
                      <tr>
                        <th className="py-2.5 px-3 w-8 text-center">#</th>
                        <th className="py-2.5 px-3 min-w-[220px]">Pilih Barang</th>
                        <th className="py-2.5 px-3 w-28 text-right">Harga Jual</th>
                        <th className="py-2.5 px-3 w-24 text-center">Kuantitas</th>
                        <th className="py-2.5 px-3 w-24 text-center">Diskon (%)</th>
                        <th className="py-2.5 px-3 w-32 text-right">Estimasi Subtotal</th>
                        <th className="py-2.5 px-2 w-10 text-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {calculatedRows.map((row, index) => {
                        const rowNum = index + 1;
                        return (
                          <tr key={row.rowId} className="hover:bg-slate-50/70 transition-colors">
                            {/* Nomor Baris */}
                            <td className="py-2.5 px-3 text-center font-mono text-slate-400">
                              {rowNum}
                            </td>

                            {/* Dropdown Barang */}
                            <td className="py-2.5 px-3">
                              <select
                                value={row.barang_id}
                                onChange={(e) =>
                                  handleItemChange(index, "barang_id", e.target.value)
                                }
                                disabled={isSubmitting || barangList.length === 0}
                                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 shadow-2xs focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                              >
                                <option value="">-- Pilih Barang --</option>
                                {barangList.map((b) => {
                                  const isSelectedInOtherRow = items.some(
                                    (other, otherIdx) =>
                                      otherIdx !== index && other.barang_id === b.id
                                  );
                                  return (
                                    <option
                                      key={b.id}
                                      value={b.id}
                                      disabled={isSelectedInOtherRow}
                                    >
                                      {b.kode} - {b.nama} (Stok: {b.stok} {b.satuan})
                                      {isSelectedInOtherRow ? " — [Sudah Dipilih]" : ""}
                                    </option>
                                  );
                                })}
                              </select>

                              {/* Indikator Stok Kurang (Peringatan Non-Bloking sesuai arahan) */}
                              {row.barang && row.isStockInsufficient && (
                                <p className="mt-1 text-[11px] text-amber-700 font-medium flex items-center gap-1">
                                  <AlertTriangle className="h-3 w-3 text-amber-600 shrink-0" />
                                  Kuantitas melebihi stok fisik ({row.barang.stok} {row.barang.satuan}). Draf tetap dapat disimpan.
                                </p>
                              )}
                            </td>

                            {/* Harga Jual Resmi (Read-Only) */}
                            <td className="py-2.5 px-3 text-right font-medium text-slate-700">
                              {row.barang ? formatRupiah(row.hargaJual) : "-"}
                            </td>

                            {/* Input Kuantitas */}
                            <td className="py-2.5 px-3">
                              <input
                                type="number"
                                min="1"
                                step="1"
                                value={row.jumlah}
                                onChange={(e) =>
                                  handleItemChange(index, "jumlah", e.target.value)
                                }
                                disabled={isSubmitting}
                                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-center text-xs font-semibold text-slate-800 shadow-2xs focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                                placeholder="1"
                              />
                            </td>

                            {/* Input Diskon Persen */}
                            <td className="py-2.5 px-3">
                              <div className="relative">
                                <input
                                  type="number"
                                  min="0"
                                  max={maxDiskon}
                                  step="0.5"
                                  value={row.diskon_persen}
                                  onChange={(e) =>
                                    handleItemChange(index, "diskon_persen", e.target.value)
                                  }
                                  disabled={isSubmitting}
                                  className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-center text-xs font-semibold text-slate-800 shadow-2xs focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500 pr-5"
                                  placeholder="0"
                                />
                                <span className="absolute right-1.5 top-1.5 text-[11px] text-slate-400 pointer-events-none">
                                  %
                                </span>
                              </div>
                            </td>

                            {/* Estimasi Subtotal Baris */}
                            <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                              {row.barang ? formatRupiah(row.subtotal) : "Rp 0"}
                            </td>

                            {/* Tombol Hapus Baris */}
                            <td className="py-2.5 px-2 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveRow(index)}
                                disabled={isSubmitting || items.length <= PESANAN_JUAL_LIMITS.MIN_ITEMS}
                                title={
                                  items.length <= PESANAN_JUAL_LIMITS.MIN_ITEMS
                                    ? "Minimal 1 baris item barang diperlukan"
                                    : "Hapus Baris"
                                }
                                className="rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400 cursor-pointer"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* BAGIAN 3: RINGKASAN & PRATINJAU ESTIMASI TOTAL */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-200 pb-2">
                <div>
                  <span className="text-xs font-semibold text-slate-700">
                    Estimasi Total Transaksi (Pratinjau Client):
                  </span>
                  <p className="text-[11px] text-slate-500">
                    Dihitung berdasarkan {items.length} baris item • Sesuai aturan pembulatan Math.round (BR-03)
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-lg sm:text-xl font-extrabold text-blue-700 tracking-tight">
                    {formatRupiah(estimatedTotal)}
                  </span>
                </div>
              </div>

              {/* Disclaimer Pratinjau Resmi */}
              <div className="flex items-start gap-2 pt-1 text-[11px] text-slate-500">
                <Info className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                <p>
                  <strong>Perhatian:</strong> Nilai total di atas adalah estimasi pratinjau kalkulasi browser. Nilai resmi tagihan dan nomor dokumen pesanan akan dihitung dan diterbitkan secara resmi oleh database server saat disimpan.
                </p>
              </div>
            </div>
          </div>

          {/* Modal Footer */}
          <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-3.5 shrink-0">
            <div className="text-[11px] text-slate-500 hidden sm:block">
              {isManager ? "Akses Manajer (Diskon s/d 25%)" : "Akses Staf Penjualan (Diskon s/d 10%)"}
            </div>

            <div className="flex items-center gap-2.5 ml-auto">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-50 cursor-pointer"
              >
                Batal
              </button>

              <button
                type="submit"
                disabled={isSubmitting || pelangganList.length === 0 || barangList.length === 0}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-xs font-semibold text-white shadow-md shadow-blue-500/25 hover:bg-blue-500 transition-all disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Menyimpan Draf...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Simpan Draf Pesanan</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
