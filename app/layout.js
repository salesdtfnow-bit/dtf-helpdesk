import './globals.css';
import Link from 'next/link';
import { currentUser } from '../lib/auth';

export const metadata = {
  title: 'DTF Now Helpdesk',
  description: 'Support ticketing for DTF Now',
};

export default async function RootLayout({ children }) {
  const user = await currentUser();
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <Link href="/tickets" className="brand">
            DTF Now <span>Helpdesk</span>
          </Link>
          {user ? (
            <nav>
              <Link href="/tickets">Tickets</Link>
              <Link href="/whatsapp">WhatsApp</Link>
              <Link href="/email">Email</Link>
              <Link href="/customers">Customers</Link>
              <Link href="/canned">Canned</Link>
              <Link href="/tickets/new">New ticket</Link>
              {user.role === 'admin' && <Link href="/admin">Admin</Link>}
              <span style={{ color: '#7ea6ff', marginLeft: 20, fontSize: 13 }}>{user.name}</span>
              <a href="/api/auth/logout">Sign out</a>
            </nav>
          ) : (
            <nav>
              <Link href="/support">Customer form</Link>
            </nav>
          )}
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
