'use client';

import { useEffect, useRef, useState } from 'react';
import { Cpu, Brain, Shield } from 'lucide-react';

const steps = [
  {
    icon: Cpu,
    title: 'Ingest',
    description:
      'Agents connect to the Sentinel mesh via standard APIs or decentralized protocols.',
  },
  {
    icon: Brain,
    title: 'Evaluate',
    description:
      'Our neural engine runs real-time trust scoring and behavioral analysis.',
  },
  {
    icon: Shield,
    title: 'Authenticate',
    description:
      'Verified intents are cryptographically signed and cleared for execution.',
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
      <div
        className="absolute inset-0 opacity-10 dot-grid"
        aria-hidden="true"
      />

      {/* Header */}
      <div className="relative">
        <h2
          className={`font-[var(--font-headline)] text-4xl md:text-5xl font-bold text-white text-center mb-24 ${
            visible ? 'animate-fade-in-up' : 'opacity-0'
          }`}
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
              className={`text-center space-y-6 ${
                visible ? 'animate-fade-in-up' : 'opacity-0'
              }`}
              style={{
                animationDelay: visible ? `${200 + index * 150}ms` : '0ms',
              }}
            >
              {/* Icon box */}
              <div className="relative inline-block">
                <div className="w-20 h-20 bg-[#162030] rounded-2xl flex items-center justify-center border border-[#3b494b]/20 mx-auto">
                  <Icon className="h-9 w-9 text-[#00eefc]" />
                </div>
              </div>

              <h3 className="font-[var(--font-headline)] text-2xl font-bold text-white">
                {item.title}
              </h3>
              <p className="text-[#b9cacb] text-sm leading-relaxed">
                {item.description}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
