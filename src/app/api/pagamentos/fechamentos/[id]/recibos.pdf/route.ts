import { NextResponse } from 'next/server';
import { contextoDaSessao } from '@/lib/contexto';
import { respostaDeErro } from '@/lib/rota';
import { gerarRecibosPdf } from '@/lib/pdf-recibos';
import { dadosRecibos } from '@/servicos/pagamentos';

export async function GET(_req: Request, info: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await contextoDaSessao();
    if (!ctx) return NextResponse.json({ mensagem: 'Não autenticado.' }, { status: 401 });
    const d = await dadosRecibos(ctx, (await info.params).id);
    const pdf = await gerarRecibosPdf(d);
    return new NextResponse(new Uint8Array(pdf), { headers: { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="recibos-fechamento-${d.fechamento.numero}.pdf"`, 'cache-control': 'no-store' } });
  } catch (e) {
    return respostaDeErro(e);
  }
}
