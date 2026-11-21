import { z } from 'zod';
import { rota } from '@/lib/rota';
import { ErroNaoEncontrado } from '@/dominio/erros';
import { adicionarNota, alterarLogistica, desfazerProgramacao, finalizarEmbarque, programarEmbarque, reabrirEmbarque, registrarCarregamento } from '@/servicos/embarques';

/** POST /api/embarques/{id}/programar | desprogramar | carregar | notas | logistica | finalizar | reabrir (§14). */
export const POST = rota<{ id: string; acao: string }>(async (ctx, req, p) => {
  const corpo = await req.json().catch(() => ({}));
  const motivo = () => z.object({ motivo: z.string() }).parse(corpo).motivo;
  switch (p.acao) {
    case 'programar': return programarEmbarque(ctx, p.id, Array.isArray(corpo) ? corpo : corpo.lotes);
    case 'desprogramar': return desfazerProgramacao(ctx, p.id, motivo());
    case 'carregar': return registrarCarregamento(ctx, p.id, corpo);
    case 'notas': return adicionarNota(ctx, p.id, corpo);
    case 'logistica': return alterarLogistica(ctx, p.id, corpo);
    case 'finalizar': return finalizarEmbarque(ctx, p.id);
    case 'reabrir': return reabrirEmbarque(ctx, p.id, motivo());
    default: throw new ErroNaoEncontrado();
  }
});
