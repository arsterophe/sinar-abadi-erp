import React from "react";

export default function PengaturanLoading() {
  return (
    <div className="space-y-6 animate-pulse max-w-7xl mx-auto">
      {/* Header Banner Skeleton */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-slate-200 shrink-0" />
            <div className="space-y-2">
              <div className="h-6 w-56 rounded-md bg-slate-200" />
              <div className="h-3.5 w-72 rounded-md bg-slate-100" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-9 w-28 rounded-xl bg-slate-200" />
          </div>
        </div>
      </div>

      {/* Metric Cards Skeleton */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <div className="h-3.5 w-28 rounded-md bg-slate-200" />
              <div className="h-9 w-9 rounded-xl bg-slate-100" />
            </div>
            <div className="mt-3 space-y-2">
              <div className="h-7 w-20 rounded-md bg-slate-200" />
              <div className="h-3 w-36 rounded-md bg-slate-100" />
            </div>
          </div>
        ))}
      </div>

      {/* Tabs Skeleton */}
      <div className="h-11 w-80 rounded-xl bg-slate-200/70" />

      {/* Main Content Box Skeleton */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-4 border-b border-slate-100 gap-3">
          <div className="space-y-1.5">
            <div className="h-5 w-48 rounded-md bg-slate-200" />
            <div className="h-3.5 w-64 rounded-md bg-slate-100" />
          </div>
          <div className="h-8 w-40 rounded-xl bg-slate-100" />
        </div>
        <div className="space-y-3 pt-2">
          {[1, 2, 3, 4, 5].map((r) => (
            <div key={r} className="h-12 w-full rounded-xl bg-slate-50 border border-slate-100" />
          ))}
        </div>
      </div>
    </div>
  );
}
