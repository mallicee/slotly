import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { api } from '../api/client';
import { Icon, type IconName } from '../components/ui';
import { useAuth } from './auth';

const NAV: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/admin', label: 'Обзор', icon: 'chart', end: true },
  { to: '/admin/calendar', label: 'Календарь', icon: 'calendar' },
  { to: '/admin/bookings', label: 'Записи', icon: 'list' },
  { to: '/admin/clients', label: 'Клиенты', icon: 'users' },
  { to: '/admin/services', label: 'Услуги', icon: 'scissors' },
];

export default function AdminLayout() {
  const { email, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const current = NAV.find((n) => (n.end ? location.pathname === n.to : location.pathname.startsWith(n.to)));

  return (
    <div className={`admin ${open ? 'nav-open' : ''}`}>
      <aside className="sidebar">
        <div className="brand">
          <img src="./favicon.svg" alt="" width="30" height="30" />
          <span>Slotly</span>
          {api.mode === 'demo' && <span className="brand-tag">demo</span>}
        </div>
        <nav onClick={() => setOpen(false)}>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className="nav-link">
              <Icon name={n.icon} />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <Link to="/" className="nav-link"><Icon name="external" />Страница записи</Link>
          <div className="user">
            <span className="user-email" title={email ?? ''}>{email}</span>
            <button className="icon-btn" onClick={logout} aria-label="Выйти" title="Выйти"><Icon name="logout" /></button>
          </div>
        </div>
      </aside>

      <div className="admin-main">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setOpen((o) => !o)} aria-label="Меню"><Icon name="menu" /></button>
          <h1>{current?.label ?? 'Slotly'}</h1>
        </header>
        <div className="admin-content">
          <Outlet />
        </div>
      </div>
      <div className="scrim" onClick={() => setOpen(false)} />
    </div>
  );
}
