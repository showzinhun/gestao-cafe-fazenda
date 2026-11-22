import { rota } from '@/lib/rota';
import { consultarEstoque, type FiltroEstoque } from '@/servicos/consultas';
import { numeroPagina } from '@/servicos/paginacao';

/** GET /api/lotes?etapa=&fazenda=&safra=&peneira=&certificado=&local=&livre=1&reservado=1&aptoEudr=1&q=&pagina= (§14). */
export const GET = rota((ctx, req) => {
  const p = new URL(req.url).searchParams;
  const f: FiltroEstoque = {
    etapaId: p.get('etapa') ?? undefined, fazendaId: p.get('fazenda') ?? undefined, safraId: p.get('safra') ?? undefined, peneiraId: p.get('peneira') ?? undefined,
    certificadoId: p.get('certificado') ?? undefined, localId: p.get('local') ?? undefined, busca: p.get('q') ?? undefined,
    situacao: p.get('livre') ? 'livre' : p.get('reservado') ? 'reservado' : undefined,
    aptoEudr: p.get('aptoEudr') === '1' || p.get('aptoEudr') === 'true',
  };
  return consultarEstoque(ctx, f, p.get('pagina') ? numeroPagina(p.get('pagina')) : undefined);
});
