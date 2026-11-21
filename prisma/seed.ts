/**
 * Seed com dados fictícios (regra 13): empresas Alfa (modelo Via úmida) e Beta (Simplificado), cenário §15 Preparação.
 * Roda com o dono das tabelas (DIRECT_URL), fora da RLS. Pode rodar mais de uma vez.
 * Senha de todos os usuários de desenvolvimento: "senha123" (só para ambiente local e testes).
 */
import { PrismaClient, type Perfil } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { SEED } from './dados-seed';
import { criarEmpresa } from '../src/servicos/plataforma';
import { processarGeometria } from '../src/dominio/geometria';

const db = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL });

async function main() {
  const hash = await bcrypt.hash(SEED.senha, 10);
  // Usuários primeiro: o administrador de cada empresa já existe quando ela é criada.
  for (const u of SEED.usuarios) {
    await db.usuario.upsert({ where: { id: u.id }, update: { nome: u.nome, email: u.email, senhaHash: hash, ativo: true }, create: { id: u.id, nome: u.nome, email: u.email, senhaHash: hash } });
  }
  const admin = (emp: 'alfa' | 'beta') => SEED.usuarios.find((u) => u.vinculos.some(([e, p]) => e === emp && p === 'ADMIN_EMPRESA'))!;
  for (const [chave, e] of Object.entries(SEED.empresas) as ['alfa' | 'beta', (typeof SEED.empresas)['alfa']][]) {
    if (!(await db.empresa.findUnique({ where: { id: e.id } }))) {
      const a = admin(chave);
      await criarEmpresa(db, { id: e.id, nome: e.nome, cnpj: e.cnpj, modelo: e.modelo, admin: { nome: a.nome, email: a.email } });
    }
  }
  for (const u of SEED.usuarios) {
    for (const [emp, perfil] of u.vinculos) {
      const empresaId = SEED.empresas[emp].id;
      await db.usuarioEmpresa.upsert({ where: { usuarioId_empresaId: { usuarioId: u.id, empresaId } }, update: { perfil: perfil as Perfil, ativo: true }, create: { usuarioId: u.id, empresaId, perfil: perfil as Perfil } });
    }
  }
  for (const p of SEED.parceiros) {
    const empresaId = SEED.empresas[p.empresa].id;
    const { empresa: _e, ...dados } = p;
    void _e;
    await db.parceiro.upsert({ where: { id: p.id }, update: {}, create: { ...dados, papeis: [...p.papeis], empresaId } });
  }
  for (const f of SEED.fazendas) {
    const empresaId = SEED.empresas[f.empresa].id;
    const dados = { codigo: f.codigo, nome: f.nome, produtorId: f.produtor, municipio: f.municipio, uf: f.uf, car: f.car };
    await db.fazenda.upsert({ where: { id: f.id }, update: dados, create: { id: f.id, empresaId, ...dados } });
  }
  const alfa = SEED.empresas.alfa.id;
  for (const t of SEED.talhoes) {
    const g = processarGeometria(t.geometria, t.areaHaInformada);
    const dados = { fazendaId: t.fazenda, codigo: t.codigo, nome: t.nome, areaHaInformada: t.areaHaInformada, variedade: t.variedade, geometria: g.geometria as object, geometriaTipo: g.tipo, areaHaCalculada: g.areaHa };
    await db.talhao.upsert({ where: { id: t.id }, update: dados, create: { id: t.id, empresaId: alfa, ...dados } });
  }
  for (const e of Object.values(SEED.empresas)) {
    const s = SEED.safra;
    await db.safra.upsert({
      where: { empresaId_codigo: { empresaId: e.id, codigo: s.codigo } },
      update: {},
      create: { empresaId: e.id, codigo: s.codigo, dataInicio: new Date(s.dataInicio), dataFim: new Date(s.dataFim) },
    });
  }
  // Locais da Alfa (terreiro TE-01 com 120 medidas, como no §15) e preço de colheita R$ 12,00 (passo 2).
  const etapa = async (codigo: string) => (await db.etapa.findUnique({ where: { empresaId_codigo: { empresaId: alfa, codigo } } }))!.id;
  const ns = SEED.fazendas[0].id;
  const locais = [
    ['TERREIRO', 'TE-01', 'Terreiro 1', '120', 'MEDIDA', ns],
    ['SECADOR', 'SE-01', 'Secador 1', '60', 'MEDIDA', ns],
    ['TULHA', 'TU-01', 'Tulha 1', '200', 'MEDIDA', ns],
    ['ARMAZEM', 'Q-01', 'Quadra 1', '30000', 'KG', null],
    ['ARMAZEM', 'Q-02', 'Quadra 2', '30000', 'KG', null],
  ] as const;
  for (const [et, codigo, nome, cap, un, faz] of locais) {
    await db.local.upsert({
      where: { empresaId_codigo: { empresaId: alfa, codigo } },
      update: {},
      create: { empresaId: alfa, etapaId: await etapa(et), codigo, nome, capacidade: cap, unidadeCapacidade: un, fazendaId: faz },
    });
  }
  const safraAlfa = (await db.safra.findUnique({ where: { empresaId_codigo: { empresaId: alfa, codigo: SEED.safra.codigo } } }))!.id;
  if (!(await db.tabelaPrecoColheita.findFirst({ where: { empresaId: alfa, fazendaId: ns } }))) {
    await db.tabelaPrecoColheita.create({ data: { empresaId: alfa, fazendaId: ns, safraId: safraAlfa, tipoColheita: 'MANUAL', valorPorMedida: '12.00', vigenciaInicio: new Date(SEED.safra.dataInicio) } });
  }
  if (!(await db.motorista.findFirst({ where: { empresaId: alfa } }))) {
    await db.motorista.create({ data: { empresaId: alfa, nome: 'Pedro Motorista (fictício)', cpf: '246.813.579-28', placaPadrao: 'ABC1D23', transportadorId: SEED.parceiros[2].id } });
  }
  console.log(`Seed: ${Object.keys(SEED.empresas).length} empresas, ${SEED.fazendas.length} fazendas, ${SEED.talhoes.length} talhões, ${SEED.usuarios.length} usuários (senha "${SEED.senha}").`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
