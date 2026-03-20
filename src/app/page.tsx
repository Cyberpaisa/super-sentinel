import Link from 'next/link';
import {
  ArrowRight,
  ShieldCheck,
  Database,
  Network,
  BadgeCheck,
  Activity,
  Zap,
} from 'lucide-react';
import { Header, Footer } from '@/components/layout';
import { HowItWorksSection } from '@/components/home';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#091423] text-[#d9e3f8] selection:bg-[#00eefc]/20 selection:text-white">
      <Header />

      {/* ─── HERO ─── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-6 overflow-hidden">
        {/* Animated Orb Background */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full -z-10 opacity-60"
          style={{
            background:
              'radial-gradient(circle, rgba(0, 238, 252, 0.15) 0%, rgba(9, 20, 35, 0) 70%)',
          }}
          aria-hidden="true"
        />

        <div className="max-w-4xl text-center z-10 space-y-8">
          {/* Mainnet Live Badge */}
          <div className="animate-fade-in stagger-1 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#2b3546] border border-[#3b494b]/20">
            <span className="w-2 h-2 rounded-full bg-[#00eefc] animate-pulse" />
            <span className="text-xs text-[#7df4ff] uppercase tracking-widest font-medium">
              Mainnet Live
            </span>
          </div>

          {/* Headline */}
          <h1 className="animate-fade-in-up stagger-2 font-[var(--font-headline)] text-6xl md:text-8xl font-bold text-white tracking-tighter leading-[0.9] text-glow">
            Trust Intelligence for{' '}
            <span className="text-[#00eefc]">Autonomous</span> Agents.
          </h1>

          {/* Subtitle */}
          <p className="animate-fade-in-up stagger-3 text-xl text-[#b9cacb] max-w-2xl mx-auto font-light leading-relaxed">
            Secure your agentic workflows with high-precision verification,
            real-time trust scoring, and decentralized compliance.
          </p>

          {/* CTA Buttons */}
          <div className="animate-fade-in-up stagger-4 flex flex-col md:flex-row items-center justify-center gap-4 pt-6">
            <Link
              href="/scanner"
              className="group inline-flex items-center gap-2 bg-[#f6f6f6] text-[#2f3131] px-8 py-4 rounded-full font-[var(--font-headline)] font-bold text-lg hover:shadow-[0_0_20px_rgba(255,255,255,0.3)] transition-all active:scale-[0.95]"
            >
              Get Started
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="/docs"
              className="glass-panel text-white border border-[#3b494b]/30 px-8 py-4 rounded-full font-[var(--font-headline)] font-bold text-lg hover:bg-[#2b3546] transition-all"
            >
              Watch Demo
            </Link>
          </div>
        </div>

        {/* Dashboard Mockup */}
        <div className="animate-fade-in-up stagger-5 mt-24 w-full max-w-6xl mx-auto relative px-4">
          <div className="glass-panel border border-[#3b494b]/20 rounded-t-2xl p-6 shadow-2xl">
            {/* Window Chrome */}
            <div className="flex items-center justify-between mb-8">
              <div className="flex gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500/40" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/40" />
                <div className="w-3 h-3 rounded-full bg-green-500/40" />
              </div>
              <div className="px-4 py-1.5 rounded-md bg-[#050e1d] border border-[#3b494b]/10 text-[10px] text-[#b9cacb] font-mono">
                https://sentinel.network/dashboard/agent-v42
              </div>
            </div>

            <div className="grid grid-cols-12 gap-6">
              {/* Left: Trust Score Gauge */}
              <div className="col-span-12 md:col-span-4">
                <div className="bg-[#121c2b] rounded-lg p-6 border border-[#3b494b]/5">
                  <div className="text-[10px] uppercase tracking-widest text-[#b9cacb] mb-4 font-bold">
                    Global Trust Score
                  </div>
                  <div className="relative flex items-center justify-center py-4">
                    <svg className="w-32 h-32 -rotate-90" viewBox="0 0 128 128">
                      <circle
                        cx="64"
                        cy="64"
                        r="58"
                        fill="transparent"
                        stroke="#2b3546"
                        strokeWidth="8"
                      />
                      <circle
                        cx="64"
                        cy="64"
                        r="58"
                        fill="transparent"
                        stroke="#00eefc"
                        strokeWidth="8"
                        strokeDasharray="364.4"
                        strokeDashoffset="40"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-3xl font-[var(--font-headline)] font-bold text-white">
                        94
                      </span>
                      <span className="text-[10px] text-[#7df4ff]">
                        HEALTHY
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right: Performance Chart */}
              <div className="col-span-12 md:col-span-8">
                <div className="bg-[#121c2b] rounded-lg p-6 border border-[#3b494b]/5 h-full">
                  <div className="flex justify-between items-center mb-6">
                    <div className="text-[10px] uppercase tracking-widest text-[#b9cacb] font-bold">
                      Agent Performance
                    </div>
                    <div className="flex gap-2">
                      <div className="w-2 h-2 rounded-full bg-[#00eefc]" />
                      <div className="w-2 h-2 rounded-full bg-[#2b3546]" />
                    </div>
                  </div>
                  <div className="h-32 flex items-end gap-2">
                    {[12, 24, 16, 28, 32, 20, 24].map((h, i) => (
                      <div
                        key={i}
                        className="w-full bg-[#00eefc]/20 rounded-sm border-t-2 border-[#00eefc]"
                        style={{ height: `${h * 4}px` }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── METRICS BAR ─── */}
      <section className="py-20 bg-[#050e1d] border-y border-[#3b494b]/10">
        <div className="max-w-6xl mx-auto px-8 grid grid-cols-2 md:grid-cols-4 gap-12">
          <MetricBar value="2.4M+" label="Daily Verifications" progress={75} />
          <MetricBar value="99.9%" label="Uptime Precision" progress={99} />
          <MetricBar value="<14ms" label="Validation Latency" progress={50} />
          <MetricBar value="500+" label="Active Protocols" progress={66} />
        </div>
      </section>

      {/* ─── TRUST STRIP (Logo Marquee) ─── */}
      <section className="py-12 bg-[#050e1d] overflow-hidden">
        <div className="flex animate-marquee whitespace-nowrap">
          {[0, 1].map((set) => (
            <div
              key={set}
              className="flex items-center gap-24 px-12 opacity-40 grayscale"
            >
              {['Avalanche', 'Chainlink', 'Ethereum', 'Solana', 'Arbitrum', 'Polygon'].map(
                (name) => (
                  <span
                    key={`${set}-${name}`}
                    className="font-[var(--font-headline)] text-lg font-bold text-white/60 tracking-tight"
                  >
                    {name}
                  </span>
                )
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ─── CAPABILITIES GRID ─── */}
      <section className="py-32 px-8">
        <div className="max-w-6xl mx-auto">
          <div className="mb-20 space-y-4">
            <h2 className="font-[var(--font-headline)] text-4xl md:text-5xl font-bold text-white tracking-tight">
              System Capabilities
            </h2>
            <p className="text-[#b9cacb] max-w-xl">
              Engineered for the next generation of autonomous intelligence and
              machine-to-machine economies.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <CapabilityCard
              number="01"
              icon={<ShieldCheck className="h-8 w-8" />}
              title="Neural Fingerprinting"
              description="Cryptographic proof of identity for LLMs and autonomous agents across distributed networks."
            />
            <CapabilityCard
              number="02"
              icon={<Database className="h-8 w-8" />}
              title="Real-time Compliance"
              description="Automated regulatory adherence monitoring for cross-border agent transactions."
            />
            <CapabilityCard
              number="03"
              icon={<Network className="h-8 w-8" />}
              title="Mesh Governance"
              description="Decentralized decision-making protocols for autonomous swarms and DAO-managed agents."
            />
            <CapabilityCard
              number="04"
              icon={<BadgeCheck className="h-8 w-8" />}
              title="Intent Verification"
              description="Ensuring agent actions align with user intent through zero-knowledge execution proofs."
            />
            <CapabilityCard
              number="05"
              icon={<Activity className="h-8 w-8" />}
              title="Adversarial Defense"
              description="Machine learning models that detect and neutralize prompt injection and social engineering."
            />
            <CapabilityCard
              number="06"
              icon={<Zap className="h-8 w-8" />}
              title="Instant Settlement"
              description="High-throughput payment rails designed specifically for micro-transactions between agents."
            />
          </div>
        </div>
      </section>

      {/* ─── LIVE STATS TICKER ─── */}
      <div className="bg-[#2b3546]/30 border-y border-[#3b494b]/10 py-3 overflow-hidden">
        <div className="flex gap-12 animate-marquee-fast whitespace-nowrap">
          {[0, 1].map((set) => (
            <div
              key={set}
              className="flex items-center gap-12 text-[10px] font-mono text-[#7df4ff]/70"
            >
              <span>EVENT: AGENT_VERIFIED_774 [TXID: 0x44...f9e]</span>
              <span className="w-1 h-1 bg-[#3b494b] rounded-full" />
              <span>TRUST_SCORE_UPDATE: +2.4pts [ORACLE_SOURCE: SSN_1]</span>
              <span className="w-1 h-1 bg-[#3b494b] rounded-full" />
              <span>NEW_NODE_JOINED: REGION_ASIA_PACIFIC</span>
              <span className="w-1 h-1 bg-[#3b494b] rounded-full" />
              <span>THREAT_NEUTRALIZED: PROMPT_INJECTION_DETECTED</span>
            </div>
          ))}
        </div>
      </div>

      {/* ─── HOW IT WORKS ─── */}
      <section className="bg-[#050e1d]">
        <HowItWorksSection />
      </section>

      {/* ─── TESTIMONIALS ─── */}
      <section className="py-32 px-8">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <TestimonialCard
              quote="SuperSentinel is the missing link in the agentic economy. It provides the trust primitives we need to scale autonomous operations safely."
              name="Marcus Thorne"
              role="CTO, NeuralScale"
            />
            <TestimonialCard
              quote="We've reduced agent-related fraud by 84% since implementing the Sentinel trust scoring system. It's an indispensable part of our stack."
              name="Elena Rodriguez"
              role="Head of Trust, FinTech Collective"
            />
            <TestimonialCard
              quote="The precision of their adversarial defense models is unmatched. SuperSentinel sets the standard for autonomous agent security."
              name="David Chen"
              role="Lead Researcher, Quantum Agents"
            />
          </div>
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section className="py-32 px-8">
        <div className="max-w-5xl mx-auto relative">
          {/* Decorative Shapes */}
          <div
            className="absolute -top-12 -left-12 w-24 h-24 border border-[#00eefc]/20 rounded-full animate-pulse"
            aria-hidden="true"
          />
          <div
            className="absolute -bottom-12 -right-12 w-32 h-32 border border-[#00eefc]/10 rounded-lg rotate-45"
            aria-hidden="true"
          />

          <div className="glass-panel p-16 rounded-3xl border border-[#3b494b]/20 text-center space-y-8 relative overflow-hidden">
            <div
              className="absolute inset-0 bg-gradient-to-br from-[#00eefc]/5 to-transparent"
              aria-hidden="true"
            />
            <h2 className="font-[var(--font-headline)] text-5xl font-bold text-white tracking-tight relative">
              Ready to secure your autonomy?
            </h2>
            <p className="text-[#b9cacb] max-w-lg mx-auto relative">
              Join 200+ enterprise teams building the future of autonomous
              intelligence with SuperSentinel.
            </p>
            <div className="flex flex-col md:flex-row max-w-md mx-auto gap-3 relative">
              <Link
                href="/scanner"
                className="flex-1 bg-[#00eefc] text-[#00363a] px-8 py-4 rounded-full font-[var(--font-headline)] font-bold hover:brightness-110 transition-all text-center whitespace-nowrap"
              >
                Get Early Access
              </Link>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

/* ─── Sub-components ─── */

function MetricBar({
  value,
  label,
  progress,
}: {
  value: string;
  label: string;
  progress: number;
}) {
  return (
    <div className="space-y-3">
      <div className="text-4xl font-[var(--font-headline)] font-bold text-white">
        {value}
      </div>
      <div className="text-xs text-[#b9cacb] uppercase tracking-widest">
        {label}
      </div>
      <div className="w-full h-1 bg-[#2b3546] rounded-full overflow-hidden">
        <div
          className="h-full bg-[#00eefc] rounded-full"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

function CapabilityCard({
  number,
  icon,
  title,
  description,
}: {
  number: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="group relative bg-[#121c2b] p-8 rounded-2xl border border-[#3b494b]/10 hover:border-[#00eefc]/50 transition-all duration-300">
      <span className="absolute top-8 right-8 text-4xl font-[var(--font-headline)] font-bold text-white/5 group-hover:text-[#00eefc]/20 transition-colors">
        {number}
      </span>
      <div className="mb-12 text-[#00eefc]">{icon}</div>
      <h3 className="font-[var(--font-headline)] text-xl font-bold text-white mb-4">
        {title}
      </h3>
      <p className="text-[#b9cacb] text-sm leading-relaxed">{description}</p>
    </div>
  );
}

function TestimonialCard({
  quote,
  name,
  role,
}: {
  quote: string;
  name: string;
  role: string;
}) {
  return (
    <div className="glass-panel p-10 rounded-2xl border border-[#3b494b]/10">
      <p className="text-lg text-white font-light leading-relaxed mb-8">
        &ldquo;{quote}&rdquo;
      </p>
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-full bg-[#2b3546]" />
        <div>
          <div className="text-white font-bold text-sm">{name}</div>
          <div className="text-[#b9cacb] text-[10px] uppercase tracking-wider">
            {role}
          </div>
        </div>
      </div>
    </div>
  );
}
