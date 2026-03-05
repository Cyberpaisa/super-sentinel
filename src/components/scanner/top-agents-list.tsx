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
  if (score >= 80) return '#4ADE80';
  if (score >= 60) return '#22D3EE';
  if (score >= 40) return '#FCD34D';
  return '#FB7185';
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
          <TrendingUp className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-white">Top Agents</h3>
        </div>
        <span className="text-[10px] text-[#475569]">By TRACER score</span>
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
                'hover:bg-[rgba(255,255,255,0.04)]',
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
              <span className="min-w-0 flex-1 truncate text-xs text-[#94A3B8] group-hover:text-white transition-colors">
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
