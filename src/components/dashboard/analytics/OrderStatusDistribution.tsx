"use client";

import React from "react";
import { PieChart, CheckCircle2, Truck, Clock, FileText, Ban } from "lucide-react";
import { OrderStatusCount } from "@/types/analytics";
import { formatRupiah } from "@/types/pelanggan";

interface OrderStatusDistributionProps {
  distribution: OrderStatusCount[] | Array<Omit<OrderStatusCount, "totalNilai">>;
  showRevenue?: boolean; // false untuk staf gudang (BR-12)
  title?: string;
  subtitle?: string;
  isLoading?: boolean;
}

const STATUS_CONFIG: Record<
  string,
  {
    bgClass: string;
    textClass: string;
    barColor: string;
    icon: React.ComponentType<{ className?: string }>;
    desc: string;
  }
> = {
  draf: {
    bgClass: "bg-slate-100",
    textClass: "text-slate-700",
    barColor: "bg-slate-400",
    icon: FileText,
    desc: "Sedang disusun / pipeline",
  },
  dikonfirmasi: {
    bgClass: "bg-blue-100",
    textClass: "text-blue-800",
    barColor: "bg-blue-500",
    icon: Clock,
    desc: "Stok terpotong, siap kirim",
  },
  dikirim: {
    bgClass: "bg-indigo-100",
    textClass: "text-indigo-800",
    barColor: "bg-indigo-500",
    icon: Truck,
    desc: "Barang keluar, tempo aktif",
  },
  lunas: {
    bgClass: "bg-emerald-100",
    textClass: "text-emerald-800",
    barColor: "bg-emerald-500",
    icon: CheckCircle2,
    desc: "Pembayaran terverifikasi kas",
  },
  dibatalkan: {
    bgClass: "bg-rose-100",
    textClass: "text-rose-800",
    barColor: "bg-rose-500",
    icon: Ban,
    desc: "Pesanan void / dibatalkan",
  },
};

export default function OrderStatusDistribution({
  distribution = [],
  showRevenue = true,
  title = "Distribusi Status Pesanan",
  subtitle = "Sebaran volume dan nilai pesanan berdasarkan siklus transaksi",
  isLoading = false,
}: OrderStatusDistributionProps) {
  const safeDist = Array.isArray(distribution) ? distribution : [];
  const totalOrders = safeDist.reduce((sum, item) => sum + item.jumlahPesanan, 0);

  return (
    <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs relative">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-2">
        <div>
          <div className="flex items-center gap-2">
            <div className="rounded-md bg-indigo-50 p-1.5 text-indigo-600">
              <PieChart className="h-4 w-4" />
            </div>
            <h3 className="font-bold text-slate-800 text-sm">{title}</h3>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
        </div>

        <div className="text-xs text-slate-500 font-medium">
          Total Keseluruhan: <span className="font-bold font-mono text-slate-800">{totalOrders} Pesanan</span>
        </div>
      </div>

      {isLoading && (
        <div className="absolute inset-0 bg-white/70 backdrop-blur-[1px] flex items-center justify-center z-10">
          <span className="text-xs font-semibold text-slate-600 animate-pulse">
            Memuat distribusi status...
          </span>
        </div>
      )}

      {/* Progress Bar Tersegmentasi Proporsional */}
      <div className="mt-4">
        <div className="h-3 w-full rounded-full bg-slate-100 flex overflow-hidden shadow-inner">
          {safeDist.map((item) => {
            const config = STATUS_CONFIG[item.status] || STATUS_CONFIG.draf;
            const pct = totalOrders > 0 ? (item.jumlahPesanan / totalOrders) * 100 : 0;
            if (pct <= 0) return null;
            return (
              <div
                key={`bar-${item.status}`}
                className={`${config.barColor} transition-all duration-500 relative group`}
                style={{ width: `${pct}%` }}
                title={`${item.label}: ${item.jumlahPesanan} pesanan (${pct.toFixed(1)}%)`}
              />
            );
          })}
        </div>
      </div>

      {/* Rincian Status dalam Bentuk Kartu / List */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {safeDist.map((item) => {
          const config = STATUS_CONFIG[item.status] || STATUS_CONFIG.draf;
          const Icon = config.icon;
          const pct = totalOrders > 0 ? ((item.jumlahPesanan / totalOrders) * 100).toFixed(1) : "0.0";

          return (
            <div
              key={item.status}
              className="flex items-start justify-between rounded-lg border border-slate-100 bg-slate-50/60 p-2.5 text-xs transition-colors hover:bg-slate-50"
            >
              <div className="flex items-start gap-2 min-w-0">
                <div className={`rounded-md p-1.5 shrink-0 ${config.bgClass} ${config.textClass}`}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-slate-800 capitalize truncate">
                    {item.label}
                  </div>
                  <div className="text-[10px] text-slate-400 font-normal">
                    {config.desc}
                  </div>
                </div>
              </div>

              <div className="text-right shrink-0 pl-2">
                <div className="font-mono font-bold text-slate-900">
                  {item.jumlahPesanan} <span className="text-[10px] text-slate-400 font-normal">({pct}%)</span>
                </div>
                {showRevenue && "totalNilai" in item && typeof item.totalNilai === "number" && (
                  <div className="font-mono text-[10px] text-slate-500 font-medium">
                    {formatRupiah(item.totalNilai)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
