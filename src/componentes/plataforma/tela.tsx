'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { acaoCriarEmpresa, acaoPlano, acaoStatusEmpresa } from '@/app/plataforma/acoes';
import type { listarEmpresasPlataforma } from '@/servicos/plataforma';
import { Botao } from '@/componentes/ui/botao';
import { Campo, Entrada } from '@/componentes/ui/campo';
import { Selecao } from '@/componentes/ui/selecao';
import { Aviso } from '@/componentes/ui/aviso';
import { Indicador } from '@/componentes/ui/cartao';
import { Selo } from '@/componentes/ui/selo';
import { ConfirmarComMotivo, dataHora } from '@/componentes/operacao/comum';

type Empresa = Awaited<ReturnType<typeof listarEmpresasPlataforma>>[number];
type Opcao = { valor: string; rotulo: string };
const PLANO: Record<string, string> = { BASICO: 'Básico', PROFISSIONAL: 'Profissional', EMPRESARIAL: 'Empresarial' };

export function TelaPlataforma({ empresas, modelos, planos }: { empresas: Empresa[]; modelos: Opcao[]; planos: string[] }) {
  const router = useRouter();
  const [nova, setNova] = useState(false);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  const rodar = (f: () => Promise<{ ok: boolean; mensagem?: string; erro?: string }>, depois?: () => void) =>
    iniciar(async () => {
      const r = await f();
      setMsg(r.ok ? { tipo: 'ok', texto: r.mensagem ?? '' } : { tipo: 'erro', texto: r.erro ?? '' });
      if (r.ok) { depois?.(); router.refresh(); }
    });
  const ativas = empresas.filter((e) => e.status === 'ATIVA').length;
  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
        <Indicador valor={empresas.length} rotulo="empresas" />
        <Indicador valor={ativas} rotulo="ativas" cor="ok" />
        <Indicador valor={empresas.length - ativas} rotulo="suspensas" cor="erro" />
        <Indicador valor={empresas.reduce((s, e) => s + e.usuarios, 0)} rotulo="vínculos de usuários ativos" cor="ouro" />
      </div>
      {msg ? <Aviso tipo={msg.tipo}>{msg.texto}</Aviso> : null}
      {nova ? (
        <form className="sombra grid gap-3 rounded-xl border border-linha bg-superficie p-4" onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const v = (k: string) => String(f.get(k) ?? '').trim();
          rodar(() => acaoCriarEmpresa({ nome: v('nome'), cnpj: v('cnpj') || null, modelo: v('modelo'), plano: v('plano') as 'BASICO', adminNome: v('adminNome'), adminEmail: v('adminEmail'), adminSenha: v('adminSenha') || null }), () => setNova(false));
        }}>
          <h2 className="font-display text-[17px] font-semibold">Nova empresa</h2>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
            <Campo rotulo="Nome *"><Entrada name="nome" required minLength={3} /></Campo>
            <Campo rotulo="CNPJ"><Entrada name="cnpj" inputMode="numeric" /></Campo>
            <Campo rotulo="Modelo de fluxo"><Selecao name="modelo">{modelos.map((m) => <option key={m.valor} value={m.valor}>{m.rotulo}</option>)}</Selecao></Campo>
            <Campo rotulo="Plano"><Selecao name="plano">{planos.map((p) => <option key={p} value={p}>{PLANO[p] ?? p}</option>)}</Selecao></Campo>
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
            <Campo rotulo="Administrador: nome *"><Entrada name="adminNome" required minLength={3} /></Campo>
            <Campo rotulo="Administrador: e-mail *"><Entrada name="adminEmail" type="email" required /></Campo>
            <Campo rotulo="Senha inicial" dica="Obrigatória se o e-mail ainda não tiver usuário (mín. 8)"><Entrada name="adminSenha" type="password" autoComplete="new-password" minLength={8} /></Campo>
          </div>
          <div className="flex gap-2"><Botao type="submit" disabled={pendente}>Criar empresa</Botao><Botao type="button" variante="secundario" onClick={() => setNova(false)}>Cancelar</Botao></div>
        </form>
      ) : <Botao className="justify-self-start" onClick={() => setNova(true)}>Nova empresa</Botao>}
      <div className="sombra overflow-x-auto rounded-xl border border-linha bg-superficie">
        <table className="w-full min-w-[960px] border-collapse text-[13.5px]">
          <caption className="sr-only">Empresas da plataforma</caption>
          <thead>
            <tr className="bg-superficie-2 text-left font-mono text-[11px] tracking-wider text-tinta-2 uppercase">
              <th scope="col" className="px-3 py-3">Empresa</th><th scope="col" className="px-3 py-3">Administradores</th><th scope="col" className="px-3 py-3 text-right">Usuários</th>
              <th scope="col" className="px-3 py-3">Plano</th><th scope="col" className="px-3 py-3">Situação</th><th scope="col" className="px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {empresas.map((e) => (
              <tr key={e.id} className="border-t border-linha align-top">
                <td className="px-3 py-2.5"><b>{e.nome}</b><div className="text-[12px] text-tinta-2">{e.cnpj ?? 'sem CNPJ'} · desde {dataHora(e.criadoEm).slice(0, 10)}{e.modelo ? ` · ${modelos.find((m) => m.valor === e.modelo)?.rotulo ?? e.modelo}` : ''}</div></td>
                <td className="px-3 py-2.5 text-[12.5px]">{e.administradores.map((a) => <div key={a.email}>{a.nome} <span className="text-tinta-2">{a.email}</span></div>)}</td>
                <td className="px-3 py-2.5 text-right font-mono">{e.usuarios}</td>
                <td className="px-3 py-2.5">
                  <Selecao aria-label={`Plano de ${e.nome}`} value={e.plano} disabled={pendente} className="h-8 w-auto" onChange={(ev) => rodar(() => acaoPlano(e.id, ev.target.value))}>
                    {planos.map((p) => <option key={p} value={p}>{PLANO[p] ?? p}</option>)}
                  </Selecao>
                </td>
                <td className="px-3 py-2.5">
                  {e.status === 'ATIVA' ? <Selo tipo="ok">Ativa</Selo> : <Selo tipo="erro">Suspensa</Selo>}
                  {e.status === 'SUSPENSA' && e.motivoStatus ? <div className="mt-1 text-[12px] text-tinta-2">{e.motivoStatus}{e.suspensaEm ? ` · ${dataHora(e.suspensaEm)}` : ''}</div> : null}
                </td>
                <td className="px-3 py-2 text-right">
                  {e.status === 'ATIVA'
                    ? <ConfirmarComMotivo rotulo="Suspender" titulo={`Suspender ${e.nome}?`} explicacao="Todos os usuários perdem o acesso na hora. Os dados ficam guardados." pendente={pendente} aoConfirmar={(m) => rodar(() => acaoStatusEmpresa(e.id, 'SUSPENSA', m))} />
                    : <Botao variante="secundario" disabled={pendente} onClick={() => rodar(() => acaoStatusEmpresa(e.id, 'ATIVA'))}>Reativar</Botao>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
