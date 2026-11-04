import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AudioProvider } from '@/components/providers/audio-provider';

export const metadata: Metadata = {
  title: 'DVibes — Midnight music, live from the source',
  description:
    'A native music player with synced lyrics and full offline mode. Search YouTube through Piped, Invidious and a direct fallback. No mock catalog.',
  applicationName: 'DVibes',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'DVibes'
  }
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#08080b'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full font-sans">
        <AudioProvider>{children}</AudioProvider>
      </body>
    </html>
  );
}
