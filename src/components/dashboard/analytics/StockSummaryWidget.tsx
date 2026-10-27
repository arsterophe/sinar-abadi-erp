"use client";

import React from "react";
import Link from "next/link";
import { Radar, AlertTriangle, XCircle, CheckCircle2, ArrowRight, ShoppingCart } from "lucide-react";
import { RadarStokSummary } from "@/types/radar_stok";

interface StockSummaryWidgetProps {
  summary?: RadarStokSummary | null;
  title?: string;
  subtitle?: string;
}

export default function StockSummaryWidget({
  summary,
  title = "Radar Stok & Peringatan Inventori",
  subtitle = "Pemantauan status stok fisik, batas minimum, dan rekomendasi restock",
}: StockSummaryWidgetProps) {
  const totalSku = summary?.totalBarang || 0;
  const stokAman = summary?.jumlahAman || 0;
  const stokMenipis = (summary?.jumlahKritis || 0) + (summary?.jumlahWaspada || 0);
  const stokHabis = summary?.jumlahHabis || 0;
  const rekomendasiOrder = summary?.totalRekomendasiOrder || 0;

  return (
    <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <div className="rounded-md bg-indigo-50 p-1.5 text-indigo-600">
              <Radar className="h-4 w-4" />
            </div>
            <h3 className="font-bold text-slate-800 text-sm">{title}</h3>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
        </div>

        <Link
          href="/radar-stok"
          className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
        >
          <span>Buka Radar Stok</span>
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {/* Grid Status Stok */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Stok Aman */}
        <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-3 text-center">
          <div className="flex items-center justify-center gap-1 text-emerald-700 text-xs font-semibold mb-1">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>Stok Aman</span>
          </div>
          <div className="font-mono text-xl font-bold text-emerald-800">
            {stokAman}
          </div>
          <div className="text-[10px] text-emerald-600 font-medium mt-0.5">
            Di atas batas minimum
          </div>
        </div>

        {/* Stok Menipis */}
        <div className="rounded-lg border border-amber-200/80 bg-amber-50/60 p-3 text-center">
          <div className="flex items-center justify-center gap-1 text-amber-700 text-xs font-semibold mb-1">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>Stok Menipis</span>
          </div>
          <div className="font-mono text-xl font-bold text-amber-800">
            {stokMenipis}
          </div>
          <div className="text-[10px] text-amber-600 font-medium mt-0.5">
            Perlu restock segera
          </div>
        </div>

        {/* Stok Habis */}
        <div className="rounded-lg border border-rose-200/80 bg-rose-50/60 p-3 text-center">
          <div className="flex items-center justify-center gap-1 text-rose-700 text-xs font-semibold mb-1">
            <XCircle className="h-3.5 w-3.5" />
            <span>Stok Habis (0)</span>
          </div>
          <div className="font-mono text-xl font-bold text-rose-800">
            {stokHabis}
          </div>
          <div className="text-[10px] text-rose-600 font-medium mt-0.5">
            Kritis / Kosong total
          </div>
        </div>

        {/* Rekomendasi Restock Order */}
        <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3 text-center">
          <div className="flex items-center justify-center gap-1 text-blue-700 text-xs font-semibold mb-1">
            <ShoppingCart className="h-3.5 w-3.5" />
            <span>Rekomendasi PO</span>
          </div>
          <div className="font-mono text-xl font-bold text-blue-800">
            {rekomendasiOrder}
          </div>
          <div className="text-[10px] text-blue-600 font-medium mt-0.5">
            SKU diajukan pembelian
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
        <span>Total SKU Inventori Terdaftar:</span>
        <span className="font-bold font-mono text-slate-800">{totalSku} Barang Aktif</span>
      </div>
    </div>
  );
}
