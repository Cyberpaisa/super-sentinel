'use client';

import { RotateCcw } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils/index';

export interface FilterValues {
  service: string | undefined;
  status: string | undefined;
  trustScoreRange: [number, number];
  sortBy?: 'trust_score' | 'created_at' | 'name';
  sortOrder?: 'asc' | 'desc';
}

interface FiltersProps {
  values: FilterValues;
  onChange: (filters: FilterValues) => void;
}

// ---- option lists -------------------------------------------------------
const SERVICES = [
  { value: 'MCP',  label: 'MCP',  className: 'bg-blue-900/20 text-blue-400 border-blue-500/30' },
  { value: 'A2A',  label: 'A2A',  className: 'bg-amber-900/20 text-amber-400 border-amber-500/30' },
  { value: 'web',  label: 'web',  className: 'bg-cyan-900/20 text-cyan-400 border-cyan-500/30' },
  { value: 'OASF', label: 'OASF', className: 'bg-purple-900/20 text-purple-400 border-purple-500/30' },
];

const STATUSES = [
  { value: 'ALL',       label: 'All statuses' },
  { value: 'VERIFIED',  label: 'Verified'     },
  { value: 'PENDING',   label: 'Pending'      },
  { value: 'FLAGGED',   label: 'Flagged'      },
  { value: 'SUSPENDED', label: 'Suspended'    },
];

const SORT_FIELDS = [
  { value: 'trust_score', label: 'TRACER score' },
  { value: 'created_at',  label: 'Date added'  },
  { value: 'name',        label: 'Name'         },
];

const SORT_ORDERS = [
  { value: 'desc', label: 'High → Low' },
  { value: 'asc',  label: 'Low → High' },
];

// ---- tiny select --------------------------------------------------------
function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-[#475569]">{label}</p>
      <div className="grid grid-cols-1 gap-1">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={cn(
              'w-full rounded-md px-3 py-1.5 text-left text-xs font-medium transition-all duration-100',
              value === opt.value
                ? 'bg-[rgba(74,222,128,0.1)] text-primary border border-[rgba(74,222,128,0.25)]'
                : 'text-[#94A3B8] hover:bg-[rgba(255,255,255,0.04)] hover:text-white border border-transparent',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---- main component -----------------------------------------------------
export function Filters({ values, onChange }: FiltersProps) {
  const hasActive = !!values.service;

  const set = (patch: Partial<FilterValues>) => onChange({ ...values, ...patch });

  return (
    <div className="flex flex-col gap-5">

      {/* Service Categories (Metadata) */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Metadata (Service)</p>
        <div className="flex flex-wrap gap-1.5">
          {SERVICES.map((svc) => {
            const active = values.service === svc.value;
            return (
              <button
                key={svc.value}
                onClick={() => set({ service: active ? undefined : svc.value })}
                className={cn(
                  'rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-all duration-100',
                  active
                    ? svc.className
                    : 'border-white/10 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-300',
                )}
              >
                {svc.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Reset */}
      {hasActive && (
        <button
          onClick={() => onChange({ service: undefined, status: undefined, trustScoreRange: [0, 100], sortBy: undefined, sortOrder: undefined })}
          className={cn(
            'flex w-full items-center justify-center gap-1.5 rounded-md py-2 text-xs font-medium transition-all',
            'border border-slate-700 text-slate-400',
            'hover:bg-slate-800 hover:text-slate-300',
          )}
        >
          <RotateCcw className="h-3 w-3" />
          Clear filters
        </button>
      )}
    </div>
  );
}
