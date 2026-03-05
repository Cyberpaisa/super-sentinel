'use client';

import Link from 'next/link';
import { Clock, Database, Shield, ShieldAlert, ShieldCheck, ShieldX } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { type Agent } from '@/hooks/use-agents';
import { type SparklineMap } from '@/hooks/use-agent-sparklines';
import { cn } from '@/lib/utils/index';

function getTrustColor(score: number) {
  if (score >= 80) return { text: 'text-[#4ADE80]', bg: 'bg-[rgba(74,222,128,0.1)]', line: '#4ADE80' };
  if (score >= 60) return { text: 'text-[#22D3EE]', bg: 'bg-[rgba(34,211,238,0.1)]', line: '#22D3EE' };
  if (score >= 40) return { text: 'text-[#FCD34D]', bg: 'bg-[rgba(252,211,77,0.1)]', line: '#FCD34D' };
  return { text: 'text-[#FB7185]', bg: 'bg-[rgba(251,113,133,0.1)]', line: '#FB7185' };
}

function getStatusConfig(status: string) {
  const map: Record<string, { icon: typeof ShieldCheck; text: string; bg: string }> = {
    VERIFIED:  { icon: ShieldCheck, text: 'text-[#4ADE80]', bg: 'bg-[rgba(74,222,128,0.1)]' },
    PENDING:   { icon: Clock,       text: 'text-[#FCD34D]', bg: 'bg-[rgba(252,211,77,0.1)]' },
    FLAGGED:   { icon: ShieldAlert, text: 'text-[#FB7185]', bg: 'bg-[rgba(251,113,133,0.1)]' },
    SUSPENDED: { icon: ShieldX,     text: 'text-[#FB7185]', bg: 'bg-[rgba(251,113,133,0.08)]' },
  };
  return map[status] ?? { icon: Shield, text: 'text-[#64748B]', bg: 'bg-[rgba(255,255,255,0.05)]' };
}


function monogram(name: string) {
  return name.slice(0, 2).toUpperCase();
}

interface AgentCardProps {
  agent: Agent;
  sparklines?: SparklineMap;
}

export function AgentCard({ agent, sparklines = {} }: AgentCardProps) {
  const displayScore = agent.tracer_score ?? agent.trust_score;
  const colors = getTrustColor(displayScore);
  const status = getStatusConfig(agent.status);
  const StatusIcon = status.icon;
  const realData = sparklines[agent.address];
  const hasSparkData = realData && realData.length >= 2;

  return (
    <Link
      href={`/agents/${agent.address}`}
      className={cn(
        'glass group flex flex-col gap-4 p-4 transition-all duration-200',
        'hover:border-[rgba(74,222,128,0.15)] hover:bg-[rgba(74,222,128,0.02)]',
      )}
    >
      {/* Top row: avatar + score */}
      <div className="flex items-start justify-between">
        <div className="relative h-10 w-10 flex-shrink-0">
          {agent.metadata?.image ? (
            <img
              src={agent.metadata.image}
              alt={agent.name}
              className="h-10 w-10 rounded-xl object-cover ring-1 ring-[rgba(255,255,255,0.08)]"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                const fallback = e.currentTarget.nextElementSibling as HTMLElement | null;
                if (fallback) { fallback.classList.remove('hidden'); fallback.classList.add('flex'); }
              }}
            />
          ) : null}
          <div
            className={cn(
              'h-10 w-10 items-center justify-center rounded-xl text-sm font-bold',
              agent.metadata?.image ? 'hidden' : 'flex',
            )}
            style={{ background: `${colors.line}14`, color: colors.line }}
          >
            {monogram(agent.name)}
          </div>
        </div>

        <div className="flex flex-col items-end gap-1">
          <div className={cn('flex items-center gap-1 rounded-lg px-2.5 py-1.5', colors.bg)}>
            <span className={cn('font-data text-lg font-bold leading-none', colors.text)}>
              {displayScore}
            </span>
            <span className="text-[10px] text-[#475569]">/100</span>
          </div>
          {agent.tracer_tier && (
            <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: colors.line }}>
              {agent.tracer_tier}
            </span>
          )}
        </div>
      </div>

      {/* Name + address */}
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-semibold text-white group-hover:text-[#4ADE80] transition-colors">
            {agent.name}
          </p>
          {agent.metadata && (
            <span title="Has on-chain metadata">
              <Database className="h-3 w-3 shrink-0 text-[#475569]" />
            </span>
          )}
        </div>
        <p className="font-data text-[10px] text-[#475569]">
          {agent.address.slice(0, 8)}...{agent.address.slice(-6)}
        </p>
      </div>

      {/* Sparkline */}
      <div className="h-10 w-full">
        {hasSparkData ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={realData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
              <Line
                type="monotone"
                dataKey="v"
                stroke={colors.line}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="w-3/4 h-[1px] bg-[rgba(255,255,255,0.1)]" />
          </div>
        )}
      </div>

      {/* Bottom: status + type */}
      <div className="flex items-center justify-between">
        <div className={cn('flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium', status.bg, status.text)}>
          <StatusIcon className="h-3 w-3" />
          {agent.status}
        </div>
        <span className="text-[10px] text-[#475569]">{agent.type}</span>
      </div>
    </Link>
  );
}
