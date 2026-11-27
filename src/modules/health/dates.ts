function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function localDay(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Turns what MeroShare sends (epoch ms or s, ISO, or a date string) into YYYY-MM-DD, or null. */
export function toDay(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value < 1e12 ? value * 1000 : value;
    return localDay(new Date(ms));
  }
  if (typeof value !== 'string') return null;
  const s = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  if (/^\d{10,13}$/.test(s)) return toDay(Number(s));
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : localDay(new Date(t));
}

export function firstDay(...values: unknown[]): string | null {
  for (const v of values) {
    const d = toDay(v);
    if (d) return d;
  }
  return null;
}

/** Calendar days from today (local) to day. 0 means today, negative means past. */
export function daysLeft(day: string, now: Date): number {
  const [y, m, d] = day.split('-').map(Number);
  const target = Date.UTC(y, m - 1, d);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / 86_400_000);
}
