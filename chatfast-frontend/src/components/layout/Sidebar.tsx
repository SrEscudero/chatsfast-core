'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { LayoutDashboard, Smartphone, Users, Server, ScrollText, LogOut, Zap, MessageSquare, Megaphone, BookUser } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import { authApi } from '@/lib/api';

const NAV_ITEMS = [
  { href: '/overview',  label: 'Overview',   icon: LayoutDashboard },
  { href: '/instances', label: 'Instancias', icon: Smartphone },
  { href: '/inbox',     label: 'Inbox CRM',  icon: MessageSquare },
  { href: '/campaigns', label: 'Campañas',   icon: Megaphone },
  { href: '/contacts',  label: 'Contactos',  icon: BookUser },
  { href: '/clients',   label: 'Clientes',   icon: Users },
  { href: '/infra',     label: 'Infra',      icon: Server },
  { href: '/logs',      label: 'Logs',       icon: ScrollText },
];

export function Sidebar() {
  const pathname = usePathname();
  const router   = useRouter();
  const { user, refreshToken, clearAuth } = useAuthStore();

  const handleLogout = async () => {
    try { if (refreshToken) await authApi.logout(refreshToken); } finally {
      clearAuth(); router.push('/login');
    }
  };

  return (
    <aside className="fixed inset-y-0 left-0 z-20 flex flex-col w-[var(--sidebar-w)] border-r border-[var(--border)] bg-[var(--bg-elevated)]">
      <div className="flex items-center gap-2.5 px-5 h-14 border-b border-[var(--border)]">
        <div className="w-7 h-7 rounded-lg bg-[var(--accent)] flex items-center justify-center shadow-sm">
          <Zap size={14} className="text-white" />
        </div>
        <span className="font-semibold text-[15px] tracking-tight text-[var(--fg)]">ChatFast</span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link key={href} href={href}>
              <motion.div
                whileHover={{ x: 1 }}
                transition={{ duration: 0.15 }}
                className={cn(
                  'relative flex items-center gap-2.5 h-9 px-3 rounded-[8px]',
                  'text-[13.5px] font-medium transition-colors duration-150 select-none',
                  active
                    ? 'bg-[var(--accent)]/10 text-[var(--accent)]'
                    : 'text-[var(--fg-secondary)] hover:bg-[var(--border)]/40 hover:text-[var(--fg)]',
                )}
              >
                {active && (
                  <motion.div
                    layoutId="sidebar-indicator"
                    className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-[var(--accent)]"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <Icon size={16} strokeWidth={active ? 2.2 : 1.8} />
                {label}
              </motion.div>
            </Link>
          );
        })}
      </nav>

      <div className="px-3 pb-4 border-t border-[var(--border)] pt-3">
        <div className="flex items-center gap-2.5 px-3 py-2 rounded-[8px]">
          <div className="w-7 h-7 rounded-full bg-[var(--border)] flex items-center justify-center flex-shrink-0">
            <span className="text-[11px] font-semibold text-[var(--fg-secondary)]">
              {user?.name?.charAt(0).toUpperCase() ?? 'U'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-medium text-[var(--fg)] truncate">{user?.name ?? '—'}</p>
            <p className="text-[11px] text-[var(--fg-tertiary)] truncate">{user?.role}</p>
          </div>
          <button
            onClick={handleLogout}
            className="p-1 rounded-[6px] text-[var(--fg-tertiary)] hover:text-[var(--destructive)] hover:bg-[var(--destructive)]/10 transition-colors"
            title="Cerrar sesión"
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
}
