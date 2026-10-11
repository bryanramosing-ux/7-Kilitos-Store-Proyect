// Rangos de fechas en la zona horaria de la tienda (America/Santiago), sin
// depender de la zona horaria del dispositivo. Los días comienzan a la primera
// hora local existente (Chile cambia de horario a medianoche).
import { TIME_ZONE } from './format.js';

const keyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const HOUR = 3600 * 1000;

// 'YYYY-MM-DD' del instante en hora de Santiago.
export function dayKey(date) {
  return keyFormatter.format(date);
}

export function monthKey(date) {
  return dayKey(date).slice(0, 7);
}

function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return { y, m, d };
}

function addDaysToKey(key, days) {
  const { y, m, d } = parseKey(key);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

// Primer instante del día local `key` en Santiago.
export function startOfDay(key) {
  const { y, m, d } = parseKey(key);
  // Candidato inicial: medianoche UTC menos el desfase máximo de Chile (UTC-3/-4).
  let ts = Date.UTC(y, m - 1, d, 0, 0, 0) + 3 * HOUR;
  // Retrocede mientras la hora anterior siga siendo el mismo día local.
  while (dayKey(new Date(ts - HOUR)) === key) ts -= HOUR;
  // Avanza si el candidato cayó en el día anterior.
  while (dayKey(new Date(ts)) < key) ts += HOUR;
  // Ajuste fino por minutos (zonas con desfases no enteros).
  while (dayKey(new Date(ts - 60000)) === key) ts -= 60000;
  return new Date(ts);
}

export function todayKey(now = new Date()) {
  return dayKey(now);
}

// Rango semiabierto [start, end) que cubre los días locales from..to inclusive.
export function rangeFromKeys(fromKey, toKey) {
  const [a, b] = fromKey <= toKey ? [fromKey, toKey] : [toKey, fromKey];
  return { start: startOfDay(a), end: startOfDay(addDaysToKey(b, 1)), fromKey: a, toKey: b };
}

export function presetRange(preset, now = new Date()) {
  const today = dayKey(now);
  switch (preset) {
    case 'hoy':
      return rangeFromKeys(today, today);
    case '7d':
      return rangeFromKeys(addDaysToKey(today, -6), today);
    case '30d':
      return rangeFromKeys(addDaysToKey(today, -29), today);
    case 'mes': {
      const first = `${today.slice(0, 7)}-01`;
      return rangeFromKeys(first, today);
    }
    case 'mes-anterior': {
      const firstThis = `${today.slice(0, 7)}-01`;
      const lastPrev = addDaysToKey(firstThis, -1);
      return rangeFromKeys(`${lastPrev.slice(0, 7)}-01`, lastPrev);
    }
    case '90d':
      return rangeFromKeys(addDaysToKey(today, -89), today);
    default:
      throw new Error(`Rango desconocido: ${preset}`);
  }
}

// Lista de días (YYYY-MM-DD) del rango, para rellenar con ceros los gráficos.
export function daysInRange(fromKey, toKey) {
  const days = [];
  for (let key = fromKey; key <= toKey; key = addDaysToKey(key, 1)) days.push(key);
  return days;
}

export function monthsInRange(fromKey, toKey) {
  const months = [];
  let key = `${fromKey.slice(0, 7)}-01`;
  while (key.slice(0, 7) <= toKey.slice(0, 7)) {
    months.push(key.slice(0, 7));
    const { y, m } = parseKey(key);
    key = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  }
  return months;
}

export { addDaysToKey };
