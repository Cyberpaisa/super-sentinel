'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, RefreshCw, Bell, CheckCircle2, Menu } from 'lucide-react';
import Image from 'next/image';
import { WalletConnectButton } from '@/components/shared/wallet-connect-button';
import { cn } from '@/lib/utils';

type ChainStatus = 'synced' | 'indexing' | 'degraded';

function ChainStatusPill({ status }: { status: ChainStatus }) {
  const config = {
    synced:   { label: 'Synced',   color: 'text-blue-400',    bg: 'bg-blue-900/20',  border: 'border-blue-500/30',  dot: 'bg-blue-400' },
    indexing: { label: 'Indexing', color: 'text-amber-400',  bg: 'bg-amber-900/20',   border: 'border-amber-500/30',   dot: 'bg-amber-400' },
    degraded: { label: 'Degraded', color: 'text-rose-400',  bg: 'bg-rose-900/20', border: 'border-rose-500/30', dot: 'bg-rose-400' },
  }[status];

  return (
    <div className={cn(
      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1',
      config.bg, config.border,
    )}>
      <div className={cn('h-1.5 w-1.5 rounded-full animate-pulse', config.dot)} />
      <span className={cn('text-[11px] font-bold uppercase tracking-tight', config.color)}>
        Network {config.label}
      </span>
    </div>
  );
}

interface DashboardNavbarProps {
  onMenuToggle?: () => void;
}

export function DashboardNavbar({ onMenuToggle }: DashboardNavbarProps) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [chainStatus] = useState<ChainStatus>('synced');

  const handleSync = useCallback(async () => {
    setIsSyncing(true);
    try {
      await fetch('/api/v1/indexer/refresh', { method: 'POST' });
    } finally {
      setTimeout(() => setIsSyncing(false), 1500);
    }
  }, []);

  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (search.trim()) {
      router.push(`/scanner?search=${encodeURIComponent(search.trim())}`);
    }
  }, [search, router]);

  return (
    <header className={cn(
      'flex h-14 flex-shrink-0 items-center gap-4 px-5',
      'border-b border-white/5',
      'bg-[#06101F]/90 backdrop-blur-[24px]',
      'relative z-50',
    )}>

      {/* Left — Hamburger (mobile) + Logo + Chain Status */}
      <div className="flex items-center gap-3">
        {/* Mobile menu toggle */}
        <button
          onClick={onMenuToggle}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[#94A3B8] hover:bg-[rgba(255,255,255,0.06)] hover:text-white lg:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-4 w-4" />
        </button>
        <Link href="/" className="flex items-center gap-2 group">
          <Image
            src="/enigma.png"
            alt="SuperSentinel"
            width={28}
            height={28}
            className="rounded-lg object-contain transition-opacity group-hover:opacity-80"
          />
          <span className="text-sm font-bold text-white tracking-tight">SuperSentinel</span>
        </Link>
        <div className="hidden h-4 w-px bg-[rgba(255,255,255,0.08)] sm:block" />
        <ChainStatusPill status={chainStatus} />
      </div>

      {/* Center — Global Search */}
      <form
        onSubmit={handleSearch}
        className="mx-auto hidden max-w-sm flex-1 md:flex"
      >
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#475569]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search agents, wallets, hashes..."
            className={cn(
              'h-9 w-full rounded-lg pl-9 pr-14 text-sm font-medium',
              'bg-white/5 border border-white/10',
              'text-white placeholder:text-slate-500',
              'focus:outline-none focus:border-blue-500/50 focus:bg-white/10',
              'transition-all duration-150',
            )}
          />
          <kbd className={cn(
            'absolute right-2.5 top-1/2 -translate-y-1/2',
            'rounded border border-[rgba(255,255,255,0.08)] px-1.5 py-0.5',
            'text-[10px] font-mono text-[#475569]',
            'bg-[rgba(255,255,255,0.04)]',
          )}>
            ⌘K
          </kbd>
        </div>
      </form>

      {/* Right — Actions */}
      <div className="ml-auto flex items-center gap-2">

        {/* Sync */}
        <button
          onClick={handleSync}
          disabled={isSyncing}
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-150',
            'border border-white/10 bg-white/5',
            'text-slate-400 hover:border-blue-500/50 hover:bg-blue-900/20 hover:text-blue-400',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
          title="Sync indexer"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', isSyncing && 'animate-spin')} />
        </button>

        {/* Notifications */}
        <button className={cn(
          'relative flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-150',
          'border border-white/10 bg-white/5',
          'text-slate-400 hover:bg-white/10 hover:text-white',
        )}>
          <Bell className="h-3.5 w-3.5" />
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-blue-500" />
        </button>

        {/* Register */}
        <Link
          href="/register"
          className={cn(
            'hidden items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold sm:flex uppercase tracking-tight',
            'bg-blue-900/20 border border-blue-500/30 text-blue-400',
            'hover:bg-blue-800/30 hover:border-blue-500/50 transition-all duration-150',
          )}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          Register Agent
        </Link>

        {/* Wallet */}
        <WalletConnectButton className="h-8 text-xs" />
      </div>
    </header>
  );
}
