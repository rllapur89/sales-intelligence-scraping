import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';

export interface MemoryUsage {
  heapUsedMb: number;
  heapTotalMb: number;
  systemTotalMb: number;
  rss: number;
}

export interface MemoryWarning {
  heapUsedMb: number;
  heapTotalMb: number;
  threshold: number;
}

declare global {
  interface Window {
    electronAPI?: {
      getMemoryUsage: () => Promise<MemoryUsage>;
      exportToFile: (data: string, filename?: string) => Promise<{ success: boolean; filePath?: string; reason?: string }>;
      showSaveDialog: (options: unknown) => Promise<unknown>;
      getAppVersion: () => Promise<string>;
      onMemoryWarning: (cb: (info: MemoryWarning) => void) => void;
      offMemoryWarning: () => void;
      platform: string;
    };
  }
}

@Injectable({ providedIn: 'root' })
export class ElectronService implements OnDestroy {
  readonly isElectron = typeof window !== 'undefined' && !!window.electronAPI;

  readonly memoryWarning$ = new Subject<MemoryWarning>();

  constructor(private zone: NgZone) {
    if (this.isElectron) {
      window.electronAPI!.onMemoryWarning((info) => {
        this.zone.run(() => this.memoryWarning$.next(info));
      });
    }
  }

  async getMemoryUsage(): Promise<MemoryUsage | null> {
    if (!this.isElectron) return null;
    return window.electronAPI!.getMemoryUsage();
  }

  ngOnDestroy(): void {
    if (this.isElectron) window.electronAPI!.offMemoryWarning();
    this.memoryWarning$.complete();
  }
}
