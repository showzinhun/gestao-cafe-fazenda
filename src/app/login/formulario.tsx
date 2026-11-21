'use client';
import { useActionState } from 'react';
import { entrar } from './acoes';
import { Botao } from '@/componentes/ui/botao';
import { Campo, Entrada } from '@/componentes/ui/campo';

export function FormularioLogin() {
  const [estado, acao, enviando] = useActionState(entrar, undefined);
  return (
    <form action={acao} className="grid gap-4">
      <Campo rotulo="E-mail">
        <Entrada name="email" type="email" autoComplete="username" required autoFocus />
      </Campo>
      <Campo rotulo="Senha">
        <Entrada name="senha" type="password" autoComplete="current-password" required />
      </Campo>
      {estado?.erro ? (
        <p role="alert" className="rounded-lg bg-erro-fundo px-3 py-2 text-[13px] text-erro">
          {estado.erro}
        </p>
      ) : null}
      <Botao type="submit" disabled={enviando} className="w-full">
        {enviando ? 'Entrando…' : 'Entrar'}
      </Botao>
    </form>
  );
}
