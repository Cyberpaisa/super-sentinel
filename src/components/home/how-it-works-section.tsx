'use client';

import { useEffect, useRef, useState } from 'react';
import { Cpu, Brain, Shield } from 'lucide-react';

const steps = [
  {
    icon: Cpu,
    title: 'Ingest',
    description:
      'Stream agent telemetry and intent data through secure zero-knowledge tunnels.',
  },
  {
    icon: Brain,
    title: 'Evaluate',
    description:
      'The Sentinel core processes trust scores using multi-vector neural analysis.',
  },
  {
    icon: Shield,
    title: 'Authenticate',
    description:
      'Cryptographic proof is generated and broadcast to the settlement layer.',
  },
];

export function HowItWorksSection() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.unobserve(el);
        }
      },
      { threshold: 0.2, rootMargin: '0px 0px -50px 0px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="relative mx-auto max-w-6xl px-8 py-32 overflow-hidden">
      {/* Dot grid background */}
      <div className="absolute inset-0 opacity-10 dot-grid" aria-hidden="true" />

      {/* Header with serif kicker */}
      <div className="relative mb-20 text-center">
        <p
          className={`font-[var(--font-serif)] italic text-2xl text-[#ababab] mb-4 ${
            visible ? 'animate-fade-in-up' : 'opacity-0'
          }`}
        >
          Protocol Flow
        </p>
        <h2
          className={`font-[var(--font-display)] text-4xl md:text-5xl font-bold text-white tracking-tight ${
            visible ? 'animate-fade-in-up' : 'opacity-0'
          }`}
          style={{ animationDelay: visible ? '100ms' : '0ms' }}
        >
          Three Layers of Intelligence
        </h2>
      </div>

      {/* Steps */}
      <div className="relative grid grid-cols-1 md:grid-cols-3 gap-12">
        {steps.map((item, index) => {
          const Icon = item.icon;
          return (
            <div
              key={item.title}
              className={`text-center ${
                visible ? 'animate-fade-in-up' : 'opacity-0'
              }`}
              style={{
                animationDelay: visible ? `${200 + index * 150}ms` : '0ms',
              }}
            >
              {/* Icon box */}
              <div className="w-20 h-20 bg-black rounded-2xl flex items-center justify-center mx-auto mb-8 shadow-xl">
                <Icon className="h-9 w-9 text-[#8cf6ff]" />
              </div>

              <h3 className="font-[var(--font-display)] text-2xl font-bold text-white mb-4">
                {item.title}
              </h3>
              <p className="text-[#ababab] text-sm leading-relaxed">
                {item.description}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
