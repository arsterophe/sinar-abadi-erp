import React from "react";

export default function LaporanLoading() {
  return (
    <div className="space-y-6 animate-pulse p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header Banner Skeleton */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-slate-200" />
            <div className="space-y-2">
              <div className="h-6 w-56 rounded-md bg-slate-200" />
              <div className="h-4 w-72 rounded-md bg-slate-100" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-9 w-24 rounded-lg bg-slate-200" />
            <div className="h-9 w-36 rounded-lg bg-slate-200" />
            <div className="h-9 w-40 rounded-lg bg-slate-200" />
          </div>
        </div>
      </div>

      {/* KPI Cards Skeleton */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <div className="h-4 w-28 rounded-md bg-slate-200" />
              <div className="h-9 w-9 rounded-xl bg-slate-100" />
            </div>
            <div className="mt-4 space-y-2">
              <div className="h-7 w-36 rounded-md bg-slate-200" />
              <div className="h-3.5 w-24 rounded-md bg-slate-100" />
            </div>
          </div>
        ))}
      </div>

      {/* Chart Skeleton */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs space-y-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4">
          <div className="space-y-2">
            <div className="h-5 w-64 rounded-md bg-slate-200" />
            <div className="h-3.5 w-80 rounded-md bg-slate-100" />
          </div>
          <div className="flex gap-4">
            <div className="h-4 w-24 rounded-md bg-slate-100" />
            <div className="h-4 w-24 rounded-md bg-slate-100" />
          </div>
        </div>
        <div className="h-64 rounded-xl bg-slate-100 flex items-end justify-around p-4 gap-2">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((c) => (
            <div key={c} className="flex gap-1.5 items-end h-full">
              <div className="w-5 rounded-t-sm bg-slate-200 h-32" />
              <div className="w-5 rounded-t-sm bg-slate-300 h-20" />
            </div>
          ))}
        </div>
      </div>

      {/* Tables Skeleton */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs space-y-4">
        <div className="flex justify-between items-center pb-4 border-b border-slate-100">
          <div className="h-5 w-48 rounded-md bg-slate-200" />
          <div className="h-8 w-44 rounded-md bg-slate-100" />
        </div>
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((r) => (
            <div key={r} className="h-10 w-full rounded-md bg-slate-100" />
          ))}
        </div>
      </div>
    </div>
  );
}
