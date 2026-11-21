import { describe, expect, it } from 'vitest';
import { apontadorPodeCorrigir, calcularItem, divergenciaCarga, mascararCpf, mascararPix } from '@/dominio/colheita';

describe('dados pessoais (§3.3)', () => {
  it('mascara CPF e chave PIX', () => {
    expect(mascararCpf('390.533.447-05')).toBe('***.***.447-05');
    expect(mascararPix('joao.ficticio@exemplo.com')).toBe('jo***@exemplo.com');
    expect(mascararPix('+55 35 90000-0003')).toBe('***0003');
    expect(mascararPix('9b1f2c3d-aaaa-bbbb-cccc-123456789abc')).toBe('9b1f…9abc');
  });
});

describe('carga e divergência (§6.2)', () => {
  it('divergência = medido − apontado; alerta acima do limite', () => {
    expect(divergenciaCarga(100, 100)).toMatchObject({ alerta: false });
    const d = divergenciaCarga(108, 100, '0.05');
    expect([d.diferenca.toString(), d.perc!.toString(), d.alerta]).toEqual(['8', '0.08', true]);
    expect(divergenciaCarga(50, 0).perc).toBeNull();
  });
});

describe('pagamento (§6.3)', () => {
  it('item = medidas × preço + adicionais − adiantamentos − descontos', () => {
    const joao = calcularItem({ apontamentos: [{ medidas: '40', valorUnitario: '12.00' }], lancamentos: [] });
    expect(joao.liquido.toString()).toBe('480');
    const r = calcularItem({
      apontamentos: [{ medidas: '10.5', valorUnitario: '12.00' }, { medidas: '3', valorUnitario: '13.00' }],
      lancamentos: [{ tipo: 'ADIANTAMENTO', valor: '50' }, { tipo: 'DESCONTO', valor: '5.5' }, { tipo: 'ADICIONAL', valor: '20' }],
    });
    expect([r.medidas.toString(), r.bruto.toString(), r.liquido.toString()]).toEqual(['13.5', '165', '129.5']);
  });

  it('RN-19 o apontador só corrige no mesmo dia', () => {
    expect(apontadorPodeCorrigir('2026-06-10', '2026-06-10')).toBe(true);
    expect(apontadorPodeCorrigir('2026-06-09', '2026-06-10')).toBe(false);
  });
});
