'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X, ArrowRight } from 'lucide-react';
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
          'fixed left-0 right-0 top-0 z-50 h-14 transition-all duration-300',
          'border-b',
          scrolled
            ? 'border-[rgba(255,255,255,0.08)] bg-[rgba(11,15,20,0.95)] backdrop-blur-[24px]'
            : 'border-transparent bg-[rgba(11,15,20,0.4)] backdrop-blur-[12px]',
        )}
      >
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-5 md:px-8">

          {/* Logo */}
          <Link href="/" className="group flex items-center gap-2.5">
            <Image
              src="/enigma.png"
              alt="SuperSentinel"
              width={28}
              height={28}
              className="rounded-lg object-contain transition-opacity group-hover:opacity-80"
            />
            <span className="text-sm font-bold tracking-tight text-white">SuperSentinel</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-1 md:flex">
            {navLinks.map((link) => {
              const active = link.exact ? pathname === link.href : pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href + link.label}
                  href={link.href}
                  className={cn(
                    'rounded-md px-3.5 py-1.5 text-[13px] font-medium transition-all duration-150',
                    active
                      ? 'text-white bg-[rgba(255,255,255,0.06)]'
                      : 'text-[#94A3B8] hover:text-white hover:bg-[rgba(255,255,255,0.04)]',
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          {/* Right actions */}
          <div className="flex items-center gap-2">
            <div className="hidden sm:block">
              <WalletConnectButton className="h-8 text-xs" />
            </div>
            <Link
              href="/scanner"
              className={cn(
                'hidden items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[13px] font-semibold md:flex',
                'bg-primary text-[#0B0F14] transition-all duration-150',
                'hover:bg-[#6EE7A0] hover:shadow-[0_0_16px_rgba(74,222,128,0.35)]',
              )}
            >
              Launch App
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>

            {/* Mobile toggle */}
            <button
              onClick={() => setOpen(p => !p)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[#94A3B8] hover:text-white md:hidden"
            >
              {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        <div className={cn(
          'md:hidden overflow-hidden transition-all duration-200',
          'border-t border-[rgba(255,255,255,0.06)] bg-[rgba(11,15,20,0.98)]',
          open ? 'max-h-60 opacity-100' : 'max-h-0 opacity-0 border-transparent',
        )}>
          <nav className="flex flex-col px-5 py-3 gap-0.5">
            {navLinks.map((link) => {
              const active = link.exact ? pathname === link.href : pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href + link.label}
                  href={link.href}
                  className={cn(
                    'rounded-md px-3 py-2.5 text-sm font-medium transition-all',
                    active ? 'text-white bg-[rgba(255,255,255,0.06)]' : 'text-[#94A3B8]',
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
            <div className="mt-2 pt-2 border-t border-[rgba(255,255,255,0.06)]">
              <WalletConnectButton className="w-full h-9 text-sm" />
            </div>
          </nav>
        </div>
      </header>

      {/* Spacer */}
      <div className="h-14" />
    </>
  );
}

export default Header;
