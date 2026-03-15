'use client';

import Link from 'next/link';
import { TrendingUp, ChevronRight } from 'lucide-react';
import { type Agent } from '@/hooks/use-agents';
import { Spinner } from '@/components/shared/spinner';
import { cn } from '@/lib/utils';

interface TopAgentsListProps {
  agents: Agent[];
  isLoading?: boolean;
}

function scoreColor(score: number) {
  if (score >= 80) return '#60A5FA'; // blue-400
  if (score >= 60) return '#22D3EE'; // cyan-400
  if (score >= 40) return '#FBBF24'; // amber-400
  return '#FB7185'; // rose-400
}

function monogram(name: string) {
  return name.slice(0, 2).toUpperCase();
}

export function TopAgentsList({ agents, isLoading }: TopAgentsListProps) {
  const sorted = [...agents]
    .sort((a, b) => (b.tracer_score ?? b.trust_score) - (a.tracer_score ?? a.trust_score))
    .slice(0, 5);

  return (
    <div className="glass p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-blue-400" />
          <h3 className="text-sm font-bold text-white tracking-tight">Top Performance</h3>
        </div>
        <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">By TRACER</span>
      </div>

      <div className="space-y-1">
        {isLoading && (
          <div className="flex justify-center py-5"><Spinner size="sm" /></div>
        )}
        {!isLoading && sorted.length === 0 && (
          <p className="py-4 text-center text-xs text-[#475569]">No agents yet</p>
        )}
        {!isLoading && sorted.map((agent, i) => {
          const displayScore = agent.tracer_score ?? agent.trust_score;
          const color = scoreColor(displayScore);
          return (
            <Link
              key={agent.address}
              href={`/agents/${agent.address}`}
              className={cn(
                'group flex items-center gap-3 rounded-lg px-2 py-2 transition-all duration-150',
                'hover:bg-white/5',
              )}
            >
              {/* Rank */}
              <span className="font-data w-4 text-xs text-[#475569]">{i + 1}</span>

              {/* Avatar */}
              <div
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-[10px] font-bold"
                style={{ background: `${color}14`, color }}
              >
                {monogram(agent.name)}
              </div>

              {/* Name */}
              <span className="min-w-0 flex-1 truncate text-xs text-slate-400 group-hover:text-white transition-colors font-medium">
                {agent.name}
              </span>

              {/* Score */}
              <span className="font-data text-sm font-bold" style={{ color }}>
                {displayScore}
              </span>

              <ChevronRight className="h-3 w-3 text-[#334155] group-hover:text-[#64748B] transition-colors" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
