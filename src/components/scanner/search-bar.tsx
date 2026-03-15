'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Search, X, Loader2 } from 'lucide-react';
import { useAgents, type Agent } from '@/hooks/use-agents';
import { cn } from '@/lib/utils/index';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

/**
 * Debounce hook
 */
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Truncate address for display
 */
function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * SearchBar component with autocomplete
 * Provides search with debounced input and dropdown results
 */
export function SearchBar({ value, onChange, className }: SearchBarProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const [isFocused, setIsFocused] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [dropdownRect, setDropdownRect] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  // Debounce search input
  const debouncedSearch = useDebounce(value, 300);

  // Fetch agents for autocomplete
  const { data, isLoading } = useAgents({
    search: debouncedSearch,
    limit: 5,
  });

  const results = useMemo(() => data?.agents || [], [data?.agents]);
  const showDropdown = isFocused && value.length > 0 && results.length > 0;

  // Handle click outside to close dropdown (incl. no cerrar al clic en el portal)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const inContainer =
        containerRef.current?.contains(target) ?? false;
      const inDropdown =
        dropdownRef.current?.contains(target) ?? false;
      if (!inContainer && !inDropdown) {
        setIsFocused(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(-1);
  }, [results]);

  // Update dropdown position for portal (so it stays on top and blocks clicks)
  const updateDropdownRect = () => {
    if (containerRef.current && showDropdown) {
      const rect = containerRef.current.getBoundingClientRect();
      setDropdownRect({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      });
    } else {
      setDropdownRect(null);
    }
  };

  useEffect(() => {
    if (!showDropdown) {
      setDropdownRect(null);
      return;
    }
    updateDropdownRect();
    window.addEventListener('scroll', updateDropdownRect, true);
    window.addEventListener('resize', updateDropdownRect);
    return () => {
      window.removeEventListener('scroll', updateDropdownRect, true);
      window.removeEventListener('resize', updateDropdownRect);
    };
  }, [showDropdown, results]);

  const handleClear = () => {
    onChange('');
    inputRef.current?.focus();
  };

  const handleSelect = (agent: Agent) => {
    onChange('');
    setIsFocused(false);
    router.push(`/agents/${agent.address}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < results.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && results[selectedIndex]) {
          handleSelect(results[selectedIndex]);
        }
        break;
      case 'Escape':
        setIsFocused(false);
        break;
    }
  };

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[rgba(255,255,255,0.4)]" />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search by name or address..."
          className={cn(
            'w-full pl-10 pr-10 py-2.5 rounded-lg font-medium',
            'bg-white/5 border border-white/10',
            'text-white placeholder:text-slate-500',
            'focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50',
            'transition-all'
          )}
        />
        {/* Loading/Clear button */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          {isLoading && value.length > 0 ? (
            <Loader2 className="h-4 w-4 text-[rgba(255,255,255,0.4)] animate-spin" />
          ) : value.length > 0 ? (
            <button
              onClick={handleClear}
              className="p-0.5 rounded hover:bg-[rgba(255,255,255,0.1)] transition-colors"
            >
              <X className="h-4 w-4 text-[rgba(255,255,255,0.4)]" />
            </button>
          ) : null}
        </div>
      </div>

      {/* Autocomplete Dropdown - portal para que quede encima y con fondo opaco */}
      {typeof document !== 'undefined' &&
        showDropdown &&
        dropdownRect &&
        createPortal(
          <div
            ref={dropdownRef}
            className="py-1 rounded-lg shadow-[0_4px_24px_rgba(0,0,0,0.6)] border border-[rgba(255,255,255,0.12)] overflow-hidden"
            style={{
              position: 'fixed',
              top: dropdownRect.top,
              left: dropdownRect.left,
              width: dropdownRect.width,
              zIndex: 9999,
              backgroundColor: '#06101F',
              pointerEvents: 'auto',
            }}
          >
            {results.map((agent, index) => (
              <button
                key={agent.address}
                type="button"
                onClick={() => handleSelect(agent)}
                className={cn(
                  'w-full px-3 py-2 flex items-center gap-3 text-left',
                  'hover:bg-white/5 transition-colors',
                  selectedIndex === index && 'bg-white/10'
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-white truncate">
                    {agent.name}
                  </div>
                  <div className="text-xs text-[rgba(255,255,255,0.5)] font-mono">
                    {truncateAddress(agent.address)}
                  </div>
                </div>
                <div
                  className={cn(
                    'px-2 py-0.5 rounded text-xs font-bold',
                    agent.trust_score >= 80
                      ? 'bg-blue-900/40 text-blue-400'
                      : agent.trust_score >= 60
                      ? 'bg-cyan-900/40 text-cyan-400'
                      : agent.trust_score >= 40
                      ? 'bg-amber-900/40 text-amber-400'
                      : 'bg-rose-900/40 text-rose-400'
                  )}
                >
                  {agent.tracer_score ?? agent.trust_score}
                </div>
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}
