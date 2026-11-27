/** MeroShare's dates are Nepal dates. Nepal is UTC+05:45 all year (no daylight saving). */
const NEPAL_OFFSET_MS = (5 * 60 + 45) * 60_000;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** The calendar day in Nepal at this instant, whatever the machine's time zone. */
export function nepalDay(d: Date): string {
  const n = new Date(d.getTime() + NEPAL_OFFSET_MS);
  return `${n.getUTCFullYear()}-${pad(n.getUTCMonth() + 1)}-${pad(n.getUTCDate())}`;
}

function writtenDay(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Turns what MeroShare sends (epoch ms or s, ISO, or a date string) into YYYY-MM-DD, or null.
 * An instant (epoch, or a string with a zone) is read as a Nepal day; a date written
 * without a zone keeps the day as written.
 */
export function toDay(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value < 1e12 ? value * 1000 : value;
    return nepalDay(new Date(ms));
  }
  if (typeof value !== 'string') return null;
  const s = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  if (/^\d{10,13}$/.test(s)) return toDay(Number(s));
  const t = Date.parse(s);
  if (Number.isNaN(t)) return null;
  const hasZone = /(Z|GMT|UTC|[+-]\d{2}:?\d{2})\s*$/i.test(s);
  return hasZone ? nepalDay(new Date(t)) : writtenDay(new Date(t));
}

export function firstDay(...values: unknown[]): string | null {
  for (const v of values) {
    const d = toDay(v);
    if (d) return d;
  }
  return null;
}

/** Calendar days from today in Nepal to day. 0 means today, negative means past. */
export function daysLeft(day: string, now: Date): number {
  const [y, m, d] = day.split('-').map(Number);
  const [ty, tm, td] = nepalDay(now).split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86_400_000);
}
