import Decimal from 'decimal.js';
import type { Geometry } from 'geojson';
import type { Prisma } from '@prisma/client';
import { ErroNaoEncontrado, ErroValidacao } from '@/dominio/erros';
import { esquemasDe, rotuloEsquemas } from '@/dominio/certificacao';
import { exigirDossieSemPendencias, pendenciasDoTalhao, type Pendencia } from '@/dominio/eudr';
import { certificadoValidoEm } from '@/dominio/lote';
import {
  codigoEmbarque, composicaoDoEmbarque, fecharDossie, geojsonTalhoes, isoBrasilia, kgJson, montarPacote, nomePacote, type ConteudoDossie, type TalhaoDossie,
} from '@/dominio/pacote';
import { auditar } from './auditoria';
import { talhoesEudr } from './eudr-base';
import { dataLocal, dec, exigirMotivo, travarMovimento } from './rastreio-base';
import { comTransacao, ehUuid, exigir, type Contexto, type Tx } from './transacao';

/** Dossiê EUDR/certificações do embarque (§10) e pacote para a exportadora (§17, RN-30). */

const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

async function dadosDoEmbarque(tx: Tx, movimentoId: string) {
  if (!ehUuid(movimentoId)) throw new ErroNaoEncontrado('Embarque não encontrado.');
  const det = await tx.embarqueDetalhe.findFirst({
    where: { movimentoId },
    include: {
      motorista: { select: { nome: true } },
      contrato: { include: { cliente: { select: { nome: true, cpfCnpj: true } }, certificados: { include: { certificado: { select: { codigo: true } } } } } },
      movimento: {
        include: {
          etapa: { select: { prefixoLote: true } }, safra: { select: { codigo: true } },
          entradas: {
            where: { cancelada: false },
            include: { lote: { include: { safra: { select: { codigo: true } }, peneira: { select: { codigo: true } }, tipoCafe: { select: { codigo: true } }, certificados: { where: { removidoEm: null }, include: { certificado: { select: { codigo: true } } } } } } },
          },
          notas: { where: { cancelada: false }, orderBy: { dataEmissao: 'asc' } },
        },
      },
    },
  });
  if (!det) throw new ErroNaoEncontrado('Embarque não encontrado.');
  return det;
}
type Det = Awaited<ReturnType<typeof dadosDoEmbarque>>;

/** Lotes do embarque somados por lote (o mesmo lote pode entrar por mais de uma reserva). */
function lotesDoEmbarque(det: Det) {
  const m = new Map<string, { lote: Det['movimento']['entradas'][number]['lote']; kg: Decimal }>();
  for (const e of det.movimento.entradas) {
    const atual = m.get(e.loteId);
    m.set(e.loteId, { lote: e.lote, kg: (atual?.kg ?? new Decimal(0)).plus(dec(e.quantidade)) });
  }
  return [...m.values()];
}

/** Cadeia de movimentos resumida: dos lotes do embarque até a colheita. */
async function cadeia(tx: Tx, loteIds: string[]) {
  const vistos = new Set<string>();
  let fila = [...loteIds];
  const movimentos = new Map<string, { movimento: string; etapa: string; data: string; status: string }>();
  while (fila.length && movimentos.size < 300) {
    const lotes = await tx.lote.findMany({ where: { id: { in: fila.filter((x) => !vistos.has(x)) } }, select: { id: true, movimentoId: true } });
    lotes.forEach((l) => vistos.add(l.id));
    const ids = [...new Set(lotes.map((l) => l.movimentoId))].filter((x) => !movimentos.has(x));
    if (!ids.length) break;
    const movs = await tx.movimento.findMany({ where: { id: { in: ids } }, include: { etapa: { select: { nome: true, prefixoLote: true } }, entradas: { where: { cancelada: false }, select: { loteId: true } } } });
    for (const mv of movs) movimentos.set(mv.id, { movimento: `${mv.etapa.prefixoLote}#${mv.numero}`, etapa: mv.etapa.nome, data: dataLocal(mv.dataEntrada), status: mv.status });
    fila = movs.flatMap((mv) => mv.entradas.map((e) => e.loteId));
  }
  return [...movimentos.values()].sort((a, b) => a.data.localeCompare(b.data) || a.movimento.localeCompare(b.movimento));
}

/** Monta o conteúdo do dossiê a partir do estado atual do embarque (com hash). */
export async function montarDossie(tx: Tx, movimentoId: string) {
  const det = await dadosDoEmbarque(tx, movimentoId);
  const lotes = lotesDoEmbarque(det);
  if (!lotes.length) throw new ErroValidacao('O dossiê é gerado depois do carregamento (os lotes entram no embarque).');
  const data = iso(det.dataEmbarque) ?? dataLocal(new Date());

  const lt = await tx.loteTalhao.findMany({ where: { loteId: { in: lotes.map((l) => l.lote.id) } } });
  const partes = composicaoDoEmbarque(lotes.map((l) => ({ kg: l.kg, talhoes: lt.filter((x) => x.loteId === l.lote.id).map((x) => ({ talhaoId: x.talhaoId, percentual: x.percentual.toString() })) })));
  const talhoes = await tx.talhao.findMany({ where: { id: { in: partes.map((p) => p.talhaoId) } }, include: { fazenda: { include: { produtor: { select: { nome: true, cpfCnpj: true } } } } } });
  const eudr = await talhoesEudr(tx, talhoes.map((t) => t.id));
  const ultimas = await tx.checagemDesmatamento.findMany({ where: { talhaoId: { in: talhoes.map((t) => t.id) } }, orderBy: [{ dataChecagem: 'desc' }, { criadoEm: 'desc' }] });

  const pendencias: Pendencia[] = [];
  const linhas: TalhaoDossie[] = partes.map((p) => {
    const t = talhoes.find((x) => x.id === p.talhaoId)!;
    const e = eudr.get(t.id)!;
    const c = ultimas.find((x) => x.talhaoId === t.id && x.versaoGeometriaHash === t.geometriaHash);
    pendencias.push(...pendenciasDoTalhao(e));
    return {
      id: t.id, fazenda: t.fazenda.codigo, fazenda_nome: t.fazenda.nome, produtor: t.fazenda.produtor?.nome ?? null, produtor_doc: t.fazenda.produtor?.cpfCnpj ?? null,
      talhao: t.codigo, nome: t.nome, area_ha: t.areaHaInformada ? Number(t.areaHaInformada) : t.areaHaCalculada ? Number(t.areaHaCalculada) : null,
      geometria_tipo: t.geometriaTipo, geometria: (t.geometria as unknown as Geometry | null) ?? null, kg: kgJson(p.kg), percentual: Number(p.percentual),
      checagem: c ? { resultado: c.resultado, data: iso(c.dataChecagem)!, provedor: c.provedor } : null,
    };
  });

  // Certificados vendidos precisam estar válidos, na data do embarque, em todas as fazendas da composição.
  const fazendaIds = [...new Set(talhoes.map((t) => t.fazendaId))];
  const fcs = await tx.fazendaCertificado.findMany({ where: { fazendaId: { in: fazendaIds } }, include: { certificado: { select: { codigo: true } }, fazenda: { select: { codigo: true } } } });
  const validoEm = (f: (typeof fcs)[number]) => certificadoValidoEm({ fazendaId: f.fazendaId, certificadoId: f.certificadoId, validadeInicio: iso(f.validadeInicio)!, validadeFim: iso(f.validadeFim)!, status: f.status, parcial: f.parcial }, data);
  const nomesCert = new Map((await tx.certificado.findMany({ where: { id: { in: det.certificadosVendidos } } })).map((c) => [c.id, c.codigo]));
  const vendidos = esquemasDe(det.certificadosVendidos.map((id) => nomesCert.get(id) ?? ''));
  for (const fid of fazendaIds) {
    const daFazenda = fcs.filter((f) => f.fazendaId === fid);
    const validos = esquemasDe(daFazenda.filter(validoEm).map((f) => f.certificado.codigo));
    const codigo = talhoes.find((t) => t.fazendaId === fid)!.fazenda.codigo;
    for (const esq of vendidos) {
      if (!validos.has(esq)) pendencias.push({ tipo: 'CERTIFICADO_INVALIDO', referencia: codigo, mensagem: `A fazenda ${codigo} não tem ${esq} válido em ${data.split('-').reverse().join('/')}.` });
    }
  }

  const conteudo: ConteudoDossie = {
    versao_formato: 1,
    gerado_em: isoBrasilia(new Date()),
    embarque: {
      codigo: codigoDoEmbarque(det, talhoes.map((t) => t.fazenda.codigo)), contrato: det.contrato.codigo, cliente: det.contrato.cliente.nome, data,
      numero_dds: det.numeroDds, exige_eudr: det.contrato.exigeEudr, certificados_vendidos: [...vendidos].sort(),
    },
    total_kg: kgJson(lotes.reduce((s, l) => s.plus(l.kg), new Decimal(0))),
    talhoes: linhas,
    lotes: lotes.map((l) => ({ codigo: l.lote.codigo, kg: kgJson(l.kg), certificados: l.lote.certificados.map((c) => c.certificado.codigo).sort() })),
    certificados: fcs.map((f) => ({ fazenda: f.fazenda.codigo, certificado: f.certificado.codigo, numero: f.numero, validade_fim: iso(f.validadeFim)!, valido: validoEm(f), parcial: f.parcial }))
      .sort((a, b) => a.fazenda.localeCompare(b.fazenda) || a.certificado.localeCompare(b.certificado)),
    cadeia: await cadeia(tx, lotes.map((l) => l.lote.id)),
    pendencias,
  };
  return { conteudo: fecharDossie(conteudo), det, lotes, lt, talhoes, fcs, validoEm, vendidos };
}

function codigoDoEmbarque(det: Det, fazendas: string[]) {
  const unicas = [...new Set(fazendas)];
  return codigoEmbarque(det.movimento.etapa.prefixoLote, unicas.length === 1 ? unicas[0]! : null, det.movimento.safra.codigo, det.movimento.numero);
}

async function gravarDossie(tx: Tx, ctx: Contexto, movimentoId: string, conteudo: ConteudoDossie & { hash_sha256: string }, congelado: boolean) {
  const ultima = await tx.dossie.findFirst({ where: { movimentoId }, orderBy: { versao: 'desc' } });
  return tx.dossie.create({
    data: {
      empresaId: ctx.empresaId, movimentoId, versao: (ultima?.versao ?? 0) + 1, geradoPor: ctx.usuarioId, conteudo: conteudo as unknown as Prisma.InputJsonValue,
      hashSha256: conteudo.hash_sha256, pendencias: conteudo.pendencias.length, congelado,
    },
  });
}

/** POST /api/embarques/{id}/dossie (§14): gera uma nova versão do dossiê com o estado atual. */
export async function gerarDossie(ctx: Contexto, movimentoId: string) {
  exigir(ctx, 'embarque.programar');
  return comTransacao(ctx, async (tx) => {
    const mov = await travarMovimento(tx, movimentoId);
    if (mov.status === 'FINALIZADO') throw new ErroValidacao('O embarque está finalizado: o dossiê da finalização está congelado.');
    if (mov.status !== 'ABERTO') throw new ErroValidacao('O embarque não está aberto.');
    const { conteudo } = await montarDossie(tx, movimentoId);
    const d = await gravarDossie(tx, ctx, movimentoId, conteudo, false);
    await auditar(tx, ctx, { entidade: 'dossie', entidadeId: d.id, acao: 'GERAR', depois: { versao: d.versao, hash: d.hashSha256, pendencias: d.pendencias } });
    return { id: d.id, versao: d.versao, hash: d.hashSha256, pendencias: conteudo.pendencias };
  });
}

/**
 * Na finalização (RN-18, RN-30): congela o dossiê (contrato com EUDR não finaliza com pendência) e,
 * se ainda não houver, emite o pacote v1. Reabrir e finalizar de novo não muda o pacote já emitido.
 */
export async function congelarNaFinalizacao(tx: Tx, ctx: Contexto, movimentoId: string, exigeEudr: boolean) {
  const montado = await montarDossie(tx, movimentoId);
  if (exigeEudr) exigirDossieSemPendencias(montado.conteudo.pendencias);
  const dossie = await gravarDossie(tx, ctx, movimentoId, montado.conteudo, true);
  const existente = await tx.pacoteEmbarque.findFirst({ where: { movimentoId }, orderBy: { versao: 'desc' } });
  const pacote = existente ?? (await emitirPacote(tx, ctx, montado, 1, null));
  return { dossie, pacote };
}

async function emitirPacote(tx: Tx, ctx: Contexto, m: Awaited<ReturnType<typeof montarDossie>>, versao: number, motivo: string | null) {
  const { det, lotes, lt, talhoes, fcs, validoEm, conteudo } = m;
  const empresa = await tx.empresa.findFirstOrThrow({ where: { id: ctx.empresaId }, select: { nome: true, cnpj: true, ie: true } });
  const rebaixados = await tx.rebaixamento.findMany({ where: { movimentoId: det.movimentoId, cancelado: false, loteResultadoId: null } });
  const vendidoRotulo = m.vendidos.size ? rotuloEsquemas(m.vendidos) : null;
  const fazendasUsadas = [...new Set(talhoes.map((t) => t.fazendaId))];
  const pacote = montarPacote({
    versao,
    geradoEm: new Date(),
    emitente: { nome: empresa.nome, cnpj_cpf: empresa.cnpj, ie: empresa.ie },
    destinatario: { nome: det.contrato.cliente.nome, cnpj_cpf: det.contrato.cliente.cpfCnpj },
    embarque: {
      codigo: conteudo.embarque.codigo, data: conteudo.embarque.data, contrato: det.contrato.codigo, placa: det.placa, motorista: det.motorista?.nome ?? null, lacres: det.lacres,
      peso_liquido_kg: det.pesoLiquido?.toString() ?? null,
    },
    notas: det.movimento.notas.map((n) => ({ numero: n.numeroNota, serie: n.serie, chave_nfe: n.chaveNfe, data_emissao: iso(n.dataEmissao)!, kg: n.qtdKg.toString() })),
    lotes: lotes.map((l) => {
      const comp = composicaoDoEmbarque([{ kg: l.kg, talhoes: lt.filter((x) => x.loteId === l.lote.id).map((x) => ({ talhaoId: x.talhaoId, percentual: x.percentual.toString() })) }]);
      return {
        codigo: l.lote.codigo, kg: l.kg.toFixed(3), safra: l.lote.safra.codigo, peneira: l.lote.peneira?.codigo ?? null, padrao: det.contrato.descricaoPadrao || null, tipo: l.lote.tipoCafe?.codigo ?? null,
        certificados: l.lote.certificados.map((c) => c.certificado.codigo).sort(), certificado_vendido: vendidoRotulo,
        rebaixamentos: rebaixados.filter((r) => r.loteOrigemId === l.lote.id).map((r) => ({ kg: r.kg.toString(), perdidos: r.esquemasPerdidos })),
        composicao: comp.map((c) => {
          const t = talhoes.find((x) => x.id === c.talhaoId)!;
          return { fazenda: t.fazenda.codigo, talhao: t.codigo, percentual: c.percentual.toString(), kg: c.kg.toString() };
        }),
      };
    }),
    fazendas: fazendasUsadas.map((fid) => {
      const f = talhoes.find((t) => t.fazendaId === fid)!.fazenda;
      return {
        codigo: f.codigo, nome: f.nome, produtor: f.produtor?.nome ?? null, cpf_cnpj: f.produtor?.cpfCnpj ?? null, ie: f.ie, car: f.car, municipio: f.municipio, uf: f.uf,
        certificados_validos: [...new Set(fcs.filter((x) => x.fazendaId === fid && validoEm(x)).map((x) => x.certificado.codigo))].sort(),
      };
    }),
    eudr: { numero_dds: det.numeroDds, talhoes_sem_pendencia: !conteudo.pendencias.some((p) => p.tipo !== 'CERTIFICADO_INVALIDO') },
  });
  const geojson = geojsonTalhoes(conteudo.talhoes);
  const p = await tx.pacoteEmbarque.create({
    data: {
      empresaId: ctx.empresaId, movimentoId: det.movimentoId, versao, geradoPor: ctx.usuarioId, conteudo: pacote as unknown as Prisma.InputJsonValue,
      geojson: geojson as unknown as Prisma.InputJsonValue, hashSha256: pacote.hash_sha256, motivo,
    },
  });
  await auditar(tx, ctx, { entidade: 'pacote_embarque', entidadeId: p.id, acao: 'EMITIR', depois: { versao, hash: p.hashSha256, motivo } });
  return p;
}

/** Reemissão (RN-30): só com o embarque finalizado, com motivo; gera nova versão (o hash muda). */
export async function reemitirPacote(ctx: Contexto, movimentoId: string, motivo: string) {
  exigir(ctx, 'movimento.fechar');
  const m = exigirMotivo(motivo, 'o motivo da reemissão');
  return comTransacao(ctx, async (tx) => {
    const mov = await travarMovimento(tx, movimentoId);
    if (mov.status !== 'FINALIZADO') throw new ErroValidacao('O pacote só é reemitido com o embarque finalizado.');
    const ultima = await tx.pacoteEmbarque.findFirst({ where: { movimentoId }, orderBy: { versao: 'desc' } });
    const montado = await montarDossie(tx, movimentoId);
    return emitirPacote(tx, ctx, montado, (ultima?.versao ?? 0) + 1, m);
  });
}

export async function obterDossie(ctx: Contexto, movimentoId: string, versao?: number) {
  if (!ehUuid(movimentoId)) throw new ErroNaoEncontrado('Embarque não encontrado.');
  return comTransacao(ctx, async (tx) => {
    const d = await tx.dossie.findFirst({ where: { movimentoId, ...(versao ? { versao } : {}) }, orderBy: { versao: 'desc' } });
    if (!d) throw new ErroNaoEncontrado('Dossiê ainda não gerado.');
    return { versao: d.versao, geradoEm: d.geradoEm, congelado: d.congelado, hash: d.hashSha256, conteudo: d.conteudo as unknown as ConteudoDossie & { hash_sha256: string } };
  });
}

export async function obterPacote(ctx: Contexto, movimentoId: string, versao?: number) {
  if (!ehUuid(movimentoId)) throw new ErroNaoEncontrado('Embarque não encontrado.');
  return comTransacao(ctx, async (tx) => {
    const p = await tx.pacoteEmbarque.findFirst({ where: { movimentoId, ...(versao ? { versao } : {}) }, orderBy: { versao: 'desc' } });
    if (!p) throw new ErroNaoEncontrado('Pacote ainda não emitido: ele nasce na finalização do embarque.');
    const conteudo = p.conteudo as unknown as ReturnType<typeof montarPacote>;
    return { versao: p.versao, hash: p.hashSha256, motivo: p.motivo, geradoEm: p.geradoEm, nome: nomePacote(conteudo.embarque.codigo, p.versao), conteudo, geojson: p.geojson };
  });
}
