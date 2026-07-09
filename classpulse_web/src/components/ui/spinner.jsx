import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

export function Spinner({ className, label = 'Loading' }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)} role="status" aria-live="polite">
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}
