'use server';
import { revalidatePath } from 'next/cache';
import { contextoDaSessao } from '@/lib/contexto';
import { falha, type ResultadoAcao } from '@/lib/resultado-acao';
import { ErroNaoEncontrado } from '@/dominio/erros';
import { assinarContrato, cancelarContrato, cancelarFixacao, criarContrato, registrarAmostra, registrarFixacao, reservarParaContrato, retornoAmostra } from '@/servicos/contratos';
import { adicionarNota, alterarLogistica, cancelarNota, criarEmbarque, desfazerProgramacao, finalizarEmbarque, programarEmbarque, reabrirEmbarque, registrarCarregamento } from '@/servicos/embarques';
import { cancelarReserva } from '@/servicos/reservas';
import { gerarDossie, reemitirPacote } from '@/servicos/dossie';

/** Ações do comercial (Fase 6): finas, só chamam os serviços (regra 2). */

async function ctx() {
  const c = await contextoDaSessao();
  if (!c) throw new ErroNaoEncontrado('Sessão expirada. Entre de novo.');
  return c;
}
async function executar<T>(mensagem: string, fn: () => Promise<T>): Promise<ResultadoAcao<T>> {
  try {
    const dados = await fn();
    for (const p of ['/contratos', '/embarques', '/estoque']) revalidatePath(p, 'layout');
    return { ok: true, mensagem, dados };
  } catch (e) {
    return falha(e);
  }
}
type Arg<F> = F extends (c: never, ...a: infer A) => unknown ? A : never;

export const acaoCriarContrato = async (d: Arg<typeof criarContrato>[0]) => executar('Contrato criado como rascunho.', async () => (await criarContrato(await ctx(), d)).id);
export const acaoAssinarContrato = async (id: string) => executar('Contrato assinado.', async () => void (await assinarContrato(await ctx(), id)));
export const acaoCancelarContrato = async (id: string, motivo: string) => executar('Contrato cancelado.', async () => void (await cancelarContrato(await ctx(), id, motivo)));
export async function acaoReservarContrato(id: string, itens: Arg<typeof reservarParaContrato>[1]) {
  try {
    const r = await reservarParaContrato(await ctx(), id, itens);
    for (const p of ['/contratos', '/estoque']) revalidatePath(p, 'layout');
    return { ok: true as const, mensagem: `${r.reservas.length} reserva(s) criada(s).`, avisos: r.avisos };
  } catch (e) {
    return falha(e);
  }
}
export const acaoCancelarReservaContrato = async (id: string, motivo: string) => executar('Reserva cancelada: os kg voltaram a ficar livres.', async () => void (await cancelarReserva(await ctx(), id, motivo)));
export const acaoFixar = async (id: string, d: Arg<typeof registrarFixacao>[1]) => executar('Fixação registrada.', async () => void (await registrarFixacao(await ctx(), id, d)));
export const acaoCancelarFixacao = async (id: string) => executar('Fixação cancelada.', async () => cancelarFixacao(await ctx(), id));
export const acaoAmostra = async (d: Arg<typeof registrarAmostra>[0]) => executar('Amostra registrada.', async () => void (await registrarAmostra(await ctx(), d)));
export const acaoRetornoAmostra = async (id: string, d: Arg<typeof retornoAmostra>[1]) => executar('Retorno registrado.', async () => void (await retornoAmostra(await ctx(), id, d)));

export const acaoCriarEmbarque = async (contratoId: string) => executar('Embarque criado.', async () => (await criarEmbarque(await ctx(), { contratoId })).id);
export const acaoProgramar = async (id: string, lotes?: Arg<typeof programarEmbarque>[1]) => executar('Embarque programado: os kg estão reservados para ele.', async () => programarEmbarque(await ctx(), id, lotes));
export const acaoDesprogramar = async (id: string, motivo: string) => executar('Programação desfeita: os kg voltaram a ficar livres.', async () => desfazerProgramacao(await ctx(), id, motivo));
export const acaoCarregar = async (id: string, d: Arg<typeof registrarCarregamento>[1]) => executar('Carregamento registrado.', async () => void (await registrarCarregamento(await ctx(), id, d)));
export const acaoNota = async (id: string, d: Arg<typeof adicionarNota>[1]) => executar('Nota fiscal registrada.', async () => void (await adicionarNota(await ctx(), id, d)));
export const acaoCancelarNota = async (id: string, notaId: string) => executar('Nota cancelada.', async () => cancelarNota(await ctx(), id, notaId));
export const acaoLogistica = async (id: string, d: Arg<typeof alterarLogistica>[1]) => executar('Dados de logística salvos.', async () => alterarLogistica(await ctx(), id, d));
export const acaoFinalizarEmbarque = async (id: string) => executar('Embarque finalizado.', async () => (await finalizarEmbarque(await ctx(), id)).statusContrato);
export const acaoReabrirEmbarque = async (id: string, motivo: string) => executar('Embarque reaberto.', async () => void (await reabrirEmbarque(await ctx(), id, motivo)));
export const acaoGerarDossie = async (id: string) => executar('Dossiê gerado.', async () => (await gerarDossie(await ctx(), id)).pendencias.length);
export const acaoReemitirPacote = async (id: string, motivo: string) => executar('Pacote reemitido em nova versão.', async () => (await reemitirPacote(await ctx(), id, motivo)).versao);
