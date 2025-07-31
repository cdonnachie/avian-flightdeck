import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { ThemeProvider } from 'next-themes';
import './globals.css';
import './vendor-prefixes.css';
import { WalletProvider } from '@/contexts/WalletContext';
import { SecurityProvider } from '@/contexts/SecurityContext';
import { NotificationProvider } from '@/contexts/NotificationContext';
import { Toaster } from '@/components/ui/sonner';
import dynamic from 'next/dynamic';
import ClientErrorBoundary from '@/components/ClientErrorBoundary';

const ServiceWorkerRegistrar = dynamic(() => import('@/components/ServiceWorkerRegistrar'));

import ElectrumManagerWrapper from '@/components/ElectrumManagerWrapper';
import ClientWatchedAddressWrapper from '@/components/ClientWatchedAddressWrapper';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Avian FlightDeck',
  description: 'Secure and user-friendly Avian cryptocurrency wallet for managing your digital assets',
  keywords: ['avian', 'cryptocurrency', 'wallet', 'blockchain', 'crypto', 'digital assets'],
  authors: [{ name: 'Avian FlightDeck Team' }],
  creator: 'Avian FlightDeck Team',
  publisher: 'Avian FlightDeck',
  manifest: '/manifest.json',

  // Icons
  icons: {
    icon: '/icons/icon-192x192.png',
    apple: '/icons/icon-192x192.png',
    shortcut: '/favicon.svg',
  },

  // OpenGraph metadata
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://flightdeck.avn.network',
    siteName: 'Avian FlightDeck',
    title: 'Avian FlightDeck - Secure Cryptocurrency Wallet',
    description: 'Secure and user-friendly Avian cryptocurrency wallet for managing your digital assets',
    images: [
      {
        url: '/screenshots/desktop-home.png',
        width: 1920,
        height: 1080,
        alt: 'Avian FlightDeck Desktop Interface',
        type: 'image/png',
      },
      {
        url: '/icons/icon-512x512.png',
        width: 512,
        height: 512,
        alt: 'Avian FlightDeck Logo',
        type: 'image/png',
      },
    ],
  },

  // Twitter metadata
  twitter: {
    card: 'summary_large_image',
    title: 'Avian FlightDeck - Secure Cryptocurrency Wallet',
    description: 'Secure and user-friendly Avian cryptocurrency wallet for managing your digital assets',
    creator: '@aavianfoundation',
    site: '@aavianfoundation',
    images: ['/screenshots/desktop-home.png'],
  },

  // Additional metadata for better SEO
  category: 'finance',
  classification: 'Cryptocurrency Wallet',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#237a7f',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className="text-size-adjust">
      <head>
        <link rel="icon" href="/icons/icon-192x192.png" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Avian FlightDeck" />
      </head>
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <ClientErrorBoundary name="Application">
            <ServiceWorkerRegistrar />
            <ElectrumManagerWrapper />
            <Toaster position="top-right" closeButton />
            <SecurityProvider>
              <WalletProvider>
                <NotificationProvider>
                  {children}
                  <ClientWatchedAddressWrapper />
                </NotificationProvider>
              </WalletProvider>
            </SecurityProvider>
          </ClientErrorBoundary>
        </ThemeProvider>
      </body>
    </html>
  );
}
