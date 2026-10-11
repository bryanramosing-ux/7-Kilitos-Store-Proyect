// Revisión estática mínima: variables no definidas, imports sin uso y errores comunes.
const browser = Object.fromEntries(
  [
    'window', 'document', 'location', 'history', 'navigator', 'localStorage', 'sessionStorage', 'fetch', 'URL',
    'URLSearchParams', 'CustomEvent', 'Event', 'FormData', 'Blob', 'ResizeObserver', 'HTMLElement', 'crypto',
    'console', 'setTimeout', 'clearTimeout', 'createImageBitmap', 'Intl', 'globalThis', 'getComputedStyle',
  ].map((name) => [name, 'readonly']),
);
const node = Object.fromEntries(
  ['process', 'console', 'setTimeout', 'clearTimeout', 'URL', 'fetch', 'Buffer', 'globalThis', 'Intl', 'crypto', 'TextEncoder']
    .map((name) => [name, 'readonly']),
);
const rules = {
  'no-undef': 'error',
  'no-unused-vars': ['error', { args: 'none', ignoreRestSiblings: true }],
  'no-unreachable': 'error',
  'no-dupe-keys': 'error',
  'no-duplicate-imports': 'error',
  'no-self-assign': 'error',
  'no-constant-condition': ['error', { checkLoops: false }],
  'no-redeclare': 'error',
  eqeqeq: ['error', 'always'],
};

export default [
  { ignores: ['**/node_modules/**', 'referencias/**', 'test-results/**', 'playwright-report/**'] },
  { files: ['public/**/*.js'], languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: browser }, rules },
  {
    files: ['functions/**/*.js', 'scripts/**/*.mjs', 'tests/**/*.js', '*.js', '*.config.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...node, ...browser } },
    rules,
  },
];
