"use client";

import React from "react";
import {
  X,
  FileText,
  Building2,
  Package,
  Calendar,
  CheckCircle2,
  XCircle,
  Truck,
  DollarSign,
  Clock,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";
import { PembelianItem } from "@/types/pembelian";
import { formatRupiah } from "@/types/barang";
import { DbUserRole } from "@/types/auth";

interface DetailPembelianModalProps {
  isOpen: boolean;
  onClose: () => void;
  pembelian: PembelianItem | null;
  userRole: DbUserRole;
  currentUserId?: string;
  onOpenSetujui?: (p: PembelianItem) => void;
  onOpenTolak?: (p: PembelianItem) => void;
  onOpenTerima?: (p: PembelianItem) => void;
  onOpenBatal?: (p: PembelianItem) => void;
}

export default function DetailPembelianModal({
  isOpen,
  onClose,
  pembelian,
  userRole,
  currentUserId,
  onOpenSetujui,
  onOpenTolak,
  onOpenTerima,
  onOpenBatal,
}: DetailPembelianModalProps) {
  if (!isOpen || !pembelian) return null;

  const isManajer = userRole === "manajer";
  const isGudang = userRole === "gudang";
  const isCreator = Boolean(currentUserId && pembelian.diajukan_oleh === currentUserId);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "diajukan":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700 border border-amber-200">
            <Clock className="h-3.5 w-3.5" />
            Menunggu Persetujuan
          </span>
        );
      case "disetujui":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700 border border-blue-200">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Disetujui (Menunggu Barang)
          </span>
        );
      case "diterima":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 border border-emerald-200">
            <Truck className="h-3.5 w-3.5" />
            Selesai Diterima Fisik
          </span>
        );
      case "ditolak":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-rose-700 border border-rose-200">
            <XCircle className="h-3.5 w-3.5" />
            Pengajuan Ditolak
          </span>
        );
      case "dibatalkan":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700 border border-slate-300">
            <X className="h-3.5 w-3.5" />
            Dibatalkan
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
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
        hour: "2-digit",
        minute: "2-digit",
      }) + " WIB";
    } catch {
      return dateString;
    }
  };

  const totalNilai =
    typeof pembelian.harga_beli_satuan === "number" && pembelian.harga_beli_satuan > 0
      ? pembelian.harga_beli_satuan * (pembelian.jumlah_diterima || pembelian.jumlah_dipesan)
      : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">{pembelian.nomor}</h2>
                {getStatusBadge(pembelian.status)}
              </div>
              <p className="text-xs text-slate-500">
                Detail Transaksi Pesanan Pembelian Barang Pemasok
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Section 1: Informasi Mitra & Barang */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Pemasok Card */}
            <div className="rounded-xl border border-slate-200 p-4 bg-slate-50/50">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5">
                <Building2 className="h-4 w-4 text-blue-600" />
                <span>Mitra Pemasok</span>
              </div>
              <p className="text-sm font-bold text-slate-900">
                {pembelian.pemasok?.nama || "Pemasok"}
              </p>
              <p className="text-xs text-slate-500 font-mono mt-0.5">
                Kode: {pembelian.pemasok?.kode || "-"}
              </p>
              {pembelian.pemasok?.telepon && (
                <p className="text-xs text-slate-600 mt-1">
                  Telp: {pembelian.pemasok.telepon}
                </p>
              )}
            </div>

            {/* Barang Card */}
            <div className="rounded-xl border border-slate-200 p-4 bg-slate-50/50">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5">
                <Package className="h-4 w-4 text-emerald-600" />
                <span>Barang Dipesan</span>
              </div>
              <p className="text-sm font-bold text-slate-900">
                {pembelian.barang?.nama || "Barang"}
              </p>
              <p className="text-xs text-slate-500 font-mono mt-0.5">
                Kode: {pembelian.barang?.kode || "-"}
              </p>
              <div className="flex items-center gap-3 mt-2 text-xs">
                <span className="text-slate-600">
                  Dipesan:{" "}
                  <strong className="text-slate-900 font-bold">
                    {pembelian.jumlah_dipesan} {pembelian.barang?.satuan}
                  </strong>
                </span>
                {pembelian.jumlah_diterima !== null && (
                  <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-semibold border border-emerald-200">
                    Diterima: {pembelian.jumlah_diterima} {pembelian.barang?.satuan}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Section 2: Kerahasiaan Finansial BR-12 */}
          {isManajer ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-900">
                  <DollarSign className="h-4 w-4 text-emerald-700" />
                  <span>Nilai Transaksi Finansial (BR-12)</span>
                </div>
                <span className="text-[10px] bg-emerald-200 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                  Khusus Manajer
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-slate-500 block">Harga Beli Satuan:</span>
                  <span className="text-sm font-bold text-slate-900">
                    {pembelian.harga_beli_satuan
                      ? formatRupiah(pembelian.harga_beli_satuan)
                      : "Belum ditentukan (menunggu approval)"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Total Komitmen / Pembayaran:</span>
                  <span className="text-sm font-extrabold text-emerald-950">
                    {totalNilai ? formatRupiah(totalNilai) : "-"}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 flex items-center gap-2.5 text-xs text-slate-500">
              <ShieldCheck className="h-4 w-4 text-blue-500 shrink-0" />
              <span>
                <strong>Kerahasiaan Finansial (BR-12):</strong> Informasi harga beli satuan dan nominal rupiah dirahasiakan dan hanya dapat diakses oleh Manajer.
              </span>
            </div>
          )}

          {/* Section 3: Catatan Penolakan (Jika Ada) */}
          {pembelian.status === "ditolak" && pembelian.alasan_tolak && (
            <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-rose-800 mb-1.5">
                <ShieldAlert className="h-4 w-4 text-rose-600" />
                <span>Alasan Penolakan Pengajuan (BR-09)</span>
              </div>
              <p className="text-xs text-rose-900 leading-relaxed font-medium bg-white p-3 rounded-lg border border-rose-100">
                &ldquo;{pembelian.alasan_tolak}&rdquo;
              </p>
            </div>
          )}

          {/* Section 4: Jejak Riwayat & Audit Log */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-3 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-slate-500" />
              <span>Jejak Riwayat & Siklus Transaksi (PRD Bab 6.2)</span>
            </h3>
            <div className="space-y-3">
              {/* Diajukan */}
              <div className="flex items-start gap-3 text-xs bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div className="h-7 w-7 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 mt-0.5">
                  <Clock className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800">Diajukan ke Sistem</span>
                    <span className="text-slate-500 font-mono text-[11px]">
                      {formatTanggalWIB(pembelian.diajukan_pada)}
                    </span>
                  </div>
                  <p className="text-slate-600 mt-0.5">
                    Oleh:{" "}
                    <span className="font-semibold text-slate-800">
                      {pembelian.pengaju?.nama_lengkap || "Staf Gudang"}
                    </span>{" "}
                    <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.2 rounded font-medium">
                      {pembelian.pengaju?.peran || "gudang"}
                    </span>
                  </p>
                </div>
              </div>

              {/* Diputuskan (Jika Ada) */}
              {pembelian.diputuskan_pada && (
                <div className="flex items-start gap-3 text-xs bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div
                    className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                      pembelian.status === "disetujui"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-rose-100 text-rose-700"
                    }`}
                  >
                    {pembelian.status === "disetujui" ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <XCircle className="h-4 w-4" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800">
                        {pembelian.status === "disetujui"
                          ? "Disetujui Manajer"
                          : pembelian.status === "ditolak"
                          ? "Ditolak Manajer"
                          : "Dibatalkan"}
                      </span>
                      <span className="text-slate-500 font-mono text-[11px]">
                        {formatTanggalWIB(pembelian.diputuskan_pada)}
                      </span>
                    </div>
                    <p className="text-slate-600 mt-0.5">
                      Oleh:{" "}
                      <span className="font-semibold text-slate-800">
                        {pembelian.pemutus?.nama_lengkap || "Manajer"}
                      </span>{" "}
                      <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.2 rounded font-medium">
                        {pembelian.pemutus?.peran || "manajer"}
                      </span>
                    </p>
                  </div>
                </div>
              )}

              {/* Diterima (Jika Ada) */}
              {pembelian.diterima_pada && (
                <div className="flex items-start gap-3 text-xs bg-emerald-50/70 p-3 rounded-xl border border-emerald-200">
                  <div className="h-7 w-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
                    <Truck className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-emerald-950">
                        Penerimaan Fisik Barang di Gudang (BR-10)
                      </span>
                      <span className="text-emerald-700 font-mono text-[11px]">
                        {formatTanggalWIB(pembelian.diterima_pada)}
                      </span>
                    </div>
                    <p className="text-emerald-800 mt-0.5">
                      Diterima oleh:{" "}
                      <span className="font-bold text-slate-900">
                        {pembelian.penerima?.nama_lengkap || "Staf Gudang"}
                      </span>{" "}
                      sejumlah{" "}
                      <strong className="text-emerald-700">
                        {pembelian.jumlah_diterima} {pembelian.barang?.satuan}
                      </strong>
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4 bg-slate-50">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
          >
            Tutup
          </button>

          <div className="flex items-center gap-2">
            {/* Tombol Aksi Kontekstual */}
            {pembelian.status === "diajukan" && isManajer && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenTolak?.(pembelian);
                  }}
                  className="rounded-xl border border-rose-300 bg-rose-50 px-3.5 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition-colors"
                >
                  Tolak Pengajuan
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenSetujui?.(pembelian);
                  }}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors shadow-sm"
                >
                  Setujui Pembelian
                </button>
              </>
            )}

            {pembelian.status === "disetujui" && (isGudang || isManajer) && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenTerima?.(pembelian);
                }}
                className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-1.5"
              >
                <Truck className="h-3.5 w-3.5" />
                <span>Catat Penerimaan Barang</span>
              </button>
            )}

            {pembelian.status === "diajukan" && (isCreator || isManajer) && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenBatal?.(pembelian);
                }}
                className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
              >
                Batalkan Pengajuan
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
