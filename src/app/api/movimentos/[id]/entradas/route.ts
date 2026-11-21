import { z } from 'zod';
import { rota } from '@/lib/rota';
import { adicionarEntradas } from '@/servicos/movimentos';

export const POST = rota<{ id: string }>(async (ctx, req, p) => {
  const corpo = await req.json();
  return adicionarEntradas(ctx, p.id, z.array(z.any()).parse(Array.isArray(corpo) ? corpo : corpo.entradas));
});
