'use client';

import { Toaster as SonnerToaster } from 'sonner';

export type ToastTone = 'success' | 'error' | 'warning' | 'info';

export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      closeButton
      richColors={false}
      toastOptions={{
        classNames: {
          toast: 'border border-border bg-card text-card-foreground shadow-glass-lg',
          description: 'text-muted-foreground',
          actionButton: 'bg-primary text-primary-foreground',
          cancelButton: 'bg-muted text-muted-foreground',
        },
      }}
    />
  );
}
