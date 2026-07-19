// NZ date formatting helpers. Use throughout the app for consistency.

function pad(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

/** DD/MM/YYYY */
export function formatNzDate(value: Date | string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return "";
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** DD/MM/YYYY, HH:MM (24h) */
export function formatNzDateTime(value: Date | string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return "";
  return `${formatNzDate(d)}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}