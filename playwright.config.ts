import { defineConfig, devices } from '@playwright/test';
import { loadEnv } from 'vite';

const env = loadEnv('test', process.cwd(), '');
const PORTA = Number(env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  globalSetup: './tests/e2e/preparar.ts',
  use: { baseURL: `http://localhost:${PORTA}`, trace: 'off', locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: /campo\.spec\.ts/ },
    // Depois do desktop: os testes do celular criam lotes e não podem mudar a numeração que o desktop confere.
    { name: 'celular', use: { ...devices['Pixel 7'] }, testMatch: /campo\.spec\.ts/, dependencies: ['desktop'] },
  ],
  webServer: {
    command: `npx next start -p ${PORTA}`,
    url: `http://localhost:${PORTA}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      DATABASE_URL: env.TEST_DATABASE_URL ?? 'postgresql://cafe_app_login:cafe_app_dev@localhost:5432/cafe_test',
      DIRECT_URL: env.TEST_DIRECT_URL ?? 'postgresql://postgres:postgres@localhost:5432/cafe_test',
      AUTH_SECRET: env.AUTH_SECRET ?? 'e2e-segredo-somente-para-testes-0123456789',
      AUTH_TRUST_HOST: 'true',
      DADOS_PESSOAIS_CHAVE: env.TEST_DADOS_PESSOAIS_CHAVE ?? 'dGVzdGUtY2hhdmUtZmljdGljaWEtMzItYnl0ZXMhISE=',
      AUTH_URL: `http://localhost:${PORTA}`,
    },
  },
});
