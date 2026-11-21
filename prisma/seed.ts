/**
 * Seed com dados fictícios (regra 13): duas empresas para o teste de isolamento (§15, Preparação).
 * Roda com o dono das tabelas (DIRECT_URL), que passa pelas políticas RLS.
 * Senha de todos os usuários de desenvolvimento: "senha123" (só para ambiente local e testes).
 */
import { PrismaClient, type Perfil } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { SEED } from './dados-seed';

const db = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL });


async function main() {
  const hash = await bcrypt.hash(SEED.senha, 10);
  for (const e of Object.values(SEED.empresas)) {
    await db.empresa.upsert({ where: { id: e.id }, update: { nome: e.nome, cnpj: e.cnpj, status: 'ATIVA' }, create: { ...e, configuracoes: { unidade_medida_litros: 60, moeda_padrao: 'BRL', fuso: 'America/Sao_Paulo' } } });
  }
  for (const f of SEED.fazendas) {
    const empresaId = SEED.empresas[f.empresa].id;
    await db.fazenda.upsert({ where: { id: f.id }, update: { nome: f.nome }, create: { id: f.id, codigo: f.codigo, nome: f.nome, municipio: f.municipio, uf: f.uf, empresaId } });
  }
  for (const u of SEED.usuarios) {
    await db.usuario.upsert({ where: { id: u.id }, update: { nome: u.nome, email: u.email, senhaHash: hash, ativo: true }, create: { id: u.id, nome: u.nome, email: u.email, senhaHash: hash } });
    for (const [emp, perfil] of u.vinculos) {
      const empresaId = SEED.empresas[emp].id;
      await db.usuarioEmpresa.upsert({
        where: { usuarioId_empresaId: { usuarioId: u.id, empresaId } },
        update: { perfil: perfil as Perfil, ativo: true },
        create: { usuarioId: u.id, empresaId, perfil: perfil as Perfil },
      });
    }
  }
  console.log(`Seed: ${Object.keys(SEED.empresas).length} empresas, ${SEED.fazendas.length} fazendas, ${SEED.usuarios.length} usuários (senha "${SEED.senha}").`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
