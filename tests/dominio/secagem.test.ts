import { describe, expect, it } from 'vitest';
import { previsaoPonto, situacaoSecagem, tendencia } from '@/dominio/secagem';

const t = (h: number) => new Date(Date.UTC(2026, 5, 1, 8) + h * 3_600_000);
const base = { ocupado: true, metaMin: '11', metaMax: '12.5', diasDesdeEntrada: 2, horasSemLeitura: 3, limiteDias: 5, limiteHorasSemLeitura: 12 };

describe('previsão de ponto (§7)', () => {
  it('precisa de 3 leituras e de umidade caindo', () => {
    expect(previsaoPonto([{ dataHora: t(0), umidade: 55 }, { dataHora: t(12), umidade: 40 }], '12.5')).toBeNull();
    expect(previsaoPonto([{ dataHora: t(0), umidade: 20 }, { dataHora: t(12), umidade: 21 }, { dataHora: t(24), umidade: 22 }], '12.5')).toBeNull();
  });
  it('regressão log-linear das 3 últimas leituras (passo 5: 55 → 40 → 28 → 18)', () => {
    const p = previsaoPonto([55, 40, 28, 18].map((u, i) => ({ dataHora: t(i * 12), umidade: u })), '12.5')!;
    expect(p.horas).toBeGreaterThan(6);
    expect(p.horas).toBeLessThan(14);
    expect(previsaoPonto([55, 40, 28, 18, 12].map((u, i) => ({ dataHora: t(i * 12), umidade: u })), '12.5')!.horas).toBe(0);
  });
});

describe('situação do cartão (§7)', () => {
  it('livre, secando, no ponto e atenção', () => {
    expect(situacaoSecagem({ ...base, ocupado: false, ultimaUmidade: null }).situacao).toBe('LIVRE');
    expect(situacaoSecagem({ ...base, ultimaUmidade: '28' }).situacao).toBe('SECANDO');
    expect(situacaoSecagem({ ...base, ultimaUmidade: '12.0' }).situacao).toBe('NO_PONTO');
    expect(situacaoSecagem({ ...base, ultimaUmidade: '28', diasDesdeEntrada: 6 })).toMatchObject({ situacao: 'ATENCAO' });
    expect(situacaoSecagem({ ...base, ultimaUmidade: '28', horasSemLeitura: 20 }).motivos[0]).toMatch(/sem leitura há 20 h/);
    expect(situacaoSecagem({ ...base, ultimaUmidade: '10' }).motivos).toContain('umidade abaixo da meta (passou do ponto)');
  });
  it('tendência da umidade', () => {
    expect(tendencia([{ dataHora: t(0), umidade: 40 }, { dataHora: t(1), umidade: 28 }])).toBe('caindo');
    expect(tendencia([{ dataHora: t(0), umidade: 12 }, { dataHora: t(1), umidade: 12.1 }])).toBe('estavel');
  });
});
