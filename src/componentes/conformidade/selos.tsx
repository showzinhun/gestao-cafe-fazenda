import { Selo } from '@/componentes/ui/selo';

const EUDR: Record<string, { rotulo: string; tipo: 'ok' | 'aviso' | 'erro' | 'neutro' }> = {
  APTO: { rotulo: 'Apto EUDR', tipo: 'ok' }, PENDENTE: { rotulo: 'Pendente', tipo: 'aviso' }, BLOQUEADO: { rotulo: 'Bloqueado', tipo: 'erro' },
};
export function SeloEudr({ situacao }: { situacao: string }) {
  const s = EUDR[situacao] ?? { rotulo: situacao, tipo: 'neutro' as const };
  return <Selo tipo={s.tipo}>{s.rotulo}</Selo>;
}

const CERT: Record<string, { rotulo: string; tipo: 'ok' | 'aviso' | 'erro' | 'neutro' }> = {
  VALIDO: { rotulo: 'Válido', tipo: 'ok' }, VENCIDO: { rotulo: 'Vencido', tipo: 'erro' }, SUSPENSO: { rotulo: 'Suspenso', tipo: 'erro' }, FUTURO: { rotulo: 'A partir de', tipo: 'neutro' },
};
export function SeloCertificado({ situacao, dias }: { situacao: string; dias?: number }) {
  const s = CERT[situacao] ?? { rotulo: situacao, tipo: 'neutro' as const };
  const vencendo = situacao === 'VALIDO' && dias !== undefined && dias <= 60;
  return <Selo tipo={vencendo ? 'aviso' : s.tipo}>{vencendo ? `Vence em ${dias} d` : s.rotulo}</Selo>;
}

const CHECAGEM: Record<string, { rotulo: string; tipo: 'ok' | 'aviso' | 'erro' | 'neutro' }> = {
  SEM_ALERTA: { rotulo: 'Sem alerta', tipo: 'ok' }, ALERTA: { rotulo: 'Alerta', tipo: 'erro' }, INCONCLUSIVO: { rotulo: 'Inconclusiva', tipo: 'aviso' }, ERRO: { rotulo: 'Erro', tipo: 'aviso' },
};
export function SeloChecagem({ resultado }: { resultado: string }) {
  const s = CHECAGEM[resultado] ?? { rotulo: resultado, tipo: 'neutro' as const };
  return <Selo tipo={s.tipo}>{s.rotulo}</Selo>;
}
