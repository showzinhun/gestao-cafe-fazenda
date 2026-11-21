import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { certificadosHerdados, codigoSafra, comporTalhoes, conferirCertificadosEscolhidos, equivalentes, gerarCodigoLote, saldoLivre, statusDoLote, type CertificadoFazenda } from '@/dominio/lote';
import { calcularResultado, quebra, rendimento } from '@/dominio/resultados';
import { ErroRegra } from '@/dominio/erros';

const D = (v: Decimal.Value) => new Decimal(v);
const txt = (d: Decimal) => d.toFixed(3);

describe('código do lote (§8)', () => {
  it('segue {PREFIXO}-{FAZ}-{SAFRA}-{NUM6}[-{TIPO}][-P{PENEIRA}][-{seq}]', () => {
    expect(gerarCodigoLote({ prefixo: 'TE', fazenda: 'NS', safra: '2025/26', numero: 45, tipo: 'CD' })).toBe('TE-NS-2526-000045-CD');
    expect(gerarCodigoLote({ prefixo: 'AR', fazenda: 'NS', safra: '2025/26', numero: 10, peneira: '17' })).toBe('AR-NS-2526-000010-P17');
    expect(gerarCodigoLote({ prefixo: 'GS', fazenda: null, safra: '2025/26', numero: 1 })).toBe('GS-MIX-2526-000001');
    expect(gerarCodigoLote({ prefixo: 'LD', fazenda: 'NS', safra: '2025/26', numero: 1, tipo: 'VER', seq: 2 })).toBe('LD-NS-2526-000001-VER-2');
    expect(codigoSafra('2025/2026')).toBe('2526');
  });
});

describe('saldo e status do lote', () => {
  it('RN-02 status derivado: aberto, parcial, utilizado, estornado', () => {
    expect(statusDoLote({ quantidade: 100, quantidadeUtilizada: 0 })).toBe('ABERTO');
    expect(statusDoLote({ quantidade: 100, quantidadeUtilizada: 40 })).toBe('PARCIAL');
    expect(statusDoLote({ quantidade: 100, quantidadeUtilizada: 100 })).toBe('UTILIZADO');
    expect(statusDoLote({ quantidade: 100, quantidadeUtilizada: 40, estornado: true })).toBe('ESTORNADO');
  });
  it('RN-01 saldo livre desconta utilizado e reservado', () => {
    expect(txt(saldoLivre({ quantidade: 1200, quantidadeUtilizada: 0, quantidadeReservada: 900 }))).toBe('300.000');
  });
});

describe('composição por talhão (RN-09)', () => {
  const ef1 = new Map([['T1', D(1)]]);
  const ef2 = new Map([['T2', D(1)]]);
  it('RN-09 lavador com EF1 (100, T1) e EF2 (50, T2) → T1 66,67% / T2 33,33%, somando 1', () => {
    const c = comporTalhoes([{ quantidade: 100, composicao: ef1 }, { quantidade: 50, composicao: ef2 }]);
    expect(c.get('T1')!.toFixed(4)).toBe('0.6667');
    expect(c.get('T2')!.toFixed(4)).toBe('0.3333');
    expect([...c.values()].reduce((s, v) => s.plus(v), D(0)).toString()).toBe('1');
    const eq = equivalentes(c, 900);
    expect(eq.find((e) => e.talhaoId === 'T1')!.quantidade.toFixed(0)).toBe('600');
    expect(eq.find((e) => e.talhaoId === 'T2')!.quantidade.toFixed(0)).toBe('300');
  });
  it('RN-09 blend de duas fazendas: composição ponderada pela quantidade de cada lote', () => {
    const misto = comporTalhoes([{ quantidade: 30, composicao: new Map([['T1', D('0.5')], ['T2', D('0.5')]]) }, { quantidade: 70, composicao: new Map([['X9', D(1)]]) }]);
    expect(misto.get('T1')!.toFixed(2)).toBe('0.15');
    expect(misto.get('X9')!.toFixed(2)).toBe('0.70');
  });
  it('RN-09 ajusta o arredondamento no maior talhão', () => {
    const c = comporTalhoes([1, 1, 1].map((q, i) => ({ quantidade: q, composicao: new Map([[`T${i}`, D(1)]]) })));
    expect([...c.values()].reduce((s, v) => s.plus(v), D(0)).eq(1)).toBe(true);
  });
});

describe('resultados por modelo', () => {
  const entradas = [{ id: 'e1', quantidade: '100', tipoCafeId: 'NAT' }, { id: 'e2', quantidade: '50', tipoCafeId: 'NAT' }];

  it('RN-12 percentual por tipo: VER 0,20 / BOI 0,30 / CD 0,40 de 150 → 30/45/60 e perda 15', () => {
    const r = calcularResultado({
      modelo: 'PERCENTUAL_POR_TIPO', unidadeEntrada: 'MEDIDA', entradas, tiposPermitidos: ['VER', 'BOI', 'CD'],
      parametros: { modelo: 'PERCENTUAL_POR_TIPO', resultados: [{ tipoCafeId: 'VER', percentual: '0.20' }, { tipoCafeId: 'BOI', percentual: '0.30' }, { tipoCafeId: 'CD', percentual: '0.40' }] },
    });
    expect(r.saidas.map((s) => [s.tipoCafeId, txt(s.quantidade)])).toEqual([['VER', '30.000'], ['BOI', '45.000'], ['CD', '60.000']]);
    expect(txt(r.perda!)).toBe('15.000');
    expect(r.percQuebra!.toString()).toBe('0.1');
  });

  it('RN-12 percentual fora de 0–1 ou soma acima de 1 é recusado', () => {
    const base = { modelo: 'PERCENTUAL_POR_TIPO' as const, unidadeEntrada: 'MEDIDA' as const, entradas };
    expect(() => calcularResultado({ ...base, parametros: { modelo: 'PERCENTUAL_POR_TIPO', resultados: [{ tipoCafeId: 'CD', percentual: '1.2' }] } })).toThrow(ErroRegra);
    expect(() => calcularResultado({ ...base, parametros: { modelo: 'PERCENTUAL_POR_TIPO', resultados: [{ tipoCafeId: 'CD', percentual: '0.6' }, { tipoCafeId: 'BOI', percentual: '0.5' }] } })).toThrow(/passa de 1/);
  });

  it('RN-12 arredonda a 3 casas e a sobra vai para a perda', () => {
    const r = calcularResultado({
      modelo: 'PERCENTUAL_POR_TIPO', unidadeEntrada: 'MEDIDA', entradas: [{ id: 'e', quantidade: '10', tipoCafeId: null }],
      parametros: { modelo: 'PERCENTUAL_POR_TIPO', resultados: [{ tipoCafeId: 'A', percentual: '0.33333' }, { tipoCafeId: 'B', percentual: '0.33333' }] },
    });
    expect(r.saidas.map((s) => txt(s.quantidade))).toEqual(['3.333', '3.333']);
    expect(txt(r.perda!)).toBe('3.334');
  });

  it('D-02 café e perda: um lote por tipo de entrada (terreiro CD 60 + BOI 45, fator 0,90 → 54 e 40,5)', () => {
    const r = calcularResultado({
      modelo: 'CAFE_E_PERDA', unidadeEntrada: 'MEDIDA',
      entradas: [{ id: 'cd', quantidade: '60', tipoCafeId: 'CD' }, { id: 'boi', quantidade: '45', tipoCafeId: 'BOI' }],
      parametros: { modelo: 'CAFE_E_PERDA', fator: '0.90' },
    });
    expect(r.saidas.map((s) => [s.tipoCafeId, txt(s.quantidade), s.fontes])).toEqual([['CD', '54.000', ['cd']], ['BOI', '40.500', ['boi']]]);
    expect(txt(r.saida)).toBe('94.500');
  });

  it('RN-10 RN-11 conversão no estoque: kg informado e rendimento kg/medida, sem quebra', () => {
    const r = calcularResultado({
      modelo: 'CONVERSAO_ESTOQUE', unidadeEntrada: 'MEDIDA',
      entradas: [{ id: 'a', quantidade: '51.300', tipoCafeId: 'CD' }, { id: 'b', quantidade: '38.475', tipoCafeId: 'BOI' }],
      parametros: { modelo: 'CONVERSAO_ESTOQUE', lotes: [{ quantidade: '1200', peneiraId: 'P17' }] },
    });
    expect(r.rendimento!.toString()).toBe('13.367');
    expect(r.percQuebra).toBeNull();
    expect(() => calcularResultado({ modelo: 'CONVERSAO_ESTOQUE', unidadeEntrada: 'MEDIDA', entradas, parametros: { modelo: 'CONVERSAO_ESTOQUE', lotes: [{ quantidade: '0' }] } })).toThrow(/maior que zero/);
  });

  it('RN-10 quebra = (entrada − saídas) / entrada; por peneira não passa da entrada', () => {
    expect(quebra(150, 135).toString()).toBe('0.1');
    expect(rendimento(1200, '89.775').toString()).toBe('13.367');
    const kg = [{ id: 'k', quantidade: '1000', tipoCafeId: null }];
    const r = calcularResultado({ modelo: 'POR_PENEIRA', unidadeEntrada: 'KG', entradas: kg, parametros: { modelo: 'POR_PENEIRA', lotes: [{ quantidade: '600', peneiraId: '17' }, { quantidade: '350', peneiraId: '15' }] } });
    expect(r.percQuebra!.toString()).toBe('0.05');
    expect(() => calcularResultado({ modelo: 'POR_PENEIRA', unidadeEntrada: 'KG', entradas: kg, parametros: { modelo: 'POR_PENEIRA', lotes: [{ quantidade: '1001', peneiraId: '17' }] } })).toThrow(ErroRegra);
  });
});

describe('certificação herdada (RN-08)', () => {
  const cf: CertificadoFazenda[] = [
    { fazendaId: 'NS', certificadoId: 'RFA', validadeInicio: '2025-01-01', validadeFim: '2027-12-31', status: 'VALIDO' },
    { fazendaId: 'BV', certificadoId: 'RFA', validadeInicio: '2025-01-01', validadeFim: '2025-12-31', status: 'VALIDO' },
    { fazendaId: 'NS', certificadoId: '4C', validadeInicio: '2025-01-01', validadeFim: '2027-12-31', status: 'SUSPENSO' },
  ];
  it('RN-08 interseção das origens, limitada às fazendas com o certificado válido na data', () => {
    expect([...certificadosHerdados({ origens: [new Set(['RFA']), new Set(['RFA', '4C'])], fazendas: ['NS'], certificadosFazendas: cf, data: '2026-06-01' })]).toEqual(['RFA']);
    expect([...certificadosHerdados({ origens: [new Set(['RFA']), new Set(['RFA'])], fazendas: ['NS', 'BV'], certificadosFazendas: cf, data: '2026-06-01' })]).toEqual([]);
    expect([...certificadosHerdados({ origens: [new Set(['RFA']), new Set()], fazendas: ['NS'], certificadosFazendas: cf, data: '2026-06-01' })]).toEqual([]);
  });
  it('RN-08 não se acrescenta certificado que a regra não permite', () => {
    expect(() => conferirCertificadosEscolhidos(new Set(['RFA']), ['RFA', 'AAA'], (c) => c)).toThrow(/AAA/);
    expect(() => conferirCertificadosEscolhidos(new Set(['RFA']), [], (c) => c)).not.toThrow();
  });
});
