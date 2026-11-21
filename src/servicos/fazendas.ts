import { z } from 'zod';
import { comTransacao, ehUuid, type Contexto } from './transacao';
import { auditar } from './auditoria';
import { ErroNaoEncontrado, ErroPermissao, ErroValidacao } from '@/dominio/erros';
import { codigoFazendaValido, normalizarCodigoFazenda, UFS } from '@/dominio/fazenda';
import { pode } from '@/dominio/perfis';

/** Fazenda mínima da Fase 0 (o cadastro completo do §4.2 vem na Fase 1). */
export const novaFazendaSchema = z.object({
  codigo: z.string().min(1),
  nome: z.string().trim().min(2).max(120),
  municipio: z.string().trim().max(120).optional(),
  uf: z.enum(UFS).optional(),
});
export type NovaFazenda = z.infer<typeof novaFazendaSchema>;

const campos = { id: true, codigo: true, nome: true, municipio: true, uf: true, ativo: true } as const;

export async function listarFazendas(ctx: Contexto) {
  return comTransacao(ctx, (tx) => tx.fazenda.findMany({ select: campos, orderBy: { codigo: 'asc' } }));
}

export async function obterFazenda(ctx: Contexto, id: string) {
  if (!ehUuid(id)) throw new ErroNaoEncontrado();
  const f = await comTransacao(ctx, (tx) => tx.fazenda.findFirst({ where: { id }, select: campos }));
  if (!f) throw new ErroNaoEncontrado('Fazenda não encontrada.');
  return f;
}

export async function criarFazenda(ctx: Contexto, entrada: NovaFazenda) {
  if (!pode(ctx.perfil, 'cadastros.editar')) throw new ErroPermissao();
  const dados = novaFazendaSchema.parse(entrada);
  const codigo = normalizarCodigoFazenda(dados.codigo);
  if (!codigoFazendaValido(codigo)) throw new ErroValidacao('O código da fazenda deve ter de 2 a 4 letras.', 'codigo');
  return comTransacao(ctx, async (tx) => {
    const existe = await tx.fazenda.findFirst({ where: { codigo }, select: { id: true } });
    if (existe) throw new ErroValidacao(`Já existe uma fazenda com o código ${codigo}.`, 'codigo');
    const f = await tx.fazenda.create({
      data: { empresaId: ctx.empresaId, codigo, nome: dados.nome, municipio: dados.municipio ?? null, uf: dados.uf ?? null, criadoPor: ctx.usuarioId, alteradoPor: ctx.usuarioId },
      select: campos,
    });
    await auditar(tx, ctx, { entidade: 'fazenda', entidadeId: f.id, acao: 'CRIAR', depois: f });
    return f;
  });
}
