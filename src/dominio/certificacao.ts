import Decimal from 'decimal.js';
import { ErroRegra } from './erros';

/**
 * Esquemas de certificação (RN-28): certificados são comparados por esquema.
 * "RFA + AAA" = {RFA, AAA}. Um lote com os certificados RFA e AAA tem os esquemas {RFA, AAA}.
 */
export function esquemasDe(codigos: Iterable<string>): Set<string> {
  const r = new Set<string>();
  for (const c of codigos) for (const p of c.split('+')) if (p.trim()) r.add(p.trim().toUpperCase());
  return r;
}

export const rotuloEsquemas = (s: Iterable<string>) => [...s].sort().join(' + ') || 'convencional';

export interface OrigemCertificada {
  loteId: string;
  codigo: string;
  kg: Decimal.Value;
  esquemas: Set<string>;
}

export interface LinhaRebaixamento {
  loteId: string;
  codigo: string;
  kg: Decimal;
  origem: string[];
  resultado: string[];
  perdidos: string[];
}

/** Kg de cada origem que perdem esquemas no resultado (RN-28). Lista vazia = sem rebaixamento. */
export function rebaixamentos(origens: OrigemCertificada[], resultado: Set<string>): LinhaRebaixamento[] {
  const r: LinhaRebaixamento[] = [];
  for (const o of origens) {
    const perdidos = [...o.esquemas].filter((e) => !resultado.has(e)).sort();
    if (perdidos.length && new Decimal(o.kg).gt(0)) {
      r.push({ loteId: o.loteId, codigo: o.codigo, kg: new Decimal(o.kg), origem: [...o.esquemas].sort(), resultado: [...resultado].sort(), perdidos });
    }
  }
  return r;
}

/** Rebaixamento exige motivo (RN-28). */
export function exigirMotivoRebaixamento(linhas: LinhaRebaixamento[], motivo: string | null | undefined): string | null {
  if (!linhas.length) return null;
  const m = (motivo ?? '').trim();
  if (m.length < 5) {
    const resumo = linhas.map((l) => `${l.codigo} perde ${l.perdidos.join(', ')} (${new Decimal(l.kg).toFixed(3).replace(/\.?0+$/, '')} kg)`).join('; ');
    throw new ErroRegra('RN-28', `Rebaixamento de certificado: ${resumo}. Informe o motivo.`);
  }
  return m;
}

/** Vender como: cada lote precisa ter todos os esquemas vendidos (RN-28) e a venda cobre os exigidos pelo contrato (RN-17). */
export function exigirVenda(lotes: { codigo: string; esquemas: Set<string> }[], vendidos: Set<string>, exigidos: Set<string>): void {
  for (const l of lotes) {
    const faltam = [...vendidos].filter((e) => !l.esquemas.has(e));
    if (faltam.length) throw new ErroRegra('RN-28', `O lote ${l.codigo} não tem ${faltam.join(', ')}: não pode ser vendido como ${rotuloEsquemas(vendidos)}.`);
  }
  const faltamContrato = [...exigidos].filter((e) => !vendidos.has(e));
  if (faltamContrato.length) throw new ErroRegra('RN-17', `O contrato exige ${faltamContrato.join(', ')}: a venda precisa incluir esse certificado.`);
}

// ---------------------------------------------------------------- certificados da fazenda (§10)

export type SituacaoCertificado = 'VALIDO' | 'VENCIDO' | 'SUSPENSO' | 'FUTURO';

export function situacaoCertificado(c: { status: string; validadeInicio: string; validadeFim: string }, hoje: string): SituacaoCertificado {
  if (c.status === 'SUSPENSO') return 'SUSPENSO';
  if (c.validadeFim < hoje) return 'VENCIDO';
  if (c.validadeInicio > hoje) return 'FUTURO';
  return 'VALIDO';
}

/** Dias corridos entre duas datas aaaa-mm-dd. */
export function diasEntre(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000);
}

/** Faixa do alerta CERTIFICADO_VENCENDO (§10): 60, 30 ou 7 dias antes do fim. Fora das faixas → null. */
export function faixaVencimento(diasRestantes: number): 60 | 30 | 7 | null {
  if (diasRestantes < 0) return null;
  if (diasRestantes <= 7) return 7;
  if (diasRestantes <= 30) return 30;
  if (diasRestantes <= 60) return 60;
  return null;
}

// ---------------------------------------------------------------- limite de quebra no serviço (RN-31)

/** Limite do tipo de serviço em empresa.configuracoes.limite_quebra_servico (ex.: {"CATACAO": "0.08"}). Sem limite → null. */
export function limiteQuebraServico(configuracoes: unknown, tipo: string | null | undefined): Decimal | null {
  if (!tipo) return null;
  const mapa = (configuracoes as { limite_quebra_servico?: Record<string, unknown> } | null)?.limite_quebra_servico;
  const v = mapa?.[tipo];
  if (v === undefined || v === null || v === '') return null;
  return new Decimal(String(v));
}

export function exigirMotivoQuebra(p: { percQuebra: Decimal.Value | null; limite: Decimal | null; tipo: string; motivo?: string | null }): string | null {
  if (!p.limite || p.percQuebra === null) return null;
  const q = new Decimal(p.percQuebra);
  if (q.lte(p.limite)) return null;
  const m = (p.motivo ?? '').trim();
  if (m.length < 5) {
    const pct = (d: Decimal) => d.times(100).toDecimalPlaces(2).toString().replace('.', ',');
    throw new ErroRegra('RN-31', `Quebra de ${pct(q)}% passa do limite de ${pct(p.limite)}% para ${p.tipo.toLowerCase()}. Informe o motivo.`);
  }
  return m;
}

// ---------------------------------------------------------------- rótulo da certificação da fazenda

/**
 * Certificação da fazenda no formato das listas do negócio: "RFA + AAA + 4C", "UTZ (parcial)", "Sem certificado".
 * Entram os certificados vigentes hoje (não suspensos, dentro da validade). Os parciais vêm marcados.
 */
export function rotuloCertificacao(certs: { codigo: string; status: string; validadeInicio: string; validadeFim: string; parcial?: boolean }[], hoje: string): string {
  const vigentes = certs.filter((c) => situacaoCertificado(c, hoje) === 'VALIDO');
  const inteiros = [...new Set(vigentes.filter((c) => !c.parcial).map((c) => c.codigo))].sort();
  const parciais = [...new Set(vigentes.filter((c) => c.parcial).map((c) => c.codigo))].filter((c) => !inteiros.includes(c)).sort();
  const partes = [...inteiros, ...parciais.map((c) => `${c} (parcial)`)];
  return partes.length ? partes.join(' + ') : 'Sem certificado';
}
