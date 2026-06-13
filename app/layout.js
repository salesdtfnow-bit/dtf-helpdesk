import './globals.css';
import Link from 'next/link';

export const metadata = {
  title: 'DTF Now Helpdesk',
  description: 'Support ticketing for DTF Now',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <Link href="/tickets" className="brand">
            DTF Now <span>Helpdesk</span>
          </Link>
          <nav>
            <Link href="/tickets">Tickets</Link>
            <Link href="/whatsapp">WhatsApp</Link>
            <Link href="/customers">Customers</Link>
            <Link href="/canned">Canned</Link>
            <Link href="/tickets/new">New ticket</Link>
            <Link href="/support">Customer form</Link>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
