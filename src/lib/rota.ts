import 'server-only';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { contextoDaSessao } from './contexto';
import { ErroNaoEncontrado, ErroPermissao, ErroRegra, ErroValidacao } from '@/dominio/erros';
import type { Contexto } from '@/servicos/transacao';

/** Converte erros de domínio em respostas HTTP (§14): regra → 422, outra empresa → 404. */
export function respostaDeErro(e: unknown): NextResponse {
  if (e instanceof ErroRegra) return NextResponse.json({ codigo: e.codigo, mensagem: e.message }, { status: 422 });
  if (e instanceof ErroNaoEncontrado) return NextResponse.json({ mensagem: e.message }, { status: 404 });
  if (e instanceof ErroPermissao) return NextResponse.json({ mensagem: e.message }, { status: 403 });
  if (e instanceof ErroValidacao) return NextResponse.json({ mensagem: e.message, campo: e.campo }, { status: 400 });
  if (e instanceof ZodError) return NextResponse.json({ mensagem: 'Dados inválidos.', erros: e.issues }, { status: 400 });
  console.error(e);
  return NextResponse.json({ mensagem: 'Erro interno.' }, { status: 500 });
}

/** Rota fina: autenticar → (validar no serviço) → chamar serviço → responder. */
export function rota<P>(fn: (ctx: Contexto, req: Request, params: P) => Promise<unknown>) {
  return async (req: Request, info: { params: Promise<P> }) => {
    try {
      const ctx = await contextoDaSessao();
      if (!ctx) return NextResponse.json({ mensagem: 'Não autenticado ou sem empresa ativa.' }, { status: 401 });
      const corpo = await fn(ctx, req, await info.params);
      return NextResponse.json(corpo ?? null);
    } catch (e) {
      return respostaDeErro(e);
    }
  };
}

/** Rota de arquivo (PDF, CSV, GeoJSON, JSON): mesmo tratamento de erros, resposta binária. */
export function download<P>(fn: (ctx: Contexto, req: Request, params: P) => Promise<{ conteudo: Buffer | string; tipo: string; nome: string; inline?: boolean }>) {
  return async (req: Request, info: { params: Promise<P> }) => {
    try {
      const ctx = await contextoDaSessao();
      if (!ctx) return NextResponse.json({ mensagem: 'Não autenticado ou sem empresa ativa.' }, { status: 401 });
      const a = await fn(ctx, req, await info.params);
      const corpo = typeof a.conteudo === 'string' ? a.conteudo : new Uint8Array(a.conteudo);
      const nome = a.nome.replace(/["\\\r\n]/g, '_');
      return new NextResponse(corpo, {
        headers: { 'content-type': a.tipo, 'content-disposition': `${a.inline ? 'inline' : 'attachment'}; filename="${nome}"`, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
      });
    } catch (e) {
      return respostaDeErro(e);
    }
  };
}

/** ?versao=N opcional. */
export const versaoDaUrl = (req: Request) => {
  const v = Number(new URL(req.url).searchParams.get('versao'));
  return Number.isInteger(v) && v > 0 ? v : undefined;
};
