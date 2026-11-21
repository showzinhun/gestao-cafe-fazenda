'use client';
import { useState, useTransition } from 'react';
import { Plus } from 'lucide-react';
import { acaoAdicionarUsuario, acaoAlterarUsuario, acaoPermissao } from '@/app/(app)/config/acoes';
import { NOME_PERFIL, PERFIS, PERMISSOES, type Perfil, type Permissao } from '@/dominio/perfis';
import { Botao } from '@/componentes/ui/botao';
import { Campo, Entrada } from '@/componentes/ui/campo';
import { Selecao } from '@/componentes/ui/selecao';
import { Selo } from '@/componentes/ui/selo';
import { Aviso } from '@/componentes/ui/aviso';
import { cn } from '@/lib/cn';

type Usuario = { usuarioId: string; nome: string; email: string; perfil: Perfil; ativo: boolean; fazendaIds: string[] };
type Opcao = { valor: string; rotulo: string };
type Msg = { tipo: 'ok' | 'erro'; texto: string } | null;

export const NOME_PERMISSAO: Record<Permissao, string> = {
  'cadastros.editar': 'Editar cadastros',
  'usuarios.gerenciar': 'Gerenciar usuários e permissões',
  'fluxo.configurar': 'Configurar o fluxo de etapas',
  'movimento.lancar': 'Lançar movimentos e resultados',
  'movimento.fechar': 'Fechar movimentos',
  'movimento.estornar': 'Estornar movimentos',
  'apontamento.lancar': 'Apontar colheita (app de campo)',
  'pagamento.fechar': 'Fechar e pagar colhedores',
  'comercial.editar': 'Contratos e reservas',
  'embarque.programar': 'Programar embarque',
  'embarque.carregar': 'Registrar carregamento',
  'inventario.aprovar': 'Aprovar inventário',
};

function Fazendas({ opcoes, valor, aoMudar, desativado }: { opcoes: Opcao[]; valor: string[]; aoMudar: (v: string[]) => void; desativado?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {opcoes.map((f) => (
        <label key={f.valor} className={cn('flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12.5px]', valor.includes(f.valor) ? 'border-destaque bg-destaque-suave' : 'border-linha', desativado && 'opacity-50')}>
          <input type="checkbox" disabled={desativado} checked={valor.includes(f.valor)} onChange={(e) => aoMudar(e.target.checked ? [...valor, f.valor] : valor.filter((x) => x !== f.valor))} />
          {f.rotulo}
        </label>
      ))}
    </div>
  );
}

export function GestaoUsuarios({ usuarios, fazendas, matriz, euId }: { usuarios: Usuario[]; fazendas: Opcao[]; matriz: Record<Perfil, Permissao[]>; euId: string }) {
  const [aba, setAba] = useState<'usuarios' | 'permissoes'>('usuarios');
  const [msg, setMsg] = useState<Msg>(null);
  const [novo, setNovo] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const rodar = (f: () => Promise<{ ok: boolean; mensagem?: string; erro?: string }>, depois?: () => void) =>
    iniciar(async () => {
      const r = await f();
      setMsg(r.ok ? { tipo: 'ok', texto: r.mensagem ?? 'Pronto.' } : { tipo: 'erro', texto: r.erro ?? 'Erro.' });
      if (r.ok) depois?.();
    });

  return (
    <div className="grid gap-4">
      <nav className="sombra inline-flex gap-1 justify-self-start rounded-[11px] border border-linha bg-superficie p-1" aria-label="Usuários e permissões">
        {(['usuarios', 'permissoes'] as const).map((a) => (
          <button key={a} type="button" aria-pressed={aba === a} onClick={() => setAba(a)} className={cn('rounded-lg px-3.5 py-2 text-sm font-medium', aba === a ? 'bg-destaque-suave text-destaque' : 'text-tinta-2')}>
            {a === 'usuarios' ? 'Usuários' : 'Permissões por perfil'}
          </button>
        ))}
      </nav>
      {msg ? <Aviso tipo={msg.tipo}>{msg.texto}</Aviso> : null}
      {aba === 'usuarios' ? (
        <>
          <p className="text-tinta-2">Quem não é administrador só lança nas fazendas liberadas (RN-04). O usuário é o mesmo em todas as empresas; a senha é dele.</p>
          {novo ? (
            <NovoUsuario fazendas={fazendas} pendente={pendente} aoCancelar={() => setNovo(false)} aoSalvar={(d) => rodar(() => acaoAdicionarUsuario(d), () => setNovo(false))} />
          ) : (
            <Botao className="justify-self-start" onClick={() => { setMsg(null); setNovo(true); }}><Plus className="size-4" /> Adicionar usuário</Botao>
          )}
          <div className="sombra overflow-x-auto rounded-xl border border-linha bg-superficie">
            <table className="w-full min-w-[760px] border-collapse text-[13.5px]">
              <thead>
                <tr className="bg-superficie-2 text-left font-mono text-[11px] tracking-wider text-tinta-2 uppercase">
                  <th className="px-3 py-2.5">Usuário</th><th className="px-3 py-2.5">Perfil</th><th className="px-3 py-2.5">Fazendas liberadas</th><th className="px-3 py-2.5">Situação</th><th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {usuarios.map((u) =>
                  editando === u.usuarioId ? (
                    <EditarLinha key={u.usuarioId} u={u} fazendas={fazendas} pendente={pendente} eu={u.usuarioId === euId} aoCancelar={() => setEditando(null)} aoSalvar={(d) => rodar(() => acaoAlterarUsuario(u.usuarioId, d), () => setEditando(null))} />
                  ) : (
                    <tr key={u.usuarioId} className={cn('border-t border-linha', !u.ativo && 'opacity-60')}>
                      <td className="px-3 py-2.5"><b>{u.nome}</b>{u.usuarioId === euId ? <span className="text-tinta-2"> (você)</span> : null}<div className="text-[12px] text-tinta-2">{u.email}</div></td>
                      <td className="px-3 py-2.5">{NOME_PERFIL[u.perfil]}</td>
                      <td className="px-3 py-2.5">{u.perfil === 'ADMIN_EMPRESA' ? 'Todas' : u.fazendaIds.length ? u.fazendaIds.map((f) => fazendas.find((o) => o.valor === f)?.rotulo.split(' · ')[0] ?? '?').join(', ') : <span className="text-aviso">Nenhuma</span>}</td>
                      <td className="px-3 py-2.5">{u.ativo ? <Selo>Ativo</Selo> : <Selo tipo="neutro">Inativo</Selo>}</td>
                      <td className="px-3 py-2.5 text-right"><Botao variante="secundario" tamanho="pequeno" onClick={() => { setMsg(null); setEditando(u.usuarioId); }}>Editar</Botao></td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <Matriz matriz={matriz} pendente={pendente} aoMudar={(p, k, v) => rodar(() => acaoPermissao(p, k, v))} />
      )}
    </div>
  );
}

function NovoUsuario({ fazendas, pendente, aoSalvar, aoCancelar }: { fazendas: Opcao[]; pendente: boolean; aoSalvar: (d: { nome: string; email: string; perfil: Perfil; senhaInicial?: string; fazendaIds: string[] }) => void; aoCancelar: () => void }) {
  const [perfil, setPerfil] = useState<Perfil>('OPERADOR');
  const [faz, setFaz] = useState<string[]>([]);
  return (
    <form
      className="sombra grid gap-4 rounded-xl border border-linha bg-superficie p-5"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        aoSalvar({ nome: String(fd.get('nome')), email: String(fd.get('email')), perfil, senhaInicial: String(fd.get('senhaInicial') ?? ''), fazendaIds: perfil === 'ADMIN_EMPRESA' ? [] : faz });
      }}
    >
      <h3 className="font-display text-[17px] font-semibold">Adicionar usuário</h3>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
        <Campo rotulo="Nome *"><Entrada name="nome" required /></Campo>
        <Campo rotulo="E-mail *" dica="Se já tiver cadastro, só libera o acesso"><Entrada name="email" type="email" required /></Campo>
        <Campo rotulo="Perfil *"><Selecao value={perfil} onChange={(e) => setPerfil(e.target.value as Perfil)}>{PERFIS.map((p) => <option key={p} value={p}>{NOME_PERFIL[p]}</option>)}</Selecao></Campo>
        <Campo rotulo="Senha inicial" dica="Obrigatória para usuário novo (8+ caracteres)"><Entrada name="senhaInicial" type="password" autoComplete="new-password" /></Campo>
      </div>
      <div className="grid gap-2">
        <b className="text-[13px]">Fazendas liberadas</b>
        <Fazendas opcoes={fazendas} valor={faz} aoMudar={setFaz} desativado={perfil === 'ADMIN_EMPRESA'} />
      </div>
      <div className="flex gap-2"><Botao type="submit" disabled={pendente}>Adicionar</Botao><Botao type="button" variante="secundario" onClick={aoCancelar}>Cancelar</Botao></div>
    </form>
  );
}

function EditarLinha({ u, fazendas, pendente, eu, aoSalvar, aoCancelar }: { u: Usuario; fazendas: Opcao[]; pendente: boolean; eu: boolean; aoSalvar: (d: { perfil: Perfil; ativo: boolean; fazendaIds: string[] }) => void; aoCancelar: () => void }) {
  const [perfil, setPerfil] = useState(u.perfil);
  const [ativo, setAtivo] = useState(u.ativo);
  const [faz, setFaz] = useState(u.fazendaIds);
  return (
    <tr className="border-t border-linha bg-destaque-suave/40">
      <td className="px-3 py-2.5 align-top"><b>{u.nome}</b><div className="text-[12px] text-tinta-2">{u.email}</div></td>
      <td className="px-3 py-2.5 align-top"><Selecao aria-label="Perfil" value={perfil} onChange={(e) => setPerfil(e.target.value as Perfil)}>{PERFIS.map((p) => <option key={p} value={p}>{NOME_PERFIL[p]}</option>)}</Selecao></td>
      <td className="px-3 py-2.5 align-top"><Fazendas opcoes={fazendas} valor={faz} aoMudar={setFaz} desativado={perfil === 'ADMIN_EMPRESA'} /></td>
      <td className="px-3 py-2.5 align-top"><label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={ativo} disabled={eu} onChange={(e) => setAtivo(e.target.checked)} /> Ativo</label></td>
      <td className="px-3 py-2.5 text-right align-top whitespace-nowrap">
        <Botao tamanho="pequeno" disabled={pendente} onClick={() => aoSalvar({ perfil, ativo, fazendaIds: perfil === 'ADMIN_EMPRESA' ? [] : faz })}>Salvar</Botao>{' '}
        <Botao tamanho="pequeno" variante="secundario" onClick={aoCancelar}>Cancelar</Botao>
      </td>
    </tr>
  );
}

function Matriz({ matriz, pendente, aoMudar }: { matriz: Record<Perfil, Permissao[]>; pendente: boolean; aoMudar: (p: Exclude<Perfil, 'ADMIN_EMPRESA'>, k: Permissao, v: boolean) => void }) {
  return (
    <>
      <p className="text-tinta-2">Marque o que cada perfil pode fazer nesta empresa. O Administrador sempre pode tudo. O servidor confere cada permissão; a tela só esconde o que não é permitido.</p>
      <div className="sombra overflow-x-auto rounded-xl border border-linha bg-superficie">
        <table className="w-full min-w-[820px] border-collapse text-[13.5px]">
          <thead>
            <tr className="bg-superficie-2 font-mono text-[11px] tracking-wider text-tinta-2 uppercase">
              <th className="px-3 py-2.5 text-left">Permissão</th>
              {PERFIS.map((p) => <th key={p} className="px-2 py-2.5 text-center">{NOME_PERFIL[p]}</th>)}
            </tr>
          </thead>
          <tbody>
            {PERMISSOES.map((k) => (
              <tr key={k} className="border-t border-linha">
                <td className="px-3 py-2">{NOME_PERMISSAO[k]}</td>
                {PERFIS.map((p) => (
                  <td key={p} className="px-2 py-2 text-center">
                    <input
                      type="checkbox"
                      aria-label={`${NOME_PERFIL[p]}: ${NOME_PERMISSAO[k]}`}
                      checked={matriz[p].includes(k)}
                      disabled={p === 'ADMIN_EMPRESA' || pendente}
                      onChange={(e) => p !== 'ADMIN_EMPRESA' && aoMudar(p, k, e.target.checked)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
