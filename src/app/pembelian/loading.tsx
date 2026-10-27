import React from "react";
import { ShoppingCart, RefreshCw } from "lucide-react";

export default function PembelianLoading() {
  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8 animate-pulse">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Breadcrumb Skeleton */}
        <div className="flex items-center justify-between">
          <div className="h-4 w-44 bg-slate-200 rounded-md"></div>
          <div className="h-8 w-24 bg-slate-200 rounded-lg"></div>
        </div>

        {/* Header Banner Skeleton */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-4">
              <div className="h-11 w-11 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400">
                <ShoppingCart className="h-6 w-6" />
              </div>
              <div className="space-y-2">
                <div className="h-6 w-56 bg-slate-200 rounded-md"></div>
                <div className="h-4 w-80 bg-slate-100 rounded-md"></div>
              </div>
            </div>
            <div className="h-10 w-48 bg-slate-100 rounded-xl"></div>
          </div>
        </div>

        {/* KPI Summary Cards Skeleton */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs space-y-2"
            >
              <div className="h-3 w-24 bg-slate-100 rounded"></div>
              <div className="h-7 w-16 bg-slate-200 rounded"></div>
              <div className="h-2.5 w-28 bg-slate-100 rounded"></div>
            </div>
          ))}
        </div>

        {/* Tabs & Search Bar Skeleton */}
        <div className="flex items-center gap-4 border-b border-slate-200 pb-2">
          <div className="h-6 w-40 bg-slate-200 rounded-md"></div>
          <div className="h-6 w-32 bg-slate-100 rounded-md"></div>
        </div>

        <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="h-9 w-72 bg-slate-100 rounded-lg"></div>
            <div className="h-8 w-64 bg-slate-100 rounded-lg"></div>
          </div>
        </div>

        {/* Data Table Skeleton */}
        <div className="rounded-xl border border-slate-200/90 bg-white shadow-xs overflow-hidden">
          <div className="bg-slate-100 border-b border-slate-200 p-4 flex items-center justify-between">
            <div className="h-4 w-40 bg-slate-200 rounded"></div>
            <RefreshCw className="h-4 w-4 animate-spin text-slate-400" />
          </div>
          <div className="divide-y divide-slate-100 p-2">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((row) => (
              <div
                key={row}
                className="py-3 px-4 flex items-center justify-between gap-4"
              >
                <div className="h-4 w-24 bg-slate-200 rounded font-mono"></div>
                <div className="h-4 w-40 bg-slate-200 rounded"></div>
                <div className="h-4 w-32 bg-slate-100 rounded"></div>
                <div className="h-4 w-16 bg-slate-100 rounded"></div>
                <div className="h-4 w-20 bg-slate-100 rounded-full"></div>
                <div className="h-7 w-16 bg-slate-100 rounded-lg"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
