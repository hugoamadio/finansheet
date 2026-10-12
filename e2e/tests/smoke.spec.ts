import { test, expect } from '@playwright/test';

// Só leitura: o app em execução usa banco com dados reais. Fluxos que
// gravam ficam nos testes Rails (banco de teste).
test.describe('smoke', () => {
  for (const path of ['/', '/login', '/dashboard', '/dashboard/virada', '/ciclos']) {
    test(`${path} responde 200`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
    });
  }

  test('login em português', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveTitle(/Entrar · FinanSheet/);
  });
});
