import { NextResponse } from 'next/server';
import { contextoDaSessao } from '@/lib/contexto';
import { respostaDeErro } from '@/lib/rota';
import { gerarRomaneioPdf } from '@/lib/pdf-romaneio';
import { obterEmbarque } from '@/servicos/embarques';
import { resumoEmpresa } from '@/servicos/acesso';

export async function GET(_req: Request, info: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await contextoDaSessao();
    if (!ctx) return NextResponse.json({ mensagem: 'Não autenticado.' }, { status: 401 });
    const e = await obterEmbarque(ctx, (await info.params).id);
    const empresa = await resumoEmpresa(ctx);
    const pdf = await gerarRomaneioPdf(empresa?.nome ?? '', e);
    return new NextResponse(new Uint8Array(pdf), { headers: { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="romaneio-${e.rotulo.replace('#', '-')}.pdf"`, 'cache-control': 'no-store' } });
  } catch (e) {
    return respostaDeErro(e);
  }
}
