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
  { value: 'MCP',  label: 'MCP',  className: 'bg-[rgba(74,222,128,0.1)] text-[#4ADE80] border-[rgba(74,222,128,0.2)]' },
  { value: 'A2A',  label: 'A2A',  className: 'bg-[rgba(252,211,77,0.1)] text-[#FCD34D] border-[rgba(252,211,77,0.2)]' },
  { value: 'web',  label: 'web',  className: 'bg-[rgba(34,211,238,0.1)] text-[#22D3EE] border-[rgba(34,211,238,0.2)]' },
  { value: 'OASF', label: 'OASF', className: 'bg-[rgba(167,139,250,0.1)] text-[#A78BFA] border-[rgba(167,139,250,0.2)]' },
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
  const hasActive =
    !!values.service ||
    !!values.status ||
    values.trustScoreRange[0] > 0 ||
    values.trustScoreRange[1] < 100 ||
    !!values.sortBy;

  const set = (patch: Partial<FilterValues>) => onChange({ ...values, ...patch });

  return (
    <div className="flex flex-col gap-5">

      {/* Service Categories */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#475569]">Service Category</p>
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
                    : 'border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] text-[#64748B] hover:bg-[rgba(255,255,255,0.06)] hover:text-[#94A3B8]',
                )}
              >
                {svc.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Status */}
      <FilterSelect
        label="Status"
        value={values.status ?? 'ALL'}
        options={STATUSES}
        onChange={(v) => set({ status: v === 'ALL' ? undefined : v })}
      />

      {/* Sort by */}
      <FilterSelect
        label="Sort By"
        value={values.sortBy ?? 'trust_score'}
        options={SORT_FIELDS}
        onChange={(v) => set({ sortBy: v as FilterValues['sortBy'] })}
      />

      {/* Sort order */}
      <FilterSelect
        label="Order"
        value={values.sortOrder ?? 'desc'}
        options={SORT_ORDERS}
        onChange={(v) => set({ sortOrder: v as 'asc' | 'desc' })}
      />

      {/* Trust score range */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#475569]">
            TRACER Score
          </p>
          <span className="font-data text-xs font-semibold text-white">
            {values.trustScoreRange[0]} – {values.trustScoreRange[1]}
          </span>
        </div>
        <Slider
          value={values.trustScoreRange}
          onValueChange={(v) => set({ trustScoreRange: [v[0], v[1]] })}
          min={0}
          max={100}
          step={5}
          minStepsBetweenThumbs={1}
          className="w-full"
        />
        <div className="flex justify-between font-data text-[10px] text-[#334155]">
          <span>0</span>
          <span>50</span>
          <span>100</span>
        </div>
      </div>

      {/* Reset */}
      {hasActive && (
        <button
          onClick={() => onChange({ service: undefined, status: undefined, trustScoreRange: [0, 100], sortBy: undefined, sortOrder: undefined })}
          className={cn(
            'flex w-full items-center justify-center gap-1.5 rounded-md py-2 text-xs font-medium transition-all',
            'border border-[rgba(251,113,133,0.2)] text-[#FB7185]',
            'hover:bg-[rgba(251,113,133,0.08)]',
          )}
        >
          <RotateCcw className="h-3 w-3" />
          Clear filters
        </button>
      )}
    </div>
  );
}
