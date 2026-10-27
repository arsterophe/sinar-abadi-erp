"use client";

import React, { useState } from "react";
import { X, XCircle, AlertCircle, Loader2 } from "lucide-react";
import { PembelianItem, PEMBELIAN_LIMITS } from "@/types/pembelian";
import { tolakPembelianAction } from "@/app/pembelian/actions";

interface TolakPembelianModalProps {
  isOpen: boolean;
  onClose: () => void;
  pembelian: PembelianItem | null;
  onSuccess: (pembelianId: string, alasanTolak: string) => void;
}

export default function TolakPembelianModal({
  isOpen,
  onClose,
  pembelian,
  onSuccess,
}: TolakPembelianModalProps) {
  const [alasanTolak, setAlasanTolak] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  React.useEffect(() => {
    setAlasanTolak("");
    setErrorMsg(null);
  }, [pembelian]);

  if (!isOpen || !pembelian) return null;

  const charCount = alasanTolak.trim().length;
  const isTooShort = charCount < PEMBELIAN_LIMITS.MIN_ALASAN_TOLAK_LEN;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (isTooShort) {
      setErrorMsg(
        `Alasan penolakan wajib diisi paling sedikit ${PEMBELIAN_LIMITS.MIN_ALASAN_TOLAK_LEN} karakter (BR-09).`
      );
      return;
    }

    setLoading(true);
    try {
      const res = await tolakPembelianAction({
        pembelian_id: pembelian.id,
        alasan_tolak: alasanTolak.trim(),
      });

      if (!res.success) {
        setErrorMsg(res.error || "Gagal menolak pengajuan pembelian.");
        setLoading(false);
        return;
      }

      onSuccess(pembelian.id, alasanTolak.trim());
      onClose();
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Terjadi kesalahan koneksi saat menolak pembelian."
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
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600 border border-rose-100">
              <XCircle className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">Tolak Pengajuan Pembelian</h2>
              <p className="text-xs text-slate-500">
                Isi pertimbangan resmi penolakan pengajuan (BR-09)
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
                <p className="font-semibold">Validasi Penolakan</p>
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
              <span className="font-semibold text-slate-800">
                {pembelian.jumlah_dipesan} {pembelian.barang?.satuan || "unit"}
              </span>
            </div>
          </div>

          {/* Input Alasan Tolak */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Alasan Penolakan <span className="text-rose-500">*</span>
              </label>
              <span
                className={`text-[11px] font-medium ${
                  isTooShort ? "text-rose-600 font-bold" : "text-emerald-600"
                }`}
              >
                {charCount} / min {PEMBELIAN_LIMITS.MIN_ALASAN_TOLAK_LEN} karakter
              </span>
            </div>
            <textarea
              rows={3}
              value={alasanTolak}
              onChange={(e) => setAlasanTolak(e.target.value)}
              placeholder="Contoh: Stok di gudang masih mencukupi untuk kebutuhan 3 minggu ke depan."
              className="w-full rounded-xl border border-slate-300 p-3.5 text-sm text-slate-900 focus:border-rose-600 focus:ring-2 focus:ring-rose-100 outline-hidden resize-none"
              required
              autoFocus
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Alasan ini akan tercatat permanen pada sistem audit log dan terlihat oleh pemohon pengajuan (BR-09, BR-12).
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
              Kembali
            </button>
            <button
              type="submit"
              disabled={loading || isTooShort}
              className="flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-rose-500/20 hover:bg-rose-700 transition-colors disabled:opacity-50"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>{loading ? "Menyimpan Penolakan..." : "Tolak Pengajuan"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
