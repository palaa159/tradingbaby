import { Suspense } from 'react';

import { Toaster } from '@/components/ui/sonner';
import { Shell } from './_components/Shell';
import './globals.css';

export const metadata = {
  title: 'Alpha Academy',
  description: 'โรงเรียนเทรดที่ไม่มีครู — Learn, Build, Measure, Repeat',
};

// The maker checks this on a phone, so the viewport must not be scaled down to
// a desktop-width lie.
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0e1117',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body>
        <Suspense>
          <Shell>{children}</Shell>
        </Suspense>
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
