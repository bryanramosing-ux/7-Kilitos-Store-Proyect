// Formatos locales de Chile (CLP sin decimales, fechas en hora de Santiago).
export const TIME_ZONE = 'America/Santiago';

const clp = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
const integer = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 });

export function formatCLP(value) {
  if (!Number.isFinite(value)) return '—';
  return clp.format(Math.round(value)).replace(/\s/g, '');
}

export function formatNumber(value) {
  return Number.isFinite(value) ? integer.format(value) : '—';
}

export function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value === 'number' || typeof value === 'string') return new Date(value);
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  return null;
}

const dateFmt = new Intl.DateTimeFormat('es-CL', { timeZone: TIME_ZONE, day: '2-digit', month: 'short', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('es-CL', {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatDate(value) {
  const date = toDate(value);
  return date ? dateFmt.format(date) : '—';
}

export function formatDateTime(value) {
  const date = toDate(value);
  return date ? dateTimeFmt.format(date) : '—';
}

export function discountPercent(price, compareAtPrice) {
  if (!Number.isInteger(compareAtPrice) || !Number.isInteger(price) || compareAtPrice <= price) return 0;
  return Math.round(((compareAtPrice - price) / compareAtPrice) * 100);
}

export function pluralize(count, singular, plural = `${singular}s`) {
  return `${formatNumber(count)} ${count === 1 ? singular : plural}`;
}

// Normaliza texto para búsquedas: minúsculas y sin tildes.
export function normalizeText(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function instagramUrl(handle) {
  const clean = String(handle ?? '').replace(/^@/, '').trim();
  return /^[A-Za-z0-9._]{1,30}$/.test(clean) ? `https://www.instagram.com/${clean}/` : null;
}

export function whatsappUrl(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '');
  return digits.length >= 8 ? `https://wa.me/${digits}` : null;
}
