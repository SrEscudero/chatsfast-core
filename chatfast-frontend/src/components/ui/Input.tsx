import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, icon, className, id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-[13px] font-medium text-[var(--fg-secondary)]">
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--fg-tertiary)]">
              {icon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              'w-full h-10 rounded-[var(--radius-sm)] px-3 text-[14px]',
              'bg-[var(--bg-elevated)] text-[var(--fg)]',
              'border border-[var(--border)]',
              'placeholder:text-[var(--fg-tertiary)]',
              'outline-none transition-all duration-150',
              'focus:border-[var(--accent)] focus:ring-3 focus:ring-[var(--accent)]/15',
              error && 'border-[var(--destructive)] focus:border-[var(--destructive)] focus:ring-[var(--destructive)]/15',
              icon && 'pl-9',
              className,
            )}
            {...props}
          />
        </div>
        {error && <p className="text-[12px] text-[var(--destructive)]">{error}</p>}
      </div>
    );
  },
);

Input.displayName = 'Input';
