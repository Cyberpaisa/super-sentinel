import Link from 'next/link';
import {
  ArrowRight,
  Fingerprint,
  ShieldCheck,
  Network,
  Brain,
  ShieldAlert,
  Zap,
} from 'lucide-react';
import { Header, Footer } from '@/components/layout';
import { HowItWorksSection } from '@/components/home';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-black text-white selection:bg-[#8cf6ff]/20 selection:text-white overflow-x-hidden">
      <Header />

      {/* ─── HERO ─── */}
      <section className="relative min-h-[calc(100vh-5rem)] flex flex-col items-center justify-center px-8 pb-24 overflow-visible bg-black">
        {/* Background Orbs */}
        <div
          className="pointer-events-none absolute top-[-10%] left-[-5%] w-[600px] h-[600px] rounded-full bg-[#043aeb]/20 blur-[120px]"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute bottom-[20%] right-[-5%] w-[500px] h-[500px] rounded-full bg-[#8cf6ff]/10 blur-[100px]"
          aria-hidden="true"
        />

        <div className="max-w-5xl w-full mx-auto text-center relative z-10 pt-8">
          {/* Mainnet Live — ping badge */}
          <div className="inline-flex items-center gap-3 mb-8 px-4 py-1.5 rounded-full glass-panel">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-[#8cf6ff] opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#8cf6ff]" />
            </span>
            <span className="text-[10px] uppercase tracking-widest text-[#ababab] font-medium">
              Mainnet Live
            </span>
          </div>

          {/* Pre-headline — Instrument Serif Italic */}
          <p className="font-[var(--font-serif)] italic text-[clamp(1.5rem,4vw,3rem)] text-[#ababab] mb-4">
            Trust Intelligence for
          </p>

          {/* Main Headline — Instrument Sans gradient */}
          <h1 className="hero-gradient-text font-[var(--font-display)] font-bold text-[clamp(3.5rem,12vw,136px)] leading-[0.95] tracking-tighter mb-8 pb-4">
            Autonomous
            <br />
            Agents
          </h1>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
            {/* Primary — White pill with blue arrow */}
            <Link
              href="/scanner"
              className="group inline-flex items-center gap-3 pl-6 pr-2 py-2 rounded-full bg-white hover:shadow-[0_0_20px_rgba(255,255,255,0.3)] hover:scale-[1.02] transition-all duration-200"
            >
              <span className="font-[var(--font-display)] font-medium text-lg text-[#0a0400]">
                Get Started
              </span>
              <span className="flex items-center justify-center w-10 h-10 rounded-full bg-[#043aeb] group-hover:bg-[#0036e2] transition-colors">
                <ArrowRight className="h-5 w-5 text-white" />
              </span>
            </Link>

            {/* Secondary — Ghost */}
            <Link
              href="/docs"
              className="group inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white/70 hover:text-white backdrop-blur-sm hover:bg-white/5 transition-all"
            >
              Watch Demo
              <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
        </div>

        {/* Dashboard Mockup */}
        <div className="max-w-6xl w-full mx-auto mt-16 relative z-10">
          {/* Window chrome */}
          <div className="glass-panel rounded-t-2xl p-3 flex items-center justify-between">
            <div className="flex gap-1.5 px-2">
              <div className="w-3 h-3 rounded-full bg-red-500/20" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/20" />
              <div className="w-3 h-3 rounded-full bg-green-500/20" />
            </div>
            <div className="bg-[#131313] px-12 py-1 rounded-full text-[10px] text-[#ababab] font-mono">
              supersentinel.ai/dashboard/live-nodes
            </div>
            <div className="w-12" />
          </div>

          {/* Dashboard body */}
          <div className="glass-panel rounded-b-2xl p-8 grid grid-cols-1 md:grid-cols-12 gap-16 shadow-[0px_24px_48px_rgba(0,0,0,0.8)]">
            {/* Left: Trust Score Gauge */}
            <div className="md:col-span-4 flex flex-col items-center justify-center p-8 bg-[#131313] rounded-2xl">
              <div className="relative w-48 h-48 flex items-center justify-center">
                <svg
                  className="w-full h-full -rotate-90"
                  viewBox="0 0 192 192"
                >
                  <circle
                    cx="96"
                    cy="96"
                    r="88"
                    fill="transparent"
                    stroke="#262626"
                    strokeWidth="8"
                  />
                  <circle
                    cx="96"
                    cy="96"
                    r="88"
                    fill="transparent"
                    stroke="#8cf6ff"
                    strokeWidth="8"
                    strokeDasharray="552.92"
                    strokeDashoffset="33.17"
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute flex flex-col items-center">
                  <span className="text-5xl font-[var(--font-display)] font-bold text-white">
                    94
                  </span>
                  <span className="text-[10px] uppercase tracking-widest text-[#ababab]">
                    Healthy
                  </span>
                </div>
              </div>
              <p className="mt-6 text-sm text-[#ababab] text-center">
                System Integrity Score
              </p>
            </div>

            {/* Right: Network Load Chart */}
            <div className="md:col-span-8 bg-[#131313] rounded-2xl p-6 flex flex-col justify-between">
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h3 className="font-[var(--font-display)] font-bold text-white">
                    Network Load
                  </h3>
                  <p className="text-xs text-[#ababab]">
                    Real-time verification spikes
                  </p>
                </div>
                <span className="text-[#8cf6ff] font-mono text-xs">
                  +12.4%
                </span>
              </div>
              <div className="flex items-end gap-2 h-40">
                {[40, 65, 50, 85, 60, 95, 70, 45].map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 bg-[#8cf6ff] rounded-t-sm transition-all duration-500"
                    style={{ height: `${h}%`, opacity: 0.2 + (h / 100) * 0.8 }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── LIVE TICKER ─── */}
      <div className="w-full bg-[#191919] py-3 overflow-hidden whitespace-nowrap">
        <div className="flex gap-12 animate-marquee-fast font-mono text-[11px] text-[#8cf6ff]/80">
          {[0, 1].map((set) => (
            <div key={set} className="flex items-center gap-12">
              <span className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#8cf6ff]" />
                AGENT_VERIFIED: #8291-ALPHA
              </span>
              <span className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#8cf6ff]" />
                TRUST_SCORE_UPDATE: 0.992
              </span>
              <span className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#ff716c]" />
                THREAT_NEUTRALIZED: VECTOR_X7
              </span>
              <span className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#8cf6ff]" />
                AGENT_VERIFIED: #1104-OMEGA
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ─── METRICS ─── */}
      <section className="py-24 px-8">
        <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-12">
          <MetricBar value="2.4M+" label="Daily Verifications" progress={85} />
          <MetricBar value="99.9%" label="Uptime SLA" progress={99} />
          <MetricBar value="<14ms" label="Inference Latency" progress={70} />
          <MetricBar value="500+" label="Enterprise Nodes" progress={60} />
        </div>
      </section>

      {/* ─── LOGO MARQUEE ─── */}
      <section className="py-12">
        <div className="max-w-6xl mx-auto overflow-hidden">
          <div className="flex justify-around items-center opacity-40 grayscale font-[var(--font-display)] font-bold text-2xl tracking-tighter gap-12 whitespace-nowrap px-8">
            {['Avalanche', 'Chainlink', 'Ethereum', 'Solana', 'Arbitrum', 'Polygon', 'Base'].map(
              (name) => (
                <span key={name}>{name}</span>
              )
            )}
          </div>
        </div>
      </section>

      {/* ─── CAPABILITIES ─── */}
      <section className="py-32 px-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-20">
            <p className="font-[var(--font-serif)] italic text-2xl text-[#ababab] mb-4">
              Enterprise-grade
            </p>
            <h2 className="font-[var(--font-display)] text-5xl font-bold tracking-tight text-white">
              Agent Capabilities
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <CapabilityCard
              icon={<Fingerprint className="h-6 w-6" />}
              title="Neural Fingerprinting"
              description="Unique cryptographic identity for every autonomous instance in your fleet."
            />
            <CapabilityCard
              icon={<ShieldCheck className="h-6 w-6" />}
              title="Real-time Compliance"
              description="Dynamic policy enforcement for cross-border agent transactions."
            />
            <CapabilityCard
              icon={<Network className="h-6 w-6" />}
              title="Mesh Governance"
              description="Decentralized oversight for multi-agent coordination systems."
            />
            <CapabilityCard
              icon={<Brain className="h-6 w-6" />}
              title="Intent Verification"
              description="Probabilistic modeling to ensure agent actions align with owner goals."
            />
            <CapabilityCard
              icon={<ShieldAlert className="h-6 w-6" />}
              title="Adversarial Defense"
              description="Protection against prompt injection and logic-bomb attacks."
            />
            <CapabilityCard
              icon={<Zap className="h-6 w-6" />}
              title="Instant Settlement"
              description="Atomic swaps and sub-second payment finality for agents."
            />
          </div>
        </div>
      </section>

      {/* ─── HOW IT WORKS ─── */}
      <section className="bg-[#131313]">
        <HowItWorksSection />
      </section>

      {/* ─── TESTIMONIALS ─── */}
      <section className="py-32 px-8">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <TestimonialCard
              quote="SuperSentinel is the only solution that provides the level of trust assurance our institutional clients demand for their autonomous agents."
              name="Elena Vance"
              role="CTO, Lumon Data"
            />
            <TestimonialCard
              quote="The latency is practically non-existent. We've scaled our agent pool by 400% since integrating the Sentinel SDK."
              name="Marcus Thorne"
              role="Head of AI, Aetherium"
            />
            <TestimonialCard
              quote="Their intent verification engine caught multiple high-risk logic failures before they reached mainnet. Absolute lifesaver."
              name="Sarah Chen"
              role="Director of Security, Synthetix"
            />
          </div>
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section className="py-32 px-8">
        <div className="max-w-5xl mx-auto relative">
          <div className="glass-panel rounded-3xl p-20 text-center relative overflow-hidden">
            <div
              className="absolute inset-0 bg-gradient-to-br from-[#8cf6ff]/10 to-transparent pointer-events-none"
              aria-hidden="true"
            />
            <h2 className="font-[var(--font-display)] text-5xl md:text-6xl font-bold mb-8 relative z-10 text-white">
              Ready to secure
              <br />
              your autonomy?
            </h2>
            <p className="text-[#ababab] max-w-xl mx-auto mb-12 relative z-10 leading-relaxed">
              Join 500+ enterprises building the future of autonomous economic
              activity on SuperSentinel.
            </p>
            <Link
              href="/scanner"
              className="relative z-10 inline-flex items-center gap-2 bg-[#8cf6ff] text-[#005459] px-12 py-5 rounded-full font-[var(--font-display)] font-bold text-lg hover:scale-[1.05] transition-transform shadow-[0_0_40px_rgba(140,246,255,0.3)]"
            >
              Get Access Now
              <ArrowRight className="h-5 w-5" />
            </Link>
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
    <div className="space-y-4">
      <p className="text-4xl font-[var(--font-display)] font-bold text-white">
        {value}
      </p>
      <p className="text-[11px] text-[#ababab] uppercase tracking-widest">
        {label}
      </p>
      <div className="h-1 bg-[#191919] rounded-full overflow-hidden">
        <div
          className="h-full bg-[#8cf6ff] rounded-full"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

function CapabilityCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="group p-8 bg-[#191919] rounded-2xl hover:bg-[#1f1f1f] transition-colors duration-500">
      <div className="w-12 h-12 rounded-full bg-[#8cf6ff]/10 flex items-center justify-center text-[#8cf6ff] mb-6 group-hover:scale-110 transition-transform duration-300">
        {icon}
      </div>
      <h3 className="font-[var(--font-display)] text-xl font-bold text-white mb-3">
        {title}
      </h3>
      <p className="text-[#ababab] text-sm leading-relaxed">{description}</p>
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
    <div className="glass-panel p-8 rounded-2xl flex flex-col justify-between">
      <p className="text-lg italic text-white leading-relaxed mb-8">
        &ldquo;{quote}&rdquo;
      </p>
      <div>
        <p className="text-white font-bold">{name}</p>
        <p className="text-xs text-[#ababab] uppercase tracking-widest">
          {role}
        </p>
      </div>
    </div>
  );
}
