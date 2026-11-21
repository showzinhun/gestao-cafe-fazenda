import { Selo } from '@/componentes/ui/selo';

const STATUS: Record<string, { rotulo: string; tipo: 'ok' | 'aviso' | 'erro' | 'neutro' }> = {
  RASCUNHO: { rotulo: 'Rascunho', tipo: 'neutro' },
  ASSINADO: { rotulo: 'Assinado', tipo: 'aviso' },
  EM_EXECUCAO: { rotulo: 'Em execução', tipo: 'aviso' },
  CONCLUIDO: { rotulo: 'Concluído', tipo: 'ok' },
  CANCELADO: { rotulo: 'Cancelado', tipo: 'erro' },
};
export function SeloContrato({ status }: { status: string }) {
  const s = STATUS[status] ?? { rotulo: status, tipo: 'neutro' as const };
  return <Selo tipo={s.tipo}>{s.rotulo}</Selo>;
}
