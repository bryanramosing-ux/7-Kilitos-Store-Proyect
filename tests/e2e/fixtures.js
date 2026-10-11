import { test as base, expect } from '@playwright/test';
import { routeFirebaseSdk, trackErrors } from './support.js';

export const test = base.extend({
  context: async ({ context }, use) => {
    await routeFirebaseSdk(context);
    await use(context);
  },
  jsErrors: async ({ page }, use) => {
    await use(trackErrors(page));
  },
});

export { expect };
