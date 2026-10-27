"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Building2,
  ShieldAlert,
  Clock,
  AlertCircle,
  Phone,
  MapPin,
  CheckCircle2,
  Lock,
  Loader2,
} from "lucide-react";
import { DbUserRole } from "@/types/auth";
import {
  PelangganItem,
  TerminHari,
  VALID_TERMIN_HARI,
  formatRupiah,
} from "@/types/pelanggan";
import { tambahPelangganAction, editPelangganAction } from "@/app/pelanggan/actions";

interface PelangganModalFormProps {
  isOpen: boolean;
  onClose: () => void;
  userRole: DbUserRole;
  pelangganToEdit?: PelangganItem | null;
  onSuccess?: (updatedItem?: Partial<PelangganItem> & { id: string }) => void;
}

export default function PelangganModalForm({
  isOpen,
  onClose,
  userRole,
  pelangganToEdit,
  onSuccess,
}: PelangganModalFormProps) {
  const isManager = userRole === "manajer";
  const isEditing = Boolean(pelangganToEdit);

  const [formData, setFormData] = useState({
    kode: "",
    nama_toko: "",
    telepon: "",
    alamat: "",
    batas_kredit: isManager ? "5000000" : "0",
    termin_hari: 14 as TerminHari,
    aktif: true,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Sinkronkan state form saat modal dibuka atau pelanggan yang diedit berganti ID
  useEffect(() => {
    if (isOpen) {
      if (pelangganToEdit) {
        setFormData({
          kode: pelangganToEdit.kode,
          nama_toko: pelangganToEdit.nama_toko,
          telepon: pelangganToEdit.telepon,
          alamat: pelangganToEdit.alamat,
          batas_kredit: String(pelangganToEdit.batas_kredit),
          termin_hari: pelangganToEdit.termin_hari,
          aktif: pelangganToEdit.aktif,
        });
      } else {
        setFormData({
          kode: "",
          nama_toko: "",
          telepon: "",
          alamat: "",
          batas_kredit: isManager ? "5000000" : "0",
          termin_hari: 14,
          aktif: true,
        });
      }
      setErrorMessage(null);
      setSuccessMessage(null);
      setIsSubmitting(false);
    }
  }, [isOpen, pelangganToEdit?.id, isManager]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    setErrorMessage(null);
    setSuccessMessage(null);

    // Ambil nilai terbaru langsung dari DOM form elements untuk mencegah stale state
    const formElement = e.currentTarget;
    const formValues = new FormData(formElement);

    const rawKode = ((formValues.get("kode") as string) ?? formData.kode) || "";
    const rawNama = ((formValues.get("nama_toko") as string) ?? formData.nama_toko) || "";
    const rawTelp = ((formValues.get("telepon") as string) ?? formData.telepon) || "";
    const rawAlamat = ((formValues.get("alamat") as string) ?? formData.alamat) || "";
    const rawBatasKredit = (formValues.get("batas_kredit") as string) ?? formData.batas_kredit;
    const rawTerminVal = formValues.get("termin_hari");
    const rawTermin = rawTerminVal !== null ? Number(rawTerminVal) : formData.termin_hari;

    // Validasi Sisi Klien
    const trimmedKode = rawKode.trim().toUpperCase();
    const trimmedNama = rawNama.trim();
    const trimmedTelp = rawTelp.trim();
    const trimmedAlamat = rawAlamat.trim();

    if (!trimmedKode) {
      setErrorMessage("Kode pelanggan wajib diisi (contoh: PLG-011).");
      return;
    }

    if (!/^PLG-[A-Z0-9\-_]+$/i.test(trimmedKode)) {
      setErrorMessage(
        "Format kode pelanggan harus diawali dengan 'PLG-' diikuti angka/karakter (contoh: PLG-011)."
      );
      return;
    }

    if (!trimmedNama) {
      setErrorMessage("Nama toko / pelanggan wajib diisi.");
      return;
    }

    if (!trimmedTelp) {
      setErrorMessage("Nomor telepon / kontak wajib diisi.");
      return;
    }

    if (trimmedTelp.length < 8 || trimmedTelp.length > 20) {
      setErrorMessage("Nomor telepon harus antara 8 hingga 20 karakter.");
      return;
    }

    if (!trimmedAlamat) {
      setErrorMessage("Alamat lengkap toko wajib diisi.");
      return;
    }

    setIsSubmitting(true);

    // Mode Edit Pelanggan (Pembaruan Toko & Plafon Kredit)
    if (isEditing && pelangganToEdit) {
      try {
        const res = await editPelangganAction({
          id: pelangganToEdit.id,
          nama_toko: trimmedNama,
          telepon: trimmedTelp,
          alamat: trimmedAlamat,
          batas_kredit: isManager ? Number(rawBatasKredit) : undefined,
          termin_hari: rawTermin,
        });

        if (!res.success) {
          setErrorMessage(res.error || "Gagal memperbarui data pelanggan.");
          setIsSubmitting(false);
          return;
        }

        setSuccessMessage("Data toko pelanggan berhasil diperbarui.");
        setIsSubmitting(false);

        const updatedData = res.data;
        setTimeout(() => {
          if (updatedData) {
            onSuccess?.({
              id: updatedData.id,
              nama_toko: updatedData.nama_toko,
              telepon: updatedData.telepon,
              alamat: updatedData.alamat,
              batas_kredit: updatedData.batas_kredit,
              termin_hari: updatedData.termin_hari as TerminHari,
            });
          } else {
            onSuccess?.();
          }
          onClose();
        }, 500);
      } catch (err) {
        setErrorMessage(
          err instanceof Error ? err.message : "Terjadi kesalahan saat memperbarui data."
        );
        setIsSubmitting(false);
      }
      return;
    }

    try {
      const res = await tambahPelangganAction({
        kode: trimmedKode,
        nama_toko: trimmedNama,
        telepon: trimmedTelp,
        alamat: trimmedAlamat,
        batas_kredit: isManager ? Number(formData.batas_kredit) : 0,
        termin_hari: formData.termin_hari,
      });

      if (!res.success) {
        setErrorMessage(res.error || "Gagal menyimpan data pelanggan.");
        setIsSubmitting(false);
        return;
      }

      // Berhasil disimpan
      setSuccessMessage("Pelanggan baru berhasil didaftarkan ke sistem.");
      setIsSubmitting(false);

      // Beri jeda sejenak untuk umpan balik visual, lalu reset dan tutup modal
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 700);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Terjadi kesalahan saat menyimpan data."
      );
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="relative w-full max-w-xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-[#0b1329] px-6 py-4 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                {isEditing ? "Detail Toko Pelanggan" : "Pendaftaran Pelanggan Baru"}
              </h2>
              <p className="text-xs text-slate-400">
                CV Sinar Abadi Niaga • Sinar Abadi ERP
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
            aria-label="Tutup Modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body / Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto text-xs">
          {/* Success Banner */}
          {successMessage && (
            <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3.5 text-emerald-950 animate-in fade-in">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="font-bold text-[11px] text-emerald-900">
                    Berhasil Menyimpan
                  </p>
                  <p className="text-[11px] leading-relaxed text-emerald-800">
                    {successMessage}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Error Banner */}
          {errorMessage && (
            <div className="rounded-xl border border-rose-300 bg-rose-50 p-3.5 text-rose-950 animate-in fade-in">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="font-bold text-[11px] text-rose-900">
                    Gagal Menyimpan Data
                  </p>
                  <p className="text-[11px] leading-relaxed text-rose-800">
                    {errorMessage}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Edit Mode Notice Banner */}
          {isEditing && (
            <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3.5 text-blue-950">
              <div className="flex items-start gap-2.5">
                <Building2 className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="font-bold text-[11px] text-blue-900">
                    Mode Pembaruan Data Pelanggan
                  </p>
                  <p className="text-[11px] leading-relaxed text-blue-800">
                    {isManager
                      ? "Sebagai Manajer, Anda dapat memperbarui data kontak toko, termin tempo, dan plafon kredit. Perubahan plafon kredit otomatis dicatat ke dalam audit log (BR-12)."
                      : "Sebagai Staf Penjualan, Anda dapat memperbarui nama toko, kontak, alamat, dan termin. Plafon kredit terkunci dan hanya dapat diubah oleh Manajer (BR-05 & BR-12)."}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Role Policy Callout */}
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 flex items-start gap-2.5 text-slate-600">
            <ShieldAlert className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
            <div className="text-[11px] leading-relaxed">
              {isManager ? (
                <p>
                  <strong>Hak Akses Manajer:</strong> Anda berwenang mengatur plafon batas kredit dan termin tempo toko baru.
                </p>
              ) : (
                <p>
                  <strong>Hak Akses Staf Penjualan (BR-05):</strong> Toko baru yang Anda daftarkan otomatis memiliki <strong>Batas Kredit Rp 0 (Tunai)</strong> sampai Manajer meninjau dan menetapkan batas kreditnya.
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Kode Pelanggan */}
            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                Kode Pelanggan <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                name="kode"
                required
                disabled={isEditing || isSubmitting}
                value={formData.kode}
                onChange={(e) =>
                  setFormData({ ...formData, kode: e.target.value.toUpperCase() })
                }
                placeholder="Contoh: PLG-011"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 font-mono font-semibold focus:border-blue-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-500"
              />
              <p className="mt-1 text-[10px] text-slate-400">
                Format: <code>PLG-011</code> (Kode bersifat unik &amp; permanen).
              </p>
            </div>

            {/* Nama Toko */}
            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                Nama Toko / Minimarket <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                name="nama_toko"
                required
                disabled={isSubmitting}
                value={formData.nama_toko}
                onChange={(e) => setFormData({ ...formData, nama_toko: e.target.value })}
                placeholder="Contoh: Toko Berkah Jaya"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 focus:border-blue-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-500"
              />
            </div>
          </div>

          {/* Telepon */}
          <div>
            <label className="block text-slate-700 font-semibold mb-1 flex items-center gap-1">
              <Phone className="h-3.5 w-3.5 text-slate-400" />
              <span>Nomor Telepon / WhatsApp <span className="text-rose-500">*</span></span>
            </label>
            <input
              type="text"
              name="telepon"
              required
              disabled={isSubmitting}
              value={formData.telepon}
              onChange={(e) => setFormData({ ...formData, telepon: e.target.value })}
              placeholder="Contoh: 0813-1100-2201"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 focus:border-blue-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-500"
            />
          </div>

          {/* Alamat */}
          <div>
            <label className="block text-slate-700 font-semibold mb-1 flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5 text-slate-400" />
              <span>Alamat Lengkap Toko <span className="text-rose-500">*</span></span>
            </label>
            <textarea
              name="alamat"
              required
              rows={2}
              disabled={isSubmitting}
              value={formData.alamat}
              onChange={(e) => setFormData({ ...formData, alamat: e.target.value })}
              placeholder="Contoh: Jl. Cut Mutia No. 12, Bekasi Timur"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 focus:border-blue-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Batas Kredit (BR-05 & BR-12) */}
            <div>
              <label className="block text-slate-700 font-semibold mb-1 flex items-center justify-between">
                <span>Batas Kredit (Plafon Piutang)</span>
                {!isManager && (
                  <span className="flex items-center gap-1 text-[10px] text-amber-700 font-semibold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                    <Lock className="h-3 w-3" />
                    Wewenang Manajer
                  </span>
                )}
              </label>
              <div className="relative">
                <input
                  type="number"
                  name="batas_kredit"
                  min="0"
                  step="100000"
                  disabled={!isManager || isSubmitting}
                  value={!isManager && !isEditing ? "0" : formData.batas_kredit}
                  onChange={(e) => setFormData({ ...formData, batas_kredit: e.target.value })}
                  placeholder="0"
                  className={`w-full rounded-lg border px-3 py-2 font-mono font-bold transition-all ${
                    isManager
                      ? "border-slate-300 bg-white text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      : "border-slate-200 bg-slate-100 text-slate-500 cursor-not-allowed"
                  }`}
                />
              </div>
              <div className="mt-1.5 flex items-center justify-between text-[11px]">
                <span className="text-slate-500">
                  Pratinjau Nominal:
                </span>
                <span className="font-mono font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                  {formatRupiah(Number(formData.batas_kredit || 0))}
                </span>
              </div>
              {!isManager && (
                <p className="mt-1 text-[10px] text-amber-600">
                  Staf Penjualan mendaftarkan toko dengan plafon default Rp 0 (BR-05).
                </p>
              )}
            </div>

            {/* Termin Pembayaran (BR-05: 0, 7, 14, 30) */}
            <div>
              <label className="block text-slate-700 font-semibold mb-1 flex items-center gap-1">
                <Clock className="h-3.5 w-3.5 text-slate-400" />
                <span>Termin Pembayaran (Tempo)</span>
              </label>
              <select
                name="termin_hari"
                disabled={isSubmitting}
                value={formData.termin_hari}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    termin_hari: Number(e.target.value) as TerminHari,
                  })
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium cursor-pointer disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
              >
                {VALID_TERMIN_HARI.map((hari) => (
                  <option key={hari} value={hari}>
                    {hari === 0
                      ? "0 Hari (Pembayaran Tunai / Cash)"
                      : `${hari} Hari (${hari === 7 ? "1 Minggu" : hari === 14 ? "2 Minggu" : "1 Bulan"})`}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[10px] text-slate-500">
                Pilihan resmi PRD BR-05: 0, 7, 14, atau 30 hari.
              </p>
            </div>
          </div>

          {/* Modal Footer / Buttons */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 font-semibold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50"
            >
              Batal
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white shadow-md shadow-blue-500/20 hover:bg-blue-500 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-white" />
                  <span>Menyimpan...</span>
                </>
              ) : (
                <span>{isEditing ? "Simpan Perubahan Toko" : "Simpan Data Pelanggan"}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
