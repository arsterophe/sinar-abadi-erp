"use client";

import React from "react";
import {
  Building2,
  Phone,
  MapPin,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Edit2,
} from "lucide-react";
import { DbUserRole } from "@/types/auth";
import { PelangganItem, formatRupiah } from "@/types/pelanggan";

interface PelangganTableProps {
  pelangganList: PelangganItem[];
  userRole: DbUserRole;
  onEdit: (item: PelangganItem) => void;
  startIndex?: number;
  sortField?: "kode" | "nama_toko" | "batas_kredit" | "piutang_berjalan";
  sortDirection?: "asc" | "desc";
  onSort?: (field: "kode" | "nama_toko" | "batas_kredit" | "piutang_berjalan") => void;
}

export default function PelangganTable({
  pelangganList,
  userRole,
  onEdit,
  startIndex = 0,
  sortField,
  sortDirection,
  onSort,
}: PelangganTableProps) {
  const isManager = userRole === "manajer";

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs text-slate-700">
        <thead className="bg-slate-100 text-slate-700 border-b border-slate-200 font-semibold uppercase tracking-wider text-[11px]">
          <tr>
            <th scope="col" className="px-4 py-3.5 w-12 text-center text-slate-500">
              No
            </th>
            <th
              scope="col"
              onClick={() => onSort?.("kode")}
              className={`px-4 py-3.5 w-28 select-none transition-colors ${
                onSort ? "cursor-pointer hover:bg-slate-200/70" : ""
              }`}
            >
              <div className="flex items-center gap-1">
                <span>Kode</span>
                {onSort && (
                  <span className="text-slate-400">
                    {sortField === "kode" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}
                  </span>
                )}
              </div>
            </th>
            <th
              scope="col"
              onClick={() => onSort?.("nama_toko")}
              className={`px-4 py-3.5 min-w-[200px] select-none transition-colors ${
                onSort ? "cursor-pointer hover:bg-slate-200/70" : ""
              }`}
            >
              <div className="flex items-center gap-1">
                <span>Toko &amp; Kontak</span>
                {onSort && (
                  <span className="text-slate-400">
                    {sortField === "nama_toko" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}
                  </span>
                )}
              </div>
            </th>
            <th
              scope="col"
              onClick={() => onSort?.("batas_kredit")}
              className={`px-4 py-3.5 text-right w-36 select-none transition-colors ${
                onSort ? "cursor-pointer hover:bg-slate-200/70" : ""
              }`}
            >
              <div className="flex items-center justify-end gap-1">
                <span>Batas Kredit</span>
                {onSort && (
                  <span className="text-slate-400">
                    {sortField === "batas_kredit" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}
                  </span>
                )}
              </div>
            </th>
            <th scope="col" className="px-3 py-3.5 text-center w-24 text-slate-500">
              Termin
            </th>
            <th
              scope="col"
              onClick={() => onSort?.("piutang_berjalan")}
              className={`px-4 py-3.5 text-right w-36 select-none transition-colors ${
                onSort ? "cursor-pointer hover:bg-slate-200/70" : ""
              }`}
            >
              <div className="flex items-center justify-end gap-1">
                <span>Piutang Berjalan</span>
                {onSort && (
                  <span className="text-slate-400">
                    {sortField === "piutang_berjalan" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}
                  </span>
                )}
              </div>
            </th>
            <th scope="col" className="px-4 py-3.5 text-center w-36 text-slate-500">
              Status Tagihan
            </th>
            <th scope="col" className="px-3 py-3.5 text-center w-24 text-slate-500">
              Status
            </th>
            <th scope="col" className="px-4 py-3.5 text-center w-24 text-slate-500">
              Aksi
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 font-medium">
          {pelangganList.length > 0 ? (
            pelangganList.map((item, index) => {
              const hasOverdue = item.tagihan_terlambat;
              const hasPiutang = item.piutang_berjalan > 0;
              const isOverLimit =
                item.batas_kredit > 0
                  ? item.piutang_berjalan > item.batas_kredit
                  : item.piutang_berjalan > 0;

              return (
                <tr
                  key={item.id}
                  className={`transition-colors hover:bg-slate-50/80 ${
                    hasOverdue ? "bg-rose-50/20" : ""
                  }`}
                >
                  <td className="px-4 py-3.5 text-center text-slate-400 tabular-nums">
                    {startIndex + index + 1}
                  </td>
                  <td className="px-4 py-3.5 font-mono font-bold text-slate-900">
                    {item.kode}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="font-bold text-slate-900 text-sm">
                      {item.nama_toko}
                    </div>
                    <div className="mt-1 flex flex-col gap-0.5 text-slate-500 text-[11px]">
                      <span className="flex items-center gap-1.5">
                        <Phone className="h-3 w-3 text-slate-400 shrink-0" />
                        <span className="font-mono">{item.telepon}</span>
                      </span>
                      <span className="flex items-center gap-1.5 line-clamp-1" title={item.alamat}>
                        <MapPin className="h-3 w-3 text-slate-400 shrink-0" />
                        <span>{item.alamat}</span>
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono font-bold text-slate-900 tabular-nums">
                    {formatRupiah(item.batas_kredit)}
                  </td>
                  <td className="px-3 py-3.5 text-center">
                    <span
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                        item.termin_hari === 0
                          ? "bg-slate-100 text-slate-700"
                          : "bg-blue-50 text-blue-800 border border-blue-200/60"
                      }`}
                    >
                      <Clock className="h-3 w-3" />
                      <span>{item.termin_hari === 0 ? "Tunai" : `${item.termin_hari}h`}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono tabular-nums">
                    <div className={`font-bold ${hasPiutang ? "text-slate-900" : "text-slate-400"}`}>
                      {formatRupiah(item.piutang_berjalan)}
                    </div>
                    {isOverLimit && (
                      <span className="mt-0.5 inline-block text-[10px] font-bold text-rose-600 bg-rose-100 px-1.5 py-0.2 rounded">
                        Melebihi Plafon (BR-05)
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    {hasOverdue ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-700 ring-1 ring-rose-600/30">
                        <AlertTriangle className="h-3.5 w-3.5 text-rose-600 shrink-0" />
                        <span>Lewat Jatuh Tempo</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-600/20">
                        <CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0" />
                        <span>Lancar</span>
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3.5 text-center">
                    {item.aktif ? (
                      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-600/20">
                        Aktif
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-500/20">
                        Nonaktif
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <button
                      onClick={() => onEdit(item)}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-slate-700 hover:bg-slate-50 hover:text-blue-600 transition-colors shadow-2xs cursor-pointer"
                      title={isManager ? "Edit data & batas kredit" : "Lihat / Edit kontak toko"}
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                      <span>{isManager ? "Edit" : "Lihat"}</span>
                    </button>
                  </td>
                </tr>
              );
            })
          ) : (
            <tr>
              <td colSpan={9} className="px-6 py-12 text-center text-slate-500">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400 mb-3">
                  <Building2 className="h-6 w-6" />
                </div>
                <h4 className="text-sm font-bold text-slate-800">
                  Tidak Ada Data Pelanggan yang Sesuai
                </h4>
                <p className="mt-1 text-xs text-slate-400 max-w-sm mx-auto">
                  Gunakan pencarian lain atau sesuaikan filter status untuk melihat pelanggan.
                </p>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
