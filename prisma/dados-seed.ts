/** Dados fictícios do seed (regra 13), usados também pelos testes. Cenário §15, Preparação. */

/** Retângulo (polígono fechado) com largura e altura em metros, a partir do canto noroeste. */
export function retangulo(lon: number, lat: number, larguraM: number, alturaM: number) {
  const dLon = larguraM / (111320 * Math.cos((lat * Math.PI) / 180));
  const dLat = alturaM / 110574;
  const r = (n: number) => Math.round(n * 1e6) / 1e6;
  const a = [r(lon), r(lat)];
  const b = [r(lon + dLon), r(lat)];
  const c = [r(lon + dLon), r(lat - dLat)];
  const d = [r(lon), r(lat - dLat)];
  return { type: 'Polygon' as const, coordinates: [[a, b, c, d, a]] };
}

export const SEED = {
  senha: 'senha123',
  empresas: {
    alfa: { id: '0b5d6b8e-1a11-4c4a-9a10-000000000a1f', nome: 'Alfa Agro (fictícia)', cnpj: '11.222.333/0001-81', modelo: 'VIA_UMIDA' },
    beta: { id: '0b5d6b8e-1a11-4c4a-9a10-000000000be7', nome: 'Beta Cafés (fictícia)', cnpj: '44.555.666/0001-81', modelo: 'SIMPLIFICADO' },
  },
  parceiros: [
    { id: '5a7c0000-0000-4000-8000-0000000000a1', empresa: 'alfa', tipoPessoa: 'F', nome: 'José Nascente (fictício)', cpfCnpj: '123.456.789-09', papeis: ['PRODUTOR'] },
    { id: '5a7c0000-0000-4000-8000-0000000000a2', empresa: 'alfa', tipoPessoa: 'J', nome: 'Exportadora Exemplo Ltda (fictícia)', cpfCnpj: '77.888.999/0001-81', papeis: ['CLIENTE'] },
    { id: '5a7c0000-0000-4000-8000-0000000000a3', empresa: 'alfa', tipoPessoa: 'F', nome: 'Transportes Silva (fictício)', cpfCnpj: '987.654.321-00', papeis: ['TRANSPORTADOR'] },
    { id: '5a7c0000-0000-4000-8000-0000000000b1', empresa: 'beta', tipoPessoa: 'F', nome: 'Maria Serra (fictícia)', cpfCnpj: '111.444.777-35', papeis: ['PRODUTOR'] },
  ],
  fazendas: [
    { id: '7f1e0c2a-5d3b-4e6f-8a90-0000000000a1', empresa: 'alfa', codigo: 'NS', nome: 'Fazenda Nascente', produtor: '5a7c0000-0000-4000-8000-0000000000a1', municipio: 'Patrocínio', uf: 'MG', car: 'MG-3148103-FICTICIO-NS' },
    { id: '7f1e0c2a-5d3b-4e6f-8a90-0000000000a2', empresa: 'alfa', codigo: 'BV', nome: 'Sítio Boa Vista', produtor: '5a7c0000-0000-4000-8000-0000000000a1', municipio: 'Coromandel', uf: 'MG', car: null },
    { id: '7f1e0c2a-5d3b-4e6f-8a90-0000000000b1', empresa: 'beta', codigo: 'SL', nome: 'Fazenda Serra Leste', produtor: '5a7c0000-0000-4000-8000-0000000000b1', municipio: 'Três Pontas', uf: 'MG', car: null },
  ],
  talhoes: [
    { id: '9d000000-0000-4000-8000-0000000000a1', fazenda: '7f1e0c2a-5d3b-4e6f-8a90-0000000000a1', codigo: 'T1', nome: 'Talhão 1', areaHaInformada: '12', variedade: 'Catuaí Vermelho', geometria: retangulo(-46.99, -18.94, 400, 300) },
    { id: '9d000000-0000-4000-8000-0000000000a2', fazenda: '7f1e0c2a-5d3b-4e6f-8a90-0000000000a1', codigo: 'T2', nome: 'Talhão 2', areaHaInformada: '8', variedade: 'Mundo Novo', geometria: retangulo(-46.99, -18.9435, 400, 200) },
  ],
  safra: { codigo: '2025/26', dataInicio: '2025-05-01', dataFim: '2026-04-30' },
  usuarios: [
    { id: 'c3a1d2e4-0000-4000-8000-00000000a001', nome: 'Ana Admin', email: 'admin@alfa.exemplo', vinculos: [['alfa', 'ADMIN_EMPRESA']] },
    { id: 'c3a1d2e4-0000-4000-8000-00000000a002', nome: 'Otávio Operador', email: 'operador@alfa.exemplo', vinculos: [['alfa', 'OPERADOR']] },
    { id: 'c3a1d2e4-0000-4000-8000-00000000b001', nome: 'Bruno Admin', email: 'admin@beta.exemplo', vinculos: [['beta', 'ADMIN_EMPRESA']] },
    { id: 'c3a1d2e4-0000-4000-8000-00000000c001', nome: 'Carla Consultora', email: 'consultora@exemplo.com', vinculos: [['alfa', 'GESTOR'], ['beta', 'CONSULTA']] },
    { id: 'c3a1d2e4-0000-4000-8000-00000000a003', nome: 'Paulo Apontador', email: 'apontador@alfa.exemplo', vinculos: [['alfa', 'APONTADOR']] },
    { id: 'c3a1d2e4-0000-4000-8000-00000000a004', nome: 'Fátima Financeiro', email: 'financeiro@alfa.exemplo', vinculos: [['alfa', 'FINANCEIRO']] },
  ],
  /** Fazendas liberadas para quem não é administrador (RN-04). */
  acessos: [
    ['c3a1d2e4-0000-4000-8000-00000000a003', '7f1e0c2a-5d3b-4e6f-8a90-0000000000a1'],
    ['c3a1d2e4-0000-4000-8000-00000000a004', '7f1e0c2a-5d3b-4e6f-8a90-0000000000a1'],
  ],
  /** §15: turma A da NS com João, Maria e Pedro (dados fictícios). */
  turmas: [{ id: '7a000000-0000-4000-8000-0000000000a1', fazenda: '7f1e0c2a-5d3b-4e6f-8a90-0000000000a1', nome: 'Turma A', responsavel: 'Sebastião (fictício)' }],
  colhedores: [
    { id: 'c0000000-0000-4000-8000-0000000000a1', turma: '7a000000-0000-4000-8000-0000000000a1', nome: 'João da Silva (fictício)', apelido: 'João', cpf: '390.533.447-05', pix: 'joao.ficticio@exemplo.com' },
    { id: 'c0000000-0000-4000-8000-0000000000a2', turma: '7a000000-0000-4000-8000-0000000000a1', nome: 'Maria de Souza (fictícia)', apelido: 'Maria', cpf: '275.484.389-23', pix: 'maria.ficticia@exemplo.com' },
    { id: 'c0000000-0000-4000-8000-0000000000a3', turma: '7a000000-0000-4000-8000-0000000000a1', nome: 'Pedro Lima (fictício)', apelido: 'Pedro', cpf: '714.602.380-01', pix: '+55 35 90000-0003' },
  ],
} as const;
