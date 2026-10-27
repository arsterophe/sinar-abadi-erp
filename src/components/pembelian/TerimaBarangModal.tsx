"use client";

import React, { useState } from "react";
import { X, PackageCheck, AlertCircle, Loader2, ArrowRight } from "lucide-react";
import { PembelianItem } from "@/types/pembelian";
import { terimaBarangPembelianAction } from "@/app/pembelian/actions";

interface TerimaBarangModalProps {
  isOpen: boolean;
  onClose: () => void;
  pembelian: PembelianItem | null;
  onSuccess: (data: {
    id: string;
    nomor: string;
    stok_sebelum: number;
    stok_sesudah: number;
    jumlah_diterima: number;
    harga_pokok_baru: number;
  }) => void;
}

export default function TerimaBarangModal({
  isOpen,
  onClose,
  pembelian,
  onSuccess,
}: TerimaBarangModalProps) {
  const [jumlahDiterima, setJumlahDiterima] = useState<number | "">("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  React.useEffect(() => {
    if (pembelian) {
      setJumlahDiterima(pembelian.jumlah_dipesan);
    } else {
      setJumlahDiterima("");
    }
    setErrorMsg(null);
  }, [pembelian]);

  if (!isOpen || !pembelian) return null;

  const jumlahDipesan = pembelian.jumlah_dipesan;
  const stokSaatIni = pembelian.barang?.stok ?? 0;
  const estimasiStokBaru =
    typeof jumlahDiterima === "number" && jumlahDiterima > 0
      ? stokSaatIni + jumlahDiterima
      : stokSaatIni;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const qty = Number(jumlahDiterima);
    if (!Number.isInteger(qty) || qty < 1 || qty > jumlahDipesan) {
      setErrorMsg(
        `Jumlah barang diterima harus berupa bilangan bulat antara 1 sampai ${jumlahDipesan} ${
          pembelian.barang?.satuan || "unit"
        } (BR-10).`
      );
      return;
    }

    setLoading(true);
    try {
      const res = await terimaBarangPembelianAction({
        pembelian_id: pembelian.id,
        jumlah_diterima: qty,
      });

      if (!res.success || !res.data) {
        setErrorMsg(res.error || "Gagal mencatat penerimaan barang.");
        setLoading(false);
        return;
      }

      onSuccess(res.data);
      onClose();
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Terjadi kesalahan koneksi saat mencatat penerimaan barang."
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
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
              <PackageCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">Catat Penerimaan Barang</h2>
              <p className="text-xs text-slate-500">
                Verifikasi fisik kedatangan barang dari pemasok (BR-10, BR-11)
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
                <p className="font-semibold">Validasi Penerimaan Gagal</p>
                <p className="mt-0.5">{errorMsg}</p>
              </div>
            </div>
          )}

          {/* Rincian PO */}
          <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-4 space-y-2.5 text-xs text-slate-600">
            <div className="flex justify-between items-center pb-2 border-b border-slate-200">
              <span className="font-semibold text-slate-500">Nomor Dokumen PO:</span>
              <span className="font-bold text-slate-900">{pembelian.nomor}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-semibold text-slate-500">Mitra Pemasok:</span>
              <span className="font-medium text-slate-800">
                {pembelian.pemasok?.nama || "Pemasok"}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-semibold text-slate-500">Barang:</span>
              <span className="font-medium text-slate-800">
                {pembelian.barang?.nama || "Barang"}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-semibold text-slate-500">Jumlah Dipesan:</span>
              <span className="font-bold text-blue-700">
                {jumlahDipesan} {pembelian.barang?.satuan || "unit"}
              </span>
            </div>
          </div>

          {/* Input Jumlah Diterima */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Jumlah Diterima Nyata di Gudang <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                type="number"
                min="1"
                max={jumlahDipesan}
                value={jumlahDiterima}
                onChange={(e) =>
                  setJumlahDiterima(e.target.value === "" ? "" : Number(e.target.value))
                }
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm font-semibold text-slate-900 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-hidden"
                required
                autoFocus
              />
              <span className="absolute right-3.5 top-2.5 text-xs font-medium text-slate-400">
                {pembelian.barang?.satuan || "unit"}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              Maksimal {jumlahDipesan} unit. Sesuai PRD BR-10, jika ada kekurangan kirim dari pemasok, sisa kekurangan tidak ditunggu.
            </p>
          </div>

          {/* Simulasi Pertambahan Saldo Stok Gudang */}
          <div className="rounded-xl bg-blue-50/80 border border-blue-200 p-4">
            <p className="text-xs font-semibold text-blue-900 mb-2">
              Dampak Terhadap Saldo Stok Gudang (BR-10, BR-11):
            </p>
            <div className="flex items-center justify-between text-xs bg-white rounded-lg p-3 border border-blue-100">
              <div className="text-center">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Stok Saat Ini</span>
                <span className="font-bold text-slate-700 text-sm">{stokSaatIni}</span>
              </div>
              <ArrowRight className="h-4 w-4 text-blue-500" />
              <div className="text-center">
                <span className="text-[10px] text-emerald-600 uppercase tracking-wider block">+ Masuk PO</span>
                <span className="font-bold text-emerald-600 text-sm">+{Number(jumlahDiterima) || 0}</span>
              </div>
              <ArrowRight className="h-4 w-4 text-blue-500" />
              <div className="text-center">
                <span className="text-[10px] text-blue-700 uppercase tracking-wider block font-semibold">Stok Baru</span>
                <span className="font-extrabold text-blue-950 text-base">{estimasiStokBaru}</span>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-blue-700 leading-relaxed">
              * Tepat 1 baris mutasi stok dengan jenis <span className="font-semibold">masuk</span> akan otomatis dicatat ke kartu stok barang (BR-11).
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
              <span>{loading ? "Menyimpan Penerimaan..." : "Konfirmasi Penerimaan Barang"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
