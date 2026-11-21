/** Dados fictícios do seed (regra 13), usados também pelos testes. */
export const SEED = {
  senha: 'senha123',
  empresas: {
    alfa: { id: '0b5d6b8e-1a11-4c4a-9a10-000000000a1f', nome: 'Alfa Agro (fictícia)', cnpj: '00.000.000/0001-91' },
    beta: { id: '0b5d6b8e-1a11-4c4a-9a10-000000000be7', nome: 'Beta Cafés (fictícia)', cnpj: '00.000.000/0002-72' },
  },
  fazendas: [
    { id: '7f1e0c2a-5d3b-4e6f-8a90-0000000000a1', empresa: 'alfa', codigo: 'NS', nome: 'Fazenda Nascente', municipio: 'Patrocínio', uf: 'MG' },
    { id: '7f1e0c2a-5d3b-4e6f-8a90-0000000000a2', empresa: 'alfa', codigo: 'BV', nome: 'Sítio Boa Vista', municipio: 'Coromandel', uf: 'MG' },
    { id: '7f1e0c2a-5d3b-4e6f-8a90-0000000000b1', empresa: 'beta', codigo: 'SL', nome: 'Fazenda Serra Leste', municipio: 'Três Pontas', uf: 'MG' },
  ],
  usuarios: [
    { id: 'c3a1d2e4-0000-4000-8000-00000000a001', nome: 'Ana Admin', email: 'admin@alfa.exemplo', vinculos: [['alfa', 'ADMIN_EMPRESA']] },
    { id: 'c3a1d2e4-0000-4000-8000-00000000a002', nome: 'Otávio Operador', email: 'operador@alfa.exemplo', vinculos: [['alfa', 'OPERADOR']] },
    { id: 'c3a1d2e4-0000-4000-8000-00000000b001', nome: 'Bruno Admin', email: 'admin@beta.exemplo', vinculos: [['beta', 'ADMIN_EMPRESA']] },
    { id: 'c3a1d2e4-0000-4000-8000-00000000c001', nome: 'Carla Consultora', email: 'consultora@exemplo.com', vinculos: [['alfa', 'GESTOR'], ['beta', 'CONSULTA']] },
  ],
} as const;
