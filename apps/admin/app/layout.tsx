import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Krunch pos',
  description:
    'Owner portal for restaurant POS: locations, staff invites, and role-based access.',
  icons: {
    icon: '/favicon.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-page antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
