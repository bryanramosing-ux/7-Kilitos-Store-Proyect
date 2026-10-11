// Control de rango de fechas (presets + personalizado) en hora de Santiago.
import { html, setHtml } from '../utils/html.js';
import { presetRange, rangeFromKeys, todayKey } from '../utils/dates.js';

const PRESETS = [
  ['hoy', 'Hoy'],
  ['7d', '7 días'],
  ['30d', '30 días'],
  ['mes', 'Este mes'],
  ['mes-anterior', 'Mes anterior'],
  ['90d', '90 días'],
  ['custom', 'Personalizado'],
];

export function rangeLabel(range) {
  return range.fromKey === range.toKey ? range.fromKey.split('-').reverse().join('-') : `${range.fromKey.split('-').reverse().join('-')} al ${range.toKey.split('-').reverse().join('-')}`;
}

/**
 * Pinta el control dentro de `container` y llama a onChange(range) al cambiar.
 * Devuelve { getRange }.
 */
export function mountRangeFilter(container, { initial = '30d', onChange }) {
  let preset = initial;
  let range = presetRange(initial);
  const today = todayKey();

  setHtml(
    container,
    html`<div class="field">
        <span class="field-label" id="range-label">Período</span>
        <div class="segmented" role="group" aria-labelledby="range-label">
          ${PRESETS.map(([key, label]) => html`<button type="button" data-preset="${key}" aria-pressed="${key === preset}">${label}</button>`)}
        </div>
      </div>
      <div class="field" data-custom hidden>
        <label for="range-from">Desde</label>
        <input class="input" type="date" id="range-from" max="${today}" value="${range.fromKey}" />
      </div>
      <div class="field" data-custom hidden>
        <label for="range-to">Hasta</label>
        <input class="input" type="date" id="range-to" max="${today}" value="${range.toKey}" />
      </div>`,
  );

  const from = container.querySelector('#range-from');
  const to = container.querySelector('#range-to');
  const customFields = container.querySelectorAll('[data-custom]');

  const emit = () => onChange(range);

  container.addEventListener('click', (event) => {
    const button = event.target.closest('[data-preset]');
    if (!button) return;
    preset = button.dataset.preset;
    container.querySelectorAll('[data-preset]').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
    customFields.forEach((el) => {
      el.hidden = preset !== 'custom';
    });
    if (preset === 'custom') {
      from.focus();
      return;
    }
    range = presetRange(preset);
    from.value = range.fromKey;
    to.value = range.toKey;
    emit();
  });

  const onDate = () => {
    if (!from.value || !to.value) return;
    range = rangeFromKeys(from.value, to.value);
    emit();
  };
  from.addEventListener('change', onDate);
  to.addEventListener('change', onDate);

  return { getRange: () => range };
}
