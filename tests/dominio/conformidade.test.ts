import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import type { Polygon } from 'geojson';
import { ErroRegra } from '@/dominio/erros';
import { esquemasDe, exigirMotivoQuebra, exigirMotivoRebaixamento, exigirVenda, faixaVencimento, limiteQuebraServico, rebaixamentos, situacaoCertificado } from '@/dominio/certificacao';
import { exigirDossieSemPendencias, exigirLoteEudr, pendenciasDoTalhao, situacaoEudr, sobreposicoes, type TalhaoEudr } from '@/dominio/eudr';
import { codigoEmbarque, composicaoDoEmbarque, hashConteudo, jsonCanonico, montarPacote } from '@/dominio/pacote';

const quadrado = (x: number, y: number, lado: number): Polygon => ({
  type: 'Polygon', coordinates: [[[x, y], [x + lado, y], [x + lado, y + lado], [x, y + lado], [x, y]]],
});
const talhao = (p: Partial<TalhaoEudr> = {}): TalhaoEudr => ({
  id: 't1', codigo: 'T1', fazenda: 'NS', geometriaTipo: 'POLIGONO', geometriaHash: 'h1', areaHa: '12',
  ultimaChecagem: { resultado: 'SEM_ALERTA', dataChecagem: '2026-11-01', versaoGeometriaHash: 'h1' }, ...p,
});
const codigo = (f: () => unknown) => { try { f(); } catch (e) { return e instanceof ErroRegra ? e.codigo : String(e); } return null; };

describe('EUDR (§10)', () => {
  it('talhão com polígono e checagem SEM_ALERTA vigente é apto', () => {
    expect(pendenciasDoTalhao(talhao())).toEqual([]);
    expect(situacaoEudr(talhao())).toBe('APTO');
  });

  it('talhão de 5 ha com PONTO é inválido para a EUDR', () => {
    const t = talhao({ geometriaTipo: 'PONTO', areaHa: '5' });
    expect(pendenciasDoTalhao(t)[0]?.tipo).toBe('PONTO_ACIMA_4HA');
    expect(situacaoEudr(t)).toBe('BLOQUEADO');
    expect(pendenciasDoTalhao(talhao({ geometriaTipo: 'PONTO', areaHa: '3.5' }))).toEqual([]);
  });

  it('checagem de outra versão da geometria não vale (precisa refazer)', () => {
    const t = talhao({ geometriaHash: 'h2' });
    expect(pendenciasDoTalhao(t)[0]?.tipo).toBe('CHECAGEM_DESATUALIZADA');
    expect(situacaoEudr(t)).toBe('PENDENTE');
    expect(pendenciasDoTalhao(talhao({ ultimaChecagem: null }))[0]?.tipo).toBe('SEM_CHECAGEM');
  });

  it('RN-18 bloqueia lote com alerta de desmatamento', () => {
    const t2 = talhao({ id: 't2', codigo: 'T2', ultimaChecagem: { resultado: 'ALERTA', dataChecagem: '2026-11-02', versaoGeometriaHash: 'h1' } });
    expect(codigo(() => exigirLoteEudr('AR-1', [talhao(), t2]))).toBe('RN-18');
  });

  it('RN-18 bloqueia lote com talhão sem geometria, mas não por falta de checagem', () => {
    expect(codigo(() => exigirLoteEudr('AR-1', [talhao({ geometriaTipo: null, geometriaHash: null })]))).toBe('RN-18');
    expect(codigo(() => exigirLoteEudr('AR-1', [talhao({ ultimaChecagem: null })]))).toBeNull();
  });

  it('RN-18 o embarque não finaliza com pendência no dossiê', () => {
    expect(codigo(() => exigirDossieSemPendencias(pendenciasDoTalhao(talhao({ ultimaChecagem: null }))))).toBe('RN-18');
    expect(codigo(() => exigirDossieSemPendencias([]))).toBeNull();
  });

  it('sobreposição de polígonos entre produtores gera alerta com a área', () => {
    const a = quadrado(-46, -21, 0.01);
    const sob = sobreposicoes(a, [
      { id: 'b', codigo: 'X1', fazenda: 'OUT', geometria: quadrado(-45.995, -21, 0.01) },
      { id: 'c', codigo: 'X2', fazenda: 'OUT', geometria: quadrado(-45.9, -21, 0.01) },
    ]);
    expect(sob.map((s) => s.id)).toEqual(['b']);
    expect(Number(sob[0]!.areaHa)).toBeGreaterThan(50);
  });
});

describe('certificados e rebaixamento', () => {
  it('certificados são comparados por esquema', () => {
    expect([...esquemasDe(['RFA + AAA', 'rfa'])].sort()).toEqual(['AAA', 'RFA']);
  });

  it('RN-28 blend de RFA com convencional rebaixa 100 kg de RFA e exige motivo', () => {
    const linhas = rebaixamentos([
      { loteId: 'a', codigo: 'A', kg: '100', esquemas: new Set(['RFA']) },
      { loteId: 'b', codigo: 'B', kg: '100', esquemas: new Set() },
    ], new Set());
    expect(linhas).toHaveLength(1);
    expect(linhas[0]!.kg.toString()).toBe('100');
    expect(linhas[0]!.perdidos).toEqual(['RFA']);
    expect(codigo(() => exigirMotivoRebaixamento(linhas, ''))).toBe('RN-28');
    expect(exigirMotivoRebaixamento(linhas, 'Blend com café convencional')).toBe('Blend com café convencional');
    expect(exigirMotivoRebaixamento([], null)).toBeNull();
  });

  it('RN-28 vender como RFA exige RFA em todos os lotes; o contrato exige o que vende (RN-17)', () => {
    const lotes = [{ codigo: 'AR', esquemas: new Set(['RFA']) }];
    expect(codigo(() => exigirVenda(lotes, new Set(['RFA']), new Set(['RFA'])))).toBeNull();
    expect(codigo(() => exigirVenda(lotes, new Set(['RFA', 'AAA']), new Set()))).toBe('RN-28');
    expect(codigo(() => exigirVenda(lotes, new Set(), new Set(['RFA'])))).toBe('RN-17');
  });

  it('situação e faixas de vencimento do certificado (60, 30, 7 dias)', () => {
    expect(situacaoCertificado({ status: 'VALIDO', validadeInicio: '2026-01-01', validadeFim: '2026-12-31' }, '2026-11-21')).toBe('VALIDO');
    expect(situacaoCertificado({ status: 'VALIDO', validadeInicio: '2025-01-01', validadeFim: '2025-12-31' }, '2026-11-21')).toBe('VENCIDO');
    expect(situacaoCertificado({ status: 'SUSPENSO', validadeInicio: '2026-01-01', validadeFim: '2026-12-31' }, '2026-11-21')).toBe('SUSPENSO');
    expect([faixaVencimento(90), faixaVencimento(45), faixaVencimento(30), faixaVencimento(10), faixaVencimento(7), faixaVencimento(-1)]).toEqual([null, 60, 30, 30, 7, null]);
  });

  it('RN-31 quebra acima do limite do tipo de serviço exige motivo', () => {
    const cfg = { limite_quebra_servico: { CATACAO: '0.05' } };
    const limite = limiteQuebraServico(cfg, 'CATACAO');
    expect(limite?.toString()).toBe('0.05');
    expect(limiteQuebraServico(cfg, 'BLEND')).toBeNull();
    expect(codigo(() => exigirMotivoQuebra({ percQuebra: '0.08', limite, tipo: 'CATACAO' }))).toBe('RN-31');
    expect(exigirMotivoQuebra({ percQuebra: '0.04', limite, tipo: 'CATACAO' })).toBeNull();
    expect(exigirMotivoQuebra({ percQuebra: '0.08', limite, tipo: 'CATACAO', motivo: 'Muito grão quebrado' })).toBe('Muito grão quebrado');
  });
});

describe('dossiê e pacote (§10, §17)', () => {
  it('composição do embarque: 900 kg do lote AR → T1 600 kg e T2 300 kg', () => {
    const p = composicaoDoEmbarque([{ kg: '900', talhoes: [{ talhaoId: 'T1', percentual: '0.6666666667' }, { talhaoId: 'T2', percentual: '0.3333333333' }] }]);
    expect(p.map((x) => [x.talhaoId, x.kg.toString(), x.percentual.toString()])).toEqual([['T1', '600', '0.6667'], ['T2', '300', '0.3333']]);
    expect(p.reduce((s, x) => s.plus(x.kg), new Decimal(0)).toString()).toBe('900');
  });

  it('JSON canônico não depende da ordem das chaves', () => {
    expect(jsonCanonico({ b: 1, a: { d: [1, { y: 2, x: 1 }], c: null } })).toBe(jsonCanonico({ a: { c: null, d: [1, { x: 1, y: 2 }] }, b: 1 }));
  });

  it('RN-30 pacote com formato, versão e hash SHA-256 do conteúdo', () => {
    const p = montarPacote({
      versao: 1, geradoEm: new Date('2026-11-20T17:00:00Z'),
      emitente: { nome: 'Alfa', cnpj_cpf: null, ie: null }, destinatario: { nome: 'Exportadora', cnpj_cpf: null },
      embarque: { codigo: codigoEmbarque('EB', 'NS', '2025/26', 1), data: '2026-11-20', contrato: 'CT-2026-0001', placa: 'ABC1D23', motorista: null, lacres: ['L1'], peso_liquido_kg: '905' },
      notas: [{ numero: '1234', serie: '1', chave_nfe: null, data_emissao: '2026-11-20', kg: '900' }],
      lotes: [{ codigo: 'AR', kg: '900', safra: '2025/26', peneira: '17', padrao: null, tipo: 'NAT', certificados: ['RFA'], certificado_vendido: 'RFA', rebaixamentos: [],
        composicao: [{ fazenda: 'NS', talhao: 'T1', percentual: '0.66666', kg: '600' }, { fazenda: 'NS', talhao: 'T2', percentual: '0.33333', kg: '300' }] }],
      fazendas: [], eudr: { numero_dds: null, talhoes_sem_pendencia: true },
    });
    expect(p.formato).toBe('cafe-pacote-embarque');
    expect(p.versao_formato).toBe(1);
    expect(p.embarque.codigo).toBe('EB-NS-2526-000001');
    expect(p.gerado_em).toBe('2026-11-20T14:00:00-03:00');
    expect(p.lotes[0]!.sacas).toBe(15);
    expect(p.lotes[0]!.composicao[0]).toEqual({ fazenda: 'NS', talhao: 'T1', percentual: 0.6667, kg: 600 });
    expect(p.hash_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(hashConteudo(p)).toBe(p.hash_sha256);
    expect(hashConteudo({ ...p, notas: [] })).not.toBe(p.hash_sha256);
  });
});
