import { cn } from '@/lib/utils';

interface CardProps {
  className?: string;
  children: React.ReactNode;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const paddingStyles = {
  none: '',
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-6',
};

export function Card({ className, children, padding = 'md' }: CardProps) {
  return (
    <div
      className={cn(
        'bg-[var(--bg-elevated)] rounded-[var(--radius)]',
        'border border-[var(--border)]',
        'shadow-[var(--shadow-sm)]',
        paddingStyles[padding],
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('flex items-center justify-between mb-4', className)}>
      {children}
    </div>
  );
}

export function CardTitle({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <h3 className={cn('text-[15px] font-semibold text-[var(--fg)]', className)}>
      {children}
    </h3>
  );
}
