import { describe, expect, it } from 'vitest';
import { codigoContrato, contratoCumprido, diasAte, diferencaPesagem, exigirCertificadosDoContrato, kgDoContrato, limiteDoEmbarque, peneiraAtende, resumoFixacoes } from '@/dominio/comercial';
import { ErroRegra } from '@/dominio/erros';

describe('contrato (§9)', () => {
  it('código, kg e conclusão com tolerância', () => {
    expect(codigoContrato(2026, 1)).toBe('CT-2026-0001');
    expect(kgDoContrato('15').toString()).toBe('900');
    expect(contratoCumprido({ quantidadeKg: 900, toleranciaPerc: 0, kgEmbarcado: 900 })).toBe(true);
    expect(contratoCumprido({ quantidadeKg: 900, toleranciaPerc: '0.05', kgEmbarcado: 855 })).toBe(true);
    expect(contratoCumprido({ quantidadeKg: 900, toleranciaPerc: '0.05', kgEmbarcado: 854 })).toBe(false);
    expect(limiteDoEmbarque({ quantidadeKg: 900, toleranciaPerc: '0.05', kgEmbarcado: 600 }).toString()).toBe('345');
  });

  it('RN-17 o lote precisa de todos os certificados exigidos', () => {
    expect(() => exigirCertificadosDoContrato({ codigo: 'AR-1', certificados: ['rfa'] }, [{ id: 'rfa', codigo: 'RFA' }])).not.toThrow();
    expect(() => exigirCertificadosDoContrato({ codigo: 'AR-1', certificados: ['rfa'] }, [{ id: 'rfa', codigo: 'RFA' }, { id: 'aaa', codigo: 'AAA' }])).toThrow(ErroRegra);
  });

  it('peneira mínima: 17 atende mínimo 16; 15 não; sem peneira não atende', () => {
    expect(peneiraAtende({ ordem: 30 }, { ordem: 40 })).toBe(true);
    expect(peneiraAtende({ ordem: 50 }, { ordem: 40 })).toBe(false);
    expect(peneiraAtende(null, { ordem: 40 })).toBe(false);
    expect(peneiraAtende(null, null)).toBe(true);
  });

  it('RN-27 pesagem: bruto 15.905 − tara 15.000 = 905; 0,56% > 0,5% exige motivo', () => {
    const d = diferencaPesagem({ bruto: '15905', tara: '15000', somaLotes: '900' });
    expect([d.liquido.toString(), d.diferenca.toString(), d.perc.toString(), d.exigeMotivo]).toEqual(['905', '5', '0.005556', true]);
    expect(diferencaPesagem({ bruto: '15904', tara: '15000', somaLotes: '900' }).exigeMotivo).toBe(false);
    expect(() => diferencaPesagem({ bruto: '100', tara: '100', somaLotes: '900' })).toThrow(/maior que a tara/);
  });

  it('fixações: sacas fixadas, preço médio e a fixar', () => {
    const r = resumoFixacoes([{ sacas: 5, precoPorSaca: '1800' }, { sacas: 10, precoPorSaca: '1900' }], 20);
    expect([r.fixadas.toString(), r.precoMedio!.toString(), r.aFixar.toString()]).toEqual(['15', '1866.67', '5']);
    expect(diasAte('2026-12-01', '2026-11-21')).toBe(10);
  });
});
