'use client';

import { useState } from 'react';
import { Bot, ShieldCheck, Activity, Star } from 'lucide-react';
import { type AgentStatus } from '@prisma/client';
import { useAgents } from '@/hooks/use-agents';
import { useAgentStats } from '@/hooks/use-agent-stats';
import { KpiCard } from '@/components/scanner/kpi-card';
import { ActivityChart } from '@/components/scanner/activity-chart';
import { TopAgentsList } from '@/components/scanner/top-agents-list';
import { RecentActivity } from '@/components/scanner/recent-activity';
import { AgentTable } from '@/components/scanner/agent-table';
import { Filters, type FilterValues } from '@/components/scanner/filters';
import { SearchBar } from '@/components/scanner/search-bar';
import { EmptyState } from '@/components/scanner/empty-state';
import { ErrorState } from '@/components/scanner/error-state';
import { AgentTableSkeleton } from '@/components/scanner/agent-table-skeleton';
import { cn } from '@/lib/utils';

const DEFAULT_FILTERS: FilterValues = { service: undefined, status: undefined, trustScoreRange: [0, 100] };

function TablePagination({ page, meta, onPage }: {
  page: number;
  meta?: { page: number; totalPages: number; total: number };
  onPage: (p: number) => void;
}) {
  if (!meta || meta.totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between border-t border-[rgba(255,255,255,0.06)] px-5 py-3">
      <span className="font-data text-xs text-[#64748B]">{meta.total} agents</span>
      <div className="flex items-center gap-1">
        <button
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className={cn(
            'rounded-lg px-3 py-1.5 text-xs transition-all',
            'border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)]',
            'text-[#94A3B8] hover:bg-[rgba(255,255,255,0.06)] hover:text-white',
            'disabled:cursor-not-allowed disabled:opacity-30',
          )}
        >Prev</button>
        <span className="font-data px-3 text-xs text-[#64748B]">{page} / {meta.totalPages}</span>
        <button
          disabled={page >= meta.totalPages}
          onClick={() => onPage(page + 1)}
          className={cn(
            'rounded-lg px-3 py-1.5 text-xs transition-all',
            'border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)]',
            'text-[#94A3B8] hover:bg-[rgba(255,255,255,0.06)] hover:text-white',
            'disabled:cursor-not-allowed disabled:opacity-30',
          )}
        >Next</button>
      </div>
    </div>
  );
}

export default function ScannerPage() {
  const [filters, setFilters] = useState<FilterValues>(DEFAULT_FILTERS);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const isFiltered = !!filters.service || !!filters.status || filters.trustScoreRange[0] > 0 || filters.trustScoreRange[1] < 100;

  const { data, isLoading, isError, refetch } = useAgents({
    ...(filters.service       && { service: filters.service }),
    ...(filters.status        && { status: filters.status as AgentStatus }),
    ...(filters.trustScoreRange[0] > 0  && { minTrustScore: filters.trustScoreRange[0] }),
    ...(filters.trustScoreRange[1] < 100 && { maxTrustScore: filters.trustScoreRange[1] }),
    ...(search                && { search }),
    ...(filters.sortBy        && { sortBy: filters.sortBy }),
    ...(filters.sortOrder     && { sortOrder: filters.sortOrder }),
    page,
    limit: 20,
  });
  const { data: stats } = useAgentStats();

  const agents = data?.agents ?? [];
  const meta   = data?.pagination;

  const verifiedPct = stats && stats.total > 0
    ? Math.round((stats.verified / stats.total) * 100)
    : 0;

  const avgTracerScore = agents.length > 0
    ? Math.round(agents.reduce((s, a) => s + (a.tracer_score ?? a.trust_score), 0) / agents.length)
    : 0;

  const handleReset = () => {
    setFilters(DEFAULT_FILTERS);
    setSearch('');
    setPage(1);
  };

  return (
    <div className="flex flex-col gap-4 p-4 sm:gap-6 sm:p-6">

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="Total Agents"
          value={stats?.total ?? 0}
          delta={stats?.active24h ? `+${stats.active24h} today` : undefined}
          trend="up"
          icon={Bot}
          accentColor="#60A5FA" // blue-400
        />
        <KpiCard
          label="Verified"
          value={`${verifiedPct}%`}
          delta={`${stats?.verified ?? 0} agents`}
          trend={verifiedPct > 50 ? 'up' : 'flat'}
          icon={ShieldCheck}
          accentColor="#22D3EE" // cyan-400
        />
        <KpiCard
          label="Active 24h"
          value={stats?.active24h ?? 0}
          trend="up"
          icon={Activity}
          accentColor="#FBBF24" // amber-400
        />
        <KpiCard
          label="Avg TRACER Score"
          value={avgTracerScore}
          trend={avgTracerScore > 60 ? 'up' : avgTracerScore > 40 ? 'flat' : 'down'}
          icon={Star}
          accentColor="#60A5FA" // blue-400
        />
      </div>

      {/* Activity Chart + Side Widgets */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_272px]">
        <ActivityChart />
        <div className="flex flex-col gap-4">
          <TopAgentsList agents={agents} isLoading={isLoading} />
          <RecentActivity agents={agents} isLoading={isLoading} />
        </div>
      </div>

      {/* Agent Registry Table + Filters sidebar */}
      <div className="flex gap-4">

        {/* Table card */}
        <div className="glass flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.06)] px-5 py-3">
            <div>
              <h2 className="text-sm font-semibold text-white">Agent Registry</h2>
              <p className="mt-0.5 text-xs text-[#64748B]">
                {meta?.total ?? agents.length} agents on-chain
              </p>
            </div>
            <SearchBar value={search} onChange={(v) => { setSearch(v); setPage(1); }} />
          </div>

          {/* Table */}
          <div className="min-w-0 overflow-x-auto">
            {isLoading ? (
              <AgentTableSkeleton rows={8} />
            ) : isError ? (
              <ErrorState onRetry={() => refetch()} />
            ) : agents.length === 0 ? (
              <EmptyState
                variant={search || isFiltered ? 'no-results' : 'no-agents'}
                onResetFilters={handleReset}
              />
            ) : (
              <AgentTable agents={agents} />
            )}
          </div>

          <TablePagination page={page} meta={meta} onPage={setPage} />
        </div>

        {/* Right sidebar: Filters */}
        <div className="hidden w-64 flex-shrink-0 xl:block">
          <div className="glass p-4">
            <p className="mb-4 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              Filters
            </p>
            <Filters
              values={filters}
              onChange={(f) => { setFilters(f); setPage(1); }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
