import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);

  show(type: ToastType, title: string, message?: string, duration = 4000): void {
    const id = Math.random().toString(36).slice(2);
    this.toasts.update(t => [...t, { id, type, title, message }]);
    setTimeout(() => this.dismiss(id), duration);
  }

  dismiss(id: string): void {
    this.toasts.update(t => t.filter(x => x.id !== id));
  }
}
