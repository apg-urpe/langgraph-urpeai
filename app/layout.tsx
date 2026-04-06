import './globals.css';
import type { Viewport } from 'next';
import { WebVitalsReporter } from '../components/WebVitalsReporter';
import { NotificationToast } from '../components/notifications/NotificationToast';
import { GamificationToast } from '../components/GamificationToast';
import { BackHandlerProvider } from '../components/BackHandlerProvider';
import { validateEnv } from '@/lib/env-validator';

// Validate environment variables at startup
validateEnv();

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#020204',
};

export const metadata = {
  title: 'MONICA AI',
  description: 'AI Chat Interface',
  icons: {
    icon: 'https://vecspltvmyopwbjzerow.supabase.co/storage/v1/object/public/chat-uploads/imag_confi/unnamed%20(1).webp',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'MONICA AI',
  },
  other: {
    'mobile-web-app-capable': 'yes',
    google: 'notranslate',
  }
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" translate="no" className="dark notranslate">
      <body className="bg-[#020204] text-zinc-100 antialiased overscroll-none">
        <BackHandlerProvider>
          {children}
        </BackHandlerProvider>
        <NotificationToast />
        <GamificationToast />
        <WebVitalsReporter />
      </body>
    </html>
  );
}
