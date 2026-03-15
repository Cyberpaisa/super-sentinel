import Link from 'next/link';
import { ArrowRight, ShieldCheck, Activity, Cpu, Server, Lock, BarChart3, Globe } from 'lucide-react';
import { Header, Footer } from '@/components/layout';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#06101F] text-slate-300 font-sans selection:bg-blue-900 selection:text-white">
      <Header />

      {/* HERO SECTION */}
      <section className="relative flex flex-col items-center justify-center overflow-hidden pt-32 pb-20 px-6 lg:pt-48 lg:pb-32 text-center text-white">
        
        {/* Subtle, dispersed radial gradients for a professional enterprise feel */}
        <div
          className="pointer-events-none absolute left-0 top-0 -translate-x-1/4 -translate-y-1/4 w-[800px] h-[800px]"
          style={{
            background: 'radial-gradient(circle, rgba(30, 64, 175, 0.08) 0%, transparent 50%)',
            filter: 'blur(60px)',
          }}
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute right-0 bottom-0 translate-x-1/4 translate-y-1/4 w-[800px] h-[800px]"
          style={{
            background: 'radial-gradient(circle, rgba(14, 165, 233, 0.04) 0%, transparent 50%)',
            filter: 'blur(70px)',
          }}
          aria-hidden="true"
        />

        <div className="relative z-10 w-full max-w-5xl mx-auto flex flex-col items-center">
          
          <div className="animate-fade-in stagger-1 mb-8 inline-flex items-center gap-2 rounded-full border border-slate-700/50 bg-slate-800/30 px-4 py-1.5 backdrop-blur-sm">
            <span className="h-2 w-2 rounded-full bg-blue-400 opacity-80" />
            <span className="text-[11px] font-semibold tracking-wider text-slate-300 uppercase">SuperSentinel Enterprise v1.5 Deployed</span>
          </div>

          <h1 className="animate-fade-in-up stagger-2 mb-8 text-5xl md:text-7xl lg:text-8xl font-black leading-[1.1] tracking-tight">
            Advanced Security for <br className="hidden md:block"/>
            <span className="text-white">Autonomous Agents</span>
          </h1>

          <p className="animate-fade-in-up stagger-3 mx-auto mb-10 max-w-3xl text-lg md:text-xl font-medium leading-relaxed text-slate-400">
            SuperSentinel provides institutional-grade intelligence and reputation monitoring for decentralized autonomous networks. Protect your infrastructure with continuous verification, real-time analytics, and automated threat prevention.
          </p>

          <div className="animate-fade-in-up stagger-4 flex flex-col sm:flex-row gap-4">
            <Link 
              href="/scanner" 
              className="group inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-8 py-3.5 text-sm font-semibold text-white transition-all hover:bg-blue-500 hover:shadow-lg hover:shadow-blue-900/40"
            >
              Launch Dashboard
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link 
              href="/scanner/agents" 
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 px-8 py-3.5 text-sm font-semibold text-slate-300 transition-all hover:border-slate-500 hover:bg-slate-800/50"
            >
              Explore Registered Agents
            </Link>
          </div>
        </div>
      </section>

      {/* METRICS & TRUST (Enterprise Look) */}
      <section className="relative z-10 border-y border-slate-800/60 bg-slate-900/20 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center divide-x divide-slate-800/50">
            <div className="flex flex-col">
              <span className="text-3xl font-bold text-white mb-2">99.9%</span>
              <span className="text-xs font-semibold tracking-wider text-slate-500 uppercase">Uptime Monitoring</span>
            </div>
            <div className="flex flex-col">
              <span className="text-3xl font-bold text-white mb-2">10ms</span>
              <span className="text-xs font-semibold tracking-wider text-slate-500 uppercase">Scan Latency</span>
            </div>
            <div className="flex flex-col">
              <span className="text-3xl font-bold text-white mb-2">24/7</span>
              <span className="text-xs font-semibold tracking-wider text-slate-500 uppercase">Continuous Defense</span>
            </div>
            <div className="flex flex-col">
              <span className="text-3xl font-bold text-white mb-2">Zero</span>
              <span className="text-xs font-semibold tracking-wider text-slate-500 uppercase">Compromised Agents</span>
            </div>
          </div>
        </div>
      </section>

      {/* CORE CAPABILITIES */}
      <section className="relative py-24 px-6 lg:py-32">
        <div className="max-w-7xl mx-auto">
          
          <div className="text-center mb-16 md:mb-24">
            <h2 className="text-3xl md:text-5xl font-bold text-white tracking-tight mb-6">Institutional Capabilities</h2>
            <p className="max-w-2xl mx-auto text-lg text-slate-400">
              Our architecture is designed to handle high-throughput, mission-critical autonomous contracts with absolute reliability and precision.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            <FeatureCard 
              icon={<ShieldCheck className="h-6 w-6 text-blue-400" />}
              title="Predictive Threat Detection"
              description="Machine learning models analyze smart contract execution patterns instantly to identify and neutralize malicious behavior before it affects your ecosystem."
            />
            <FeatureCard 
              icon={<Globe className="h-6 w-6 text-blue-400" />}
              title="Global Agent Discovery"
              description="A fully decentralized index of autonomous agents, categorized by their on-chain risk profiles, verified credentials, and real-time behavioral score."
            />
            <FeatureCard 
              icon={<BarChart3 className="h-6 w-6 text-blue-400" />}
              title="Regulatory Intelligence"
              description="Maintains exhaustive logs and auditable trails for every tracked agent to guarantee full compliance with upcoming financial data regulations."
            />
            <FeatureCard 
              icon={<Lock className="h-6 w-6 text-blue-400" />}
              title="Immutable Reputation"
              description="Trust scoring that relies entirely on deterministic on-chain logic, eliminating human bias and ensuring perfectly transparent evaluations."
            />
            <FeatureCard 
              icon={<Server className="h-6 w-6 text-blue-400" />}
              title="High-Availability Infrastructure"
              description="Deployed across redundant nodes tailored for Avalanche and EVM-compatible networks, ensuring no single point of failure."
            />
            <FeatureCard 
              icon={<Cpu className="h-6 w-6 text-blue-400" />}
              title="Semantic Analysis"
              description="Proprietary heuristics that interpret the true intent of an autonomous agent's transaction payload in less than twenty milliseconds."
            />
          </div>

        </div>
      </section>

      {/* CTA SECTION */}
      <section className="border-t border-slate-800/60 bg-slate-900/30 py-24 px-6 text-center">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">Ready to secure your network?</h2>
          <p className="text-lg text-slate-400 mb-10">
            Integrate SuperSentinel into your autonomous agent protocols today and guarantee absolute trust and transparency.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Link 
              href="/docs" 
              className="inline-flex items-center justify-center rounded-lg bg-white/5 border border-white/10 px-8 py-3.5 text-sm font-semibold text-white transition-all hover:bg-white/10"
            >
              Read Documentation
            </Link>
            <a 
              href="mailto:contact@supersentinel.io" 
              className="inline-flex items-center justify-center rounded-lg border border-slate-700 bg-transparent px-8 py-3.5 text-sm font-semibold text-slate-300 transition-all hover:border-slate-500"
            >
              Contact Sales
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <div className="flex flex-col items-start p-8 rounded-2xl border border-slate-800/80 bg-slate-800/20 transition-all hover:bg-slate-800/40 hover:border-slate-700">
      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-lg bg-blue-900/20 border border-blue-800/30">
        {icon}
      </div>
      <h3 className="mb-3 text-lg font-bold text-white">{title}</h3>
      <p className="text-sm font-medium leading-relaxed text-slate-400">{description}</p>
    </div>
  );
}
