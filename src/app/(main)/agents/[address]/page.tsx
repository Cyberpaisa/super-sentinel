'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink, GitBranch, Bot, Radar } from 'lucide-react';
import Link from 'next/link';
import { RatingForm } from '@/components/agent/rating-form';
import { ReportModal } from '@/components/agent/report-modal';
import { Spinner } from '@/components/shared/spinner';
import { TracerScoreBadge } from '@/components/tracer-score-badge';
import SentinelResults from '@/components/sentinel-results';
import { useAgent, type AgentDetail } from '@/hooks/use-agent';
import { useSentinelScan } from '@/hooks/use-sentinel-scan';
import { cn } from '@/lib/utils/index';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function formatRelativeTime(dateString: string): string {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  return new Date(dateString).toLocaleDateString();
}

function formatAge(dateString: string): string {
  const diffDays = Math.floor((Date.now() - new Date(dateString).getTime()) / 86400000);
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return '1 day';
  if (diffDays < 30) return `${diffDays} days`;
  const months = Math.floor(diffDays / 30);
  return months === 1 ? '1 month' : `${months} months`;
}

function formatEventDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/** Format DB enum values into readable labels (TRADING → Trading, EIP1967 → EIP-1967) */
function formatEnumValue(value: string): string {
  if (value === 'EIP1967') return 'EIP-1967';
  if (value === 'UUPS') return 'UUPS';
  if (value === 'NONE') return 'None';
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

// ─── Status helpers ───────────────────────────────────────────────────────────

function statusClass(status: string): string {
  if (status === 'VERIFIED') return 'text-blue-400 border-blue-500/30 bg-blue-900/20';
  if (status === 'FLAGGED' || status === 'SUSPENDED') return 'text-rose-400 border-rose-500/30 bg-rose-900/20';
  return 'text-slate-500 border-slate-700 bg-slate-800/50';
}

// ─── Service tag colors ──────────────────────────────────────────────────────

function getServiceTagStyle(name: string): string {
  switch (name.toLowerCase()) {
    case 'mcp':  return 'bg-blue-900/20 text-blue-400 border-blue-500/30';
    case 'a2a':  return 'bg-amber-900/20 text-amber-400 border-amber-500/30';
    case 'web':  return 'bg-cyan-900/20 text-cyan-400 border-cyan-500/30';
    case 'oasf': return 'bg-purple-900/20 text-purple-400 border-purple-500/30';
    default:     return 'bg-white/5 text-slate-400 border-white/10';
  }
}

// ─── Known protocols ─────────────────────────────────────────────────────────

const KNOWN_PROTOCOLS = ['MCP', 'A2A', 'x402', 'web', 'github', 'attestations'] as const;

function isProtocolActive(protocol: string, agent: AgentDetail): boolean {
  return (agent.metadata?.services ?? []).some(
    (s) => s.name.toLowerCase() === protocol.toLowerCase(),
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function IdentityRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <span className="text-xs text-[#475569]">{label}</span>
      <span className={cn('text-xs text-[#94A3B8]', mono && 'font-data')}>{value}</span>
    </div>
  );
}

// ─── Tab types ────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'sentinel' | 'activity' | 'community' | 'metadata';

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AgentProfilePage() {
  const params = useParams();
  const address = params.address as string;
  const [copied, setCopied] = useState(false);
  const [embedCopied, setEmbedCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const { data: agent, isLoading, isError, error, refetch } = useAgent(address, {
    refetchInterval: 5 * 60 * 1000,
  });

  const { data: heartbeatData } = useQuery({
    queryKey: ['heartbeats-recent', address],
    queryFn: async () => {
      const res = await fetch(`/api/v1/agents/${address}/heartbeats?period=7d&limit=10`);
      const json = await res.json();
      return json.data ?? null;
    },
    enabled: !!address,
    staleTime: 5 * 60 * 1000,
  });

  const { scan, isScanning, error: scanError, runScan } = useSentinelScan();

  const handleCopy = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleEmbed = () => {
    const snippet = `<iframe src="${window.location.origin}/agents/${address}/embed" width="320" height="160" frameborder="0" style="border:none;"></iframe>`;
    navigator.clipboard.writeText(snippet);
    setEmbedCopied(true);
    setTimeout(() => setEmbedCopied(false), 2000);
  };

  const handleShare = () => {
    if (!agent) return;
    const displayScore = agent.tracerScore?.total ?? agent.trustScore.score;
    const tierLabel = agent.tracerScore?.tier ? ` (${agent.tracerScore.tier})` : '';
    const url = `${window.location.origin}/agents/${address}`;
    const text = [
      `\uD83D\uDD0D ${agent.name} \u2014 TRACER Score: ${displayScore}/100${tierLabel}`,
      `\u2705 ${agent.status} | ${agent.type}`,
      ``,
      `Verified on SuperSentinel \u00B7 Avalanche`,
    ].join('\n');
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
      '_blank',
      'noopener,noreferrer,width=600,height=500',
    );
  };

  const snowtraceUrl =
    agent?.registryAddress && agent?.tokenId
      ? `https://snowtrace.io/token/${agent.registryAddress}?a=${agent.tokenId}#inventory`
      : `https://snowtrace.io/address/${address}`;

  // ─── Loading ─────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Spinner size="lg" />
          <p className="text-sm text-[#64748B]">Loading agent profile…</p>
        </div>
      </div>
    );
  }

  // ─── Error ───────────────────────────────────────────────────────────────────
  if (isError) {
    return (
      <div className="p-6">
        <Link
          href="/scanner/agents"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-[#64748B] transition-colors hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Agents
        </Link>
        <div className="mt-8 flex flex-col items-center justify-center py-16 text-center">
          <h1 className="mb-2 text-lg font-bold text-white">Agent Not Found</h1>
          <p className="mb-6 max-w-md text-sm text-[#64748B]">
            {error?.message || 'Unable to load agent details.'}
          </p>
          <button
            onClick={() => refetch()}
            className="rounded-lg border border-[rgba(255,255,255,0.08)] px-4 py-2 text-sm text-white transition-colors hover:bg-[rgba(255,255,255,0.04)]"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!agent) return null;

  // ─── Derived values ───────────────────────────────────────────────────────────
  const vol24h = agent.volumes?.['24h'];
  const vol24hDisplay = vol24h ? `${parseFloat(vol24h.volumeAvax).toFixed(1)} AVAX` : '—';

  const snapshotStats = [
    { label: 'UPTIME',       value: `${agent.uptime.percentage.toFixed(0)}%` },
    { label: 'VOLUME (24H)', value: vol24hDisplay },
    { label: 'PROXY',        value: agent.proxy.detected ? formatEnumValue(agent.proxy.type) : 'None' },
    { label: 'RATING',       value: agent.ratings.count > 0 ? `${agent.ratings.average.toFixed(1)} / 5` : '—' },
    { label: 'AGE',          value: formatAge(agent.createdAt) },
  ];

  const TRACER_WEIGHTS = { trust: 0.20, reliability: 0.20, autonomy: 0.15, capability: 0.20, economics: 0.10, reputation: 0.15 };
  const TRACER_LABELS: Record<string, string> = { trust: 'Trust', reliability: 'Reliability', autonomy: 'Autonomy', capability: 'Capability', economics: 'Economics', reputation: 'Reputation' };

  const tracerDimensions = agent.tracerScore
    ? (Object.entries(agent.tracerScore.dimensions) as [string, number][]).map(([key, score]) => ({
        label: TRACER_LABELS[key] ?? key,
        score,
        weight: TRACER_WEIGHTS[key as keyof typeof TRACER_WEIGHTS] ?? 0,
      }))
    : null;

  type EventItem = {
    id: string;
    type: 'HEARTBEAT' | 'RATING';
    time: string;
    label: string;
    sortKey: number;
  };

  const hbLogs: Array<{ id: string; timestamp: string; result: string; responseTimeMs: number }> =
    heartbeatData?.logs ?? [];

  const allEvents: EventItem[] = [
    ...hbLogs.map((h) => ({
      id: h.id,
      type: 'HEARTBEAT' as const,
      time: h.timestamp,
      label: `${h.result} · ${h.responseTimeMs}ms`,
      sortKey: new Date(h.timestamp).getTime(),
    })),
    ...(agent.ratings.recent ?? []).map((r) => ({
      id: r.id,
      type: 'RATING' as const,
      time: r.createdAt,
      label: `${r.rating}★ from ${truncateAddress(r.userAddress)}`,
      sortKey: new Date(r.createdAt).getTime(),
    })),
  ]
    .sort((a, b) => b.sortKey - a.sortKey)
    .slice(0, 10);

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'overview',  label: 'Overview' },
    { id: 'sentinel',  label: 'Sentinel Check', count: scan ? scan.orchestrator.results.length : undefined },
    { id: 'activity',  label: 'Activity Log',  count: allEvents.length },
    { id: 'community', label: 'Community Ratings', count: agent.ratings.count },
    ...(agent.metadata ? [{ id: 'metadata' as const, label: 'Technical Metadata' }] : []),
  ];

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">

      {/* Back */}
      <Link
        href="/scanner/agents"
        className="inline-flex w-fit items-center gap-1.5 text-xs text-[#475569] transition-colors hover:text-white"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Agents
      </Link>

      {/* ── Header ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="flex min-w-0 flex-1 items-start gap-4">

          {/* Agent avatar */}
          <div className="shrink-0">
            {agent.metadata?.image ? (
              <img
                src={agent.metadata.image}
                alt={agent.name}
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  const fb = e.currentTarget.nextElementSibling as HTMLElement | null;
                  if (fb) { fb.classList.remove('hidden'); fb.classList.add('flex'); }
                }}
                className="h-16 w-16 rounded-xl object-cover ring-1 ring-[rgba(255,255,255,0.08)]"
              />
            ) : null}
            <div
              className={cn(
                'h-16 w-16 items-center justify-center rounded-xl bg-blue-900/10 ring-1 ring-white/10',
                agent.metadata?.image ? 'hidden' : 'flex',
              )}
            >
              <Bot className="h-7 w-7 text-slate-500" />
            </div>
          </div>

          <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight text-white">{agent.name}</h1>
            <span className="rounded border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[#475569]">
              {formatEnumValue(agent.type)}
            </span>
            <span className={cn('rounded border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider', statusClass(agent.status))}>
              {formatEnumValue(agent.status)}
            </span>
            {(agent.metadata?.services ?? []).map((svc, i) => (
              <span key={`${svc.name}-${i}`} className={cn('rounded border px-2 py-0.5 text-[10px] font-semibold', getServiceTagStyle(svc.name))}>
                {svc.name}
              </span>
            ))}
          </div>

          {agent.description && (
            <p className="mb-3 max-w-2xl text-sm leading-relaxed text-[#94A3B8]">
              {agent.description}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-data text-xs text-[#475569]">
            {agent.tokenId && <span>#{agent.tokenId}</span>}
            {agent.tokenId && <span>·</span>}
            <span>Registered {formatRelativeTime(agent.createdAt)}</span>
            <span>·</span>
            <button
              onClick={handleCopy}
              title="Copy address"
              className="inline-flex items-center gap-1 transition-colors hover:text-white"
            >
              {truncateAddress(address)}
              {copied && <span className="text-blue-400 font-bold"> ✓</span>}
            </button>
            <span>·</span>
            <span>Owner {truncateAddress(agent.ownerAddress)}</span>
          </div>
          </div>
        </div>

        {/* TRACER Score */}
        <div className="shrink-0 sm:text-right">
          {agent.tracerScore ? (
            <>
              <p className="font-data text-5xl font-extrabold leading-none" style={{ color: agent.tracerScore.tier === 'VERIFIED' ? '#60A5FA' : agent.tracerScore.tier === 'PASS' ? '#22D3EE' : agent.tracerScore.tier === 'PARTIAL' ? '#FBBF24' : '#FB7185' }}>
                {agent.tracerScore.total}
              </p>
              <p className="mt-1 text-xs font-bold text-slate-500 uppercase tracking-widest leading-none">SCORE</p>
              <span
                className="mt-3 inline-block rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                style={{
                  backgroundColor: `${agent.tracerScore.tier === 'VERIFIED' ? '#60A5FA' : agent.tracerScore.tier === 'PASS' ? '#22D3EE' : agent.tracerScore.tier === 'PARTIAL' ? '#FBBF24' : '#FB7185'}20`,
                  borderColor: `${agent.tracerScore.tier === 'VERIFIED' ? '#60A5FA' : agent.tracerScore.tier === 'PASS' ? '#22D3EE' : agent.tracerScore.tier === 'PARTIAL' ? '#FBBF24' : '#FB7185'}40`,
                  color: agent.tracerScore.tier === 'VERIFIED' ? '#60A5FA' : agent.tracerScore.tier === 'PASS' ? '#22D3EE' : agent.tracerScore.tier === 'PARTIAL' ? '#FBBF24' : '#FB7185',
                }}
              >
                {agent.tracerScore.tier}
              </span>
            </>
          ) : (
            <>
              <p className="font-data text-5xl font-bold leading-none text-[#475569]">
                —
              </p>
              <p className="mt-1 text-[11px] text-[#475569]">Run a scan</p>
            </>
          )}
        </div>
      </div>

      {/* Flagged / Suspended warning */}
      {(agent.status === 'FLAGGED' || agent.status === 'SUSPENDED') && (
        <div className="rounded-lg border border-[rgba(251,113,133,0.2)] bg-[rgba(251,113,133,0.06)] px-4 py-3 text-sm text-[#FB7185]">
          This agent has been{' '}
          {agent.status === 'FLAGGED'
            ? 'flagged by the community and is under review'
            : 'suspended'}.
        </div>
      )}

      {/* ── Actions ── */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={handleShare}
          className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[rgba(255,255,255,0.08)]"
        >
          Share Certificate
        </button>
        <button
          onClick={handleEmbed}
          className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[rgba(255,255,255,0.08)]"
        >
          {embedCopied ? 'Copied!' : 'Embed'}
        </button>
        <a
          href={snowtraceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[rgba(255,255,255,0.08)]"
        >
          Explorer
          <ExternalLink className="h-3 w-3" />
        </a>
        <Link
          href={`/agents/${address}/trust-graph` as '/'}
          className="inline-flex items-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-900/20 px-4 py-2 text-xs font-bold text-blue-400 transition-colors hover:bg-blue-800/20"
        >
          <GitBranch className="h-3 w-3" />
          Trust Graph
        </Link>
        <button
          onClick={() => runScan(address)}
          disabled={isScanning}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-xs font-semibold transition-colors',
            isScanning
              ? 'cursor-wait border-cyan-500/30 bg-cyan-900/10 text-cyan-400'
              : 'border-cyan-500/30 bg-cyan-900/20 text-cyan-400 hover:bg-cyan-800/20 hover:border-cyan-500/50',
          )}
        >
          <Radar className="h-3 w-3" />
          {isScanning ? 'Scanning…' : 'Sentinel Scan'}
        </button>
        <ReportModal agentAddress={address} />
      </div>

      {/* ── Trust Snapshot strip ── */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[rgba(255,255,255,0.06)] sm:grid-cols-5">
        {snapshotStats.map(({ label, value }) => (
          <div key={label} className="bg-[rgba(255,255,255,0.02)] px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#475569]">{label}</p>
            <p className="font-data mt-1 text-sm font-bold text-white">{value}</p>
          </div>
        ))}
      </div>

      {/* ── Tabs ── */}
      <div className="border-b border-[rgba(255,255,255,0.06)]">
        <div className="flex">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'relative px-4 py-2.5 text-sm font-bold uppercase tracking-tight transition-colors',
                activeTab === tab.id
                  ? 'text-white after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-blue-500'
                  : 'text-slate-500 hover:text-slate-300',
              )}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className="ml-2 rounded-full bg-[rgba(255,255,255,0.06)] px-1.5 py-0.5 text-[10px] text-[#475569]">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab: Overview ── */}
      {activeTab === 'overview' && (
        <div className="flex flex-col gap-6">

          {/* Two-column */}
          <div className="grid gap-4 md:grid-cols-2">

            {/* ERC-8004 Identity */}
            <div className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] p-5">
              <p className="mb-4 text-[10px] font-semibold uppercase tracking-widest text-[#475569]">ERC-8004 Identity</p>
              <div className="divide-y divide-[rgba(255,255,255,0.04)]">
                <IdentityRow label="Agent ID"  value={agent.tokenId ? `#${agent.tokenId}` : '—'} />
                <IdentityRow label="Type"      value={formatEnumValue(agent.type)} />
                <IdentityRow label="Chain"     value="Avalanche C-Chain" />
                <IdentityRow label="Owner"     value={truncateAddress(agent.ownerAddress)} mono />
                {agent.registryAddress && (
                  <IdentityRow label="Registry" value={truncateAddress(agent.registryAddress)} mono />
                )}
                {agent.tokenUri && (
                  <div className="flex items-center justify-between py-2.5">
                    <span className="text-xs text-[#475569]">Token URI</span>
                    <a
                      href={agent.tokenUri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-[#94A3B8] transition-colors hover:text-white"
                    >
                      View <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
                <IdentityRow label="Storage"  value="On-chain" />
              </div>
            </div>

            {/* Right column */}
            <div className="flex flex-col gap-4">
              <div className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] p-5">
                <p className="mb-4 text-[10px] font-semibold uppercase tracking-widest text-[#475569]">What Changed</p>
                <ul className="space-y-2 text-xs text-[#94A3B8]">
                  <li>Registered {formatRelativeTime(agent.createdAt)}</li>
                  {agent.tracerScore && (
                    <li>TRACER score updated {formatRelativeTime(agent.tracerScore.updatedAt)}</li>
                  )}
                  {agent.ratings.recent.length > 0 && (
                    <li>Rating received {formatRelativeTime(agent.ratings.recent[0].createdAt)}</li>
                  )}
                  {heartbeatData?.logs?.[0] ? (
                    <li>
                      Heartbeat:{' '}
                      {heartbeatData.logs[0].result === 'PASS' ? 'last check OK' : 'last check failed'}{' '}
                      · {formatRelativeTime(heartbeatData.logs[0].timestamp)}
                    </li>
                  ) : (
                    <li>Heartbeat: no data yet</li>
                  )}
                </ul>
              </div>

              <div className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] p-5">
                <p className="mb-4 text-[10px] font-semibold uppercase tracking-widest text-[#475569]">Connected Protocols</p>
                <div className="divide-y divide-[rgba(255,255,255,0.04)]">
                  {KNOWN_PROTOCOLS.map((protocol) => {
                    const active = isProtocolActive(protocol, agent);
                    return (
                      <div key={protocol} className="flex items-center justify-between py-2.5">
                        <span className="text-xs text-white">{protocol}</span>
                        <span
                          className={cn(
                            'rounded px-2 py-0.5 text-[10px] font-semibold',
                            active
                              ? 'bg-[rgba(74,222,128,0.1)] text-[#4ADE80]'
                              : 'bg-[rgba(255,255,255,0.04)] text-[#475569]',
                          )}
                        >
                          {active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* TRACER Dimensions */}
          {tracerDimensions ? (
            <div className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] p-5">
              <div className="mb-5 flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[#475569]">TRACER Dimensions</p>
                <p className="font-data text-sm font-bold text-white">
                  {agent.tracerScore!.total}
                  <span className="ml-0.5 text-xs font-normal text-[#475569]">/100</span>
                </p>
              </div>
              <div className="space-y-4">
                {tracerDimensions.map(({ label, score, weight }) => {
                  const barColor = score >= 80 ? '#60A5FA' : score >= 60 ? '#22D3EE' : score >= 40 ? '#FBBF24' : '#FB7185';
                  return (
                    <div key={label}>
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-xs text-[#94A3B8]">{label}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] text-[#475569]">{Math.round(weight * 100)}%</span>
                          <span className="font-data w-7 text-right text-xs font-bold text-white">{score}</span>
                        </div>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                        <div
                          className="h-full rounded-full transition-all duration-700 shadow-[0_0_8px_rgba(255,255,255,0.2)]"
                          style={{ width: `${score}%`, backgroundColor: barColor }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] p-5">
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Radar className="mb-3 h-6 w-6 text-[#475569]" />
                <p className="mb-3 text-sm text-[#475569]">No TRACER score yet</p>
                <button
                  onClick={() => runScan(address)}
                  disabled={isScanning}
                  className="rounded-lg border border-[rgba(34,211,238,0.2)] bg-[rgba(34,211,238,0.06)] px-4 py-2 text-xs font-semibold text-[#22D3EE] transition-colors hover:bg-[rgba(34,211,238,0.1)]"
                >
                  {isScanning ? 'Scanning...' : 'Run Sentinel Scan'}
                </button>
              </div>
            </div>
          )}

        </div>
      )}

      {/* ── Tab: Sentinel ── */}
      {activeTab === 'sentinel' && (
        <div className="flex flex-col gap-6">
          {!scan && !isScanning && !scanError && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Radar className="mb-3 h-8 w-8 text-[#475569]" />
              <p className="mb-4 text-sm text-[#475569]">
                Run a sentinel scan to verify this agent&apos;s health, TLS, and latency.
              </p>
              <button
                onClick={() => runScan(address)}
                className="rounded-lg border border-[rgba(34,211,238,0.2)] bg-[rgba(34,211,238,0.06)] px-5 py-2.5 text-sm font-semibold text-[#22D3EE] transition-colors hover:bg-[rgba(34,211,238,0.1)]"
              >
                Run Sentinel Scan
              </button>
            </div>
          )}

          {isScanning && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Spinner size="lg" />
              <p className="mt-3 text-sm text-[#64748B]">Running sentinel checks…</p>
            </div>
          )}

          {scanError && !scan && (
            <div className="rounded-lg border border-[rgba(251,113,133,0.2)] bg-[rgba(251,113,133,0.06)] px-4 py-3 text-sm text-[#FB7185]">
              Scan failed: {scanError.message}
            </div>
          )}

          {scan && (
            <>
              {/* TRACER Score + Summary */}
              <div className="grid gap-4 md:grid-cols-[240px_1fr]">
                <div className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] p-5">
                  <p className="mb-3 text-center text-[10px] font-semibold uppercase tracking-widest text-[#475569]">
                    TRACER Score
                  </p>
                  <TracerScoreBadge score={scan.tracer} />
                </div>

                <div className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-[#475569]">
                      Sentinel Results
                    </p>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-blue-400 font-bold tracking-tight">{scan.orchestrator.summary.passed} passed</span>
                      {scan.orchestrator.summary.failed > 0 && (
                        <span className="text-rose-400 font-bold tracking-tight">{scan.orchestrator.summary.failed} failed</span>
                      )}
                      {scan.orchestrator.summary.errored > 0 && (
                        <span className="text-amber-400 font-bold tracking-tight">{scan.orchestrator.summary.errored} errored</span>
                      )}
                    </div>
                  </div>
                  <SentinelResults
                    results={scan.orchestrator.results}
                    errors={scan.orchestrator.errors}
                  />
                </div>
              </div>

              {/* Re-scan button */}
              <div className="flex justify-center">
                <button
                  onClick={() => runScan(address)}
                  disabled={isScanning}
                  className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[rgba(255,255,255,0.08)]"
                >
                  {isScanning ? 'Scanning…' : 'Re-scan'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Tab: Activity ── */}
      {activeTab === 'activity' && (
        <div className="flex flex-col gap-6">

          {/* Uptime summary */}
          <div className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] p-5">
            <p className="mb-4 text-[10px] font-semibold uppercase tracking-widest text-[#475569]">Uptime Summary (7d)</p>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                { label: 'Uptime',        value: `${agent.uptime.percentage.toFixed(1)}%` },
                { label: 'Total Checks',  value: agent.uptime.totalPings.toString() },
                { label: 'Successful',    value: agent.uptime.successfulPings.toString() },
                { label: 'Avg Response',  value: `${agent.uptime.averageResponseTimeMs}ms` },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-[10px] uppercase tracking-widest text-[#475569]">{label}</p>
                  <p className="font-data mt-1 text-sm font-bold text-white">{value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Event history */}
          {allEvents.length > 0 ? (
            <div className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)]">
              <div className="border-b border-[rgba(255,255,255,0.06)] px-5 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[#475569]">Event History</p>
              </div>
              <div className="divide-y divide-[rgba(255,255,255,0.04)]">
                {allEvents.map((evt) => (
                  <div key={evt.id} className="flex items-center gap-3 px-5 py-2.5">
                    <span className="font-data shrink-0 text-[10px] text-[#475569]">
                      {formatEventDate(evt.time)}
                    </span>
                    <span
                      className={cn(
                        'shrink-0 rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-tight',
                        evt.type === 'HEARTBEAT'
                          ? 'bg-slate-800 text-slate-400'
                          : 'bg-blue-900/20 text-blue-400 border border-blue-500/20',
                      )}
                    >
                      {evt.type}
                    </span>
                    <span className="truncate text-xs text-[#94A3B8]">{evt.label}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-sm text-[#475569]">No activity recorded yet.</p>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Metadata ── */}
      {activeTab === 'metadata' && agent.metadata && (() => {
        const SKIP_KEYS = new Set(['name', 'description', 'image', 'type', 'services', 'x402Support', 'active', 'registrations', 'supportedTrust']);
        const extraEntries = Object.entries(agent.metadata).filter(
          ([k, v]) => !SKIP_KEYS.has(k) && v !== undefined && v !== null,
        );
        return (
          <div className="flex flex-col gap-4">

            {/* Services */}
            {(agent.metadata.services ?? []).length > 0 && (
              <div className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] p-5">
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-[#475569]">Services</p>
                <div className="flex flex-col gap-2">
                  {agent.metadata.services!.map((svc, i) => (
                    <div key={i} className="rounded-lg border border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.02)] px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-white">{svc.name}</span>
                        {svc.version && (
                          <span className="rounded bg-[rgba(255,255,255,0.06)] px-1.5 py-0.5 font-data text-[10px] text-[#475569]">
                            v{svc.version}
                          </span>
                        )}
                      </div>
                      {svc.endpoint && (
                        <p className="mt-1 break-all font-data text-[11px] text-[#475569]">{svc.endpoint}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Flags */}
            {(agent.metadata.x402Support !== undefined || agent.metadata.active !== undefined) && (
              <div className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] p-5">
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-[#475569]">Capabilities</p>
                <div className="flex flex-wrap gap-2">
                  {agent.metadata.x402Support !== undefined && (
                    <span className={cn(
                      'rounded-full border px-3 py-1 text-[11px] font-semibold',
                      agent.metadata.x402Support
                        ? 'border-[rgba(74,222,128,0.25)] bg-[rgba(74,222,128,0.08)] text-[#4ADE80]'
                        : 'border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] text-[#475569]',
                    )}>
                      x402 {agent.metadata.x402Support ? 'Supported' : 'Not supported'}
                    </span>
                  )}
                  {agent.metadata.active !== undefined && (
                    <span className={cn(
                      'rounded-full border px-3 py-1 text-[11px] font-semibold',
                      agent.metadata.active
                        ? 'border-[rgba(74,222,128,0.25)] bg-[rgba(74,222,128,0.08)] text-[#4ADE80]'
                        : 'border-[rgba(251,113,133,0.25)] bg-[rgba(251,113,133,0.08)] text-[#FB7185]',
                    )}>
                      {agent.metadata.active ? 'Active' : 'Inactive'}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Supported Trust */}
            {(agent.metadata.supportedTrust ?? []).length > 0 && (
              <div className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] p-5">
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-[#475569]">Supported Trust</p>
                <div className="flex flex-wrap gap-1.5">
                  {agent.metadata.supportedTrust!.map((t) => (
                    <span key={t} className="rounded border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-2 py-0.5 text-[11px] text-[#94A3B8]">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Registrations */}
            {(agent.metadata.registrations ?? []).length > 0 && (
              <div className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] p-5">
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-[#475569]">Registrations</p>
                <div className="divide-y divide-[rgba(255,255,255,0.04)]">
                  {agent.metadata.registrations!.map((reg, i) => (
                    <div key={i} className="flex items-center justify-between py-2.5">
                      <span className="font-data text-xs text-[#94A3B8]">#{reg.agentId}</span>
                      <span className="font-data text-[11px] text-[#475569]">{truncateAddress(reg.agentRegistry)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Additional fields */}
            {extraEntries.length > 0 && (
              <div className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] p-5">
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-[#475569]">Additional Fields</p>
                <div className="divide-y divide-[rgba(255,255,255,0.04)]">
                  {extraEntries.map(([key, value]) => (
                    <div key={key} className="flex items-start justify-between gap-4 py-2.5">
                      <span className="shrink-0 text-xs text-[#475569]">{key}</span>
                      <span className="break-all text-right font-data text-xs text-[#94A3B8]">
                        {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {(agent.metadata.services ?? []).length === 0 &&
              agent.metadata.x402Support === undefined &&
              agent.metadata.active === undefined &&
              (agent.metadata.supportedTrust ?? []).length === 0 &&
              (agent.metadata.registrations ?? []).length === 0 &&
              extraEntries.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <p className="text-sm text-[#475569]">No metadata fields available for this agent.</p>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Tab: Community ── */}
      {activeTab === 'community' && (
        <div className="flex flex-col gap-4">
          <RatingForm agentAddress={address} />

          {agent.ratings.count > 0 ? (
            <div className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] p-5">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[#475569]">Community Ratings</p>
                <p className="font-data text-sm font-bold text-white">
                  {agent.ratings.average.toFixed(1)}
                  <span className="ml-1 text-xs font-normal text-[#475569]">
                    / 5 · {agent.ratings.count} ratings
                  </span>
                </p>
              </div>
              <div className="space-y-3">
                {agent.ratings.recent.map((rating) => (
                  <div
                    key={rating.id}
                    className="rounded-lg border border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.02)] p-4"
                  >
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-[#94A3B8]">
                        {'★'.repeat(rating.rating)}
                        <span className="text-[#334155]">{'★'.repeat(5 - rating.rating)}</span>
                      </span>
                      <span className="font-data text-[10px] text-[#475569]">
                        {formatRelativeTime(rating.createdAt)}
                      </span>
                    </div>
                    {rating.review && <p className="text-xs text-[#94A3B8]">{rating.review}</p>}
                    <p className="mt-1.5 font-data text-[10px] text-[#475569]">
                      {truncateAddress(rating.userAddress)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <p className="text-sm text-[#475569]">No ratings yet. Be the first to rate this agent.</p>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
