'use client';

import { useState } from 'react';
import {
  Heart,
  ShieldCheck,
  Timer,
  GitBranch,
  FileCheck,
  CircleDot,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import type { SentinelResult } from '@/sentinels/types';

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface SentinelResultsProps {
  results: SentinelResult[];
  errors: Array<{ sentinel: string; reason: string }>;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const SENTINEL_ICONS: Record<string, React.ElementType> = {
  health: Heart,
  tls: ShieldCheck,
  latency: Timer,
  proxy: GitBranch,
  'oz-match': FileCheck,
};

function getIcon(sentinel: string) {
  return SENTINEL_ICONS[sentinel] ?? CircleDot;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Return a hex color based on the 0-100 score. */
function scoreColor(score: number): string {
  if (score > 70) return '#4ADE80';
  if (score >= 40) return '#FCD34D';
  return '#FB7185';
}

/** Render a primitive value as a readable string. */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function DataSection({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data);

  if (entries.length === 0) {
    return <p className="text-sm" style={{ color: '#475569' }}>No data available.</p>;
  }

  return (
    <div className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
      {entries.map(([key, value]) => (
        <div key={key} className="contents">
          <span style={{ color: '#22D3EE' }} className="font-mono">
            {key}
          </span>
          <span
            className="font-mono whitespace-pre-wrap break-all"
            style={{ color: '#94a3b8' }}
          >
            {formatValue(value)}
          </span>
        </div>
      ))}
    </div>
  );
}

function ResultCard({ result }: { result: SentinelResult }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = getIcon(result.sentinel);
  const StatusIcon = result.passed ? CheckCircle2 : XCircle;
  const statusColor = result.passed ? '#4ADE80' : '#FB7185';

  return (
    <div
      className="rounded-lg border p-4"
      style={{
        borderColor: '#334155',
        backgroundColor: 'rgba(30, 41, 59, 0.5)',
      }}
    >
      {/* Header row */}
      <div className="flex items-center gap-3">
        <Icon size={20} style={{ color: '#22D3EE' }} />

        <span className="flex-1 font-medium text-white">
          {capitalize(result.sentinel)}
        </span>

        {/* Score */}
        <span
          className="font-mono text-sm font-semibold tabular-nums"
          style={{ color: scoreColor(result.score) }}
        >
          {result.score}
        </span>

        {/* Pass / Fail */}
        <StatusIcon size={18} style={{ color: statusColor }} />

        {/* Expand toggle */}
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="ml-1 rounded p-1 transition-colors hover:bg-white/5"
          aria-label={expanded ? 'Collapse details' : 'Expand details'}
        >
          {expanded ? (
            <ChevronDown size={16} style={{ color: '#475569' }} />
          ) : (
            <ChevronRight size={16} style={{ color: '#475569' }} />
          )}
        </button>
      </div>

      {/* Expandable data */}
      {expanded && (
        <div className="mt-3 border-t pt-3" style={{ borderColor: '#334155' }}>
          <DataSection data={result.data} />
        </div>
      )}
    </div>
  );
}

function ErrorCard({ error }: { error: { sentinel: string; reason: string } }) {
  return (
    <div
      className="flex items-start gap-3 rounded-lg border p-4"
      style={{
        borderColor: '#334155',
        backgroundColor: 'rgba(30, 41, 59, 0.5)',
      }}
    >
      <AlertTriangle size={20} style={{ color: '#FCD34D' }} className="mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="font-medium text-white">{capitalize(error.sentinel)}</p>
        <p className="mt-1 break-words text-sm" style={{ color: '#FB7185' }}>
          {error.reason}
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export default function SentinelResults({ results, errors }: SentinelResultsProps) {
  if (results.length === 0 && errors.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      {results.map((result) => (
        <ResultCard key={result.sentinel} result={result} />
      ))}

      {errors.length > 0 && (
        <div className="flex flex-col gap-3">
          {results.length > 0 && (
            <p className="mt-2 text-xs font-semibold uppercase tracking-wider" style={{ color: '#475569' }}>
              Errors
            </p>
          )}
          {errors.map((error) => (
            <ErrorCard key={error.sentinel} error={error} />
          ))}
        </div>
      )}
    </div>
  );
}
