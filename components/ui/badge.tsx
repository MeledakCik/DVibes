import * as React from 'react';
import { cn } from '@/lib/utils';

type BadgeVariant = 'default' | 'muted' | 'outline' | 'sage';

const styles: Record<BadgeVariant, string> = {
  default: 'bg-lavender/15 text-lavender border-lavender/20',
  muted: 'bg-white/8 text-mist border-white/10',
  outline: 'bg-transparent text-mist border-white/15',
  sage: 'bg-sage/10 text-sage border-sage/20'
};

export function Badge({
  className,
  variant = 'muted',
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em]',
        styles[variant],
        className
      )}
      {...props}
    />
  );
}
