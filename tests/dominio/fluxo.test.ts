import { describe, expect, it } from 'vitest';
import { destinosPermitidos, normalizarPrefixo, transicaoPermitida, unidadesCompativeis, validarEtapa, validarFluxo, type EtapaConfig, type TransicaoConfig } from '@/dominio/fluxo';
import { MODELOS_FLUXO, modeloFluxo, type ModeloFluxo } from '@/dominio/modelos-fluxo';

/** Converte um modelo em configuração de empresa (id = código da etapa). */
function doModelo(m: ModeloFluxo): { etapas: EtapaConfig[]; transicoes: TransicaoConfig[] } {
  const etapas = m.etapas.map<EtapaConfig>((e) => ({
    id: e.codigo, codigo: e.codigo, nome: e.nome, classe: e.classe, prefixoLote: e.prefixoLote,
    unidadeEntrada: e.unidadeEntrada, unidadeSaida: e.unidadeSaida, modeloResultado: e.modeloResultado,
    monitoraSecagem: e.monitoraSecagem ?? false, umidadeMetaMin: e.umidadeMetaMin ?? null, umidadeMetaMax: e.umidadeMetaMax ?? null,
    exigeLocal: e.exigeLocal ?? false, ativa: true, tiposResultado: e.tiposResultado ?? [],
  }));
  return { etapas, transicoes: m.transicoes.map(([origem, destino]) => ({ origem, destino, fazendaId: null })) };
}
const viaUmida = () => doModelo(modeloFluxo('VIA_UMIDA')!);
const mensagens = (etapas: EtapaConfig[], transicoes: TransicaoConfig[]) => validarFluxo(etapas, transicoes).map((p) => p.mensagem).join(' | ');

describe('modelos de fluxo (§5.3)', () => {
  it.each(MODELOS_FLUXO.map((m) => [m.codigo, m] as const))('%s é um fluxo válido', (_c, m) => {
    const { etapas, transicoes } = doModelo(m);
    expect(validarFluxo(etapas, transicoes)).toEqual([]);
  });

  it('Via úmida completa: Colheita → Lavador → Terreiro ⇄ Secador → Tulha → Armazém ⇄ Serviço → Embarque, com os atalhos', () => {
    const { etapas, transicoes } = viaUmida();
    expect(etapas.map((e) => e.prefixoLote)).toEqual(['EF', 'LD', 'TE', 'SE', 'TU', 'AR', 'GS', 'EB']);
    const pares = new Set(transicoes.map((t) => `${t.origem}>${t.destino}`));
    for (const p of ['COLHEITA>LAVADOR', 'LAVADOR>TERREIRO', 'TERREIRO>SECADOR', 'SECADOR>TERREIRO', 'SECADOR>TULHA', 'TULHA>ARMAZEM', 'ARMAZEM>SERVICO', 'SERVICO>ARMAZEM', 'ARMAZEM>EMBARQUE', 'COLHEITA>TERREIRO', 'LAVADOR>SECADOR', 'TERREIRO>TULHA']) {
      expect(pares, p).toContain(p);
    }
    expect(etapas.find((e) => e.codigo === 'LAVADOR')!.tiposResultado).toEqual(['VER', 'BOI', 'CD']);
    expect(etapas.filter((e) => e.monitoraSecagem).map((e) => e.codigo)).toEqual(['TERREIRO', 'SECADOR']);
  });
});

describe('regras do fluxo (§5.2)', () => {
  it('§5.2 exige pelo menos uma etapa ativa de Colheita, Estoque e Saída', () => {
    const { etapas, transicoes } = viaUmida();
    for (const classe of ['COLHEITA', 'ESTOQUE', 'SAIDA'] as const) {
      const sem = etapas.map((e) => (e.classe === classe ? { ...e, ativa: false } : e));
      expect(mensagens(sem, transicoes)).toMatch(/pelo menos uma etapa/i);
    }
  });

  it('§5.2 a entrada só vale se houver transição; a da fazenda substitui a da empresa para aquela origem', () => {
    const t: TransicaoConfig[] = [
      { origem: 'TE', destino: 'SE', fazendaId: null },
      { origem: 'TE', destino: 'TU', fazendaId: null },
      { origem: 'TE', destino: 'TU', fazendaId: 'NS' },
    ];
    expect(destinosPermitidos(t, 'TE', null).sort()).toEqual(['SE', 'TU']);
    expect(destinosPermitidos(t, 'TE', 'BV').sort()).toEqual(['SE', 'TU']);
    expect(destinosPermitidos(t, 'TE', 'NS')).toEqual(['TU']);
    expect(destinosPermitidos(t, 'SE', 'NS')).toEqual([]);
  });

  it('§5.2 prefixo do lote é único na empresa, com 2 ou 3 letras', () => {
    const { etapas, transicoes } = viaUmida();
    const dup = etapas.map((e) => (e.codigo === 'SECADOR' ? { ...e, prefixoLote: 'TE' } : e));
    expect(mensagens(dup, transicoes)).toMatch(/prefixo/i);
    expect(normalizarPrefixo(' sé ')).toBe('SE');
    expect(validarEtapa({ ...etapas[0]!, prefixoLote: 'E1' }).length).toBeGreaterThan(0);
  });

  it('colheita não recebe de outras etapas e saída não envia', () => {
    const { etapas, transicoes } = viaUmida();
    expect(mensagens(etapas, [...transicoes, { origem: 'TERREIRO', destino: 'COLHEITA', fazendaId: null }])).toMatch(/não recebe/);
    expect(mensagens(etapas, [...transicoes, { origem: 'EMBARQUE', destino: 'ARMAZEM', fazendaId: null }])).toMatch(/fim do fluxo/);
  });

  it('unidades: medidas não entram onde se recebe kg, mas o estoque aceita kg de volta do serviço', () => {
    const { etapas } = viaUmida();
    const e = (c: string) => etapas.find((x) => x.codigo === c)!;
    expect(unidadesCompativeis(e('TULHA'), e('SERVICO'))).toBe(false);
    expect(unidadesCompativeis(e('SERVICO'), e('TERREIRO'))).toBe(false);
    expect(unidadesCompativeis(e('SERVICO'), e('ARMAZEM'))).toBe(true);
    expect(transicaoPermitida(e('TULHA'), e('TULHA'))).toBe(false);
  });

  it('aponta etapa ativa que nenhuma colheita alcança', () => {
    const { etapas, transicoes } = viaUmida();
    const semTulha = transicoes.filter((t) => t.destino !== 'TULHA');
    expect(mensagens(etapas, semTulha)).toMatch(/Tulha/);
  });

  it('transição repetida é apontada', () => {
    const { etapas, transicoes } = viaUmida();
    expect(mensagens(etapas, [...transicoes, transicoes[0]!])).toMatch(/repetida/);
  });

  it('secagem só em processamento e com meta mínima ≤ máxima', () => {
    const { etapas } = viaUmida();
    const te = etapas.find((x) => x.codigo === 'TERREIRO')!;
    expect(validarEtapa({ ...te, umidadeMetaMin: '13', umidadeMetaMax: '12' }).length).toBeGreaterThan(0);
    expect(validarEtapa({ ...etapas.find((x) => x.codigo === 'ARMAZEM')!, monitoraSecagem: true, umidadeMetaMin: '11', umidadeMetaMax: '12' }).length).toBeGreaterThan(0);
    expect(validarEtapa(te)).toEqual([]);
  });

  it('percentual por tipo exige tipos de resultado', () => {
    const ld = viaUmida().etapas.find((x) => x.codigo === 'LAVADOR')!;
    expect(validarEtapa({ ...ld, tiposResultado: [] }).length).toBeGreaterThan(0);
  });

  it('modelo de resultado e unidades precisam combinar com a classe', () => {
    const ar = viaUmida().etapas.find((x) => x.codigo === 'ARMAZEM')!;
    expect(validarEtapa({ ...ar, modeloResultado: 'POR_PENEIRA' }).length).toBeGreaterThan(0);
    expect(validarEtapa({ ...ar, unidadeSaida: 'MEDIDA' }).length).toBeGreaterThan(0);
  });
});
