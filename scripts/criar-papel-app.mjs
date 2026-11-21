// Cria (ou atualiza) o login da aplicação como membro do papel "cafe_app".
// Uso: DIRECT_URL=... APP_DB_PASSWORD=... node scripts/criar-papel-app.mjs [nome_do_login]
// O papel "cafe_app" e os privilégios vêm da migração *_rls_multiempresa.
import { PrismaClient } from '@prisma/client';

const url = process.env.DIRECT_URL;
const senha = process.env.APP_DB_PASSWORD;
const login = process.argv[2] ?? 'cafe_app_login';
if (!url || !senha) {
  console.error('Defina DIRECT_URL e APP_DB_PASSWORD.');
  process.exit(1);
}
if (!/^[a-z_][a-z0-9_]{0,62}$/.test(login)) {
  console.error('Nome de login inválido.');
  process.exit(1);
}
const db = new PrismaClient({ datasourceUrl: url });
const lit = (s) => "'" + String(s).replace(/'/g, "''") + "'";
try {
  const existe = await db.$queryRawUnsafe(`SELECT 1 FROM pg_roles WHERE rolname = ${lit(login)}`);
  const acao = existe.length ? 'ALTER' : 'CREATE';
  await db.$executeRawUnsafe(`${acao} ROLE ${login} LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD ${lit(senha)}`);
  await db.$executeRawUnsafe(`GRANT cafe_app TO ${login}`);
  console.log(`Login ${login} pronto (membro de cafe_app).`);
} finally {
  await db.$disconnect();
}
