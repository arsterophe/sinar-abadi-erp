"use client";

import React, { useState } from "react";
import { X, AlertCircle, ShoppingCart, Loader2 } from "lucide-react";
import { PemasokItem, PEMBELIAN_LIMITS } from "@/types/pembelian";
import { DbUserRole } from "@/types/auth";
import { buatPengajuanPembelianAction } from "@/app/pembelian/actions";

interface BarangOption {
  id: string;
  kode: string;
  nama: string;
  satuan: string;
  stok: number;
}

interface BuatPembelianModalProps {
  isOpen: boolean;
  onClose: () => void;
  pemasokList: PemasokItem[];
  barangList: BarangOption[];
  userRole: DbUserRole;
  onSuccess: (data: { id: string; nomor: string }) => void;
}

export default function BuatPembelianModal({
  isOpen,
  onClose,
  pemasokList,
  barangList,
  userRole,
  onSuccess,
}: BuatPembelianModalProps) {
  const [pemasokId, setPemasokId] = useState("");
  const [barangId, setBarangId] = useState("");
  const [jumlahDipesan, setJumlahDipesan] = useState<number | "">("");
  const [hargaBeliSatuan, setHargaBeliSatuan] = useState<number | "">("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const selectedBarang = barangList.find((b) => b.id === barangId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!pemasokId) {
      setErrorMsg("Silakan pilih mitra pemasok terlebih dahulu.");
      return;
    }

    if (!barangId) {
      setErrorMsg("Silakan pilih barang yang akan dipesan.");
      return;
    }

    const qty = Number(jumlahDipesan);
    if (
      !Number.isInteger(qty) ||
      qty < PEMBELIAN_LIMITS.MIN_JUMLAH_PESAN ||
      qty > PEMBELIAN_LIMITS.MAX_JUMLAH_PESAN
    ) {
      setErrorMsg(
        `Jumlah dipesan harus bilangan bulat antara ${PEMBELIAN_LIMITS.MIN_JUMLAH_PESAN} sampai ${PEMBELIAN_LIMITS.MAX_JUMLAH_PESAN.toLocaleString("id-ID")} unit (BR-09).`
      );
      return;
    }

    let harga: number | null = null;
    if (userRole === "manajer" && hargaBeliSatuan !== "") {
      const h = Number(hargaBeliSatuan);
      if (h <= 0) {
        setErrorMsg("Harga beli satuan harus bernilai lebih dari Rp0.");
        return;
      }
      harga = h;
    }

    setLoading(true);
    try {
      const res = await buatPengajuanPembelianAction({
        pemasok_id: pemasokId,
        barang_id: barangId,
        jumlah_dipesan: qty,
        harga_beli_satuan: harga,
      });

      if (!res.success || !res.data) {
        setErrorMsg(res.error || "Gagal membuat pengajuan pembelian.");
        setLoading(false);
        return;
      }

      onSuccess(res.data);
      onClose();
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Terjadi kesalahan koneksi saat mengajukan pembelian."
      );
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
              <ShoppingCart className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                Buat Pengajuan Pembelian (PO)
              </h2>
              <p className="text-xs text-slate-500">
                Pesan barang ke pemasok resmi sesuai kebutuhan stok gudang (BR-09)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {errorMsg && (
            <div className="flex items-start gap-3 rounded-xl bg-rose-50 border border-rose-200 p-4 text-xs text-rose-800">
              <AlertCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Validasi Pengajuan Gagal</p>
                <p className="mt-0.5 leading-relaxed">{errorMsg}</p>
              </div>
            </div>
          )}

          {/* Mitra Pemasok */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Mitra Pemasok <span className="text-rose-500">*</span>
            </label>
            <select
              value={pemasokId}
              onChange={(e) => setPemasokId(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-hidden bg-white"
              required
            >
              <option value="">-- Pilih Pemasok --</option>
              {pemasokList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.kode} - {p.nama}
                </option>
              ))}
            </select>
          </div>

          {/* Barang Yang Dipesan */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Barang Yang Dipesan <span className="text-rose-500">*</span>
            </label>
            <select
              value={barangId}
              onChange={(e) => setBarangId(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-hidden bg-white"
              required
            >
              <option value="">-- Pilih Barang --</option>
              {barangList.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.kode} - {b.nama} (Stok: {b.stok} {b.satuan})
                </option>
              ))}
            </select>
            {selectedBarang && (
              <p className="mt-1.5 text-xs text-slate-500">
                Stok fisik saat ini:{" "}
                <span className="font-semibold text-slate-800">
                  {selectedBarang.stok} {selectedBarang.satuan}
                </span>
              </p>
            )}
          </div>

          {/* Jumlah Dipesan */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Jumlah Dipesan <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                type="number"
                min={PEMBELIAN_LIMITS.MIN_JUMLAH_PESAN}
                max={PEMBELIAN_LIMITS.MAX_JUMLAH_PESAN}
                value={jumlahDipesan}
                onChange={(e) =>
                  setJumlahDipesan(e.target.value === "" ? "" : Number(e.target.value))
                }
                placeholder="Contoh: 50"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-hidden"
                required
              />
              {selectedBarang && (
                <span className="absolute right-3.5 top-2.5 text-xs font-medium text-slate-400">
                  {selectedBarang.satuan}
                </span>
              )}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              Batas kuantitas pembelian: 1 s/d 10.000 unit per pengajuan (BR-09).
            </p>
          </div>

          {/* Input Khusus Manajer: Estimasi Harga Beli Satuan */}
          {userRole === "manajer" && (
            <div className="rounded-xl bg-blue-50/60 border border-blue-200/80 p-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-blue-900 uppercase tracking-wider">
                  Harga Beli Satuan (Opsional untuk Manajer)
                </label>
                <span className="text-[10px] bg-blue-200/70 text-blue-800 font-bold px-2 py-0.5 rounded-full">
                  Privilese Manajer
                </span>
              </div>
              <div className="relative">
                <span className="absolute left-3.5 top-2.5 text-sm font-semibold text-slate-500">
                  Rp
                </span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={hargaBeliSatuan}
                  onChange={(e) =>
                    setHargaBeliSatuan(e.target.value === "" ? "" : Number(e.target.value))
                  }
                  placeholder="Bisa diisi nanti saat persetujuan PO"
                  className="w-full rounded-xl border border-blue-200 pl-11 pr-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:ring-2 focus:ring-blue-200 outline-hidden bg-white"
                />
              </div>
              <p className="mt-1.5 text-[11px] text-blue-700">
                Jika dikosongkan, harga beli satuan dapat ditentukan pada saat Anda menyetujui pengajuan PO ini.
              </p>
            </div>
          )}

          {/* Ketentuan Bisnis Alert */}
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 text-xs text-slate-600 space-y-1">
            <p className="font-semibold text-slate-800">
              Kebijakan Transaksi (PRD Bab 4 & Bab 6.2):
            </p>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              * Pengajuan ini akan berstatus <strong className="text-amber-700">diajukan</strong> dan membutuhkan persetujuan Manajer.
            </p>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              * <span className="font-semibold text-rose-600">Penting:</span> Stok barang di gudang TIDAK AKAN bertambah saat pengajuan dibuat. Saldo persediaan hanya bertambah setelah barang fisik tiba dan dicatat oleh staf gudang (BR-10).
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-500/20 hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>{loading ? "Mengirimkan Pengajuan..." : "Kirim Pengajuan PO"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
