"use client";

import React, { useState } from "react";
import { X, CheckCircle, AlertCircle, Loader2, DollarSign } from "lucide-react";
import { PembelianItem } from "@/types/pembelian";
import { formatRupiah } from "@/types/barang";
import { setujuiPembelianAction } from "@/app/pembelian/actions";

interface SetujuiPembelianModalProps {
  isOpen: boolean;
  onClose: () => void;
  pembelian: PembelianItem | null;
  onSuccess: (pembelianId: string, hargaBeliSatuan: number) => void;
}

export default function SetujuiPembelianModal({
  isOpen,
  onClose,
  pembelian,
  onSuccess,
}: SetujuiPembelianModalProps) {
  const [hargaBeliSatuan, setHargaBeliSatuan] = useState<number | "">("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Set nilai awal jika sudah ada estimasi harga beli
  React.useEffect(() => {
    if (pembelian?.harga_beli_satuan) {
      setHargaBeliSatuan(pembelian.harga_beli_satuan);
    } else {
      setHargaBeliSatuan("");
    }
    setErrorMsg(null);
  }, [pembelian]);

  if (!isOpen || !pembelian) return null;

  const totalNilai =
    typeof hargaBeliSatuan === "number" && hargaBeliSatuan > 0
      ? hargaBeliSatuan * pembelian.jumlah_dipesan
      : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const harga = Number(hargaBeliSatuan);
    if (isNaN(harga) || harga <= 0) {
      setErrorMsg("Harga beli satuan wajib diisi dan harus bernilai lebih dari Rp0 (BR-09).");
      return;
    }

    setLoading(true);
    try {
      const res = await setujuiPembelianAction({
        pembelian_id: pembelian.id,
        harga_beli_satuan: harga,
      });

      if (!res.success) {
        setErrorMsg(res.error || "Gagal menyetujui pengajuan pembelian.");
        setLoading(false);
        return;
      }

      onSuccess(pembelian.id, harga);
      onClose();
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Terjadi kesalahan koneksi saat menyetujui pembelian."
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
      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100">
              <CheckCircle className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">Persetujuan Pembelian (PO)</h2>
              <p className="text-xs text-slate-500">
                Verifikasi pengajuan &amp; tentukan harga beli satuan (BR-09, BR-12)
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {errorMsg && (
            <div className="flex items-start gap-3 rounded-xl bg-rose-50 border border-rose-200 p-4 text-xs text-rose-800">
              <AlertCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Validasi Gagal</p>
                <p className="mt-0.5">{errorMsg}</p>
              </div>
            </div>
          )}

          {/* Rincian PO */}
          <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-4 space-y-2.5 text-xs text-slate-600">
            <div className="flex justify-between items-center pb-2 border-b border-slate-200">
              <span className="font-semibold text-slate-500">Nomor PO:</span>
              <span className="font-bold text-slate-900">{pembelian.nomor}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-semibold text-slate-500">Mitra Pemasok:</span>
              <span className="font-medium text-slate-800">
                {pembelian.pemasok?.nama || "Pemasok"}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-semibold text-slate-500">Barang Dipesan:</span>
              <span className="font-medium text-slate-800">
                {pembelian.barang?.nama || "Barang"}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-semibold text-slate-500">Jumlah Dipesan:</span>
              <span className="font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full">
                {pembelian.jumlah_dipesan} {pembelian.barang?.satuan || "unit"}
              </span>
            </div>
          </div>

          {/* Input Harga Beli Satuan */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Harga Beli Satuan (Netto dari Pemasok) <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-2.5 text-sm font-bold text-slate-500">
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
                placeholder="Contoh: 150000"
                className="w-full rounded-xl border border-slate-300 pl-11 pr-3.5 py-2.5 text-sm text-slate-900 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 outline-hidden font-medium"
                required
                autoFocus
              />
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              Harga ini akan menjadi patokan HPP barang setelah barang diterima secara fisik di gudang (BR-10).
            </p>
          </div>

          {/* Kalkulasi Total Nilai PO */}
          <div className="rounded-xl bg-emerald-50/80 border border-emerald-200 p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-emerald-700" />
              <div>
                <p className="text-xs font-medium text-emerald-900">Total Komitmen Pembelian</p>
                <p className="text-[11px] text-emerald-700">
                  {pembelian.jumlah_dipesan} {pembelian.barang?.satuan} × {formatRupiah(Number(hargaBeliSatuan) || 0)}
                </p>
              </div>
            </div>
            <span className="text-base font-extrabold text-emerald-950">
              {formatRupiah(totalNilai)}
            </span>
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
              className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-500/20 hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>{loading ? "Menyimpan Persetujuan..." : "Setujui Pembelian"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
