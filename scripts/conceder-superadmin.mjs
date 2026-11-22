// Concede (ou retira) o perfil de SUPERADMIN da plataforma. Só o dono do banco pode (gatilho usuario_superadmin_protegido).
// Uso: DIRECT_URL=... node scripts/conceder-superadmin.mjs email@dominio [--retirar]
import { PrismaClient } from '@prisma/client';

const url = process.env.DIRECT_URL;
const email = (process.argv[2] ?? '').trim().toLowerCase();
const valor = !process.argv.includes('--retirar');
if (!url || !email) {
  console.error('Uso: DIRECT_URL=... node scripts/conceder-superadmin.mjs email [--retirar]');
  process.exit(1);
}
const db = new PrismaClient({ datasourceUrl: url });
try {
  const u = await db.usuario.update({ where: { email }, data: { superadmin: valor } });
  console.log(`${u.email}: superadmin = ${u.superadmin}`);
} catch {
  console.error('Usuário não encontrado.');
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
