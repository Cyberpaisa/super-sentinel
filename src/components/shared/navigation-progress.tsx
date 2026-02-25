'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

function ProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const barRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const progressRef = useRef(0);
  const activeRef = useRef(false);

  function start() {
    const bar = barRef.current;
    if (!bar || activeRef.current) return;
    activeRef.current = true;
    progressRef.current = 0;
    bar.style.transition = 'none';
    bar.style.opacity = '1';
    bar.style.width = '0%';

    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      if (!activeRef.current) return;
      // Ease toward 90%, never reaching it naturally
      const delta = (90 - progressRef.current) * 0.12;
      progressRef.current = Math.min(90, progressRef.current + Math.max(delta, 0.5));
      bar.style.transition = 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
      bar.style.width = `${progressRef.current}%`;
    }, 350);
  }

  function finish() {
    const bar = barRef.current;
    if (!bar) return;
    clearInterval(timerRef.current);
    activeRef.current = false;
    bar.style.transition = 'width 0.15s ease-out';
    bar.style.width = '100%';
    setTimeout(() => {
      if (!bar) return;
      bar.style.transition = 'opacity 0.3s ease';
      bar.style.opacity = '0';
      setTimeout(() => {
        if (!bar) return;
        bar.style.transition = 'none';
        bar.style.width = '0%';
        progressRef.current = 0;
      }, 300);
    }, 150);
  }

  // Detect link clicks → start bar before navigation
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      const anchor = target.closest('a');

      if (anchor) {
        const href = anchor.getAttribute('href');
        if (!href || anchor.target || e.metaKey || e.ctrlKey || e.shiftKey) return;
        try {
          const url = new URL(href, window.location.href);
          if (url.origin === window.location.origin && url.pathname !== window.location.pathname) {
            start();
          }
        } catch {
          // relative href parse failure — skip
        }
        return;
      }

      // Also handle rows/buttons that use router.push via data-href attribute
      const navEl = target.closest('[data-href]');
      if (navEl) {
        start();
      }
    }
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  // Complete bar when navigation settles
  useEffect(() => {
    finish();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);

  return (
    <div
      ref={barRef}
      className="pointer-events-none fixed left-0 top-0 z-[9999] h-[2px] w-0 opacity-0"
      style={{
        background: 'linear-gradient(90deg, #4ADE80, #22D3EE)',
        boxShadow: '0 0 10px #4ADE80, 0 0 4px #22D3EE',
      }}
    />
  );
}

// Suspense boundary required for useSearchParams in Next.js App Router
import { Suspense } from 'react';

export function NavigationProgress() {
  return (
    <Suspense fallback={null}>
      <ProgressBar />
    </Suspense>
  );
}
