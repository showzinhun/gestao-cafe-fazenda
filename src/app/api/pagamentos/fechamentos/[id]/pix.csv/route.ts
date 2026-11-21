import { NextResponse } from 'next/server';
import { contextoDaSessao } from '@/lib/contexto';
import { respostaDeErro } from '@/lib/rota';
import { listaPix } from '@/servicos/pagamentos';

/** Lista de pagamento PIX (CSV). Dados abertos: só FINANCEIRO/ADMIN, auditado (§3.3). */
export async function GET(_req: Request, info: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await contextoDaSessao();
    if (!ctx) return NextResponse.json({ mensagem: 'Não autenticado.' }, { status: 401 });
    const r = await listaPix(ctx, (await info.params).id);
    return new NextResponse(r.conteudo, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${r.nome}"`, 'cache-control': 'no-store' } });
  } catch (e) {
    return respostaDeErro(e);
  }
}
