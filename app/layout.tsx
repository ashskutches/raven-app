import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Raven — Your Personal AI',
  description: 'A world-class personal AI life coach. Knows you, grows with you, holds you accountable.',
};

/**
 * Next writes `width=device-width, initial-scale=1` itself; it does not write
 * `viewport-fit`, and without it `env(safe-area-inset-bottom)` is always 0 —
 * which on an iPhone puts the bottom tab bar underneath the home indicator.
 * The theme colour matches --color-bg so the browser chrome does not frame a
 * near-black app in white.
 */
export const viewport: Viewport = {
  viewportFit: 'cover',
  themeColor: '#080612',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>{children}</body>
    </html>
  );
}
