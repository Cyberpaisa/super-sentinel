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
    { href: '/scanner/agents', label: 'Agents'         },
    { href: '/register',       label: 'Register Agent' },
  ],
  company: [
    { href: '/docs',           label: 'Documentation'  },
    { href: '/docs/api',       label: 'API Reference'  },
  ],
  security: [
    { href: 'https://x.com/snowrail_latam?s=20', label: 'Twitter/X', external: true },
  ],
};

export const Footer: FC<FooterProps> = ({ className }) => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className={cn('w-full py-20 px-8 bg-black', className)}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-12 max-w-6xl mx-auto">
        {/* Branding */}
        <div className="col-span-2 md:col-span-1 space-y-6">
          <Link href="/" className="flex items-center gap-2.5 w-fit">
            <Image
              src="/enigma.png"
              alt="SuperSentinel"
              width={24}
              height={24}
              className="rounded-md object-contain"
            />
            <span className="font-[var(--font-display)] text-xl font-black text-white italic">
              SuperSentinel
            </span>
          </Link>
          <p className="text-[#ababab] text-sm leading-relaxed max-w-xs">
            Trust Intelligence for the next generation of autonomous digital
            economies.
          </p>
        </div>

        {/* Product */}
        <FooterColumn title="Product" links={footerLinks.product} />

        {/* Company */}
        <FooterColumn title="Resources" links={footerLinks.company} />

        {/* Security */}
        <FooterColumn
          title="Social"
          links={footerLinks.security}
          external
        />
      </div>

      {/* Bottom */}
      <div className="max-w-6xl mx-auto mt-20 pt-8 border-t border-[#484848]/10 text-[#484848] text-xs">
        &copy; {currentYear} SuperSentinel. Trust Intelligence for Autonomous
        Agents.
      </div>
    </footer>
  );
};

function FooterColumn({
  title,
  links,
  external,
}: {
  title: string;
  links: { href: string; label: string; external?: boolean }[];
  external?: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm uppercase tracking-widest text-[#00eefc] mb-2 font-medium">
        {title}
      </p>
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href as '/'}
          className="text-[#484848] hover:text-[#8cf6ff] transition-colors duration-300 text-sm"
          {...(external || link.external
            ? { target: '_blank', rel: 'noopener noreferrer' }
            : {})}
        >
          {link.label}
        </Link>
      ))}
    </div>
  );
}

export default Footer;
