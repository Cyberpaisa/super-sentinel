import type { Metadata } from 'next';
import { Inter, JetBrains_Mono, Space_Grotesk, Instrument_Serif, Instrument_Sans } from 'next/font/google';
import './globals.css';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { Providers } from './providers';
import { WebsiteJsonLd } from '@/components/shared/json-ld';
import { NavigationProgress } from '@/components/shared/navigation-progress';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-headline',
});

const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  display: 'swap',
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-serif',
});

const instrumentSans = Instrument_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-display',
});

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://enigma.app';

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: 'SuperSentinel - Advanced Autonomous Monitoring',
    template: '%s | SuperSentinel',
  },
  description:
    'Advanced monitoring and security platform for autonomous agents.',
  keywords: ['blockchain', 'security', 'monitoring', 'trust score', 'web3', 'defi', 'smart contracts', 'supersentinel'],
  authors: [{ name: 'SuperSentinel Team' }],
  openGraph: {
    title: 'SuperSentinel - Advanced Autonomous Monitoring',
    description: 'Advanced monitoring and security platform for autonomous agents.',
    type: 'website',
    siteName: 'SuperSentinel',
    url: BASE_URL,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SuperSentinel - Advanced Autonomous Monitoring',
    description: 'Advanced monitoring and security platform for autonomous agents.',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} ${jetbrainsMono.variable} ${spaceGrotesk.variable} ${instrumentSerif.variable} ${instrumentSans.variable} font-sans antialiased`}>
        <WebsiteJsonLd />
        <NavigationProgress />
        <Providers>
          {children}
        </Providers>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
