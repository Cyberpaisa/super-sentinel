'use client';

import { useRouter } from 'next/navigation';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { ArrowUpDown, Clock, Database, Shield, ShieldAlert, ShieldCheck, ShieldX } from 'lucide-react';
import { useState } from 'react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { type Agent } from '@/hooks/use-agents';
import { type SparklineMap } from '@/hooks/use-agent-sparklines';
import { cn } from '@/lib/utils/index';

interface AgentTableProps {
  agents: Agent[];
  sparklines?: SparklineMap;
  onSortChange?: (sortBy: string, sortOrder: 'asc' | 'desc') => void;
}

function getTrustScoreColor(score: number): string {
  if (score >= 80) return 'text-[#4ADE80] bg-[rgba(74,222,128,0.1)]';
  if (score >= 60) return 'text-[#22D3EE] bg-[rgba(34,211,238,0.1)]';
  if (score >= 40) return 'text-[#FCD34D] bg-[rgba(252,211,77,0.1)]';
  return 'text-[#FB7185] bg-[rgba(251,113,133,0.1)]';
}

function getTrustScoreLineColor(score: number): string {
  if (score >= 80) return '#4ADE80';
  if (score >= 60) return '#22D3EE';
  if (score >= 40) return '#FCD34D';
  return '#FB7185';
}

function getStatusConfig(status: string) {
  const configs = {
    VERIFIED:  { icon: ShieldCheck, className: 'bg-[rgba(74,222,128,0.1)] text-[#4ADE80] border-[rgba(74,222,128,0.2)]' },
    PENDING:   { icon: Clock,       className: 'bg-[rgba(252,211,77,0.1)] text-[#FCD34D] border-[rgba(252,211,77,0.2)]' },
    FLAGGED:   { icon: ShieldAlert, className: 'bg-[rgba(251,113,133,0.1)] text-[#FB7185] border-[rgba(251,113,133,0.2)]' },
    SUSPENDED: { icon: ShieldX,     className: 'bg-[rgba(251,113,133,0.08)] text-[#FB7185] border-[rgba(251,113,133,0.15)]' },
  };
  return configs[status as keyof typeof configs] || {
    icon: Shield,
    className: 'bg-[rgba(255,255,255,0.05)] text-[#64748B] border-[rgba(255,255,255,0.1)]',
  };
}

function formatRelativeTime(dateString: string): string {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  return new Date(dateString).toLocaleDateString();
}

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function MiniSparkline({ score, realData }: {
  score: number;
  realData?: { v: number }[];
}) {
  const hasData = realData && realData.length >= 2;
  const color = getTrustScoreLineColor(score);

  if (!hasData) {
    return (
      <div className="h-8 w-16 flex items-center justify-center">
        <div className="w-10 h-[1px] bg-[rgba(255,255,255,0.1)]" />
      </div>
    );
  }

  return (
    <div className="h-8 w-16">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={realData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function getServiceStyle(service: string): string {
  switch (service.toLowerCase()) {
    case 'mcp':  return 'bg-[rgba(74,222,128,0.1)] text-[#4ADE80] border-[rgba(74,222,128,0.2)]';
    case 'a2a':  return 'bg-[rgba(252,211,77,0.1)] text-[#FCD34D] border-[rgba(252,211,77,0.2)]';
    case 'web':  return 'bg-[rgba(34,211,238,0.1)] text-[#22D3EE] border-[rgba(34,211,238,0.2)]';
    case 'oasf': return 'bg-[rgba(167,139,250,0.1)] text-[#A78BFA] border-[rgba(167,139,250,0.2)]';
    default:     return 'bg-[rgba(255,255,255,0.05)] border-[rgba(255,255,255,0.1)] text-[#64748B]';
  }
}

// X (Twitter) share icon SVG
const XIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.736l7.737-8.843L1.254 2.25H8.08l4.259 5.632zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
  </svg>
);

// ── Static column definitions ─────────────────────────────────────────────────

const columns: ColumnDef<Agent>[] = [
  {
    id: 'rank',
    header: '#',
    cell: ({ row }) => (
      <span className="font-data text-xs text-[#475569]">{row.index + 1}</span>
    ),
    size: 44,
  },
  {
    accessorKey: 'name',
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        className="h-auto p-0 text-[10px] font-semibold uppercase tracking-widest text-[#475569] hover:bg-transparent hover:text-white"
      >
        Name
        <ArrowUpDown className="ml-1.5 h-3 w-3" />
      </Button>
    ),
    cell: ({ row }) => {
      const image = row.original.metadata?.image;
      return (
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div className="relative h-8 w-8 shrink-0">
            {image ? (
              <img
                src={image}
                alt={row.original.name}
                className="h-8 w-8 rounded-lg object-cover ring-1 ring-[rgba(255,255,255,0.08)]"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  const fallback = e.currentTarget.nextElementSibling as HTMLElement | null;
                  if (fallback) { fallback.classList.remove('hidden'); fallback.classList.add('flex'); }
                }}
              />
            ) : null}
            <div
              className={cn(
                'h-8 w-8 items-center justify-center rounded-lg bg-[rgba(255,255,255,0.04)] text-[10px] font-bold text-[#475569] ring-1 ring-[rgba(255,255,255,0.08)]',
                image ? 'hidden' : 'flex',
              )}
            >
              {row.original.name.slice(0, 2).toUpperCase()}
            </div>
          </div>
          {/* Name + address */}
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="font-medium text-white">{row.original.name}</span>
              {row.original.metadata && (
                <span title="Has on-chain metadata">
                  <Database className="h-2.5 w-2.5 shrink-0 text-[#475569]" />
                </span>
              )}
            </div>
            <span className="font-data text-[10px] text-[#475569]">
              {truncateAddress(row.original.address)}
            </span>
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: 'type',
    header: () => (
      <span className="text-[10px] font-semibold uppercase tracking-widest text-[#475569]">Type</span>
    ),
    cell: ({ row }) => {
      const services = row.original.services;
      if (services && services.length > 0) {
        return (
          <div className="flex flex-wrap gap-1">
            {services.map((svc) => (
              <Badge key={svc} variant="outline" className={cn('text-[10px] px-1.5 py-0', getServiceStyle(svc))}>
                {svc}
              </Badge>
            ))}
          </div>
        );
      }
      return (
        <Badge variant="outline" className="text-[10px] bg-[rgba(255,255,255,0.04)] border-[rgba(255,255,255,0.08)] text-[#64748B]">
          {row.original.type}
        </Badge>
      );
    },
    size: 140,
  },
  {
    accessorKey: 'trust_score',
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        className="h-auto p-0 text-[10px] font-semibold uppercase tracking-widest text-[#475569] hover:bg-transparent hover:text-white"
      >
        Score
        <ArrowUpDown className="ml-1.5 h-3 w-3" />
      </Button>
    ),
    cell: ({ row }) => {
      const score = row.original.trust_score;
      return (
        <span className={cn('font-data inline-flex items-center justify-center rounded-md px-2 py-1 text-sm font-bold', getTrustScoreColor(score))}>
          {score}
        </span>
      );
    },
    size: 80,
  },
  {
    accessorKey: 'status',
    header: () => (
      <span className="text-[10px] font-semibold uppercase tracking-widest text-[#475569]">Status</span>
    ),
    cell: ({ row }) => {
      const config = getStatusConfig(row.original.status);
      const Icon = config.icon;
      return (
        <Badge variant="outline" className={cn('gap-1 text-[10px]', config.className)}>
          <Icon className="h-3 w-3" />
          {row.original.status}
        </Badge>
      );
    },
    size: 110,
  },
  {
    accessorKey: 'updated_at',
    header: () => (
      <span className="text-[10px] font-semibold uppercase tracking-widest text-[#475569]">Updated</span>
    ),
    cell: ({ row }) => (
      <span className="font-data text-xs text-[#475569]">
        {formatRelativeTime(row.original.updated_at)}
      </span>
    ),
    size: 110,
  },
];

// ── AgentTable ────────────────────────────────────────────────────────────────

export function AgentTable({ agents, sparklines = {}, onSortChange }: AgentTableProps) {
  const router = useRouter();
  const [sorting, setSorting] = useState<SortingState>([]);

  // Trend column closes over `sparklines` prop
  const trendColumn: ColumnDef<Agent> = {
    id: 'trend',
    header: () => (
      <span className="text-[10px] font-semibold uppercase tracking-widest text-[#475569]">Trend</span>
    ),
    cell: ({ row }) => (
      <MiniSparkline
        score={row.original.trust_score}
        realData={sparklines[row.original.address]}
      />
    ),
    size: 80,
  };

  // Share column — opens X/Twitter directly, no modal
  const shareColumn: ColumnDef<Agent> = {
    id: 'share',
    header: () => null,
    cell: ({ row }) => {
      const agent = row.original;
      const handleShare = (e: React.MouseEvent) => {
        e.stopPropagation();
        const url  = `${window.location.origin}/agents/${agent.address}`;
        const text = [
          `\uD83D\uDD0D ${agent.name} — Trust Score: ${agent.trust_score}/100`,
          `\u2705 ${agent.status} | ${agent.type}`,
          ``,
          `Verified on Enigma \u00B7 Avalanche`,
        ].join('\n');
        window.open(
          `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
          '_blank',
          'noopener,noreferrer,width=600,height=500',
        );
      };
      return (
        <button
          onClick={handleShare}
          title="Share on X"
          className="flex items-center justify-center rounded-lg p-1.5 text-[#475569] transition-colors hover:bg-[rgba(29,161,242,0.08)] hover:text-[#1D9BF0]"
        >
          <XIcon />
        </button>
      );
    },
    size: 40,
  };

  const table = useReactTable({
    data: agents,
    columns: [...columns, trendColumn, shareColumn],
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: (updater) => {
      const newSorting = typeof updater === 'function' ? updater(sorting) : updater;
      setSorting(newSorting);
      if (onSortChange && newSorting.length > 0) {
        const { id, desc } = newSorting[0];
        onSortChange(id, desc ? 'desc' : 'asc');
      }
    },
    state: { sorting },
  });

  return (
    <div className="overflow-x-auto rounded-md border border-[rgba(255,255,255,0.06)]">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow
              key={headerGroup.id}
              className="border-b border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] hover:bg-transparent"
            >
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id} style={{ width: header.getSize() }} className="py-2.5 text-[rgba(255,255,255,0.5)]">
                  {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row, index) => (
            <TableRow
              key={row.id}
              data-href={`/agents/${row.original.address}`}
              onClick={() => router.push(`/agents/${row.original.address}`)}
              className="cursor-pointer border-b border-[rgba(255,255,255,0.04)] transition-colors duration-150 hover:bg-[rgba(74,222,128,0.03)]"
              style={{ animationDelay: `${index * 30}ms` }}
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id} className="py-2.5">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
