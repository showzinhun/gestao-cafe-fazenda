import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { cnpjValido, cpfValido, formatarCpfCnpj, normalizarPlaca, placaValida } from '@/dominio/documentos';
import { GeometriaInvalida, processarGeometria } from '@/dominio/geometria';
import { permissoesDoPerfil } from '@/dominio/permissoes';
import { precoVigente, vigenciasSobrepostas, type PrecoColheita } from '@/dominio/precos';
import { retangulo, SEED } from '../../prisma/dados-seed';

describe('documentos', () => {
  it('valida CPF e CNPJ pelos dígitos verificadores', () => {
    expect(cpfValido('123.456.789-09')).toBe(true);
    expect(cpfValido('123.456.789-00')).toBe(false);
    expect(cpfValido('111.111.111-11')).toBe(false);
    expect(cnpjValido('11.222.333/0001-81')).toBe(true);
    expect(cnpjValido('11.222.333/0001-80')).toBe(false);
    expect(formatarCpfCnpj('12345678909')).toBe('123.456.789-09');
  });
  it('placa antiga e Mercosul', () => {
    expect(normalizarPlaca('abc-1234')).toBe('ABC1234');
    expect(placaValida('ABC1D23')).toBe(true);
    expect(placaValida('AB12345')).toBe(false);
  });
});

describe('geometria do talhão', () => {
  it('calcula a área do polígono em hectares (T1 ≈ 12 ha)', () => {
    const t1 = SEED.talhoes.find((t) => t.codigo === 'T1')!;
    const r = processarGeometria(t1.geometria, '12');
    expect(r.tipo).toBe('POLIGONO');
    expect(new Decimal(r.areaHa!).minus(12).abs().lt(0.2)).toBe(true);
    expect(r.avisos).toEqual([]);
  });
  it('aceita Feature e FeatureCollection, e avisa quando a área difere mais de 10% da informada', () => {
    const g = retangulo(-46.99, -18.94, 400, 300);
    const r = processarGeometria({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: g }] }, '20');
    expect(r.avisos.join(' ')).toMatch(/difere/i);
  });
  it('recusa polígono que se cruza ou coordenada fora do mundo', () => {
    const laco = { type: 'Polygon', coordinates: [[[0, 0], [1, 1], [1, 0], [0, 1], [0, 0]]] };
    expect(() => processarGeometria(laco)).toThrow(GeometriaInvalida);
    expect(() => processarGeometria({ type: 'Point', coordinates: [200, 10] })).toThrow(GeometriaInvalida);
  });
  it('ponto em talhão grande gera aviso (EUDR pede polígono acima de 4 ha)', () => {
    const r = processarGeometria({ type: 'Point', coordinates: [-46.99, -18.94] }, '12');
    expect(r.tipo).toBe('PONTO');
    expect(r.avisos.join(' ')).toMatch(/4 ha/);
  });
});

describe('tabela de preços de colheita', () => {
  const base: Omit<PrecoColheita, 'id' | 'fazendaId' | 'talhaoId' | 'valorPorMedida'> = { safraId: 's', tipoColheita: 'MANUAL', vigenciaInicio: '2025-05-01', vigenciaFim: null, ativo: true };
  const precos: PrecoColheita[] = [
    { ...base, id: 'empresa', fazendaId: null, talhaoId: null, valorPorMedida: '10' },
    { ...base, id: 'fazenda', fazendaId: 'NS', talhaoId: null, valorPorMedida: '12' },
    { ...base, id: 'talhao', fazendaId: 'NS', talhaoId: 'T1', valorPorMedida: '13' },
  ];
  it('o mais específico vence: talhão > fazenda > empresa', () => {
    const q = { data: '2025-06-10', safraId: 's', tipoColheita: 'MANUAL' as const, fazendaId: 'NS', talhaoId: 'T1' };
    expect(precoVigente(precos, q)?.id).toBe('talhao');
    expect(precoVigente(precos, { ...q, talhaoId: 'T2' })?.id).toBe('fazenda');
    expect(precoVigente(precos, { ...q, fazendaId: 'BV', talhaoId: 'X' })?.id).toBe('empresa');
    expect(precoVigente(precos, { ...q, data: '2025-04-30' })).toBeNull();
  });
  it('vigências sobrepostas no mesmo escopo', () => {
    expect(vigenciasSobrepostas({ vigenciaInicio: '2025-05-01', vigenciaFim: '2025-06-30' }, { vigenciaInicio: '2025-06-30', vigenciaFim: null })).toBe(true);
    expect(vigenciasSobrepostas({ vigenciaInicio: '2025-05-01', vigenciaFim: '2025-06-29' }, { vigenciaInicio: '2025-06-30', vigenciaFim: null })).toBe(false);
  });
});

describe('matriz de permissões', () => {
  it('ajuste da empresa liga e desliga permissões do perfil; administrador sempre pode tudo', () => {
    const ajustado = permissoesDoPerfil('OPERADOR', { OPERADOR: { 'cadastros.editar': true, 'movimento.lancar': false } });
    expect(ajustado).toContain('cadastros.editar');
    expect(ajustado).not.toContain('movimento.lancar');
    const admin = permissoesDoPerfil('ADMIN_EMPRESA', { ADMIN_EMPRESA: { 'usuarios.gerenciar': false } });
    expect(admin).toContain('usuarios.gerenciar');
  });
});
