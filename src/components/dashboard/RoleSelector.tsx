"use client";

import React from "react";
import { UserRole, USER_ROLES } from "@/types/dashboard";
import { DbUserRole, roleDisplayLabel } from "@/types/auth";
import { Briefcase, TrendingUp, Boxes, Lock } from "lucide-react";

interface RoleSelectorProps {
  currentRole: UserRole;
  onSelectRole: (role: UserRole) => void;
  userRole?: DbUserRole;
}

export default function RoleSelector({
  currentRole,
  onSelectRole,
  userRole,
}: RoleSelectorProps) {
  const isManager = userRole === "manajer";

  const roles: { id: UserRole; icon: React.ElementType }[] = [
    { id: "manager", icon: Briefcase },
    { id: "sales", icon: TrendingUp },
    { id: "warehouse", icon: Boxes },
  ];

  const activeConfig = USER_ROLES[currentRole];

  return (
    <div className="rounded-xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-xs">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {isManager
                ? "Simulasi Pratinjau Departemen (Wewenang Eksekutif)"
                : "Peran Operasional Terverifikasi"}
            </span>
            {!isManager && userRole && (
              <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 border border-slate-200">
                <Lock className="h-3 w-3 text-slate-500" />
                Terkunci di Database
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-slate-600">
            {isManager
              ? "Sebagai Manajer, pilih departemen di bawah untuk melihat pratinjau struktur kartu dan indikator operasional:"
              : `Akun Anda terotentikasi sebagai ${roleDisplayLabel(
                  userRole || "penjualan"
                )}. Akses data dibatasi ketat oleh otorisasi server (PRD Bab 7).`}
          </p>
        </div>

        {/* Role Toggle Buttons */}
        <div className="flex flex-wrap gap-2 p-1 bg-slate-100 rounded-xl border border-slate-200">
          {roles.map(({ id, icon: Icon }) => {
            const role = USER_ROLES[id];
            const isActive = currentRole === id;
            const isClickable = isManager || isActive;

            return (
              <button
                key={id}
                type="button"
                disabled={!isClickable}
                onClick={() => {
                  if (isClickable) onSelectRole(id);
                }}
                title={
                  !isClickable
                    ? `Peran Anda terikat pada profil database (${roleDisplayLabel(
                        userRole || "penjualan"
                      )})`
                    : `Lihat tampilan ${role.label}`
                }
                className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-all ${
                  isActive
                    ? "bg-white text-blue-700 shadow-xs border border-slate-200 cursor-default"
                    : isClickable
                    ? "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 cursor-pointer"
                    : "text-slate-400 opacity-40 cursor-not-allowed"
                }`}
              >
                <Icon
                  className={`h-4 w-4 ${
                    isActive
                      ? "text-blue-600"
                      : isClickable
                      ? "text-slate-500"
                      : "text-slate-400"
                  }`}
                />
                <span>{role.label}</span>
                {!isManager && !isActive && (
                  <Lock className="h-3 w-3 text-slate-400" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Role explanation bar */}
      <div className="mt-3.5 flex items-center gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
        <span className="font-semibold text-slate-700">Fokus Peran:</span>
        <span>{activeConfig.focusArea}</span>
        <span className="text-slate-300">•</span>
        <span className="text-slate-500 italic">{activeConfig.description}</span>
      </div>
    </div>
  );
}
