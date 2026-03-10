'use client';

import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const PAGE_TITLES: Record<string, { title: string; description: string }> = {
  '/overview':  { title: 'Overview',   description: 'Estadísticas globales de la plataforma' },
  '/instances': { title: 'Instancias', description: 'Gestión de instancias de WhatsApp' },
  '/inbox':     { title: 'Inbox CRM',  description: 'Bandeja de entrada y conversaciones' },
  '/campaigns': { title: 'Campañas',   description: 'Mensajería masiva y seguimiento' },
  '/contacts':  { title: 'Contactos',  description: 'Directorio de contactos por instancia' },
  '/clients':   { title: 'Clientes',   description: 'Administración de cuentas cliente' },
  '/infra':     { title: 'Infra',      description: 'Métricas del servidor y contenedores Docker' },
  '/logs':      { title: 'Logs',       description: 'Stream de logs del servidor en tiempo real' },
};

export function Header({ className }: { className?: string }) {
  const pathname = usePathname();
  const page = PAGE_TITLES[pathname] ?? { title: 'ChatFast', description: '' };

  return (
    <header
      className={cn(
        'h-14 flex items-center px-6 border-b border-[var(--border)]',
        'bg-[var(--bg-elevated)]/80 backdrop-blur-xl sticky top-0 z-10',
        className,
      )}
    >
      <div>
        <h1 className="text-[15px] font-semibold text-[var(--fg)] leading-none">{page.title}</h1>
        {page.description && (
          <p className="text-[12px] text-[var(--fg-tertiary)] mt-0.5 leading-none">{page.description}</p>
        )}
      </div>
    </header>
  );
}
