import { execFileSync } from 'node:child_process';
import { loadEnv } from 'vite';
import { PrismaClient } from '@prisma/client';

/**
 * Prepara o banco de TESTE do zero a cada execução: recria o banco (só se o nome terminar em "_test"),
 * aplica as migrações com `prisma migrate deploy` (com RLS), cria o login da aplicação e carrega o seed fictício.
 * Nunca toca no banco de desenvolvimento: as URLs vêm de TEST_DIRECT_URL / TEST_DATABASE_URL.
 */
export default async function prepararBanco() {
  const env = loadEnv('test', process.cwd(), '');
  const direta = env.TEST_DIRECT_URL ?? 'postgresql://postgres:postgres@localhost:5432/cafe_test';
  const app = env.TEST_DATABASE_URL ?? 'postgresql://cafe_app_login:cafe_app_dev@localhost:5432/cafe_test';
  const url = new URL(direta);
  const banco = url.pathname.slice(1);
  if (!/^[a-z0-9_]+_test$/.test(banco) || new URL(app).pathname.slice(1) !== banco) {
    throw new Error(`Banco de teste inválido: "${banco}". Use um banco exclusivo cujo nome termine em "_test".`);
  }
  const admin = new URL(direta);
  admin.pathname = '/postgres';
  const db = new PrismaClient({ datasourceUrl: admin.toString() });
  try {
    await db.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${banco}" WITH (FORCE)`);
    await db.$executeRawUnsafe(`CREATE DATABASE "${banco}"`);
  } finally {
    await db.$disconnect();
  }
  const filho = { ...process.env, DATABASE_URL: app, DIRECT_URL: direta, APP_DB_PASSWORD: env.APP_DB_PASSWORD ?? 'cafe_app_dev' };
  const rodar = (args: string[]) => execFileSync('npx', args, { stdio: 'pipe', env: filho });
  rodar(['prisma', 'migrate', 'deploy']);
  execFileSync('node', ['scripts/criar-papel-app.mjs'], { stdio: 'pipe', env: filho });
  rodar(['tsx', 'prisma/seed.ts']);
}
