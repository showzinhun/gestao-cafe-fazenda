import type { Metadata } from 'next';
import { exigirContexto } from '@/lib/contexto';
import { movimentosEmSecagem } from '@/servicos/secagem';
import { permissoesDoPerfil } from '@/dominio/permissoes';
import { LeiturasCampo } from '@/componentes/campo/leituras';

export const metadata: Metadata = { title: 'Leituras de secagem' };
export const dynamic = 'force-dynamic';

/** Leituras de umidade pelo celular (§7), com ou sem sinal. */
export default async function PaginaLeiturasCampo() {
  const ctx = await exigirContexto();
  const p = ctx.permissoes ?? permissoesDoPerfil(ctx.perfil);
  if (!p.includes('apontamento.lancar') && !p.includes('movimento.lancar')) return <p className="text-tinta-2">Seu perfil não lança leituras de secagem.</p>;
  return <LeiturasCampo empresaId={ctx.empresaId} movimentosServidor={await movimentosEmSecagem(ctx)} />;
}
