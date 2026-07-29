import { Suspense } from 'react';

import { Shell } from './_components/Shell.tsx';
import './globals.css';

export const metadata = {
  title: 'Alpha Academy',
  description: 'โรงเรียนเทรดที่ไม่มีครู — Learn, Build, Measure, Repeat',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body>
        {/* useSearchParams needs a boundary; the frame is cheap enough to wait on. */}
        <Suspense>
          <Shell>{children}</Shell>
        </Suspense>
      </body>
    </html>
  );
}
