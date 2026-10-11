// Validaciones de formularios en el navegador. Mejoran la experiencia, pero la
// validación definitiva ocurre en Cloud Functions y en las reglas de seguridad.

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

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const rules = {
  required: (label) => (v) => (String(v ?? '').trim() ? null : `${label} es obligatorio.`),
  minLength: (label, n) => (v) => (String(v ?? '').trim().length >= n ? null : `${label} debe tener al menos ${n} caracteres.`),
  maxLength: (label, n) => (v) => (String(v ?? '').trim().length <= n ? null : `${label} no puede superar ${n} caracteres.`),
  email: () => (v) => (EMAIL.test(String(v ?? '').trim()) ? null : 'Ingresa un correo electrónico válido.'),
  phone: () => (v) => {
    const text = String(v ?? '').trim();
    if (!/^\+?[0-9\s-]+$/.test(text)) return 'El teléfono solo puede contener números, espacios y +.';
    const digits = text.replace(/\D/g, '').length;
    return digits >= 8 && digits <= 15 ? null : 'Ingresa un teléfono válido (8 a 15 dígitos).';
  },
  integer: (label, { min, max } = {}) => (v) => {
    const text = String(v ?? '').trim();
    if (!/^-?\d+$/.test(text)) return `${label} debe ser un número entero, sin puntos ni decimales.`;
    const n = Number(text);
    if (min !== undefined && n < min) return `${label} debe ser mayor o igual a ${min}.`;
    if (max !== undefined && n > max) return `${label} debe ser menor o igual a ${max}.`;
    return null;
  },
  optionalInteger: (label, opts) => (v) => (String(v ?? '').trim() === '' ? null : rules.integer(label, opts)(v)),
  oneOf: (label, values) => (v) => (values.includes(v) ? null : `Selecciona ${label}.`),
  password: () => (v) => (String(v ?? '').length >= 8 ? null : 'La contraseña debe tener al menos 8 caracteres.'),
};

// Convierte "16.900" o "$16.900" en 16900. Devuelve null si está vacío.
export function parseMoney(value) {
  const text = String(value ?? '').replace(/[$\s.]/g, '').trim();
  if (text === '') return null;
  return /^-?\d+$/.test(text) ? Number(text) : NaN;
}

// Ejecuta validadores por campo; devuelve { campo: mensaje } solo con errores.
export function validate(values, schema) {
  const errors = {};
  for (const [field, validators] of Object.entries(schema)) {
    for (const check of validators) {
      const message = check(values[field], values);
      if (message) {
        errors[field] = message;
        break;
      }
    }
  }
  return errors;
}
