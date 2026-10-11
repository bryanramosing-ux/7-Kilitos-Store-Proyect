import { HttpsError } from 'firebase-functions/v2/https';

// Errores de validación: siempre en español y con el campo afectado para que la
// interfaz pueda marcarlo.
export function invalid(field, message) {
  return new HttpsError('invalid-argument', message, { code: 'INVALID_FIELD', field });
}

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function cleanText(value, { field, label, min = 0, max, multiline = false, required = min > 0 }) {
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string') throw invalid(field, `${label} no es válido.`);
  let text = value.replace(CONTROL_CHARS, '');
  text = multiline ? text.replace(/\r\n?/g, '\n').trim() : text.replace(/\s+/g, ' ').trim();
  if (required && text.length === 0) throw invalid(field, `${label} es obligatorio.`);
  if (text.length > 0 && text.length < min) throw invalid(field, `${label} debe tener al menos ${min} caracteres.`);
  if (max && text.length > max) throw invalid(field, `${label} no puede superar ${max} caracteres.`);
  return text;
}

export function cleanInt(value, { field, label, min, max }) {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw invalid(field, `${label} debe ser un número entero.`);
  }
  if (min !== undefined && value < min) throw invalid(field, `${label} debe ser mayor o igual a ${min}.`);
  if (max !== undefined && value > max) throw invalid(field, `${label} debe ser menor o igual a ${max}.`);
  return value;
}

export function cleanOptionalInt(value, opts) {
  if (value === undefined || value === null || value === '') return null;
  return cleanInt(value, opts);
}

export function cleanBool(value, { field, label }) {
  if (typeof value !== 'boolean') throw invalid(field, `${label} debe ser verdadero o falso.`);
  return value;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function cleanRequestId(value, field = 'requestId') {
  if (typeof value !== 'string' || !UUID.test(value)) {
    throw invalid(field, 'El identificador de la solicitud no es válido.');
  }
  return value.toLowerCase();
}

const DOC_ID = /^[A-Za-z0-9_-]{1,64}$/;
export function cleanDocId(value, field, label) {
  if (typeof value !== 'string' || !DOC_ID.test(value)) throw invalid(field, `${label} no es válido.`);
  return value;
}

// Correo: validación pragmática (la confirmación real la hace la tienda al contactar).
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export function cleanEmail(value, field = 'email') {
  const email = cleanText(value, { field, label: 'El correo', min: 5, max: 120 }).toLowerCase();
  if (!EMAIL.test(email)) throw invalid(field, 'Ingresa un correo electrónico válido.');
  return email;
}

// Teléfono chileno o internacional: solo dígitos, espacios, + y guiones; 8 a 15 dígitos.
export function cleanPhone(value, field = 'phone') {
  const phone = cleanText(value, { field, label: 'El teléfono', min: 8, max: 20 });
  if (!/^\+?[0-9\s-]+$/.test(phone)) throw invalid(field, 'El teléfono solo puede contener números, espacios y +.');
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) throw invalid(field, 'Ingresa un teléfono válido (8 a 15 dígitos).');
  return phone;
}

export const CHILE_REGIONS = Object.freeze([
  'Arica y Parinacota',
  'Tarapacá',
  'Antofagasta',
  'Atacama',
  'Coquimbo',
  'Valparaíso',
  'Metropolitana de Santiago',
  "Libertador General Bernardo O'Higgins",
  'Maule',
  'Ñuble',
  'Biobío',
  'La Araucanía',
  'Los Ríos',
  'Los Lagos',
  'Aysén del General Carlos Ibáñez del Campo',
  'Magallanes y de la Antártica Chilena',
]);

export function ensureObject(value, field, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid(field, `${label} no es válido.`);
  return value;
}

export function ensureArray(value, field, label, max) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw invalid(field, `${label} no es válido.`);
  if (max !== undefined && value.length > max) throw invalid(field, `${label} admite como máximo ${max} elementos.`);
  return value;
}
