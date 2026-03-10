import { cn } from '@/lib/utils';

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'connecting';

interface BadgeProps {
  variant?: BadgeVariant;
  className?: string;
  children: React.ReactNode;
  dot?: boolean;
}

const variantStyles: Record<BadgeVariant, string> = {
  success:    'bg-[var(--success)]/12 text-[var(--success)]',
  warning:    'bg-[var(--warning)]/12 text-[var(--warning)]',
  error:      'bg-[var(--destructive)]/12 text-[var(--destructive)]',
  info:       'bg-[var(--accent)]/12 text-[var(--accent)]',
  neutral:    'bg-[var(--border)]/50 text-[var(--fg-secondary)]',
  connecting: 'bg-[var(--warning)]/12 text-[var(--warning)]',
};

const dotStyles: Record<BadgeVariant, string> = {
  success:    'bg-[var(--success)]',
  warning:    'bg-[var(--warning)]',
  error:      'bg-[var(--destructive)]',
  info:       'bg-[var(--accent)]',
  neutral:    'bg-[var(--fg-tertiary)]',
  connecting: 'bg-[var(--warning)] animate-pulse',
};

export function Badge({ variant = 'neutral', className, children, dot = false }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5',
        'text-[12px] font-medium rounded-full',
        variantStyles[variant],
        className,
      )}
    >
      {dot && <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', dotStyles[variant])} />}
      {children}
    </span>
  );
}

export function instanceStatusBadge(status: string) {
  const map: Record<string, { variant: BadgeVariant; label: string }> = {
    CONNECTED:    { variant: 'success',    label: 'Conectado' },
    CONNECTING:   { variant: 'connecting', label: 'Conectando' },
    DISCONNECTED: { variant: 'neutral',    label: 'Desconectado' },
    ERROR:        { variant: 'error',      label: 'Error' },
    PENDING:      { variant: 'info',       label: 'Pendiente' },
  };
  return map[status] ?? { variant: 'neutral' as BadgeVariant, label: status };
}
