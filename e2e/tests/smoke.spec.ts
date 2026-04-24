import { test, expect } from '@playwright/test';

test.describe('smoke', () => {
  test('home responde 200', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);
  });

  test('home renderiza sem erro', async ({ page }) => {
    await page.goto('/');
    // Rails 8 serve a welcome page padrão em / quando não há rota root.
    // Se você configurar root route, ajuste este matcher.
    await expect(page).toHaveTitle(/rails|finansheet/i);
  });
});
