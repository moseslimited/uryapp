import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { storage } from './storage';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  const symbol = storage.getItem('currencySymbol');
  return `${symbol} ${amount}`;
}

/** Parse Frappe API error payloads (417 / validation) for user-visible text. */
export function getFrappeErrorMessage(error: unknown): string {
  if (error == null) return 'Request failed';
  if (typeof error === 'string') return error;
  if (!(typeof error === 'object')) return 'Request failed';
  const e = error as Record<string, unknown>;
  const msg = e.message;
  if (typeof msg === 'string' && msg.trim()) return msg;
  const sm = e._server_messages;
  if (typeof sm === 'string' && sm) {
    try {
      const arr = JSON.parse(sm) as Array<{ message?: string }>;
      const first = arr?.[0]?.message;
      if (typeof first === 'string') return first.replace(/<[^>]*>/g, '').trim() || 'Request failed';
    } catch {
      /* ignore */
    }
  }
  if (typeof e.exc === 'string' && e.exc) {
    const line = e.exc.split('\n').find((l) => l.trim() && !l.includes('Traceback'));
    if (line) return line.replace(/^[^:]+:\s*/, '').slice(0, 400);
  }
  return 'Request failed';
} 