'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

function Item({ href, label, current }) {
  const active = href === '/tickets' ? current.startsWith('/tickets') : current === href || current.startsWith(href + '/');
  return (
    <Link href={href} className={active ? 'active' : ''}>
      {label}
    </Link>
  );
}

export default function NavLinks({ user, waEnabled }) {
  const pathname = usePathname() || '';
  if (!user) {
    return (
      <nav>
        <Link href="/support">Customer form</Link>
      </nav>
    );
  }
  return (
    <nav>
      <Item href="/tickets" label="Tickets" current={pathname} />
      {waEnabled && <Item href="/whatsapp" label="WhatsApp" current={pathname} />}
      <Item href="/email" label="Email" current={pathname} />
      <Item href="/customers" label="Customers" current={pathname} />
      <Item href="/canned" label="Canned" current={pathname} />
      <Item href="/tickets/new" label="New ticket" current={pathname} />
      {user.role === 'admin' && <Item href="/admin" label="Admin" current={pathname} />}
      <span className="nav-user">{user.name}</span>
      <a href="/api/auth/logout" className="nav-signout">Sign out</a>
    </nav>
  );
}
