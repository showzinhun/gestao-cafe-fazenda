import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

const env = loadEnv('test', process.cwd(), '');
const testeDb = {
  DATABASE_URL: env.TEST_DATABASE_URL ?? 'postgresql://cafe_app_login:cafe_app_dev@localhost:5432/cafe_test',
  DIRECT_URL: env.TEST_DIRECT_URL ?? 'postgresql://postgres:postgres@localhost:5432/cafe_test',
  APP_DB_PASSWORD: env.APP_DB_PASSWORD ?? 'cafe_app_dev',
};

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    projects: [
      {
        plugins: [tsconfigPaths()],
        test: { name: 'dominio', include: ['tests/dominio/**/*.test.ts'], environment: 'node' },
      },
      {
        plugins: [tsconfigPaths()],
        test: {
          name: 'integracao',
          include: ['tests/integracao/**/*.test.ts'],
          environment: 'node',
          env: testeDb,
          globalSetup: ['tests/integracao/preparar-banco.ts'],
          sequence: { concurrent: false },
          poolOptions: { forks: { singleFork: true } },
          testTimeout: 20000,
          hookTimeout: 120000,
        },
      },
    ],
  },
});
