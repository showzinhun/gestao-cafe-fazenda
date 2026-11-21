/**
 * Cria uma empresa nova copiando um modelo de fluxo (§5.3). Operação de plataforma: usa DIRECT_URL.
 * Uso: npx tsx scripts/criar-empresa.ts --nome "Fazenda X" --modelo VIA_UMIDA --admin-email a@b.c --admin-nome "Fulano" --admin-senha "..."
 * Modelos: VIA_UMIDA, VIA_SECA, SIMPLIFICADO.
 */
import { PrismaClient } from '@prisma/client';
import { criarEmpresa } from '../src/servicos/plataforma';

const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};

const db = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL });
const nome = arg('nome');
const email = arg('admin-email');
if (!nome || !email) {
  console.error('Informe --nome e --admin-email (e --admin-senha se o usuário ainda não existir).');
  process.exit(1);
}
criarEmpresa(db, { nome, cnpj: arg('cnpj') ?? null, modelo: arg('modelo') ?? 'VIA_UMIDA', admin: { nome: arg('admin-nome') ?? email, email, senha: arg('admin-senha') } })
  .then((e) => console.log(`Empresa criada: ${e.nome} (${e.id}).`))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
