import './globals.css';
import Link from 'next/link';
import { currentUser } from '../lib/auth';
import NavLinks from './NavLinks';

export const metadata = {
  title: 'DTF Now Helpdesk',
  description: 'Support ticketing for DTF Now',
};

export default async function RootLayout({ children }) {
  const user = await currentUser();
  const waEnabled = process.env.WHATSAPP_ENABLED === 'true';
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <Link href="/tickets" className="brand">
            <span className="brand-dot" />
            DTF Now <span>Helpdesk</span>
          </Link>
          <NavLinks user={user} waEnabled={waEnabled} />
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
