import Decimal from 'decimal.js';
import { z } from 'zod';
import { ErroNaoEncontrado, ErroPermissao, ErroValidacao } from '@/dominio/erros';
import { pode } from '@/dominio/perfis';
import { dentroDaMeta, previsaoPonto, situacaoSecagem, tendencia, type SituacaoSecagem } from '@/dominio/secagem';
import { auditar } from './auditoria';
import { emitirAlerta } from './alertas';
import { ocupacaoDoLocal } from './movimentos';
import { comTransacao, ehUuid, type Contexto, type Tx } from './transacao';
import { dec, exigirFazendas, fazendasPermitidas, mapasFazenda, normalizarDecimal } from './rastreio-base';

/** Painel de secagem (§7): leituras (também offline), ocupação, curva, previsão e alertas. */

const numero = (min: number, max: number, oque: string) =>
  z.union([z.string(), z.number()]).transform((v, c) => {
    const t = normalizarDecimal(v);
    let d: Decimal;
    try {
      d = new Decimal(t);
    } catch {
      c.addIssue({ code: 'custom', message: `${oque} inválida.` });
      return z.NEVER;
    }
    if (d.isNaN() || d.lt(min) || d.gt(max)) {
      c.addIssue({ code: 'custom', message: `${oque} deve ficar entre ${min} e ${max}.` });
      return z.NEVER;
    }
    return d.toDecimalPlaces(2).toString();
  });

const leituraSchema = z.object({
  id: z.string().uuid(),
  movimentoId: z.string().uuid(),
  dataHora: z.coerce.date(),
  umidade: numero(0, 100, 'Umidade'),
  temperaturaMassa: numero(-10, 90, 'Temperatura da massa').optional().nullable(),
  temperaturaAr: numero(-10, 60, 'Temperatura do ar').optional().nullable(),
  observacao: z.string().trim().max(300).optional().nullable(),
});
export type LeituraCampo = z.input<typeof leituraSchema>;
export type ResultadoLeitura = { id: string; situacao: 'gravado' | 'repetido' } | { id: string; situacao: 'erro'; mensagem: string };

/** Quem lança leituras: o apontador no campo ou quem lança movimentos. */
function exigirLeitura(ctx: Contexto) {
  const lista = ctx.permissoes;
  const ok = lista ? lista.includes('apontamento.lancar') || lista.includes('movimento.lancar') : pode(ctx.perfil, 'apontamento.lancar') || pode(ctx.perfil, 'movimento.lancar');
  if (!ok) throw new ErroPermissao();
}

async function configuracao(tx: Tx, empresaId: string) {
  const e = await tx.empresa.findFirst({ where: { id: empresaId }, select: { configuracoes: true } });
  const c = (e?.configuracoes ?? {}) as Record<string, unknown>;
  return { limiteDias: Number(c.secagem_limite_dias ?? 5), limiteHoras: Number(c.secagem_horas_sem_leitura ?? 12) };
}

async function fazendasDoMovimento(tx: Tx, movimentoId: string, fazendaId: string | null) {
  if (fazendaId) return [fazendaId];
  const es = await tx.movimentoEntrada.findMany({ where: { movimentoId, cancelada: false }, select: { lote: { select: { fazendaId: true, talhoes: { select: { talhaoId: true } } } } } });
  const diretas = es.map((e) => e.lote.fazendaId).filter((x): x is string => !!x);
  const talhoes = es.filter((e) => !e.lote.fazendaId).flatMap((e) => e.lote.talhoes.map((t) => t.talhaoId));
  return [...new Set([...diretas, ...(await mapasFazenda(tx, talhoes)).doTalhao.values()])];
}

/** Recebe leituras (do celular, offline ou não). Idempotente pelo UUID (RN-23). Leitura na meta gera PONTO_SECAGEM. */
export async function registrarLeituras(ctx: Contexto, entrada: { dispositivoId?: string | null; leituras: unknown[] }): Promise<ResultadoLeitura[]> {
  exigirLeitura(ctx);
  if (!Array.isArray(entrada.leituras) || entrada.leituras.length > 500) throw new ErroValidacao('Envie até 500 leituras por vez.');
  const dispositivoId = typeof entrada.dispositivoId === 'string' ? entrada.dispositivoId.slice(0, 80) : null;
  const res: ResultadoLeitura[] = [];
  for (const bruto of entrada.leituras) {
    const p = leituraSchema.safeParse(bruto);
    const id = String((bruto as { id?: unknown })?.id ?? '?');
    if (!p.success) {
      res.push({ id, situacao: 'erro', mensagem: p.error.issues[0]?.message ?? 'Leitura inválida.' });
      continue;
    }
    const l = p.data;
    try {
      res.push(
        await comTransacao(ctx, async (tx): Promise<ResultadoLeitura> => {
          if (await tx.leituraSecagem.findFirst({ where: { id: l.id } })) return { id: l.id, situacao: 'repetido' };
          const mov = await tx.movimento.findFirst({ where: { id: l.movimentoId }, include: { etapa: true } });
          if (!mov) throw new ErroNaoEncontrado('Movimento não encontrado.');
          if (!mov.etapa.monitoraSecagem) throw new ErroValidacao(`${mov.etapa.nome} não monitora secagem.`);
          if (mov.status !== 'ABERTO') throw new ErroValidacao('O movimento não está mais em secagem.');
          exigirFazendas(await fazendasPermitidas(tx, ctx), await fazendasDoMovimento(tx, mov.id, mov.fazendaId));
          if (l.dataHora.getTime() > Date.now() + 10 * 60_000) throw new ErroValidacao('Leitura com data futura.');
          await tx.leituraSecagem.create({
            data: { id: l.id, empresaId: ctx.empresaId, movimentoId: mov.id, dataHora: l.dataHora, umidade: l.umidade, temperaturaMassa: l.temperaturaMassa ?? null, temperaturaAr: l.temperaturaAr ?? null, observacao: l.observacao || null, usuarioId: ctx.usuarioId, dispositivoId },
          });
          await auditar(tx, ctx, { entidade: 'leitura_secagem', entidadeId: l.id, acao: 'CRIAR', depois: { movimento: `${mov.etapa.prefixoLote}#${mov.numero}`, umidade: l.umidade, dispositivoId } });
          // A leitura mais recente decide o alerta de ponto.
          const ultima = await tx.leituraSecagem.findFirst({ where: { movimentoId: mov.id, cancelada: false }, orderBy: { dataHora: 'desc' } });
          if (ultima && mov.etapa.umidadeMetaMin && mov.etapa.umidadeMetaMax && dentroDaMeta(dec(ultima.umidade), dec(mov.etapa.umidadeMetaMin), dec(mov.etapa.umidadeMetaMax)))
            await emitirAlerta(tx, ctx.empresaId, {
              tipo: 'PONTO_SECAGEM', chave: `PONTO_SECAGEM:${mov.id}`, entidade: 'movimento', entidadeId: mov.id, severidade: 'INFO',
              mensagem: `${mov.etapa.nome} ${mov.etapa.prefixoLote}#${mov.numero} chegou ao ponto: umidade ${dec(ultima.umidade).toString().replace('.', ',')}% (meta ${dec(mov.etapa.umidadeMetaMin).toString().replace('.', ',')}–${dec(mov.etapa.umidadeMetaMax).toString().replace('.', ',')}%).`,
            });
          return { id: l.id, situacao: 'gravado' };
        }),
      );
    } catch (e) {
      if (e instanceof ErroValidacao || e instanceof ErroNaoEncontrado || e instanceof ErroPermissao || (e as { codigo?: string }).codigo) res.push({ id: l.id, situacao: 'erro', mensagem: (e as Error).message });
      else throw e;
    }
  }
  return res;
}

/** POST /api/movimentos/{id}/leituras (§14), lançada no escritório. */
export async function lancarLeitura(ctx: Contexto, movimentoId: string, d: Omit<LeituraCampo, 'id' | 'movimentoId'> & { id?: string }) {
  const [r] = await registrarLeituras(ctx, { leituras: [{ ...d, id: d.id ?? crypto.randomUUID(), movimentoId }] });
  if (r!.situacao === 'erro') throw new ErroValidacao(r!.mensagem);
  return r;
}

const fmtLeitura = (l: { id: string; dataHora: Date; umidade: { toString(): string }; temperaturaMassa: { toString(): string } | null; temperaturaAr: { toString(): string } | null; observacao: string | null }) => ({
  id: l.id, dataHora: l.dataHora.toISOString(), umidade: l.umidade.toString(), temperaturaMassa: l.temperaturaMassa?.toString() ?? null, temperaturaAr: l.temperaturaAr?.toString() ?? null, observacao: l.observacao,
});

/** Curva de umidade × tempo com a faixa da meta e a previsão de ponto (§7). */
export async function curvaSecagem(ctx: Contexto, movimentoId: string) {
  if (!ehUuid(movimentoId)) throw new ErroNaoEncontrado('Movimento não encontrado.');
  return comTransacao(ctx, async (tx) => {
    const mov = await tx.movimento.findFirst({ where: { id: movimentoId }, include: { etapa: true } });
    if (!mov) throw new ErroNaoEncontrado('Movimento não encontrado.');
    const leituras = await tx.leituraSecagem.findMany({ where: { movimentoId, cancelada: false }, orderBy: { dataHora: 'asc' } });
    const base = leituras.map((l) => ({ dataHora: l.dataHora, umidade: l.umidade.toString() }));
    const prev = mov.etapa.umidadeMetaMax && mov.status === 'ABERTO' ? previsaoPonto(base, mov.etapa.umidadeMetaMax.toString()) : null;
    return {
      movimentoId, monitora: mov.etapa.monitoraSecagem, metaMin: mov.etapa.umidadeMetaMin?.toString() ?? null, metaMax: mov.etapa.umidadeMetaMax?.toString() ?? null,
      leituras: leituras.map(fmtLeitura), previsao: prev ? { horas: prev.horas, em: prev.em.toISOString() } : null,
      ultimaUmidade: leituras.at(-1)?.umidade.toString() ?? null,
    };
  });
}

export interface CartaoSecagem {
  localId: string | null;
  local: string;
  etapa: string;
  capacidade: string | null;
  unidadeCapacidade: string | null;
  ocupacao: string | null; // fração 0..n
  situacao: SituacaoSecagem;
  motivos: string[];
  movimentos: {
    id: string; rotulo: string; volume: string; unidade: string; dias: number; entrada: string;
    ultimaUmidade: string | null; ultimaLeitura: string | null; tendencia: string | null; previsaoHoras: number | null; metaMin: string | null; metaMax: string | null; situacao: SituacaoSecagem; motivos: string[];
  }[];
}

/** Mapa de ocupação (§7): um cartão por local das etapas que monitoram secagem. Também emite SECAGEM_LONGA. */
export async function painelSecagem(ctx: Contexto) {
  return comTransacao(ctx, async (tx) => {
    const cfg = await configuracao(tx, ctx.empresaId);
    const etapas = await tx.etapa.findMany({ where: { monitoraSecagem: true, ativa: true }, orderBy: { ordem: 'asc' } });
    const locais = await tx.local.findMany({ where: { etapaId: { in: etapas.map((e) => e.id) }, ativo: true }, orderBy: { codigo: 'asc' } });
    const movs = await tx.movimento.findMany({ where: { etapaId: { in: etapas.map((e) => e.id) }, status: 'ABERTO', natureza: 'NORMAL' }, include: { etapa: true }, orderBy: { dataEntrada: 'asc' } });
    const leituras = await tx.leituraSecagem.findMany({ where: { movimentoId: { in: movs.map((m) => m.id) }, cancelada: false }, orderBy: { dataHora: 'asc' } });
    const agora = new Date();
    const prioridade: Record<SituacaoSecagem, number> = { ATENCAO: 3, NO_PONTO: 2, SECANDO: 1, LIVRE: 0 };

    const descrever = async (m: (typeof movs)[number]) => {
      const ls = leituras.filter((l) => l.movimentoId === m.id).map((l) => ({ dataHora: l.dataHora, umidade: l.umidade.toString() }));
      const ultima = ls.at(-1) ?? null;
      const dias = Math.floor((agora.getTime() - m.dataEntrada.getTime()) / 86_400_000);
      const s = situacaoSecagem({
        ocupado: true, ultimaUmidade: ultima?.umidade ?? null, metaMin: m.etapa.umidadeMetaMin?.toString() ?? null, metaMax: m.etapa.umidadeMetaMax?.toString() ?? null,
        diasDesdeEntrada: dias, horasSemLeitura: ultima ? (agora.getTime() - ultima.dataHora.getTime()) / 3_600_000 : null, limiteDias: cfg.limiteDias, limiteHorasSemLeitura: cfg.limiteHoras,
      });
      if (dias > cfg.limiteDias)
        await emitirAlerta(tx, ctx.empresaId, { tipo: 'SECAGEM_LONGA', chave: `SECAGEM_LONGA:${m.id}`, entidade: 'movimento', entidadeId: m.id, mensagem: `${m.etapa.nome} ${m.etapa.prefixoLote}#${m.numero} está secando há ${dias} dias (limite ${cfg.limiteDias}).` });
      const prev = m.etapa.umidadeMetaMax ? previsaoPonto(ls, m.etapa.umidadeMetaMax.toString()) : null;
      return {
        id: m.id, rotulo: `${m.etapa.prefixoLote}#${m.numero}`, volume: dec(m.qtdEntrada).toFixed(3), unidade: m.unidade, dias, entrada: m.dataEntrada.toISOString(),
        ultimaUmidade: ultima?.umidade ?? null, ultimaLeitura: ultima ? ultima.dataHora.toISOString() : null, tendencia: tendencia(ls), previsaoHoras: prev?.horas ?? null,
        metaMin: m.etapa.umidadeMetaMin?.toString() ?? null, metaMax: m.etapa.umidadeMetaMax?.toString() ?? null, situacao: s.situacao, motivos: s.motivos,
      };
    };

    const cartoes: CartaoSecagem[] = [];
    for (const l of locais) {
      const etapa = etapas.find((e) => e.id === l.etapaId)!;
      const doLocal = await Promise.all(movs.filter((m) => m.localId === l.id).map(descrever));
      let ocupacao: string | null = null;
      if (l.capacidade && l.unidadeCapacidade === 'MEDIDA') ocupacao = (await ocupacaoDoLocal(tx, l.id)).div(dec(l.capacidade)).toDecimalPlaces(4).toString();
      const pior = doLocal.sort((a, b) => prioridade[b.situacao] - prioridade[a.situacao])[0];
      cartoes.push({
        localId: l.id, local: `${l.codigo} · ${l.nome}`, etapa: etapa.nome, capacidade: l.capacidade?.toString() ?? null, unidadeCapacidade: l.unidadeCapacidade, ocupacao,
        situacao: pior?.situacao ?? 'LIVRE', motivos: pior?.motivos ?? [], movimentos: doLocal,
      });
    }
    const semLocal = await Promise.all(movs.filter((m) => !m.localId).map(descrever));
    for (const m of semLocal)
      cartoes.push({ localId: null, local: 'Sem local', etapa: movs.find((x) => x.id === m.id)!.etapa.nome, capacidade: null, unidadeCapacidade: null, ocupacao: null, situacao: m.situacao, motivos: m.motivos, movimentos: [m] });
    const resumo = { LIVRE: 0, SECANDO: 0, NO_PONTO: 0, ATENCAO: 0 } as Record<SituacaoSecagem, number>;
    for (const c of cartoes) resumo[c.situacao]++;
    return { cartoes, resumo, limites: cfg };
  });
}

/** Movimentos em secagem para o app de campo (lançar leituras sem sinal). */
export async function movimentosEmSecagem(ctx: Contexto) {
  return comTransacao(ctx, async (tx) => {
    const permitidas = await fazendasPermitidas(tx, ctx);
    const movs = await tx.movimento.findMany({ where: { status: 'ABERTO', natureza: 'NORMAL', etapa: { monitoraSecagem: true } }, include: { etapa: true, local: { select: { codigo: true } } }, orderBy: { dataEntrada: 'asc' } });
    const r = [];
    for (const m of movs) {
      const fazendas = await fazendasDoMovimento(tx, m.id, m.fazendaId);
      if (permitidas && fazendas.some((f) => !permitidas.has(f))) continue;
      const ultima = await tx.leituraSecagem.findFirst({ where: { movimentoId: m.id, cancelada: false }, orderBy: { dataHora: 'desc' } });
      r.push({
        id: m.id, rotulo: `${m.etapa.nome} ${m.etapa.prefixoLote}#${m.numero}`, local: m.local?.codigo ?? null, volume: dec(m.qtdEntrada).toFixed(3),
        metaMin: m.etapa.umidadeMetaMin?.toString() ?? null, metaMax: m.etapa.umidadeMetaMax?.toString() ?? null, ultimaUmidade: ultima?.umidade.toString() ?? null,
      });
    }
    return r;
  });
}
