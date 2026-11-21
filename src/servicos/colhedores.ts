import { z } from 'zod';
import { ErroNaoEncontrado, ErroPermissao, ErroValidacao } from '@/dominio/erros';
import { cpfValido, formatarCpfCnpj, soDigitos } from '@/dominio/documentos';
import { mascararCpf, mascararPix } from '@/dominio/colheita';
import { cifrar, decifrar, impressao } from '@/lib/cripto';
import { auditar } from './auditoria';
import { comTransacao, ehUuid, exigir, type Contexto } from './transacao';
import { exigirFazendas, fazendasPermitidas } from './rastreio-base';

/**
 * Turmas e colhedores (§4.5). CPF e chave PIX são dados pessoais (§3.3, regra 11):
 * cifrados no banco, mascarados por padrão; só FINANCEIRO e ADMIN_EMPRESA revelam, e cada revelação é auditada.
 */

const texto = (max = 120) => z.string().trim().max(max).optional().nullable().transform((v) => v || null);

// ================================================================ turmas

const turmaSchema = z.object({ fazendaId: z.string().uuid(), nome: z.string().trim().min(1).max(60), responsavel: texto() });

export async function listarTurmas(ctx: Contexto, opcoes: { incluirInativas?: boolean } = {}) {
  return comTransacao(ctx, async (tx) =>
    (await tx.turma.findMany({
      where: opcoes.incluirInativas ? {} : { ativo: true },
      include: { fazenda: { select: { codigo: true } }, _count: { select: { colhedores: { where: { ativo: true } } } } },
      orderBy: [{ fazenda: { codigo: 'asc' } }, { nome: 'asc' }],
    })).map((t) => ({ id: t.id, nome: t.nome, fazendaId: t.fazendaId, fazenda: t.fazenda.codigo, responsavel: t.responsavel, ativo: t.ativo, colhedores: t._count.colhedores })),
  );
}

export async function salvarTurma(ctx: Contexto, id: string | null, entrada: z.input<typeof turmaSchema>) {
  exigir(ctx, 'cadastros.editar');
  const d = turmaSchema.parse(entrada);
  return comTransacao(ctx, async (tx) => {
    if (!(await tx.fazenda.findFirst({ where: { id: d.fazendaId } }))) throw new ErroNaoEncontrado('Fazenda não encontrada.');
    const repetida = await tx.turma.findFirst({ where: { fazendaId: d.fazendaId, nome: d.nome, ...(id ? { NOT: { id } } : {}) } });
    if (repetida) throw new ErroValidacao('Já existe uma turma com esse nome nesta fazenda.', 'nome');
    const atual = id ? await tx.turma.findFirst({ where: { id } }) : null;
    if (id && !atual) throw new ErroNaoEncontrado('Turma não encontrada.');
    const t = atual
      ? await tx.turma.update({ where: { id: atual.id }, data: { ...d, alteradoPor: ctx.usuarioId } })
      : await tx.turma.create({ data: { ...d, empresaId: ctx.empresaId, criadoPor: ctx.usuarioId } });
    await auditar(tx, ctx, { entidade: 'turma', entidadeId: t.id, acao: atual ? 'ALTERAR' : 'CRIAR', antes: atual ?? undefined, depois: t });
    return t;
  });
}

// ================================================================ colhedores

const colhedorSchema = z.object({
  nome: z.string().trim().min(2).max(120),
  apelido: texto(40),
  turmaId: z.string().uuid().optional().nullable().or(z.literal('')).transform((v) => v || null),
  telefone: texto(30),
  /** Só quando informado: vazio mantém o valor atual; "-" apaga. */
  cpf: z.string().trim().optional().nullable(),
  chavePix: z.string().trim().max(140).optional().nullable(),
});

/** Lista sem dados pessoais abertos: só as máscaras. */
export async function listarColhedores(ctx: Contexto, filtro: { turmaId?: string; incluirInativos?: boolean } = {}) {
  return comTransacao(ctx, async (tx) =>
    (await tx.colhedor.findMany({
      where: { ...(filtro.incluirInativos ? {} : { ativo: true }), ...(filtro.turmaId ? { turmaId: filtro.turmaId } : {}) },
      include: { turma: { select: { nome: true, fazenda: { select: { codigo: true } } } } },
      orderBy: { nome: 'asc' },
    })).map((c) => ({
      id: c.id, nome: c.nome, apelido: c.apelido, telefone: c.telefone, turmaId: c.turmaId, turma: c.turma ? `${c.turma.fazenda.codigo} · ${c.turma.nome}` : null,
      cpf: c.cpfMascara, chavePix: c.pixMascara, ativo: c.ativo,
    })),
  );
}

export async function salvarColhedor(ctx: Contexto, id: string | null, entrada: z.input<typeof colhedorSchema>) {
  exigir(ctx, 'cadastros.editar');
  const d = colhedorSchema.parse(entrada);
  return comTransacao(ctx, async (tx) => {
    const atual = id ? await tx.colhedor.findFirst({ where: { id } }) : null;
    if (id && !atual) throw new ErroNaoEncontrado('Colhedor não encontrado.');
    if (d.turmaId && !(await tx.turma.findFirst({ where: { id: d.turmaId } }))) throw new ErroNaoEncontrado('Turma não encontrada.');
    const pessoais: Record<string, string | null> = {};
    if (d.cpf === '-') Object.assign(pessoais, { cpfCifrado: null, cpfMascara: null, cpfHash: null });
    else if (d.cpf) {
      if (!cpfValido(d.cpf)) throw new ErroValidacao('CPF inválido.', 'cpf');
      const digitos = soDigitos(d.cpf);
      const hash = impressao(`cpf:${digitos}`);
      if (await tx.colhedor.findFirst({ where: { cpfHash: hash, ...(id ? { NOT: { id } } : {}) } })) throw new ErroValidacao('Já existe um colhedor com esse CPF.', 'cpf');
      Object.assign(pessoais, { cpfCifrado: cifrar(digitos), cpfMascara: mascararCpf(digitos), cpfHash: hash });
    }
    if (d.chavePix === '-') Object.assign(pessoais, { pixCifrado: null, pixMascara: null });
    else if (d.chavePix) Object.assign(pessoais, { pixCifrado: cifrar(d.chavePix), pixMascara: mascararPix(d.chavePix) });
    const dados = { nome: d.nome, apelido: d.apelido, turmaId: d.turmaId, telefone: d.telefone, ...pessoais };
    const c = atual
      ? await tx.colhedor.update({ where: { id: atual.id }, data: { ...dados, alteradoPor: ctx.usuarioId } })
      : await tx.colhedor.create({ data: { ...dados, empresaId: ctx.empresaId, criadoPor: ctx.usuarioId } });
    // A auditoria guarda só as máscaras: o dado aberto nunca vai para o log.
    const visivel = (x: typeof c | null) => x && { nome: x.nome, apelido: x.apelido, turmaId: x.turmaId, telefone: x.telefone, cpf: x.cpfMascara, chavePix: x.pixMascara, ativo: x.ativo };
    await auditar(tx, ctx, { entidade: 'colhedor', entidadeId: c.id, acao: atual ? 'ALTERAR' : 'CRIAR', antes: visivel(atual) ?? undefined, depois: visivel(c) });
    return { id: c.id, nome: c.nome };
  });
}

export async function definirAtivoColhedor(ctx: Contexto, id: string, ativo: boolean) {
  exigir(ctx, 'cadastros.editar');
  if (!ehUuid(id)) throw new ErroNaoEncontrado('Colhedor não encontrado.');
  return comTransacao(ctx, async (tx) => {
    const c = await tx.colhedor.findFirst({ where: { id } });
    if (!c) throw new ErroNaoEncontrado('Colhedor não encontrado.');
    await tx.colhedor.update({ where: { id }, data: { ativo, alteradoPor: ctx.usuarioId } });
    await auditar(tx, ctx, { entidade: 'colhedor', entidadeId: id, acao: ativo ? 'REATIVAR' : 'INATIVAR' });
  });
}

/** Quem pode ver CPF e PIX sem máscara (§3.3). */
export const podeRevelar = (ctx: Pick<Contexto, 'perfil'>) => ctx.perfil === 'FINANCEIRO' || ctx.perfil === 'ADMIN_EMPRESA';

/** Mostra CPF e PIX abertos. Só FINANCEIRO e ADMIN_EMPRESA; toda revelação vai para a auditoria (§3.3). */
export async function revelarDadosColhedor(ctx: Contexto, id: string) {
  if (!podeRevelar(ctx)) throw new ErroPermissao('Só o financeiro e o administrador veem CPF e PIX sem máscara.');
  if (!ehUuid(id)) throw new ErroNaoEncontrado('Colhedor não encontrado.');
  return comTransacao(ctx, async (tx) => {
    const c = await tx.colhedor.findFirst({ where: { id } });
    if (!c) throw new ErroNaoEncontrado('Colhedor não encontrado.');
    await auditar(tx, ctx, { entidade: 'colhedor', entidadeId: id, acao: 'REVELAR', depois: { campos: ['cpf', 'chavePix'] } });
    return { cpf: c.cpfCifrado ? formatarCpfCnpj(decifrar(c.cpfCifrado)) : null, chavePix: c.pixCifrado ? decifrar(c.pixCifrado) : null };
  });
}

// ================================================================ dados do app de campo

/** Tudo que o apontador precisa para trabalhar sem sinal: fazendas liberadas, talhões, turmas e colhedores. */
export async function dadosDoCampo(ctx: Contexto) {
  exigir(ctx, 'apontamento.lancar');
  return comTransacao(ctx, async (tx) => {
    const permitidas = await fazendasPermitidas(tx, ctx);
    const filtro = permitidas ? { id: { in: [...permitidas] } } : {};
    const fazendas = await tx.fazenda.findMany({ where: { ativo: true, ...filtro }, orderBy: { codigo: 'asc' }, select: { id: true, codigo: true, nome: true } });
    const ids = fazendas.map((f) => f.id);
    const [talhoes, turmas, safras, tipos] = await Promise.all([
      tx.talhao.findMany({ where: { ativo: true, fazendaId: { in: ids } }, orderBy: { codigo: 'asc' }, select: { id: true, codigo: true, nome: true, fazendaId: true } }),
      tx.turma.findMany({ where: { ativo: true, fazendaId: { in: ids } }, orderBy: { nome: 'asc' }, include: { colhedores: { where: { ativo: true }, orderBy: { nome: 'asc' }, select: { id: true, nome: true, apelido: true } } } }),
      tx.safra.findMany({ where: { ativa: true }, orderBy: { dataInicio: 'desc' }, select: { id: true, codigo: true, dataInicio: true, dataFim: true } }),
      tx.tipoCafe.findMany({ where: { ativo: true }, orderBy: { codigo: 'asc' }, select: { id: true, codigo: true, nome: true } }),
    ]);
    return {
      fazendas, talhoes, safras: safras.map((s) => ({ id: s.id, codigo: s.codigo, inicio: s.dataInicio.toISOString().slice(0, 10), fim: s.dataFim.toISOString().slice(0, 10) })), tipos,
      turmas: turmas.map((t) => ({ id: t.id, nome: t.nome, fazendaId: t.fazendaId, colhedores: t.colhedores })),
    };
  });
}

export function exigirFazendaDoCampo(permitidas: Set<string> | null, fazendaId: string) {
  exigirFazendas(permitidas, [fazendaId]);
}
