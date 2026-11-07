import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'relativeTime', standalone: true, pure: false })
export class RelativeTimePipe implements PipeTransform {
  transform(value: Date | string | null | undefined): string {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    const diff = Date.now() - date.getTime();
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }
}
