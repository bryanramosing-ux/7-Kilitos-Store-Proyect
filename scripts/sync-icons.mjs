#!/usr/bin/env node
// Reúne los iconos Material Symbols usados en el código y actualiza el enlace de
// la fuente en todas las páginas para descargar solo ese subconjunto (~30 KB en
// vez de ~460 KB). Uso: `npm run icons` (escribe) o `npm run check:icons` (verifica).
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const checkOnly = process.argv.includes('--check');

function walk(dir, exts, out = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, exts, out);
    else if (exts.includes(extname(path))) out.push(path);
  }
  return out;
}

// Iconos usados fuera de llamadas icon(): contenido CSS y cambios de texto en JS.
const names = new Set(['error', 'done', 'add_shopping_cart']);
const quoted = /'([a-z][a-z0-9_]{1,40})'/g;
const sources = [...walk(join(root, 'public/js'), ['.js']), join(root, 'functions/scripts/seed-data.js')];
for (const file of sources) {
  const code = readFileSync(file, 'utf8');
  for (const match of code.matchAll(/\bicon\(([^()]*)\)/g)) {
    for (const [, name] of match[1].matchAll(quoted)) names.add(name);
  }
  for (const [, name] of code.matchAll(/\b(?:icon|iconName):\s*'([a-z][a-z0-9_]+)'/g)) names.add(name);
  for (const match of code.matchAll(/(?:_ICONS|\bICONS)\s*=\s*[[{]([^\]}]*)[\]}]/g)) {
    for (const [, name] of match[1].matchAll(quoted)) names.add(name);
  }
}
// Palabras que no son iconos pero calzan con el patrón (opciones de icon()).
['filled', 'label', 'success'].forEach((word) => names.delete(word));

const sorted = [...names].sort();
const url = `https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0..1,0&icon_names=${sorted.join(',')}&display=block`;
const htmlFiles = walk(join(root, 'public'), ['.html']);
let outdated = 0;
for (const file of htmlFiles) {
  const content = readFileSync(file, 'utf8');
  if (!content.includes('data-icon-font')) continue;
  const next = content.replace(/(<link rel="stylesheet" data-icon-font href=")[^"]*(")/, `$1${url.replace(/&/g, '&amp;')}$2`);
  if (next !== content) {
    outdated += 1;
    if (!checkOnly) writeFileSync(file, next);
  }
}
console.log(`${sorted.length} iconos: ${sorted.join(', ')}`);
if (checkOnly && outdated > 0) {
  console.error(`✖ ${outdated} páginas tienen el enlace de iconos desactualizado. Ejecuta: npm run icons`);
  process.exit(1);
}
console.log(checkOnly ? '✔ Enlaces de iconos al día.' : `✔ Páginas actualizadas: ${outdated}`);
