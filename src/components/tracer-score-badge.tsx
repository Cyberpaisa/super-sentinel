'use client';

import { useMemo } from 'react';
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  ResponsiveContainer,
} from 'recharts';
import type { TRACERScore, TRACERTier } from '@/sentinels/scoring/types';

const TIER_COLORS: Record<TRACERTier, string> = {
  VERIFIED: '#60A5FA', // blue-400
  PASS: '#22D3EE',     // cyan-400
  PARTIAL: '#FBBF24',  // amber-400
  FAIL: '#FB7185',     // rose-400
};

const DIMENSION_LABELS: Record<string, string> = {
  trust: 'Trust',
  reliability: 'Reliability',
  autonomy: 'Autonomy',
  capability: 'Capability',
  economics: 'Economics',
  reputation: 'Reputation',
};

interface TracerScoreBadgeProps {
  score: TRACERScore;
}

export function TracerScoreBadge({ score }: TracerScoreBadgeProps) {
  const tierColor = TIER_COLORS[score.tier];

  const radarData = useMemo(() => {
    return Object.entries(score.dimensions).map(([key, dim]) => ({
      dimension: DIMENSION_LABELS[key] ?? key,
      value: dim.score,
    }));
  }, [score.dimensions]);

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Radar chart */}
      <div className="w-[220px] h-[180px]">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
            <PolarGrid stroke="#475569" strokeOpacity={0.4} />
            <PolarAngleAxis
              dataKey="dimension"
              tick={{ fill: '#94a3b8', fontSize: 11 }}
            />
            <Radar
              dataKey="value"
              stroke={tierColor}
              fill={tierColor}
              fillOpacity={0.2}
              strokeWidth={1.5}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* Score and tier */}
      <div className="flex flex-col items-center gap-1">
        <span className="text-3xl font-bold text-white leading-none">
          {Math.round(score.total)}
        </span>
        <span
          className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
          style={{ backgroundColor: `${tierColor}20`, color: tierColor }}
        >
          {score.tier}
        </span>
      </div>
    </div>
  );
}
