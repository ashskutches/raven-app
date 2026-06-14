import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Raven — Your Personal AI',
  description: 'A world-class personal AI life coach. Knows you, grows with you, holds you accountable.',
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
