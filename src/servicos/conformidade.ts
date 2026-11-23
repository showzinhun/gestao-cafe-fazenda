import { z } from 'zod';
import type { Geometry } from 'geojson';
import { ErroNaoEncontrado, ErroValidacao } from '@/dominio/erros';
import { diasEntre, faixaVencimento, situacaoCertificado } from '@/dominio/certificacao';
import { DATA_CORTE, pendenciasDoTalhao, situacaoEudr } from '@/dominio/eudr';
import { sha256 } from '@/dominio/pacote';
import { auditar } from './auditoria';
import { emitirAlerta } from './alertas';
import { provedor } from './desmatamento';
import { talhoesEudr } from './eudr-base';
import { dataLocal, normalizarDecimal } from './rastreio-base';
import { comTransacao, ehUuid, exigir, type Contexto, type Tx } from './transacao';

/** Certificações e EUDR (§10): arquivos, certificados das fazendas, checagens de desmatamento e painel. */

const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const comoData = (v: string) => new Date(`${v}T00:00:00Z`);
const dataTexto = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data no formato aaaa-mm-dd.');
export const TAMANHO_MAXIMO_ARQUIVO = 5 * 1024 * 1024;

// ---------------------------------------------------------------- arquivos (evidências, certificados)

export interface ArquivoEnviado {
  nome: string;
  tipo: string;
  conteudo: Buffer;
}

/** Guarda um PDF no banco (até 5 MB). Arquivos não mudam nem são apagados. */
export async function salvarArquivo(tx: Tx, ctx: Contexto, a: ArquivoEnviado) {
  if (!a.conteudo.length) throw new ErroValidacao('Arquivo vazio.', 'arquivo');
  if (a.conteudo.length > TAMANHO_MAXIMO_ARQUIVO) throw new ErroValidacao('O arquivo passa de 5 MB.', 'arquivo');
  if (a.conteudo.subarray(0, 5).toString('latin1') !== '%PDF-') throw new ErroValidacao('Envie o arquivo em PDF.', 'arquivo');
  const nome = a.nome.replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(0, 120) || 'arquivo.pdf';
  return tx.arquivo.create({ data: { empresaId: ctx.empresaId, nome, tipo: 'application/pdf', tamanho: a.conteudo.length, sha256: sha256(a.conteudo), conteudo: new Uint8Array(a.conteudo), criadoPor: ctx.usuarioId } });
}

export async function obterArquivo(ctx: Contexto, id: string) {
  if (!ehUuid(id)) throw new ErroNaoEncontrado('Arquivo não encontrado.');
  return comTransacao(ctx, async (tx) => {
    const a = await tx.arquivo.findFirst({ where: { id } });
    if (!a) throw new ErroNaoEncontrado('Arquivo não encontrado.');
    return a;
  });
}

// ---------------------------------------------------------------- certificados da fazenda (§10)

const marcado = z.preprocess((v) => v === true || v === 'true' || v === 'on' || v === '1', z.boolean());
const certificadoFazendaSchema = z.object({
  certificadoId: z.string().uuid('Escolha o certificado.'),
  /** ID/número do certificado, quando houver (nem todo certificado tem). */
  numero: z.string().trim().max(60).optional().nullable(),
  validadeInicio: dataTexto,
  validadeFim: dataTexto,
  /** Certificação de só parte da fazenda (ex.: "UTZ parcial"). */
  parcial: marcado.optional().default(false),
});
type EntradaCertificado = z.input<typeof certificadoFazendaSchema>;
const alteracaoCertificadoSchema = certificadoFazendaSchema.omit({ certificadoId: true });

const br = (d: Date | string) => (typeof d === 'string' ? d : iso(d)!).split('-').reverse().join('/');

/** Dois certificados do mesmo tipo na mesma fazenda não podem ter validades que se cruzam (renovar = período novo). */
async function exigirSemSobreposicao(tx: Tx, fazenda: { id: string; codigo: string }, cert: { id: string; codigo: string }, inicio: string, fim: string, ignorarId?: string) {
  const outros = await tx.fazendaCertificado.findMany({ where: { fazendaId: fazenda.id, certificadoId: cert.id, status: { not: 'SUSPENSO' }, ...(ignorarId ? { id: { not: ignorarId } } : {}) } });
  const choque = outros.find((o) => iso(o.validadeInicio)! <= fim && inicio <= iso(o.validadeFim)!);
  if (choque)
    throw new ErroValidacao(`A fazenda ${fazenda.codigo} já tem ${cert.codigo} de ${br(choque.validadeInicio)} a ${br(choque.validadeFim)}. Edite esse registro ou suspenda-o antes de cadastrar outro no mesmo período.`, 'validadeInicio');
}

/** Cadastra vários certificados da fazenda de uma vez (tudo ou nada). Cada um com ID opcional, validade, parcial e PDF. */
export async function adicionarCertificadosFazenda(ctx: Contexto, fazendaId: string, itens: { entrada: EntradaCertificado; arquivo?: ArquivoEnviado | null }[]) {
  exigir(ctx, 'cadastros.editar');
  if (!itens.length) throw new ErroValidacao('Marque ao menos um certificado.', 'certificadoId');
  const lista = itens.map((i) => ({ d: certificadoFazendaSchema.parse(i.entrada), arquivo: i.arquivo ?? null }));
  for (const { d } of lista) if (d.validadeFim < d.validadeInicio) throw new ErroValidacao('O fim da validade deve ser depois do início.', 'validadeFim');
  if (new Set(lista.map((l) => l.d.certificadoId)).size !== lista.length) throw new ErroValidacao('O mesmo certificado foi marcado duas vezes.', 'certificadoId');
  if (!ehUuid(fazendaId)) throw new ErroNaoEncontrado('Fazenda não encontrada.');
  return comTransacao(ctx, async (tx) => {
    const fazenda = await tx.fazenda.findFirst({ where: { id: fazendaId } });
    if (!fazenda) throw new ErroNaoEncontrado('Fazenda não encontrada.');
    const criados = [];
    for (const { d, arquivo } of lista) {
      const cert = await tx.certificado.findFirst({ where: { id: d.certificadoId, ativo: true } });
      if (!cert) throw new ErroNaoEncontrado('Certificado não encontrado.');
      await exigirSemSobreposicao(tx, fazenda, cert, d.validadeInicio, d.validadeFim);
      const arq = arquivo ? await salvarArquivo(tx, ctx, arquivo) : null;
      const fc = await tx.fazendaCertificado.create({
        data: {
          empresaId: ctx.empresaId, fazendaId, certificadoId: cert.id, numero: d.numero || null, validadeInicio: comoData(d.validadeInicio), validadeFim: comoData(d.validadeFim),
          parcial: d.parcial, arquivoId: arq?.id ?? null, status: 'VALIDO', criadoPor: ctx.usuarioId,
        },
      });
      await auditar(tx, ctx, { entidade: 'fazenda_certificado', entidadeId: fc.id, acao: 'CRIAR', depois: { fazenda: fazenda.codigo, certificado: cert.codigo, ...d, arquivo: arq?.nome ?? null } });
      criados.push(fc);
    }
    await verificarCertificados(tx, ctx.empresaId);
    return criados;
  });
}

export async function adicionarCertificadoFazenda(ctx: Contexto, fazendaId: string, entrada: EntradaCertificado, arquivo?: ArquivoEnviado | null) {
  return (await adicionarCertificadosFazenda(ctx, fazendaId, [{ entrada, arquivo }]))[0]!;
}

/** Corrige o ID, a validade e o "parcial" de um certificado já cadastrado; um PDF novo substitui o anterior (o antigo fica guardado). */
export async function alterarCertificadoFazenda(ctx: Contexto, id: string, entrada: z.input<typeof alteracaoCertificadoSchema>, arquivo?: ArquivoEnviado | null) {
  exigir(ctx, 'cadastros.editar');
  if (!ehUuid(id)) throw new ErroNaoEncontrado('Certificado não encontrado.');
  const d = alteracaoCertificadoSchema.parse(entrada);
  if (d.validadeFim < d.validadeInicio) throw new ErroValidacao('O fim da validade deve ser depois do início.', 'validadeFim');
  return comTransacao(ctx, async (tx) => {
    const fc = await tx.fazendaCertificado.findFirst({ where: { id }, include: { fazenda: { select: { id: true, codigo: true } }, certificado: { select: { id: true, codigo: true } } } });
    if (!fc) throw new ErroNaoEncontrado('Certificado não encontrado.');
    if (fc.status !== 'SUSPENSO') await exigirSemSobreposicao(tx, fc.fazenda, fc.certificado, d.validadeInicio, d.validadeFim, id);
    const arq = arquivo ? await salvarArquivo(tx, ctx, arquivo) : null;
    const r = await tx.fazendaCertificado.update({
      where: { id },
      data: { numero: d.numero || null, validadeInicio: comoData(d.validadeInicio), validadeFim: comoData(d.validadeFim), parcial: d.parcial, ...(arq ? { arquivoId: arq.id } : {}), alteradoPor: ctx.usuarioId },
    });
    await auditar(tx, ctx, {
      entidade: 'fazenda_certificado', entidadeId: id, acao: 'ALTERAR',
      antes: { numero: fc.numero, validadeInicio: iso(fc.validadeInicio), validadeFim: iso(fc.validadeFim), parcial: fc.parcial },
      depois: { ...d, numero: d.numero || null, ...(arq ? { arquivo: arq.nome } : {}) },
    });
    await verificarCertificados(tx, ctx.empresaId);
    return r;
  });
}

/** Suspender (com motivo) ou reativar. Certificados não são apagados; vencido é derivado da data. */
export async function alterarStatusCertificadoFazenda(ctx: Contexto, id: string, status: 'VALIDO' | 'SUSPENSO', motivo?: string | null) {
  exigir(ctx, 'cadastros.editar');
  if (!ehUuid(id)) throw new ErroNaoEncontrado('Certificado não encontrado.');
  const m = (motivo ?? '').trim();
  if (status === 'SUSPENSO' && m.length < 5) throw new ErroValidacao('Informe o motivo da suspensão.', 'motivo');
  return comTransacao(ctx, async (tx) => {
    const fc = await tx.fazendaCertificado.findFirst({ where: { id } });
    if (!fc) throw new ErroNaoEncontrado('Certificado não encontrado.');
    const r = await tx.fazendaCertificado.update({ where: { id }, data: { status, motivoStatus: m || null, alteradoPor: ctx.usuarioId } });
    await auditar(tx, ctx, { entidade: 'fazenda_certificado', entidadeId: id, acao: 'ALTERAR', antes: { status: fc.status }, depois: { status, motivo: m || null } });
    return r;
  });
}

export async function listarCertificadosFazenda(ctx: Contexto, fazendaId?: string) {
  return comTransacao(ctx, async (tx) => {
    const hoje = dataLocal(new Date());
    const linhas = await tx.fazendaCertificado.findMany({
      where: fazendaId ? { fazendaId } : {},
      include: { certificado: { select: { codigo: true, nome: true } }, fazenda: { select: { id: true, codigo: true, nome: true } }, arquivo: { select: { id: true, nome: true } } },
      orderBy: [{ validadeFim: 'asc' }],
    });
    return linhas.map((c) => {
      const base = { status: c.status, validadeInicio: iso(c.validadeInicio)!, validadeFim: iso(c.validadeFim)! };
      return {
        id: c.id, fazenda: c.fazenda, certificado: c.certificado.codigo, nomeCertificado: c.certificado.nome, numero: c.numero, parcial: c.parcial, ...base,
        situacao: situacaoCertificado(base, hoje), diasRestantes: diasEntre(hoje, base.validadeFim), motivoStatus: c.motivoStatus, arquivo: c.arquivo,
      };
    });
  });
}

/** Alertas CERTIFICADO_VENCENDO a 60, 30 e 7 dias (§10). Um alerta por certificado e faixa. */
export async function verificarCertificados(tx: Tx, empresaId: string, hoje = dataLocal(new Date())) {
  const linhas = await tx.fazendaCertificado.findMany({ where: { status: 'VALIDO' }, include: { certificado: { select: { codigo: true } }, fazenda: { select: { codigo: true } } } });
  for (const c of linhas) {
    const fim = iso(c.validadeFim)!;
    const faixa = faixaVencimento(diasEntre(hoje, fim));
    if (!faixa) continue;
    await emitirAlerta(tx, empresaId, {
      tipo: 'CERTIFICADO_VENCENDO', chave: `CERTIFICADO_VENCENDO:${c.id}:${faixa}`, entidade: 'fazenda_certificado', entidadeId: c.id,
      severidade: faixa === 7 ? 'CRITICO' : 'AVISO',
      mensagem: `${c.certificado.codigo} da fazenda ${c.fazenda.codigo} vence em ${fim.split('-').reverse().join('/')} (${faixa === 7 ? 'até 7' : `até ${faixa}`} dias).`,
    });
  }
}

// ---------------------------------------------------------------- checagem de desmatamento (§10)

const manualSchema = z.object({
  resultado: z.enum(['SEM_ALERTA', 'ALERTA', 'INCONCLUSIVO', 'ERRO']),
  dataChecagem: dataTexto,
  provedor: z.string().trim().min(2).max(60).default('Importação manual'),
  areaAlertaHa: z.union([z.string(), z.number()]).optional().nullable().transform((v) => (v === null || v === undefined || v === '' ? null : normalizarDecimal(v))),
  observacao: z.string().trim().max(500).optional().nullable(),
});

async function talhaoParaChecar(tx: Tx, talhaoId: string) {
  if (!ehUuid(talhaoId)) throw new ErroNaoEncontrado('Talhão não encontrado.');
  const t = await tx.talhao.findFirst({ where: { id: talhaoId }, include: { fazenda: { select: { codigo: true } } } });
  if (!t) throw new ErroNaoEncontrado('Talhão não encontrado.');
  if (!t.geometria || !t.geometriaHash) throw new ErroValidacao(`O talhão ${t.fazenda.codigo}/${t.codigo} não tem geometria: desenhe ou importe antes de checar.`, 'geometria');
  return t;
}

async function depoisDaChecagem(tx: Tx, ctx: Contexto, t: { id: string; codigo: string; fazenda: { codigo: string } }, c: { id: string; resultado: string; provedor: string }) {
  await auditar(tx, ctx, { entidade: 'checagem_desmatamento', entidadeId: c.id, acao: 'CRIAR', depois: { talhao: `${t.fazenda.codigo}/${t.codigo}`, resultado: c.resultado, provedor: c.provedor } });
  if (c.resultado !== 'SEM_ALERTA') {
    await emitirAlerta(tx, ctx.empresaId, {
      tipo: 'EUDR_PENDENTE', chave: `EUDR_PENDENTE:checagem:${c.id}`, entidade: 'talhao', entidadeId: t.id, severidade: c.resultado === 'ALERTA' ? 'CRITICO' : 'AVISO',
      mensagem: `Talhão ${t.fazenda.codigo}/${t.codigo}: checagem de desmatamento ${c.resultado === 'ALERTA' ? 'com ALERTA' : c.resultado.toLowerCase()}.`,
    });
  }
}

/** Checagem por um provedor (MVP: MOCK). Vale para a versão atual da geometria. */
export async function checarTalhao(ctx: Contexto, talhaoId: string, codigoProvedor = 'MOCK') {
  exigir(ctx, 'cadastros.editar');
  const p = provedor(codigoProvedor);
  if (!p) throw new ErroValidacao('Provedor de checagem desconhecido.', 'provedor');
  return comTransacao(ctx, async (tx) => {
    const t = await talhaoParaChecar(tx, talhaoId);
    const r = await p.checar({ id: t.id, codigo: t.codigo, geometria: t.geometria as unknown as Geometry, areaHa: (t.areaHaInformada ?? t.areaHaCalculada)?.toString() ?? null }, DATA_CORTE);
    const c = await tx.checagemDesmatamento.create({
      data: {
        empresaId: ctx.empresaId, talhaoId: t.id, provedor: p.codigo, dataChecagem: comoData(dataLocal(new Date())), dataCorte: comoData(DATA_CORTE), resultado: r.resultado,
        areaAlertaHa: r.areaAlertaHa ?? null, evidencia: r.evidencia as object, versaoGeometriaHash: t.geometriaHash!, criadoPor: ctx.usuarioId,
      },
    });
    await depoisDaChecagem(tx, ctx, t, c);
    return c;
  });
}

/** Importação manual do resultado (laudo de outro provedor), com evidência em PDF. */
export async function importarChecagem(ctx: Contexto, talhaoId: string, entrada: z.input<typeof manualSchema>, arquivo?: ArquivoEnviado | null) {
  exigir(ctx, 'cadastros.editar');
  const d = manualSchema.parse(entrada);
  if (d.dataChecagem > dataLocal(new Date())) throw new ErroValidacao('A data da checagem não pode ser futura.', 'dataChecagem');
  if (d.resultado === 'ALERTA' && !d.areaAlertaHa && !(d.observacao ?? '').trim()) throw new ErroValidacao('Para ALERTA, informe a área do alerta ou uma observação.', 'areaAlertaHa');
  return comTransacao(ctx, async (tx) => {
    const t = await talhaoParaChecar(tx, talhaoId);
    const arq = arquivo ? await salvarArquivo(tx, ctx, arquivo) : null;
    const c = await tx.checagemDesmatamento.create({
      data: {
        empresaId: ctx.empresaId, talhaoId: t.id, provedor: d.provedor, dataChecagem: comoData(d.dataChecagem), dataCorte: comoData(DATA_CORTE), resultado: d.resultado,
        areaAlertaHa: d.areaAlertaHa, evidencia: { importacao: 'manual', arquivo: arq?.nome ?? null, sha256: arq?.sha256 ?? null }, arquivoId: arq?.id ?? null,
        versaoGeometriaHash: t.geometriaHash!, observacao: d.observacao || null, criadoPor: ctx.usuarioId,
      },
    });
    await depoisDaChecagem(tx, ctx, t, c);
    return c;
  });
}

export async function listarChecagens(ctx: Contexto, talhaoId: string) {
  if (!ehUuid(talhaoId)) throw new ErroNaoEncontrado('Talhão não encontrado.');
  return comTransacao(ctx, async (tx) => {
    const t = await tx.talhao.findFirst({ where: { id: talhaoId } });
    if (!t) throw new ErroNaoEncontrado('Talhão não encontrado.');
    const cs = await tx.checagemDesmatamento.findMany({ where: { talhaoId }, include: { arquivo: { select: { id: true, nome: true } } }, orderBy: [{ dataChecagem: 'desc' }, { criadoEm: 'desc' }] });
    return cs.map((c) => ({
      id: c.id, provedor: c.provedor, dataChecagem: iso(c.dataChecagem), dataCorte: iso(c.dataCorte), resultado: c.resultado, areaAlertaHa: c.areaAlertaHa?.toString() ?? null,
      observacao: c.observacao, arquivo: c.arquivo, vigente: c.versaoGeometriaHash === t.geometriaHash,
    }));
  });
}

// ---------------------------------------------------------------- painel de conformidade (§12, item 13)

export async function painelConformidade(ctx: Contexto) {
  return comTransacao(ctx, async (tx) => {
    const hoje = dataLocal(new Date());
    await verificarCertificados(tx, ctx.empresaId, hoje);
    const talhoes = await tx.talhao.findMany({ where: { ativo: true, fazenda: { ativo: true } }, include: { fazenda: { select: { codigo: true, nome: true } } }, orderBy: [{ fazenda: { codigo: 'asc' } }, { codigo: 'asc' }] });
    const eudr = await talhoesEudr(tx, talhoes.map((t) => t.id));
    const linhasTalhoes = talhoes.map((t) => {
      const e = eudr.get(t.id)!;
      return {
        id: t.id, fazenda: t.fazenda.codigo, fazendaId: t.fazendaId, codigo: t.codigo, nome: t.nome, geometriaTipo: t.geometriaTipo,
        areaHa: (t.areaHaInformada ?? t.areaHaCalculada)?.toString() ?? null, ultimaChecagem: e.ultimaChecagem,
        situacao: situacaoEudr(e), pendencias: pendenciasDoTalhao(e).map((p) => p.mensagem),
      };
    });
    const certificados = (await tx.fazendaCertificado.findMany({ include: { certificado: { select: { codigo: true } }, fazenda: { select: { id: true, codigo: true } } }, orderBy: { validadeFim: 'asc' } })).map((c) => {
      const base = { status: c.status, validadeInicio: iso(c.validadeInicio)!, validadeFim: iso(c.validadeFim)! };
      return { id: c.id, fazenda: c.fazenda, certificado: c.certificado.codigo, numero: c.numero, parcial: c.parcial, ...base, situacao: situacaoCertificado(base, hoje), diasRestantes: diasEntre(hoje, base.validadeFim) };
    });
    // Dossiês pendentes: embarques carregados ainda abertos com pendências no último dossiê, ou finalizados sem DDS.
    const embarques = await tx.embarqueDetalhe.findMany({
      where: { movimento: { status: { in: ['ABERTO', 'FINALIZADO'] } } },
      include: { contrato: { select: { codigo: true, exigeEudr: true } }, movimento: { select: { id: true, numero: true, status: true, etapa: { select: { prefixoLote: true } }, dossies: { orderBy: { versao: 'desc' }, take: 1, select: { versao: true, pendencias: true, geradoEm: true } } } } },
    });
    const dossies = embarques
      .map((e) => {
        const d = e.movimento.dossies[0];
        const motivo = e.movimento.status === 'FINALIZADO'
          ? (e.contrato.exigeEudr && !e.numeroDds ? 'Finalizado sem número da DDS' : null)
          : !e.carregadoEm ? null : !d ? 'Dossiê ainda não gerado' : d.pendencias > 0 ? `${d.pendencias} pendência(s)` : null;
        return motivo ? { id: e.movimentoId, rotulo: `${e.movimento.etapa.prefixoLote}#${e.movimento.numero}`, contrato: e.contrato.codigo, exigeEudr: e.contrato.exigeEudr, motivo } : null;
      })
      .filter((x): x is NonNullable<typeof x> => !!x);
    const contagem = (s: string) => linhasTalhoes.filter((t) => t.situacao === s).length;
    return {
      resumo: {
        certificadosVencendo: certificados.filter((c) => c.situacao === 'VALIDO' && c.diasRestantes <= 60).length,
        certificadosVencidos: certificados.filter((c) => c.situacao === 'VENCIDO').length,
        talhoesAptos: contagem('APTO'), talhoesPendentes: contagem('PENDENTE'), talhoesBloqueados: contagem('BLOQUEADO'), dossiesPendentes: dossies.length,
      },
      certificados, talhoes: linhasTalhoes, dossies,
    };
  });
}

