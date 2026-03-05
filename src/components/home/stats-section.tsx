'use client';

import { useEffect, useRef, useState } from 'react';
import { Shield, Activity, Code2, BarChart3 } from 'lucide-react';

interface StatsSectionProps {
  totalAgents: number;
  verifiedAgents: number;
  volumeDisplay: string;
  avgTrustScore: number;
}

export function StatsSection({ totalAgents, verifiedAgents, volumeDisplay, avgTrustScore }: StatsSectionProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(element);
        }
      },
      { threshold: 0.2, rootMargin: '0px 0px -50px 0px' }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const stats = [
    { label: 'Total Agents', value: totalAgents, icon: Code2 },
    { label: 'Verified', value: verifiedAgents, icon: Shield },
    { label: 'Volume 24h', value: volumeDisplay, icon: BarChart3 },
    { label: 'Avg TRACER Score', value: avgTrustScore, icon: Activity },
  ];

  return (
    <section ref={ref} className="relative z-10 mx-auto max-w-6xl px-6 py-16">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, index) => (
          <div
            key={stat.label}
            className={`glass group p-6 text-center interactive-card ${isVisible ? 'animate-scale-in' : 'opacity-0'}`}
            style={{ animationDelay: isVisible ? `${index * 100}ms` : '0ms' }}
          >
            <stat.icon className="mx-auto mb-3 h-6 w-6 text-primary transition-transform group-hover:scale-110" />
            <div className="text-stat font-bold text-white number-animate font-data">{stat.value}</div>
            <div className="mt-1 text-sm text-text-secondary">{stat.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
