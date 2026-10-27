"use client";

import React from "react";
import { UserRole, USER_ROLES } from "@/types/dashboard";
import { Briefcase, TrendingUp, Boxes } from "lucide-react";

interface RoleSelectorProps {
  currentRole: UserRole;
  onSelectRole: (role: UserRole) => void;
}

export default function RoleSelector({ currentRole, onSelectRole }: RoleSelectorProps) {
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
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Simulasi Pratinjau Peran Pengguna (Role-based Dashboard)
          </span>
          <p className="mt-0.5 text-sm text-slate-600">
            Pilih peran di bawah ini untuk melihat struktur kartu & indikator yang relevan bagi masing-masing departemen:
          </p>
        </div>

        {/* Role Toggle Buttons */}
        <div className="flex flex-wrap gap-2 p-1 bg-slate-100 rounded-xl border border-slate-200">
          {roles.map(({ id, icon: Icon }) => {
            const role = USER_ROLES[id];
            const isActive = currentRole === id;

            return (
              <button
                key={id}
                onClick={() => onSelectRole(id)}
                className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-all ${
                  isActive
                    ? "bg-white text-blue-700 shadow-xs border border-slate-200"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? "text-blue-600" : "text-slate-500"}`} />
                <span>{role.label}</span>
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
