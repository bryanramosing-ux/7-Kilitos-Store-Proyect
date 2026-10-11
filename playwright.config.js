// Pruebas de extremo a extremo contra Firebase Local Emulator Suite.
// Ejecutar con `npm run test:e2e` (levanta los emuladores, siembra datos y corre).
import { defineConfig, devices } from '@playwright/test';

// En entornos con proxy de salida (CI corporativo, contenedores) Chromium no lee
// HTTPS_PROXY; se le pasa explícitamente y se excluye el tráfico local.
const proxy = process.env.HTTPS_PROXY ?? process.env.https_proxy;
const launchArgs = proxy ? [`--proxy-server=${proxy}`, '--proxy-bypass-list=127.0.0.1;localhost;<loopback>'] : [];

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '*.spec.js',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  globalSetup: './tests/e2e/global-setup.js',
  use: {
    baseURL: 'http://127.0.0.1:5000',
    locale: 'es-CL',
    timezoneId: 'America/Santiago',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { args: launchArgs },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } } }],
});
