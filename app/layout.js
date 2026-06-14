import './globals.css';
import Link from 'next/link';
import { headers } from 'next/headers';
import { currentUser } from '../lib/auth';
import NavLinks from './NavLinks';

export const metadata = {
  title: 'DTF Now Helpdesk',
  description: 'Support ticketing for DTF Now',
};

export default async function RootLayout({ children }) {
  const pathname = headers().get('x-pathname') || '';
  const bare = ['/support', '/thanks', '/login'].some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  );
  const user = bare ? null : await currentUser();
  const waEnabled = process.env.WHATSAPP_ENABLED === 'true';

  return (
    <html lang="en">
      <body>
        {!bare && (
          <header className="topbar">
            <Link href="/tickets" className="brand">
              <span className="brand-dot" />
              DTF Now <span>Helpdesk</span>
            </Link>
            <NavLinks user={user} waEnabled={waEnabled} />
          </header>
        )}
        <main style={bare ? { maxWidth: 580, marginTop: 36 } : undefined}>{children}</main>
      </body>
    </html>
  );
}
