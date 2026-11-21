import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { ErroRegra } from '@/dominio/erros';
import { codigoFazendaValido, normalizarCodigoFazenda } from '@/dominio/fazenda';
import { pode, PERFIS } from '@/dominio/perfis';
import { kgParaSacas, qtd } from '@/dominio/quantidade';
import { formatarData, formatarNumero } from '@/lib/formatacao';

describe('erros de regra', () => {
  it('carrega o código RN para a resposta 422', () => {
    const e = new ErroRegra('RN-07', 'Reserva maior que o saldo.');
    expect(e.codigo).toBe('RN-07');
    expect(e.message).toBe('Reserva maior que o saldo.');
  });
});

describe('fazenda', () => {
  it('normaliza o código: sem acento, maiúsculo', () => {
    expect(normalizarCodigoFazenda(' sã ')).toBe('SA');
  });
  it('código tem de 2 a 4 letras', () => {
    expect(codigoFazendaValido('NS')).toBe(true);
    expect(codigoFazendaValido('ABCD')).toBe(true);
    expect(codigoFazendaValido('N')).toBe(false);
    expect(codigoFazendaValido('ABCDE')).toBe(false);
    expect(codigoFazendaValido('N1')).toBe(false);
  });
});

describe('perfis e permissões (§3.2)', () => {
  it('ADMIN_EMPRESA pode tudo', () => {
    expect(pode('ADMIN_EMPRESA', 'usuarios.gerenciar')).toBe(true);
  });
  it('CONSULTA não escreve nada', () => {
    expect(pode('CONSULTA', 'cadastros.editar')).toBe(false);
    expect(pode('CONSULTA', 'movimento.lancar')).toBe(false);
  });
  it('APONTADOR só aponta colheita', () => {
    expect(pode('APONTADOR', 'apontamento.lancar')).toBe(true);
    expect(pode('APONTADOR', 'movimento.lancar')).toBe(false);
  });
  it('todo perfil tem matriz definida', () => {
    for (const p of PERFIS) expect(() => pode(p, 'cadastros.editar')).not.toThrow();
  });
});

describe('quantidades com Decimal (regra 9)', () => {
  it('arredonda a 3 casas sem erro de ponto flutuante', () => {
    expect(qtd('0.1').plus(qtd('0.2')).equals(new Decimal('0.3'))).toBe(true);
    expect(qtd('1.23456').toString()).toBe('1.235');
  });
  it('converte kg em sacas de 60 kg', () => {
    expect(kgParaSacas('1200').toString()).toBe('20');
    expect(kgParaSacas('89.775').toString()).toBe('1.496');
  });
});

describe('formatação pt-BR (§12)', () => {
  it('números com milhar e vírgula', () => {
    expect(formatarNumero('1234.567')).toBe('1.234,567');
    expect(formatarNumero('1200')).toBe('1.200');
    expect(formatarNumero('-0.5')).toBe('-0,5');
  });
  it('datas dd/mm/aaaa no fuso de Brasília', () => {
    expect(formatarData(new Date('2026-11-20T02:00:00Z'))).toBe('19/11/2026');
  });
});
