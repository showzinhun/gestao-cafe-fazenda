import { createHash } from 'node:crypto';
import Decimal from 'decimal.js';
import type { Geometry } from 'geojson';
import type { Pendencia } from './eudr';
import { gerarCodigoLote } from './lote';

/**
 * Dossiê do embarque (§10) e pacote fazenda → exportadora (§17, RN-30).
 * O formato do pacote é contrato com outro sistema: mudanças só com nova VERSAO_FORMATO (regra 15).
 */
export const FORMATO_PACOTE = 'cafe-pacote-embarque';
export const VERSAO_FORMATO = 1;

// ---------------------------------------------------------------- JSON canônico e hash

/** JSON com chaves em ordem: o mesmo conteúdo gera sempre o mesmo texto (e o mesmo hash). */
export function jsonCanonico(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(jsonCanonico).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${jsonCanonico(o[k])}`).join(',')}}`;
}

export const sha256 = (texto: string | Buffer) => createHash('sha256').update(texto).digest('hex');

/** Hash do conteúdo sem o próprio campo de hash. */
export function hashConteudo<T extends Record<string, unknown>>(conteudo: T): string {
  const resto: Record<string, unknown> = { ...conteudo };
  delete resto.hash_sha256;
  return sha256(jsonCanonico(resto));
}

/** Kg com 3 casas, como número no JSON (§17). */
export const kgJson = (v: Decimal.Value) => Number(new Decimal(v).toFixed(3));

/** Data e hora no fuso de Brasília com deslocamento (ex.: 2026-11-20T14:00:00-03:00). */
export function isoBrasilia(d: Date): string {
  const local = new Date(d.getTime() - 3 * 3_600_000);
  return `${local.toISOString().slice(0, 19)}-03:00`;
}

// ---------------------------------------------------------------- composição por talhão no embarque (RN-09)

export interface TalhaoDoLote {
  talhaoId: string;
  percentual: Decimal.Value; // fração do lote (0–1)
}

export interface ParteTalhao {
  talhaoId: string;
  kg: Decimal;
  percentual: Decimal;
}

/**
 * Kg de cada talhão no embarque = Σ (kg do lote no embarque × percentual do talhão no lote).
 * Arredonda a 3 casas e ajusta a sobra no maior, para Σ = total (como na RN-09).
 */
export function composicaoDoEmbarque(lotes: { kg: Decimal.Value; talhoes: TalhaoDoLote[] }[]): ParteTalhao[] {
  const soma = new Map<string, Decimal>();
  let total = new Decimal(0);
  for (const l of lotes) {
    total = total.plus(l.kg);
    for (const t of l.talhoes) soma.set(t.talhaoId, (soma.get(t.talhaoId) ?? new Decimal(0)).plus(new Decimal(l.kg).times(t.percentual)));
  }
  const partes = [...soma.entries()].map(([talhaoId, kg]) => ({ talhaoId, kg: kg.toDecimalPlaces(3, Decimal.ROUND_HALF_UP), percentual: new Decimal(0) }));
  if (!partes.length || total.isZero()) return [];
  const sobra = total.toDecimalPlaces(3).minus(partes.reduce((s, p) => s.plus(p.kg), new Decimal(0)));
  const maior = partes.reduce((a, b) => (b.kg.gt(a.kg) ? b : a));
  maior.kg = maior.kg.plus(sobra);
  for (const p of partes) p.percentual = p.kg.div(total).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
  return partes.sort((a, b) => b.kg.comparedTo(a.kg));
}

// ---------------------------------------------------------------- dossiê (§10)

export interface TalhaoDossie {
  id: string;
  fazenda: string;
  fazenda_nome: string;
  produtor: string | null;
  produtor_doc: string | null;
  talhao: string;
  nome: string;
  area_ha: number | null;
  geometria_tipo: 'PONTO' | 'POLIGONO' | null;
  geometria: Geometry | null;
  kg: number;
  percentual: number;
  checagem: { resultado: string; data: string; provedor: string } | null;
}

export interface ConteudoDossie {
  versao_formato: 1;
  gerado_em: string;
  embarque: { codigo: string; contrato: string; cliente: string; data: string | null; numero_dds: string | null; exige_eudr: boolean; certificados_vendidos: string[] };
  total_kg: number;
  talhoes: TalhaoDossie[];
  lotes: { codigo: string; kg: number; certificados: string[] }[];
  certificados: { fazenda: string; certificado: string; numero: string | null; validade_fim: string; valido: boolean; parcial?: boolean }[];
  cadeia: { movimento: string; etapa: string; data: string; status: string }[];
  pendencias: Pendencia[];
  hash_sha256?: string;
}

export function fecharDossie(c: ConteudoDossie): ConteudoDossie & { hash_sha256: string } {
  return { ...c, hash_sha256: hashConteudo(c as unknown as Record<string, unknown>) };
}

/** GeoJSON FeatureCollection do dossiê e do pacote: um item por talhão da composição. */
export function geojsonTalhoes(talhoes: TalhaoDossie[]) {
  return {
    type: 'FeatureCollection' as const,
    features: talhoes.filter((t) => t.geometria).map((t) => ({
      type: 'Feature' as const,
      geometry: t.geometria!,
      properties: {
        Name: `${t.fazenda}-${t.talhao}`, id: t.id, fazenda: t.fazenda, produtor: t.produtor, area_ha: t.area_ha,
        kg_no_embarque: t.kg, checagem: t.checagem ? { resultado: t.checagem.resultado, data: t.checagem.data } : null,
      },
    })),
  };
}

const celula = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const decBr = (n: number | null, casas: number) => (n === null ? '' : n.toFixed(casas).replace('.', ','));

/** CSV do dossiê (separador ";" e vírgula decimal, para abrir no Excel em pt-BR). */
export function csvDossie(c: ConteudoDossie): string {
  const linhas = [
    ['Fazenda', 'Nome da fazenda', 'Produtor', 'CPF/CNPJ', 'Talhão', 'Área (ha)', 'Geometria', 'kg no embarque', '%', 'Checagem', 'Data da checagem', 'Provedor'],
    ...c.talhoes.map((t) => [t.fazenda, t.fazenda_nome, t.produtor, t.produtor_doc, t.talhao, decBr(t.area_ha, 4), t.geometria_tipo ?? 'sem geometria', decBr(t.kg, 3), decBr(t.percentual * 100, 2),
      t.checagem?.resultado ?? 'sem checagem', t.checagem?.data ?? '', t.checagem?.provedor ?? '']),
  ];
  return linhas.map((l) => l.map(celula).join(';')).join('\r\n') + '\r\n';
}

// ---------------------------------------------------------------- pacote de embarque (§17)

export interface EntradaPacote {
  versao: number;
  geradoEm: Date;
  emitente: { nome: string; cnpj_cpf: string | null; ie: string | null };
  destinatario: { nome: string; cnpj_cpf: string | null };
  embarque: { codigo: string; data: string | null; contrato: string; placa: string | null; motorista: string | null; lacres: string[]; peso_liquido_kg: Decimal.Value | null };
  notas: { numero: string; serie: string | null; chave_nfe: string | null; data_emissao: string; kg: Decimal.Value }[];
  lotes: {
    codigo: string; kg: Decimal.Value; safra: string; peneira: string | null; padrao: string | null; tipo: string | null;
    certificados: string[]; certificado_vendido: string | null; rebaixamentos: { kg: Decimal.Value; perdidos: string[] }[];
    composicao: { fazenda: string; talhao: string; percentual: Decimal.Value; kg: Decimal.Value }[];
  }[];
  fazendas: { codigo: string; nome: string; produtor: string | null; cpf_cnpj: string | null; ie: string | null; car: string | null; municipio: string | null; uf: string | null; certificados_validos: string[] }[];
  eudr: { numero_dds: string | null; talhoes_sem_pendencia: boolean };
}

export function montarPacote(e: EntradaPacote) {
  const conteudo = {
    formato: FORMATO_PACOTE,
    versao_formato: VERSAO_FORMATO,
    versao: e.versao,
    gerado_em: isoBrasilia(e.geradoEm),
    emitente: e.emitente,
    destinatario: e.destinatario,
    embarque: { ...e.embarque, peso_liquido_kg: e.embarque.peso_liquido_kg === null ? null : kgJson(e.embarque.peso_liquido_kg) },
    notas: e.notas.map((n) => ({ ...n, kg: kgJson(n.kg) })),
    lotes: e.lotes.map((l) => ({
      codigo: l.codigo, kg: kgJson(l.kg), sacas: Number(new Decimal(l.kg).div(60).toFixed(3)), safra: l.safra, peneira: l.peneira, padrao: l.padrao, tipo: l.tipo,
      certificados: l.certificados, certificado_vendido: l.certificado_vendido,
      rebaixamentos: l.rebaixamentos.map((r) => ({ kg: kgJson(r.kg), perdidos: r.perdidos })),
      composicao: l.composicao.map((c) => ({ fazenda: c.fazenda, talhao: c.talhao, percentual: Number(new Decimal(c.percentual).toFixed(4)), kg: kgJson(c.kg) })),
    })),
    fazendas: e.fazendas,
    eudr: e.eudr,
  };
  return { ...conteudo, hash_sha256: hashConteudo(conteudo) };
}

export const nomePacote = (codigoEmbarque: string, versao: number) => `pacote-${codigoEmbarque}-v${versao}`;

/** Código do embarque no pacote (§17): EB-NS-2526-000001 (fazenda ou MIX, safra sem barra, número com 6 dígitos). */
export const codigoEmbarque = (prefixo: string, fazenda: string | null, safra: string, numero: number) => gerarCodigoLote({ prefixo, fazenda, safra, numero });
