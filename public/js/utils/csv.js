// Exportación CSV compatible con Excel en español (separador ";" y BOM UTF-8).
// Las celdas que empiezan con = + - @ se prefijan para evitar inyección de fórmulas.

function cell(value) {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (typeof value !== 'number' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[";\n\r]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(columns, rows) {
  const header = columns.map((column) => cell(column.label)).join(';');
  const body = rows.map((row) => columns.map((column) => cell(column.value(row))).join(';'));
  return [header, ...body].join('\r\n');
}

export function downloadCsv(filename, columns, rows) {
  const blob = new Blob(['﻿', toCsv(columns, rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
