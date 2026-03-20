import { type FC } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { cn } from '@/lib/utils';

interface FooterProps {
  className?: string;
}

const footerLinks = {
  product: [
    { href: '/scanner',        label: 'Scanner'        },
    { href: '/scanner/agents', label: 'Agent Registry' },
    { href: '/register',       label: 'Register Agent' },
  ],
  resources: [
    { href: '/docs',           label: 'Documentation'  },
    { href: '/docs/api',       label: 'API Reference'  },
  ],
  social: [
    { href: 'https://x.com/snowrail_latam?s=20', label: 'Twitter/X', external: true },
  ],
};

export const Footer: FC<FooterProps> = ({ className }) => {
  const currentYear = new Date().getFullYear();

  return (
    <footer
      className={cn(
        'w-full py-16 px-8 border-t border-white/5 bg-[#050e1d]',
        className
      )}
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-12 max-w-6xl mx-auto">
        {/* Branding */}
        <div className="col-span-2 md:col-span-1">
          <Link href="/" className="flex items-center gap-2.5 w-fit mb-6">
            <Image
              src="/enigma.png"
              alt="SuperSentinel"
              width={24}
              height={24}
              className="rounded-md object-contain"
            />
            <span className="font-[var(--font-headline)] text-lg font-bold text-white">
              SuperSentinel
            </span>
          </Link>
          <p className="text-sm text-slate-400 max-w-xs leading-relaxed">
            The global standard for autonomous agent verification and trust monitoring.
          </p>
        </div>

        {/* Product */}
        <div>
          <h5 className="font-[var(--font-headline)] text-sm font-bold text-white mb-6">
            Product
          </h5>
          <ul className="space-y-4">
            {footerLinks.product.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href as '/'}
                  className="text-sm text-slate-500 hover:text-[#00F0FF] transition-colors"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Resources */}
        <div>
          <h5 className="font-[var(--font-headline)] text-sm font-bold text-white mb-6">
            Resources
          </h5>
          <ul className="space-y-4">
            {footerLinks.resources.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href as '/'}
                  className="text-sm text-slate-500 hover:text-[#00F0FF] transition-colors"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Social */}
        <div>
          <h5 className="font-[var(--font-headline)] text-sm font-bold text-white mb-6">
            Social
          </h5>
          <ul className="space-y-4">
            {footerLinks.social.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href as '/'}
                  className="text-sm text-slate-500 hover:text-[#00F0FF] transition-colors"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Bottom */}
      <div className="max-w-6xl mx-auto mt-16 pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-4">
        <p className="text-sm text-slate-400">
          &copy; {currentYear} SuperSentinel. All rights reserved.
        </p>
        <p className="text-xs text-slate-500">
          Built for the Avalanche ecosystem
        </p>
      </div>
    </footer>
  );
};

export default Footer;
