"use client";

import React from "react";
import { Package, Award } from "lucide-react";
import { TopProductItem } from "@/types/analytics";
import { formatRupiah } from "@/types/pelanggan";

interface TopProductsChartProps {
  products: TopProductItem[] | Array<Omit<TopProductItem, "totalNilaiJual">>;
  showRevenue?: boolean; // false untuk staf gudang (BR-12)
  title?: string;
  subtitle?: string;
  isLoading?: boolean;
}

export default function TopProductsChart({
  products = [],
  showRevenue = true,
  title = "Produk Terlaris",
  subtitle = "Berdasarkan akumulasi kuantitas fisik terjual pada pesanan sah",
  isLoading = false,
}: TopProductsChartProps) {
  const safeProducts = Array.isArray(products) ? products : [];
  const maxQty = safeProducts.reduce((max, p) => Math.max(max, p.kuantitasTerjual), 0);
  const totalVolume = safeProducts.reduce((sum, p) => sum + p.kuantitasTerjual, 0);

  return (
    <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs relative">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-2">
        <div>
          <div className="flex items-center gap-2">
            <div className="rounded-md bg-amber-50 p-1.5 text-amber-600">
              <Award className="h-4 w-4" />
            </div>
            <h3 className="font-bold text-slate-800 text-sm">{title}</h3>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
        </div>

        <div className="text-xs text-slate-500 font-medium">
          Total Terjual: <span className="font-bold font-mono text-slate-800">{totalVolume} Unit/Dus</span>
        </div>
      </div>

      {/* Konten Daftar Produk & Bar Visualisasi */}
      <div className="mt-4 space-y-3">
        {isLoading && (
          <div className="absolute inset-0 bg-white/70 backdrop-blur-[1px] flex items-center justify-center z-10">
            <span className="text-xs font-semibold text-slate-600 animate-pulse">
              Memuat data produk...
            </span>
          </div>
        )}

        {safeProducts.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
            <Package className="h-8 w-8 text-slate-300" />
            <span>Belum ada transaksi penjualan produk sah pada rentang tanggal ini.</span>
          </div>
        ) : (
          safeProducts.map((item, index) => {
            const percentage = maxQty > 0 ? (item.kuantitasTerjual / maxQty) * 100 : 0;
            const rank = index + 1;

            return (
              <div key={item.barangId || `prod-${index}`} className="group">
                <div className="flex items-center justify-between text-xs mb-1">
                  <div className="flex items-center gap-2 min-w-0 pr-2">
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-[11px] font-bold ${
                        rank === 1
                          ? "bg-amber-100 text-amber-800"
                          : rank === 2
                          ? "bg-slate-200 text-slate-700"
                          : rank === 3
                          ? "bg-amber-700/10 text-amber-900"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {rank}
                    </span>
                    <span className="font-mono text-[11px] text-slate-400 shrink-0">
                      [{item.kodeBarang}]
                    </span>
                    <span className="font-semibold text-slate-800 truncate" title={item.namaBarang}>
                      {item.namaBarang}
                    </span>
                  </div>

                  <div className="text-right shrink-0 flex items-center gap-3">
                    <span className="font-mono font-bold text-slate-900">
                      {item.kuantitasTerjual} {item.satuan}
                    </span>
                    {showRevenue && "totalNilaiJual" in item && typeof item.totalNilaiJual === "number" && (
                      <span className="font-mono text-[11px] text-emerald-600 font-medium hidden sm:inline">
                        ({formatRupiah(item.totalNilaiJual)})
                      </span>
                    )}
                  </div>
                </div>

                {/* Bar Visualisasi Proporsi */}
                <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      rank === 1
                        ? "bg-amber-500"
                        : rank === 2
                        ? "bg-blue-500"
                        : rank === 3
                        ? "bg-indigo-500"
                        : "bg-slate-400"
                    }`}
                    style={{ width: `${Math.max(4, percentage)}%` }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
