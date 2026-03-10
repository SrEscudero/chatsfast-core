'use client';

import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children: React.ReactNode;
}

const variantStyles: Record<Variant, string> = {
  primary:
    'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] shadow-[0_1px_2px_rgba(0,113,227,.3)]',
  secondary:
    'bg-[var(--bg-elevated)] text-[var(--fg)] border border-[var(--border)] hover:bg-[var(--bg)]',
  ghost:
    'text-[var(--fg)] hover:bg-[var(--border)]/30',
  destructive:
    'bg-[var(--destructive)] text-white hover:opacity-90',
};

const sizeStyles: Record<Size, string> = {
  sm: 'h-7 px-3 text-[13px] rounded-[8px]',
  md: 'h-9 px-4 text-[14px] rounded-[10px]',
  lg: 'h-11 px-6 text-[15px] rounded-[12px]',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  className,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.1 }}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-medium',
        'transition-colors duration-150 select-none outline-none',
        'focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40',
        'disabled:opacity-50 disabled:pointer-events-none',
        variantStyles[variant],
        sizeStyles[size],
        className,
      )}
      {...props}
    >
      {loading && (
        <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
      )}
      {children}
    </motion.button>
  );
}
