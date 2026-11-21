import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth, unstable_update } from '@/auth';
import { vinculoAtivo } from '@/servicos/acesso';
import { respostaDeErro } from '@/lib/rota';

const corpo = z.object({ empresaId: z.string() });

/** POST /api/auth/empresa-ativa {empresaId} (§14). Empresa sem vínculo → 404. */
export async function POST(req: Request) {
  try {
    const s = await auth();
    if (!s?.usuarioId) return NextResponse.json({ mensagem: 'Não autenticado.' }, { status: 401 });
    const { empresaId } = corpo.parse(await req.json());
    const v = await vinculoAtivo(s.usuarioId, empresaId);
    await unstable_update({ empresaId: v.empresaId } as never);
    return NextResponse.json({ empresaId: v.empresaId, nome: v.nome, perfil: v.perfil });
  } catch (e) {
    return respostaDeErro(e);
  }
}
