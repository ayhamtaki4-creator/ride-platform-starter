const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export const SERVICE_TIME_ZONE =
  process.env.SERVICE_TIME_ZONE?.trim() || 'Asia/Damascus';

export function parseDateOnly(value: string): Date | null {
  const match = DATE_ONLY_PATTERN.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return parsed;
}

export function dateOnlyKey(value: Date) {
  return [
    value.getUTCFullYear().toString().padStart(4, '0'),
    (value.getUTCMonth() + 1).toString().padStart(2, '0'),
    value.getUTCDate().toString().padStart(2, '0')
  ].join('-');
}

export function zonedDateKey(
  value = new Date(),
  timeZone = SERVICE_TIME_ZONE
) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(value);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get('year')}-${values.get('month')}-${values.get('day')}`;
}

export function currentServiceDate(value = new Date()) {
  const parsed = parseDateOnly(zonedDateKey(value));
  if (!parsed) {
    throw new Error(`Unable to resolve current service date for ${SERVICE_TIME_ZONE}`);
  }
  return parsed;
}

export function isPastServiceDate(date: Date, now = new Date()) {
  return dateOnlyKey(date) < zonedDateKey(now);
}

export function utcDayBounds(value: Date) {
  const start = new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())
  );
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}
