"use client";

import React, { useState, useId } from "react";
import { TrendingUp, BarChart2, Info } from "lucide-react";
import { SalesTrendPoint } from "@/types/analytics";
import { formatRupiah } from "@/types/pelanggan";

interface SalesTrendChartProps {
  data: SalesTrendPoint[];
  title?: string;
  subtitle?: string;
  isLoading?: boolean;
}

export default function SalesTrendChart({
  data = [],
  title = "Tren Penjualan Harian",
  subtitle = "Grafik omzet penjualan sah dari pesanan berstatus dikirim dan lunas",
  isLoading = false,
}: SalesTrendChartProps) {
  const gradientId = useId();
  const [hoveredPoint, setHoveredPoint] = useState<{
    point: SalesTrendPoint;
    x: number;
    y: number;
  } | null>(null);

  // Periksa apakah seluruh nilai adalah nol atau data kosong
  const safeData = Array.isArray(data) ? data : [];
  const maxNilai = safeData.reduce((max, p) => Math.max(max, p.totalNilai), 0);
  const totalOmzet = safeData.reduce((sum, p) => sum + p.totalNilai, 0);
  const totalPesanan = safeData.reduce((sum, p) => sum + p.jumlahPesanan, 0);
  const isAllZero = maxNilai === 0;

  // Dimensi SVG
  const width = 800;
  const height = 260;
  const paddingLeft = 70;
  const paddingRight = 30;
  const paddingTop = 25;
  const paddingBottom = 40;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  // Hitung skala sumbu Y (pembulatan atas ke kelipatan rapi)
  const yUpper = isAllZero ? 1000000 : Math.ceil(maxNilai * 1.15);
  const yTicks = [0, yUpper * 0.25, yUpper * 0.5, yUpper * 0.75, yUpper];

  // Koordinat titik-titik data
  const points = safeData.map((d, index) => {
    const x =
      safeData.length <= 1
        ? paddingLeft + chartWidth / 2
        : paddingLeft + (index / (safeData.length - 1)) * chartWidth;
    const y = isAllZero
      ? paddingTop + chartHeight
      : paddingTop + chartHeight - (d.totalNilai / yUpper) * chartHeight;
    return { x, y, data: d };
  });

  // Buat path garis dan area SVG
  let pathD = "";
  let areaD = "";

  if (points.length > 0) {
    pathD = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      // Gunakan kurva bezier halus (cubic / tension)
      const prev = points[i - 1];
      const curr = points[i];
      const cx1 = prev.x + (curr.x - prev.x) / 2;
      const cy1 = prev.y;
      const cx2 = prev.x + (curr.x - prev.x) / 2;
      const cy2 = curr.y;
      pathD += ` C ${cx1} ${cy1}, ${cx2} ${cy2}, ${curr.x} ${curr.y}`;
    }

    const firstX = points[0].x;
    const lastX = points[points.length - 1].x;
    const bottomY = paddingTop + chartHeight;
    areaD = `${pathD} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
  }

  // Pilih interval label sumbu X agar tidak bertumpuk
  const step = Math.max(1, Math.ceil(safeData.length / 7));

  return (
    <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs relative">
      {/* Header Chart */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="rounded-md bg-blue-50 p-1.5 text-blue-600">
              <TrendingUp className="h-4 w-4" />
            </div>
            <h3 className="font-bold text-slate-800 text-sm">{title}</h3>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
        </div>

        {/* Ringkasan Angka Periode Terpilih */}
        <div className="flex items-center gap-4 text-xs bg-slate-50/80 rounded-lg px-3 py-1.5 border border-slate-100">
          <div>
            <span className="text-slate-400 block text-[10px]">Total Omzet:</span>
            <span className="font-bold text-slate-800 font-mono">
              {formatRupiah(totalOmzet)}
            </span>
          </div>
          <div className="h-6 w-px bg-slate-200" />
          <div>
            <span className="text-slate-400 block text-[10px]">Total Pesanan Sah:</span>
            <span className="font-bold text-slate-800 font-mono">
              {totalPesanan} Pesanan
            </span>
          </div>
        </div>
      </div>

      {/* SVG Canvas Area */}
      <div className="relative mt-4 w-full">
        {isLoading && (
          <div className="absolute inset-0 bg-white/70 backdrop-blur-[1px] flex items-center justify-center z-10 rounded-lg">
            <span className="text-xs font-semibold text-slate-600 animate-pulse">
              Memuat grafik tren...
            </span>
          </div>
        )}

        {safeData.length === 0 ? (
          <div className="py-16 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
            <BarChart2 className="h-8 w-8 text-slate-300" />
            <span>Tidak ada data deret waktu untuk rentang tanggal ini.</span>
          </div>
        ) : (
          <div className="relative">
            <svg
              viewBox={`0 0 ${width} ${height}`}
              className="w-full h-auto overflow-visible select-none"
              aria-label="Grafik Tren Penjualan Harian"
              role="img"
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.28" />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Grid Garis Horizontal & Label Sumbu Y */}
              {yTicks.map((tickVal, i) => {
                const y =
                  paddingTop + chartHeight - (tickVal / yUpper) * chartHeight;
                return (
                  <g key={`ytick-${i}`}>
                    <line
                      x1={paddingLeft}
                      y1={y}
                      x2={width - paddingRight}
                      y2={y}
                      stroke="#f1f5f9"
                      strokeWidth="1"
                      strokeDasharray={i === 0 ? "none" : "3 3"}
                    />
                    <text
                      x={paddingLeft - 10}
                      y={y + 3.5}
                      textAnchor="end"
                      className="text-[10px] fill-slate-400 font-mono font-medium"
                    >
                      {tickVal === 0
                        ? "Rp0"
                        : tickVal >= 1000000
                        ? `Rp${(tickVal / 1000000).toFixed(tickVal % 1000000 === 0 ? 0 : 1)}jt`
                        : `Rp${(tickVal / 1000).toFixed(0)}rb`}
                    </text>
                  </g>
                );
              })}

              {/* Area & Garis Grafik */}
              {areaD && !isAllZero && (
                <path d={areaD} fill={`url(#${gradientId})`} />
              )}
              {pathD && (
                <path
                  d={pathD}
                  fill="none"
                  stroke={isAllZero ? "#cbd5e1" : "#2563eb"}
                  strokeWidth={isAllZero ? "1.5" : "2.5"}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* Titik-titik Data Interaktif */}
              {points.map((pt, i) => {
                const isHovered =
                  hoveredPoint?.point.date === pt.data.date;
                return (
                  <g key={`pt-${i}`}>
                    {/* Area tangkap hover tak kasat mata yang lebih luas */}
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r="14"
                      fill="transparent"
                      className="cursor-pointer"
                      onMouseEnter={() =>
                        setHoveredPoint({ point: pt.data, x: pt.x, y: pt.y })
                      }
                      onMouseLeave={() => setHoveredPoint(null)}
                      onFocus={() =>
                        setHoveredPoint({ point: pt.data, x: pt.x, y: pt.y })
                      }
                      tabIndex={0}
                      aria-label={`${pt.data.label}: ${formatRupiah(pt.data.totalNilai)}, ${pt.data.jumlahPesanan} pesanan`}
                    />
                    {/* Titik visual */}
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={isHovered ? "5.5" : pt.data.totalNilai > 0 ? "3.5" : "2.5"}
                      fill={
                        isHovered
                          ? "#1d4ed8"
                          : pt.data.totalNilai > 0
                          ? "#3b82f6"
                          : "#94a3b8"
                      }
                      stroke="#ffffff"
                      strokeWidth={isHovered ? "2.5" : "1.5"}
                      className="transition-all duration-150 pointer-events-none"
                    />
                  </g>
                );
              })}

              {/* Label Sumbu X (Tanggal) */}
              {points.map((pt, i) => {
                const showLabel =
                  i === 0 ||
                  i === points.length - 1 ||
                  i % step === 0;
                if (!showLabel) return null;
                return (
                  <text
                    key={`xtick-${i}`}
                    x={pt.x}
                    y={height - 12}
                    textAnchor="middle"
                    className="text-[10px] fill-slate-400 font-medium"
                  >
                    {pt.data.label}
                  </text>
                );
              })}
            </svg>

            {/* Tooltip Dinamis Melayang Adaptif */}
            {hoveredPoint && (() => {
              const xPct = (hoveredPoint.x / width) * 100;
              const yPct = (hoveredPoint.y / height) * 100;
              const isNearTop = yPct < 28;
              const isNearLeft = xPct < 20;
              const isNearRight = xPct > 80;

              let xTransform = "-translate-x-1/2";
              if (isNearLeft) xTransform = "-translate-x-2";
              if (isNearRight) xTransform = "-translate-x-[90%]";

              const yTransform = isNearTop ? "translate-y-3" : "-translate-y-full pb-2";

              return (
                <div
                  className={`absolute z-30 pointer-events-none ${xTransform} ${yTransform} transition-all duration-100`}
                  style={{
                    left: `${xPct}%`,
                    top: `${yPct}%`,
                  }}
                >
                  <div className="rounded-lg bg-slate-900/95 text-white p-2.5 shadow-xl border border-slate-700/50 text-xs min-w-[140px] backdrop-blur-sm">
                    <div className="text-[10px] font-semibold text-slate-300 pb-1 border-b border-slate-700">
                      {hoveredPoint.point.date} ({hoveredPoint.point.label})
                    </div>
                    <div className="pt-1.5 space-y-0.5">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-400 text-[10px]">Omzet:</span>
                        <span className="font-mono font-bold text-emerald-400">
                          {formatRupiah(hoveredPoint.point.totalNilai)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-400 text-[10px]">Volume:</span>
                        <span className="font-mono font-semibold text-white">
                          {hoveredPoint.point.jumlahPesanan} pesanan
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {isAllZero && (
          <div className="mt-2 flex items-center justify-center gap-1.5 text-xs text-slate-400 bg-slate-50 py-1.5 rounded-md border border-slate-100">
            <Info className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <span>
              Tidak ada omzet penjualan sah tercatat pada seluruh tanggal dalam periode ini.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
