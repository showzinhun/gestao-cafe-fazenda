import { type Perfil, type Prisma, PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { CERTIFICADOS_PADRAO, MODELOS_FLUXO, modeloFluxo, PENEIRAS_PADRAO, TIPOS_CAFE_PADRAO } from '@/dominio/modelos-fluxo';
import { ErroNaoEncontrado, ErroPermissao, ErroValidacao } from '@/dominio/erros';
import { cnpjValido, formatarCpfCnpj } from '@/dominio/documentos';
import { copiarModelo } from './fluxo';
import { ehUuid, type Tx } from './transacao';

/**
 * Plataforma (SUPERADMIN, §3.2 e §12 item 15): empresas, planos e suspensão.
 * Roda com o papel de banco "cafe_plataforma" (SET LOCAL ROLE), que passa por fora da RLS mas só tem
 * privilégio sobre empresas, usuários, vínculos e cadastros-base: o SUPERADMIN não vê dados operacionais.
 */

/** Planos informativos (D-04: sem cobrança no MVP). */
export const PLANOS = ['BASICO', 'PROFISSIONAL', 'EMPRESARIAL'] as const;

interface DadosEmpresa {
  id?: string;
  nome: string;
  cnpj?: string | null;
  modelo: string;
  plano?: string;
  admin: { nome: string; email: string; senha?: string };
}

/** Cria a empresa, copia o modelo de fluxo (§5.3) e os cadastros-base, e vincula o administrador. */
async function criarEmpresaTx(tx: Tx, dados: DadosEmpresa, autorId: string | null) {
  const modelo = modeloFluxo(dados.modelo);
  if (!modelo) throw new ErroValidacao(`Modelo de fluxo desconhecido: ${dados.modelo}.`, 'modelo');
  const empresa = await tx.empresa.create({
    data: {
      ...(dados.id ? { id: dados.id } : {}), nome: dados.nome, cnpj: dados.cnpj ?? null, plano: dados.plano ?? 'BASICO',
      configuracoes: { unidade_medida_litros: 60, moeda_padrao: 'BRL', fuso: 'America/Sao_Paulo', modelo_inicial: modelo.codigo },
    },
  });
  const e = empresa.id;
  await tx.tipoCafe.createMany({ data: TIPOS_CAFE_PADRAO.map(([codigo, nome]) => ({ empresaId: e, codigo, nome })) });
  await tx.peneira.createMany({ data: PENEIRAS_PADRAO.map(([codigo, descricao], i) => ({ empresaId: e, codigo, descricao, ordem: (i + 1) * 10 })) });
  await tx.certificado.createMany({ data: CERTIFICADOS_PADRAO.map(([codigo, nome]) => ({ empresaId: e, codigo, nome })) });
  await tx.turno.createMany({ data: ['Manhã', 'Tarde', 'Noite'].map((nome) => ({ empresaId: e, nome })) });
  await copiarModelo(tx, e, modelo, null);

  const email = dados.admin.email.trim().toLowerCase();
  let u = await tx.usuario.findUnique({ where: { email } });
  if (!u) {
    if (!dados.admin.senha) throw new ErroValidacao('Informe a senha do administrador.', 'senha');
    u = await tx.usuario.create({ data: { nome: dados.admin.nome, email, senhaHash: await bcrypt.hash(dados.admin.senha, 10) } });
  }
  await tx.usuarioEmpresa.create({ data: { usuarioId: u.id, empresaId: e, perfil: 'ADMIN_EMPRESA' as Perfil } });
  // createMany: sem RETURNING (a plataforma só insere na auditoria, não lê).
  await tx.auditoria.createMany({ data: { empresaId: e, usuarioId: autorId, entidade: 'empresa', entidadeId: e, acao: 'CRIAR', depois: { nome: dados.nome, modelo: modelo.codigo, plano: empresa.plano, admin: email } } });
  return empresa;
}

/** Script e seed: conexão de dono (DIRECT_URL), fora da RLS. */
export async function criarEmpresa(db: PrismaClient, dados: DadosEmpresa) {
  return db.$transaction((tx) => criarEmpresaTx(tx, dados, null));
}

/** O usuário é SUPERADMIN ativo? (lido com a conexão da aplicação). */
export async function ehSuperadmin(usuarioId: string | null | undefined): Promise<boolean> {
  if (!ehUuid(usuarioId)) return false;
  const u = await prisma.usuario.findUnique({ where: { id: usuarioId }, select: { superadmin: true, ativo: true } });
  return !!u?.superadmin && u.ativo;
}

/** Transação da plataforma: confere o SUPERADMIN e assume o papel "cafe_plataforma" só nela. */
async function comPlataforma<T>(usuarioId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!(await ehSuperadmin(usuarioId))) throw new ErroPermissao('Só o administrador da plataforma acessa esta área.');
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.empresa_id', '', true), set_config('app.usuario_id', ${usuarioId}, true)`;
    await tx.$executeRawUnsafe('SET LOCAL ROLE cafe_plataforma');
    return fn(tx);
  });
}

async function registrar(tx: Tx, usuarioId: string, empresaId: string, acao: string, depois: Prisma.InputJsonValue, antes?: Prisma.InputJsonValue) {
  await tx.auditoria.createMany({ data: { empresaId, usuarioId, entidade: 'empresa', entidadeId: empresaId, acao, antes, depois } });
}

/** Lista de empresas: só dados cadastrais e de acesso (nunca operacionais). */
export async function listarEmpresasPlataforma(usuarioId: string) {
  return comPlataforma(usuarioId, async (tx) => {
    const empresas = await tx.empresa.findMany({ orderBy: { nome: 'asc' } });
    const vinculos = await tx.usuarioEmpresa.findMany({ where: { ativo: true }, include: { usuario: { select: { nome: true, email: true, ativo: true } } } });
    return empresas.map((e) => {
      const v = vinculos.filter((x) => x.empresaId === e.id && x.usuario.ativo);
      return {
        id: e.id, nome: e.nome, cnpj: e.cnpj, plano: e.plano, status: e.status, criadoEm: e.criadoEm, suspensaEm: e.suspensaEm, motivoStatus: e.motivoStatus,
        modelo: (e.configuracoes as { modelo_inicial?: string } | null)?.modelo_inicial ?? null,
        usuarios: v.length, administradores: v.filter((x) => x.perfil === 'ADMIN_EMPRESA').map((x) => ({ nome: x.usuario.nome, email: x.usuario.email })),
      };
    });
  });
}

const novaEmpresaSchema = z.object({
  nome: z.string().trim().min(3, 'Informe o nome da empresa.').max(120),
  cnpj: z.string().trim().optional().nullable().transform((v) => v || null),
  modelo: z.enum(MODELOS_FLUXO.map((m) => m.codigo) as [string, ...string[]]),
  plano: z.enum(PLANOS).default('BASICO'),
  adminNome: z.string().trim().min(3, 'Informe o nome do administrador.').max(120),
  adminEmail: z.string().trim().toLowerCase().email('E-mail inválido.'),
  adminSenha: z.string().optional().nullable(),
});

export async function criarEmpresaPlataforma(usuarioId: string, entrada: z.input<typeof novaEmpresaSchema>) {
  const d = novaEmpresaSchema.parse(entrada);
  if (d.cnpj && !cnpjValido(d.cnpj)) throw new ErroValidacao('CNPJ inválido.', 'cnpj');
  if (d.adminSenha && d.adminSenha.length < 8) throw new ErroValidacao('A senha inicial precisa de pelo menos 8 caracteres.', 'adminSenha');
  return comPlataforma(usuarioId, async (tx) => {
    if (await tx.empresa.findFirst({ where: { nome: { equals: d.nome, mode: 'insensitive' } } })) throw new ErroValidacao('Já existe uma empresa com esse nome.', 'nome');
    const e = await criarEmpresaTx(tx, { nome: d.nome, cnpj: d.cnpj ? formatarCpfCnpj(d.cnpj) : null, modelo: d.modelo, plano: d.plano, admin: { nome: d.adminNome, email: d.adminEmail, senha: d.adminSenha ?? undefined } }, usuarioId);
    return { id: e.id, nome: e.nome };
  });
}

async function empresaDaPlataforma(tx: Tx, empresaId: string) {
  if (!ehUuid(empresaId)) throw new ErroNaoEncontrado('Empresa não encontrada.');
  const e = await tx.empresa.findUnique({ where: { id: empresaId } });
  if (!e) throw new ErroNaoEncontrado('Empresa não encontrada.');
  return e;
}

/** Suspender (com motivo) corta o acesso de todos os usuários na hora; reativar devolve. Nada é apagado. */
export async function alterarStatusEmpresa(usuarioId: string, empresaId: string, status: 'ATIVA' | 'SUSPENSA', motivo?: string | null) {
  const m = (motivo ?? '').trim();
  if (status === 'SUSPENSA' && m.length < 5) throw new ErroValidacao('Informe o motivo da suspensão.', 'motivo');
  return comPlataforma(usuarioId, async (tx) => {
    const e = await empresaDaPlataforma(tx, empresaId);
    if (e.status === status) throw new ErroValidacao(status === 'SUSPENSA' ? 'A empresa já está suspensa.' : 'A empresa já está ativa.');
    const r = await tx.empresa.update({ where: { id: empresaId }, data: { status, suspensaEm: status === 'SUSPENSA' ? new Date() : null, motivoStatus: m || null } });
    await registrar(tx, usuarioId, empresaId, status === 'SUSPENSA' ? 'SUSPENDER' : 'REATIVAR', { status, motivo: m || null }, { status: e.status });
    return { id: r.id, status: r.status };
  });
}

export async function alterarPlano(usuarioId: string, empresaId: string, plano: string) {
  const p = z.enum(PLANOS).parse(plano);
  return comPlataforma(usuarioId, async (tx) => {
    const e = await empresaDaPlataforma(tx, empresaId);
    if (e.plano === p) return { id: e.id, plano: e.plano };
    const r = await tx.empresa.update({ where: { id: empresaId }, data: { plano: p } });
    await registrar(tx, usuarioId, empresaId, 'ALTERAR_PLANO', { plano: p }, { plano: e.plano });
    return { id: r.id, plano: r.plano };
  });
}
