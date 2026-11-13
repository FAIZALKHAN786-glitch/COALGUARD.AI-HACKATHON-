import { cn } from '@/lib/utils';

export function BrandMark({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <span
        aria-hidden="true"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground shadow-sm"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M4 18.5 9.5 8l4 5.5L16.5 9 21 18.5H4Z" fill="currentColor" opacity="0.95" />
          <path d="M4 21h17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </span>
      {!compact && (
        <span className="flex flex-col leading-none">
          <span className="text-sm font-semibold tracking-tight text-foreground">CoalGuard.AI</span>
          <span className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Smart Governance
          </span>
        </span>
      )}
    </div>
  );
}
