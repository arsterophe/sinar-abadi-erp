"use client";

import React, { useState } from "react";
import {
  Calendar,
  ChevronDown,
  Loader2,
  Check,
  CalendarRange,
} from "lucide-react";
import { DateRangeFilter as IDateRangeFilter, DateRangePreset } from "@/types/analytics";

interface DateRangeFilterProps {
  currentFilter: IDateRangeFilter;
  onFilterChange: (newFilter: IDateRangeFilter) => void;
  isLoading?: boolean;
}

const PRESET_OPTIONS: { id: DateRangePreset; label: string; desc: string }[] = [
  { id: "hari_ini", label: "Hari Ini", desc: "Data transaksi per hari ini" },
  { id: "7_hari", label: "7 Hari Terakhir", desc: "Tren 7 hari terakhir (WIB)" },
  { id: "30_hari", label: "30 Hari Terakhir", desc: "Tren 30 hari terakhir (WIB)" },
  { id: "bulan_ini", label: "Bulan Ini", desc: "Dari tanggal 1 s/d hari ini" },
  { id: "kustom", label: "Rentang Kustom", desc: "Tentukan rentang tanggal sendiri" },
];

export default function DateRangeFilter({
  currentFilter,
  onFilterChange,
  isLoading = false,
}: DateRangeFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [customStart, setCustomStart] = useState(currentFilter.startDate);
  const [customEnd, setCustomEnd] = useState(currentFilter.endDate);
  const [customError, setCustomError] = useState<string | null>(null);

  const activePreset =
    PRESET_OPTIONS.find((p) => p.id === currentFilter.preset) || PRESET_OPTIONS[2];

  const handleSelectPreset = (presetId: DateRangePreset) => {
    if (presetId === "kustom") {
      setCustomStart(currentFilter.startDate);
      setCustomEnd(currentFilter.endDate);
      setCustomError(null);
      // Biarkan dropdown tetap terbuka untuk memilih tanggal kustom
      return;
    }

    setIsOpen(false);
    onFilterChange({
      preset: presetId,
      startDate: currentFilter.startDate,
      endDate: currentFilter.endDate,
    });
  };

  const handleApplyCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customStart || !customEnd) {
      setCustomError("Tanggal mulai dan akhir wajib diisi.");
      return;
    }

    if (customStart > customEnd) {
      setCustomError("Tanggal mulai tidak boleh melebihi tanggal akhir.");
      return;
    }

    setCustomError(null);
    setIsOpen(false);
    onFilterChange({
      preset: "kustom",
      startDate: customStart,
      endDate: customEnd,
    });
  };

  return (
    <div className="relative inline-block text-left">
      {/* Tombol Pemicu Filter Utama */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        disabled={isLoading}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60 transition-all cursor-pointer"
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        {isLoading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
        ) : (
          <Calendar className="h-3.5 w-3.5 text-slate-500" />
        )}
        <span>Periode:</span>
        <span className="font-bold text-slate-900">{activePreset.label}</span>
        <span className="text-[11px] font-normal text-slate-400">
          ({currentFilter.startDate} s/d {currentFilter.endDate})
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-slate-400 ml-0.5" />
      </button>

      {/* Dropdown Menu & Form Kustom */}
      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-20"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute right-0 mt-2 z-30 w-[calc(100vw-2.5rem)] max-w-xs sm:w-80 rounded-xl border border-slate-200 bg-white p-3 shadow-lg ring-1 ring-black/5 animate-in fade-in-50 zoom-in-95 duration-100">
            <div className="px-2 py-1.5 border-b border-slate-100 mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Pilih Periode Analitik
              </span>
            </div>

            {/* Daftar Preset Standar */}
            <div className="space-y-1">
              {PRESET_OPTIONS.map((opt) => {
                const isSelected = currentFilter.preset === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleSelectPreset(opt.id)}
                    className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs transition-colors cursor-pointer ${
                      isSelected
                        ? "bg-blue-50 text-blue-700 font-semibold"
                        : "text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <div>
                      <div>{opt.label}</div>
                      <div className="text-[10px] text-slate-400 font-normal">
                        {opt.desc}
                      </div>
                    </div>
                    {isSelected && <Check className="h-3.5 w-3.5 text-blue-600 shrink-0" />}
                  </button>
                );
              })}
            </div>

            {/* Formulir Tanggal Kustom */}
            {currentFilter.preset === "kustom" && (
              <form
                onSubmit={handleApplyCustom}
                className="mt-3 border-t border-slate-100 pt-3 space-y-2.5"
              >
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
                  <CalendarRange className="h-3.5 w-3.5 text-slate-400" />
                  <span>Rentang Tanggal Kalender (WIB):</span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-slate-500 mb-0.5">
                      Dari Tanggal
                    </label>
                    <input
                      type="date"
                      value={customStart}
                      onChange={(e) => setCustomStart(e.target.value)}
                      className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500 mb-0.5">
                      Sampai Tanggal
                    </label>
                    <input
                      type="date"
                      value={customEnd}
                      onChange={(e) => setCustomEnd(e.target.value)}
                      className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                {customError && (
                  <div className="text-[10px] text-rose-600 font-medium">
                    {customError}
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="rounded-md px-2.5 py-1 text-xs text-slate-500 hover:bg-slate-100"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="rounded-md bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700 transition-colors shadow-xs"
                  >
                    Terapkan
                  </button>
                </div>
              </form>
            )}
          </div>
        </>
      )}
    </div>
  );
}
