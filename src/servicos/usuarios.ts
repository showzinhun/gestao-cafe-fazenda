import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { auditar } from './auditoria';
import { comTransacao, ehUuid, exigir, type Contexto } from './transacao';
import { ErroNaoEncontrado, ErroValidacao } from '@/dominio/erros';
import { PERFIS, PERMISSOES, type Perfil, type Permissao } from '@/dominio/perfis';
import { permissoesDoPerfil, type AjustesPermissao } from '@/dominio/permissoes';

/**
 * Usuários da empresa (§3.2) e acesso por fazenda (RN-04). O usuário é global (e-mail único):
 * se o e-mail já existe, só se cria o vínculo; a senha dele não muda daqui.
 */
export async function listarUsuarios(ctx: Contexto) {
  exigir(ctx, 'usuarios.gerenciar');
  return comTransacao(ctx, async (tx) => {
    const vinculos = await tx.usuarioEmpresa.findMany({ where: { empresaId: ctx.empresaId }, include: { usuario: { select: { id: true, nome: true, email: true, ativo: true } } }, orderBy: { usuario: { nome: 'asc' } } });
    const acessos = await tx.usuarioFazenda.findMany({ select: { usuarioId: true, fazendaId: true } });
    return vinculos.map((v) => ({
      usuarioId: v.usuarioId, nome: v.usuario.nome, email: v.usuario.email, perfil: v.perfil, ativo: v.ativo && v.usuario.ativo,
      fazendaIds: acessos.filter((a) => a.usuarioId === v.usuarioId).map((a) => a.fazendaId),
    }));
  });
}

const novoUsuario = z.object({
  nome: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email('E-mail inválido.'),
  perfil: z.enum(PERFIS),
  senhaInicial: z.string().min(8, 'A senha inicial precisa de pelo menos 8 caracteres.').optional().or(z.literal('')).transform((v) => v || undefined),
  fazendaIds: z.array(z.string().uuid()).default([]),
});

export async function adicionarUsuario(ctx: Contexto, entrada: z.input<typeof novoUsuario>) {
  exigir(ctx, 'usuarios.gerenciar');
  const d = novoUsuario.parse(entrada);
  return comTransacao(ctx, async (tx) => {
    let u = await tx.usuario.findUnique({ where: { email: d.email } });
    if (u) {
      const ja = await tx.usuarioEmpresa.findFirst({ where: { usuarioId: u.id, empresaId: ctx.empresaId } });
      if (ja) throw new ErroValidacao('Esse e-mail já tem acesso a esta empresa.', 'email');
    } else {
      if (!d.senhaInicial) throw new ErroValidacao('Informe uma senha inicial para o novo usuário.', 'senhaInicial');
      u = await tx.usuario.create({ data: { nome: d.nome, email: d.email, senhaHash: await bcrypt.hash(d.senhaInicial, 10) } });
    }
    await tx.usuarioEmpresa.create({ data: { usuarioId: u.id, empresaId: ctx.empresaId, perfil: d.perfil } });
    await gravarFazendas(tx, ctx, u.id, d.fazendaIds);
    await auditar(tx, ctx, { entidade: 'usuario_empresa', entidadeId: u.id, acao: 'CRIAR', depois: { email: d.email, perfil: d.perfil, fazendaIds: d.fazendaIds } });
    return { usuarioId: u.id, novo: !!d.senhaInicial };
  });
}

async function gravarFazendas(tx: Parameters<Parameters<typeof comTransacao>[1]>[0], ctx: Contexto, usuarioId: string, fazendaIds: string[]) {
  const unicas = [...new Set(fazendaIds)];
  if (unicas.length && (await tx.fazenda.count({ where: { id: { in: unicas } } })) !== unicas.length) throw new ErroNaoEncontrado('Fazenda não encontrada.');
  await tx.usuarioFazenda.deleteMany({ where: { usuarioId } });
  if (unicas.length) await tx.usuarioFazenda.createMany({ data: unicas.map((f) => ({ usuarioId, fazendaId: f, empresaId: ctx.empresaId })) });
}

const alteracao = z.object({ perfil: z.enum(PERFIS), ativo: z.boolean(), fazendaIds: z.array(z.string().uuid()).default([]) });

/** Muda perfil, situação e fazendas liberadas. A empresa nunca fica sem administrador ativo. */
export async function alterarUsuario(ctx: Contexto, usuarioId: string, entrada: z.input<typeof alteracao>) {
  exigir(ctx, 'usuarios.gerenciar');
  if (!ehUuid(usuarioId)) throw new ErroNaoEncontrado();
  const d = alteracao.parse(entrada);
  return comTransacao(ctx, async (tx) => {
    const v = await tx.usuarioEmpresa.findFirst({ where: { usuarioId, empresaId: ctx.empresaId } });
    if (!v) throw new ErroNaoEncontrado('Usuário não encontrado.');
    const perdeAdmin = v.perfil === 'ADMIN_EMPRESA' && v.ativo && (d.perfil !== 'ADMIN_EMPRESA' || !d.ativo);
    if (perdeAdmin) {
      const outros = await tx.usuarioEmpresa.count({ where: { empresaId: ctx.empresaId, perfil: 'ADMIN_EMPRESA', ativo: true, NOT: { usuarioId } } });
      if (outros === 0) throw new ErroValidacao('A empresa precisa de pelo menos um administrador ativo.');
    }
    if (usuarioId === ctx.usuarioId && !d.ativo) throw new ErroValidacao('Você não pode inativar o seu próprio acesso.');
    await tx.usuarioEmpresa.update({ where: { usuarioId_empresaId: { usuarioId, empresaId: ctx.empresaId } }, data: { perfil: d.perfil, ativo: d.ativo } });
    await gravarFazendas(tx, ctx, usuarioId, d.fazendaIds);
    await auditar(tx, ctx, { entidade: 'usuario_empresa', entidadeId: usuarioId, acao: 'ALTERAR', antes: { perfil: v.perfil, ativo: v.ativo }, depois: d });
  });
}

/** Fazendas em que o usuário pode lançar (RN-04). ADMIN_EMPRESA: todas (null = sem restrição). */
export async function fazendasDoUsuario(ctx: Contexto): Promise<string[] | null> {
  if (ctx.perfil === 'ADMIN_EMPRESA') return null;
  return comTransacao(ctx, async (tx) => (await tx.usuarioFazenda.findMany({ where: { usuarioId: ctx.usuarioId } })).map((a) => a.fazendaId));
}

// ------------------------------------------------------------------ matriz de permissões (§3.2)

export async function obterMatriz(ctx: Contexto) {
  return comTransacao(ctx, async (tx) => {
    const linhas = await tx.perfilPermissao.findMany();
    const ajustes: AjustesPermissao = {};
    for (const l of linhas) (ajustes[l.perfil] ??= {})[l.permissao as Permissao] = l.permitido;
    return Object.fromEntries(PERFIS.map((p) => [p, permissoesDoPerfil(p, ajustes)])) as Record<Perfil, Permissao[]>;
  });
}

const ajuste = z.object({ perfil: z.enum(PERFIS).exclude(['ADMIN_EMPRESA']), permissao: z.enum(PERMISSOES), permitido: z.boolean() });

export async function definirPermissao(ctx: Contexto, entrada: z.input<typeof ajuste>) {
  exigir(ctx, 'usuarios.gerenciar');
  const d = ajuste.parse(entrada);
  return comTransacao(ctx, async (tx) => {
    await tx.perfilPermissao.upsert({
      where: { empresaId_perfil_permissao: { empresaId: ctx.empresaId, perfil: d.perfil, permissao: d.permissao } },
      update: { permitido: d.permitido },
      create: { empresaId: ctx.empresaId, ...d },
    });
    await auditar(tx, ctx, { entidade: 'perfil_permissao', entidadeId: `${d.perfil}:${d.permissao}`, acao: 'ALTERAR', depois: d });
  });
}
