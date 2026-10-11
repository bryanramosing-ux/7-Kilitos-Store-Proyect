// Gráficos SVG livianos (sin dependencias). Una sola serie por gráfico de columnas:
// el título nombra la serie, por eso no lleva leyenda. Barras de 24 px máximo con
// extremo redondeado de 4 px y base recta; cuadrícula tenue; tooltip por barra
// accesible con teclado. Los mismos datos se ofrecen siempre en una tabla.
import { html } from '../utils/html.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// Escala en pesos: mínimo $1.000 para no mostrar fracciones sin datos.
function niceMax(value) {
  if (value <= 1000) return 1000;
  const exponent = 10 ** Math.floor(Math.log10(value));
  const fraction = value / exponent;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return nice * exponent;
}

export function compactCLP(value) {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1).replace('.', ',')}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return `$${value}`;
}

function columnPath(x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height);
  const bottom = y + height;
  return `M${x},${bottom}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${bottom}Z`;
}

function el(name, attrs = {}) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

/**
 * @param {HTMLElement} container
 * @param {Array<{ label: string, short: string, value: number, detail?: string }>} data
 * @param {{ formatValue: (n:number)=>string, ariaLabel: string }} options
 */
export function columnChart(container, data, { formatValue, ariaLabel }) {
  container.classList.add('chart');
  const draw = () => {
    container.replaceChildren();
    const width = Math.max(container.clientWidth, 280);
    const height = 220;
    const pad = { top: 12, right: 8, bottom: 28, left: 48 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const max = niceMax(Math.max(...data.map((d) => d.value), 0));
    const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, role: 'group', 'aria-label': ariaLabel });

    const grid = el('g', { class: 'grid' });
    const axis = el('g', { class: 'axis' });
    for (let i = 0; i <= 4; i += 1) {
      const value = (max / 4) * i;
      const y = pad.top + plotH - (value / max) * plotH;
      grid.append(el('line', { x1: pad.left, x2: width - pad.right, y1: y, y2: y }));
      const label = el('text', { x: pad.left - 8, y: y + 4, 'text-anchor': 'end' });
      label.textContent = compactCLP(value);
      axis.append(label);
    }
    svg.append(grid, axis);

    const band = plotW / Math.max(data.length, 1);
    const barW = Math.min(24, Math.max(2, band - 2));
    const labelEvery = Math.ceil(data.length / Math.max(1, Math.floor(plotW / 56)));
    const tooltip = document.createElement('div');
    tooltip.className = 'chart-tooltip';
    tooltip.hidden = true;

    data.forEach((d, i) => {
      const x = pad.left + band * i + (band - barW) / 2;
      const h = max > 0 ? (d.value / max) * plotH : 0;
      const y = pad.top + plotH - h;
      const hit = el('rect', {
        class: 'bar-hit',
        x: pad.left + band * i,
        y: pad.top,
        width: band,
        height: plotH,
        tabindex: 0,
        role: 'img',
        'aria-label': `${d.label}: ${formatValue(d.value)}${d.detail ? `, ${d.detail}` : ''}`,
      });
      const bar = el('path', { class: 'bar', d: h > 0 ? columnPath(x, y, barW, h, 4) : `M${x},${pad.top + plotH}h${barW}` });
      const show = () => {
        tooltip.replaceChildren();
        const value = document.createElement('strong');
        value.textContent = formatValue(d.value);
        const label = document.createElement('span');
        label.textContent = d.detail ? `${d.label} · ${d.detail}` : d.label;
        tooltip.append(value, label);
        tooltip.style.left = `${((x + barW / 2) / width) * 100}%`;
        tooltip.style.top = `${(Math.min(y, pad.top + plotH - 4) / height) * 100}%`;
        tooltip.hidden = false;
      };
      const hide = () => {
        tooltip.hidden = true;
      };
      hit.addEventListener('pointerenter', show);
      hit.addEventListener('focus', show);
      hit.addEventListener('pointerleave', hide);
      hit.addEventListener('blur', hide);
      svg.append(hit, bar);
      if (i % labelEvery === 0) {
        const tick = el('text', { x: pad.left + band * i + band / 2, y: height - 8, 'text-anchor': 'middle' });
        tick.textContent = d.short;
        axis.append(tick);
      }
    });
    svg.append(axis);
    container.append(svg, tooltip);
  };
  draw();
  const observer = new ResizeObserver(() => draw());
  observer.observe(container);
  return () => observer.disconnect();
}

/** Lista de barras horizontales (valor al extremo, etiqueta con texto). */
export function hbarList(items, { formatValue, className = () => '' }) {
  const max = Math.max(...items.map((i) => i.value), 0);
  return html`<ul class="hbar-list">
    ${items.map(
      (item) => html`<li class="hbar-row">
        <div class="hbar-meta"><span>${item.label}</span><strong>${formatValue(item.value)}</strong></div>
        <div class="hbar-track" aria-hidden="true"><div class="hbar-fill ${className(item)}" style="width:${max > 0 ? Math.max(1, (item.value / max) * 100).toFixed(1) : 0}%"></div></div>
      </li>`,
    )}
  </ul>`;
}

/** Tabla accesible equivalente al gráfico. */
export function chartTable(caption, headers, rows) {
  return html`<details class="chart-table">
    <summary>Ver datos en tabla</summary>
    <div class="table-wrap"><table class="table">
      <caption class="sr-only">${caption}</caption>
      <thead><tr>${headers.map((h, i) => html`<th scope="col" class="${i > 0 ? 'num' : ''}">${h}</th>`)}</tr></thead>
      <tbody>${rows.map((row) => html`<tr>${row.map((cell, i) => html`<td class="${i > 0 ? 'num' : ''}">${cell}</td>`)}</tr>`)}</tbody>
    </table></div>
  </details>`;
}

