'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { WalletConnectButton } from '@/components/shared/wallet-connect-button';

const navLinks = [
  { href: '/',               label: 'Home',    exact: true  },
  { href: '/scanner',        label: 'Scanner', exact: true  },
  { href: '/scanner/agents', label: 'Agents',  exact: false },
  { href: '/docs',           label: 'Docs',    exact: false },
  { href: '/register',       label: 'Register',exact: true  },
] as const;

export function Header() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  useEffect(() => { setOpen(false); }, [pathname]);

  return (
    <>
      <header
        className={cn(
          'fixed left-0 right-0 top-0 z-50 transition-all duration-300',
          scrolled
            ? 'bg-[#091423]/80 backdrop-blur-xl'
            : 'bg-transparent',
        )}
      >
        <div className="mx-auto flex h-20 max-w-6xl items-center justify-between px-8">

          {/* Logo */}
          <Link href="/" className="group flex items-center gap-2.5">
            <Image
              src="/enigma.png"
              alt="SuperSentinel"
              width={28}
              height={28}
              className="rounded-lg object-contain transition-opacity group-hover:opacity-80"
            />
            <span className="text-xl font-bold tracking-[-0.04em] text-white font-[var(--font-headline)]">
              SuperSentinel
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-8 md:flex">
            {navLinks.map((link) => {
              const active = link.exact ? pathname === link.href : pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href + link.label}
                  href={link.href}
                  className={cn(
                    'font-[var(--font-headline)] text-sm tracking-tight transition-colors duration-150',
                    active
                      ? 'text-white font-bold border-b border-[#00F0FF] pb-1'
                      : 'text-slate-400 hover:text-white',
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          {/* Right actions */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:block">
              <WalletConnectButton className="h-8 text-xs" />
            </div>
            <Link
              href="/scanner"
              className="hidden md:flex items-center rounded-full bg-[#f6f6f6] px-6 py-2 text-sm font-bold tracking-tight text-[#2f3131] transition-transform active:scale-[0.95]"
            >
              Launch App
            </Link>

            {/* Mobile toggle */}
            <button
              onClick={() => setOpen(p => !p)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-white md:hidden"
            >
              {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        <div className={cn(
          'md:hidden overflow-hidden transition-all duration-200',
          'bg-[#091423]/98 backdrop-blur-xl',
          open ? 'max-h-72 opacity-100' : 'max-h-0 opacity-0',
        )}>
          <nav className="flex flex-col px-8 py-4 gap-1">
            {navLinks.map((link) => {
              const active = link.exact ? pathname === link.href : pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href + link.label}
                  href={link.href}
                  className={cn(
                    'rounded-md px-3 py-2.5 text-sm font-medium transition-all font-[var(--font-headline)]',
                    active ? 'text-white' : 'text-slate-400',
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
            <div className="mt-2 pt-2 border-t border-white/5">
              <WalletConnectButton className="w-full h-9 text-sm" />
            </div>
          </nav>
        </div>
      </header>

      {/* Spacer */}
      <div className="h-20" />
    </>
  );
}

export default Header;
