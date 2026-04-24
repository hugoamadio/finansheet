import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright rodado FORA do container, direto no host.
 * Pré-requisito: subir o Rails com `docker compose up -d` antes de testar.
 *
 * Docs: https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests',

  // Paraleliza arquivos de teste
  fullyParallel: true,

  // CI: falha se alguém esquecer `.only`; local: deixa rodar
  forbidOnly: !!process.env.CI,

  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  reporter: 'html',

  use: {
    // Aponta pra app rodando no container (porta publicada via compose)
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',

    // Captura trace/screenshot só quando algo quebra — barato e útil
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Firefox e WebKit comentados pra install rápido. Descomenta quando
    // quiser cobertura cross-browser e roda `npx playwright install`.
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
  ],

  // webServer NÃO configurado de propósito: você sobe o Rails via
  // `docker compose up -d` e os testes assumem que está no ar.
});
