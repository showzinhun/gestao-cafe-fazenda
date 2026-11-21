import type { Metadata } from 'next';
import { exigirContexto } from '@/lib/contexto';
import { dadosDoCampo } from '@/servicos/colhedores';
import { permissoesDoPerfil } from '@/dominio/permissoes';
import { Apontamento } from '@/componentes/campo/apontamento';

export const metadata: Metadata = { title: 'Apontamento' };

/** Apontamento de colheita (§6.1). Os dados vêm do servidor quando há sinal e ficam no aparelho para usar sem sinal. */
export default async function PaginaApontar() {
  const ctx = await exigirContexto();
  const pode = (ctx.permissoes ?? permissoesDoPerfil(ctx.perfil)).includes('apontamento.lancar');
  if (!pode) return <p className="text-tinta-2">Seu perfil não lança apontamentos de colheita.</p>;
  const dados = await dadosDoCampo(ctx);
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  return <Apontamento empresaId={ctx.empresaId} dadosServidor={dados} hoje={hoje} />;
}
