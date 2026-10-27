"use client";

import React, { useState, useMemo, useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import {
  X,
  SlidersHorizontal,
  Package,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileText,
  Calculator,
} from "lucide-react";
import { BarangItem, PenyesuaianStokResult } from "@/types/barang";
import { sesuaikanStokAction } from "@/app/barang-dan-stok/actions";

interface PenyesuaianStokModalProps {
  isOpen: boolean;
  onClose: () => void;
  barangList: BarangItem[];
  preselectedBarangId?: string | null;
  onSuccess: (result: PenyesuaianStokResult) => void;
}

const emptySubscribe = () => () => {};

export default function PenyesuaianStokModal({
  isOpen,
  onClose,
  barangList,
  preselectedBarangId,
  onSuccess,
}: PenyesuaianStokModalProps) {
  // Filter hanya barang yang aktif untuk penyesuaian stok
  const activeBarangList = useMemo(() => {
    return barangList.filter((b) => b.aktif);
  }, [barangList]);

  const defaultId = useMemo(() => {
    return preselectedBarangId && activeBarangList.some((b) => b.id === preselectedBarangId)
      ? preselectedBarangId
      : activeBarangList[0]?.id || "";
  }, [preselectedBarangId, activeBarangList]);

  const defaultTargetBarang = useMemo(() => {
    return activeBarangList.find((b) => b.id === defaultId);
  }, [activeBarangList, defaultId]);

  // Deteksi mounting client-side untuk createPortal tanpa setState dalam effect
  const isClient = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  const [barangId, setBarangId] = useState<string>(defaultId);
  const [tipeInput, setTipeInput] = useState<"stok_fisik" | "selisih">("stok_fisik");
  const [stokFisikInput, setStokFisikInput] = useState<string>(
    defaultTargetBarang ? String(defaultTargetBarang.stok) : ""
  );
  const [selisihInput, setSelisihInput] = useState<string>("0");
  const [alasan, setAlasan] = useState<string>("");
  const [nomorDokumen, setNomorDokumen] = useState<string>("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Synchronous mutex lock untuk mencegah double submit / re-entry saat proses sedang berjalan
  const isSubmittingRef = useRef<boolean>(false);

  // Cegah scroll pada halaman belakang (body & html) saat modal terbuka
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

  // Barang yang sedang dipilih
  const selectedBarang = useMemo(() => {
    return activeBarangList.find((b) => b.id === barangId) || null;
  }, [activeBarangList, barangId]);

  // Sinkronkan default stok saat barang dipilih berubah
  const handleBarangChange = (newId: string) => {
    setBarangId(newId);
    setErrorMessage(null);
    const b = activeBarangList.find((item) => item.id === newId);
    if (b) {
      setStokFisikInput(String(b.stok));
      setSelisihInput("0");
    }
  };

  // Kalkulasi estimasi stok akhir dan perubahan
  const { calculatedPerubahan, calculatedStokAkhir, isInvalidStock } = useMemo(() => {
    if (!selectedBarang) {
      return { calculatedPerubahan: 0, calculatedStokAkhir: 0, isInvalidStock: false };
    }

    const currentStock = Number(selectedBarang.stok) || 0;

    if (tipeInput === "stok_fisik") {
      const newPhysical = Number(stokFisikInput);
      if (stokFisikInput === "" || isNaN(newPhysical)) {
        return { calculatedPerubahan: 0, calculatedStokAkhir: currentStock, isInvalidStock: false };
      }
      const change = newPhysical - currentStock;
      return {
        calculatedPerubahan: change,
        calculatedStokAkhir: newPhysical,
        isInvalidStock: newPhysical < 0,
      };
    } else {
      const diff = Number(selisihInput);
      if (selisihInput === "" || isNaN(diff)) {
        return { calculatedPerubahan: 0, calculatedStokAkhir: currentStock, isInvalidStock: false };
      }
      const finalStock = currentStock + diff;
      return {
        calculatedPerubahan: diff,
        calculatedStokAkhir: finalStock,
        isInvalidStock: finalStock < 0,
      };
    }
  }, [selectedBarang, tipeInput, stokFisikInput, selisihInput]);

  if (!isOpen || !isClient) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 1. Synchronous Mutex Guard: Cegah re-entry / double submission seketika
    if (isSubmittingRef.current || isSubmitting) {
      return;
    }

    setErrorMessage(null);

    // 2. Validasi kelengkapan form di sisi klien
    if (!selectedBarang) {
      setErrorMessage("Pilih barang yang ingin disesuaikan.");
      return;
    }

    if (alasan.trim().length < 10) {
      setErrorMessage("Alasan penyesuaian wajib diisi minimal 10 karakter.");
      return;
    }

    if (calculatedPerubahan === 0) {
      setErrorMessage("Tidak ada perubahan stok (jumlah selisih nol). Masukkan angka stok yang berbeda dari stok saat ini.");
      return;
    }

    if (calculatedStokAkhir < 0) {
      setErrorMessage(`Penyesuaian tidak valid: stok akhir tidak boleh negatif (hasil: ${calculatedStokAkhir}).`);
      return;
    }

    // 3. Kunci mutex secara sinkron dan set status loading UI
    isSubmittingRef.current = true;
    setIsSubmitting(true);

    try {
      const result = await sesuaikanStokAction({
        barang_id: selectedBarang.id,
        tipe_input: tipeInput,
        nilai: tipeInput === "stok_fisik" ? Number(stokFisikInput) : Number(selisihInput),
        alasan: alasan.trim(),
        nomor_dokumen: nomorDokumen.trim() || undefined,
      });

      if (!result.success || !result.data) {
        setErrorMessage(result.error || "Gagal memproses penyesuaian stok.");
        return;
      }

      onSuccess(result.data);
      onClose();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Terjadi kendala saat menyimpan penyesuaian stok."
      );
    } finally {
      // 4. Pastikan mutex selalu dilepas kembali, baik saat sukses maupun saat gagal
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const isSubmitDisabled =
    isSubmitting ||
    isInvalidStock ||
    calculatedPerubahan === 0 ||
    alasan.trim().length < 10;

  const modalContent = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-xs overflow-y-auto overscroll-contain">
      <form
        onSubmit={handleSubmit}
        noValidate
        style={{ maxHeight: "calc(100dvh - 2rem)" }}
        className="relative w-full max-w-lg max-h-[90dvh] flex flex-col rounded-2xl border border-slate-700/80 bg-[#0d162f] text-slate-100 shadow-2xl overflow-hidden overscroll-contain my-auto"
      >
        {/* Header Modal - Fixed at top of modal */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-[#0b1329] px-6 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <SlidersHorizontal className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                Penyesuaian Stok Fisik
              </h2>
              <p className="text-xs text-slate-400">
                Catat hasil hitung fisik / stock opname & kerusakan (BR-01, BR-11)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer"
            aria-label="Tutup modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Form Content */}
        <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4 overscroll-contain">
          {/* Pesan Kesalahan */}
          {errorMessage && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-950/50 p-3.5 text-xs text-rose-200">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                <div className="flex-1 leading-relaxed">{errorMessage}</div>
              </div>
            </div>
          )}

          {/* Pemilihan Barang */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
              Barang yang Disesuaikan <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <select
                value={barangId}
                onChange={(e) => handleBarangChange(e.target.value)}
                disabled={isSubmitting || activeBarangList.length === 0}
                className="w-full rounded-xl border border-slate-700/80 bg-slate-900/90 py-2.5 px-3 text-xs font-medium text-white shadow-inner focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
              >
                {activeBarangList.length === 0 && (
                  <option value="">Tidak ada barang aktif</option>
                )}
                {activeBarangList.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.kode} — {item.nama} (Stok: {item.stok} {item.satuan})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Info Status Barang Saat Ini */}
          {selectedBarang && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-slate-300">
                <Package className="h-4 w-4 text-blue-400" />
                <span>Stok Sistem Saat Ini:</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold text-white">
                  {selectedBarang.stok} {selectedBarang.satuan}
                </span>
                <span className="text-[11px] text-slate-400">
                  (Min: {selectedBarang.stok_minimum})
                </span>
              </div>
            </div>
          )}

          {/* Toggle Mode Input */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
              Metode Perhitungan <span className="text-rose-400">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-900/90 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setTipeInput("stok_fisik")}
                className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  tipeInput === "stok_fisik"
                    ? "bg-blue-600 text-white shadow-md"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Calculator className="h-3.5 w-3.5" />
                <span>Stok Fisik Baru</span>
              </button>
              <button
                type="button"
                onClick={() => setTipeInput("selisih")}
                className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  tipeInput === "selisih"
                    ? "bg-blue-600 text-white shadow-md"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span>Selisih Jumlah (+/-)</span>
              </button>
            </div>
          </div>

          {/* Input Nilai Berdasarkan Mode */}
          {tipeInput === "stok_fisik" ? (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                Stok Fisik Terkini di Gudang <span className="text-rose-400">*</span>
              </label>
              <input
                type="number"
                min="0"
                step="1"
                required
                value={stokFisikInput}
                onChange={(e) => setStokFisikInput(e.target.value)}
                placeholder="Masukkan hasil hitung fisik (misal: 95)"
                disabled={isSubmitting}
                className="w-full rounded-xl border border-slate-700/80 bg-slate-900/90 py-2.5 px-3 text-sm font-mono text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
              />
              <p className="mt-1 text-[11px] text-slate-400">
                Masukkan total fisik yang dihitung di rak gudang saat stock opname.
              </p>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                Jumlah Penyesuaian (+ Tambah / - Kurang) <span className="text-rose-400">*</span>
              </label>
              <input
                type="number"
                step="1"
                required
                value={selisihInput}
                onChange={(e) => setSelisihInput(e.target.value)}
                placeholder="Contoh: -5 (rusak) atau +10 (kelebihan)"
                disabled={isSubmitting}
                className="w-full rounded-xl border border-slate-700/80 bg-slate-900/90 py-2.5 px-3 text-sm font-mono text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
              />
              <p className="mt-1 text-[11px] text-slate-400">
                Gunakan angka minus (-) untuk pengurangan fisik (rusak/hilang), angka positif (+) untuk penambahan.
              </p>
            </div>
          )}

          {/* Live Preview Perubahan */}
          <div
            className={`rounded-xl border p-3.5 transition-all text-xs ${
              isInvalidStock
                ? "border-rose-500/50 bg-rose-950/30 text-rose-300"
                : calculatedPerubahan !== 0
                ? "border-blue-500/40 bg-blue-950/30 text-blue-200"
                : "border-slate-800 bg-slate-900/40 text-slate-400"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-medium">Perubahan Mutasi:</span>
              <span className="font-mono font-bold">
                {calculatedPerubahan > 0
                  ? `+${calculatedPerubahan}`
                  : `${calculatedPerubahan}`}{" "}
                {selectedBarang?.satuan}
              </span>
            </div>
            <div className="mt-1.5 flex items-center justify-between pt-1.5 border-t border-slate-800/80">
              <span className="font-medium">Estimasi Stok Akhir:</span>
              <span
                className={`font-mono text-sm font-bold ${
                  isInvalidStock ? "text-rose-400" : "text-emerald-400"
                }`}
              >
                {calculatedStokAkhir} {selectedBarang?.satuan}
              </span>
            </div>
            {isInvalidStock ? (
              <p className="mt-1.5 text-[11px] text-rose-400 flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Stok tidak boleh bernilai negatif (BR-01). Periksa kembali angka penyesuaian.
              </p>
            ) : calculatedPerubahan === 0 ? (
              <p className="mt-1.5 text-[11px] text-amber-400/90 flex items-center gap-1">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                Belum ada perubahan stok (jumlah fisik sama dengan sistem). Ubah angka untuk menyimpan.
              </p>
            ) : null}
          </div>

          {/* Alasan Penyesuaian (Wajib) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Alasan Penyesuaian <span className="text-rose-400">*</span>
              </label>
              <span
                className={`text-[11px] font-mono font-medium ${
                  alasan.trim().length >= 10 ? "text-emerald-400" : "text-amber-400"
                }`}
              >
                {alasan.trim().length}/10 karakter
                {alasan.trim().length < 10 && ` (kurang ${10 - alasan.trim().length})`}
              </span>
            </div>
            <textarea
              rows={2}
              required
              value={alasan}
              onChange={(e) => setAlasan(e.target.value)}
              placeholder="Contoh: Hasil hitung fisik berkala 23 Oktober 2026 atau Barang penyok dan bocor saat bongkar muat"
              disabled={isSubmitting}
              className="w-full rounded-xl border border-slate-700/80 bg-slate-900/90 py-2 px-3 text-xs text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all resize-none"
            />
            <p className="mt-1 text-[11px] text-slate-400">
              Wajib diisi paling sedikit 10 karakter sebagai pertanggungjawaban audit log fisik (sesuai ERD).
            </p>
          </div>

          {/* Nomor Dokumen Referensi (Opsional) */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
              Nomor Dokumen / Berita Acara <span className="text-slate-500">(Opsional)</span>
            </label>
            <div className="relative">
              <FileText className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input
                type="text"
                value={nomorDokumen}
                onChange={(e) => setNomorDokumen(e.target.value)}
                placeholder="Otomatis: ADJ-261023-XXXX jika dikosongkan"
                disabled={isSubmitting}
                className="w-full rounded-xl border border-slate-700/80 bg-slate-900/90 py-2 pl-9 pr-3 text-xs text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all font-mono"
              />
            </div>
          </div>
        </div>

        {/* Pinned Footer Actions */}
        <div className="shrink-0 relative z-10 px-6 py-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-t border-slate-800 bg-[#0b1329] backdrop-blur-xs">
          <div className="text-[11px] text-slate-400">
            {isSubmitting ? (
              <span className="text-blue-400 flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                Memproses transaksi penyesuaian stok...
              </span>
            ) : calculatedPerubahan === 0 ? (
              <span className="text-amber-400/90 flex items-center gap-1">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                Ubah nilai stok untuk menyimpan
              </span>
            ) : alasan.trim().length < 10 ? (
              <span className="text-amber-400/90 flex items-center gap-1">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                Alasan min. 10 karakter ({alasan.trim().length}/10)
              </span>
            ) : isInvalidStock ? (
              <span className="text-rose-400 flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Stok akhir tidak boleh negatif
              </span>
            ) : (
              <span className="text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                Validasi lengkap, siap simpan
              </span>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 hover:text-white transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitDisabled}
              title={
                isSubmitting
                  ? "Sedang menyimpan..."
                  : calculatedPerubahan === 0
                  ? "Masukkan perubahan stok (selisih tidak boleh 0)"
                  : alasan.trim().length < 10
                  ? `Alasan wajib minimal 10 karakter (saat ini ${alasan.trim().length}/10)`
                  : isInvalidStock
                  ? "Stok akhir tidak boleh negatif"
                  : "Simpan Penyesuaian Stok"
              }
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-amber-600 px-5 py-2 text-xs font-semibold text-white shadow-lg shadow-amber-600/30 hover:bg-amber-500 active:scale-98 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Menyimpan ke Database...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Simpan Penyesuaian</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );

  return createPortal(modalContent, document.body);
}
