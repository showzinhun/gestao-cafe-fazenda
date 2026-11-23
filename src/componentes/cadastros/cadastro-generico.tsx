'use client';
import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { Pencil, Plus, Search } from 'lucide-react';
import { CADASTROS, type CampoForm, type Opcao, type Registro } from './config';
import { alternarAtivo, salvarCadastro } from '@/app/(app)/cadastros/acoes';
import { Botao } from '@/componentes/ui/botao';
import { Campo, Entrada } from '@/componentes/ui/campo';
import { Selecao } from '@/componentes/ui/selecao';
import { Selo } from '@/componentes/ui/selo';
import { Aviso } from '@/componentes/ui/aviso';
import { cn } from '@/lib/cn';

type Msg = { tipo: 'ok' | 'aviso' | 'erro'; texto: string } | null;

/** Lista + formulário de um cadastro do §4.2, com inativar/reativar (nada é apagado). */
export function CadastroGenerico({ recurso, registros, opcoes, podeEditar }: { recurso: string; registros: Registro[]; opcoes: Record<string, Opcao[]>; podeEditar: boolean }) {
  const cfg = CADASTROS[recurso]!;
  const campoAtivo = cfg.campoAtivo ?? 'ativo';
  const [busca, setBusca] = useState('');
  const [inativos, setInativos] = useState(false);
  const [editando, setEditando] = useState<Registro | 'novo' | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [pendente, iniciar] = useTransition();

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return registros.filter((r) => (inativos || r[campoAtivo] !== false) && (!q || cfg.colunas.some((c) => c.valor(r).toLowerCase().includes(q))));
  }, [registros, busca, inativos, cfg, campoAtivo]);

  function alternar(r: Registro) {
    const ativo = r[campoAtivo] === false;
    iniciar(async () => {
      const res = await alternarAtivo(recurso, r.id, ativo);
      setMsg(res.ok ? { tipo: 'ok', texto: res.mensagem ?? 'Pronto.' } : { tipo: 'erro', texto: res.erro });
    });
  }

  return (
    <div className="grid gap-4">
      <p className="text-tinta-2">{cfg.descricao}</p>
      {msg ? <Aviso tipo={msg.tipo}>{msg.texto}</Aviso> : null}
      {editando ? (
        <Formulario
          key={editando === 'novo' ? 'novo' : editando.id}
          recurso={recurso}
          registro={editando === 'novo' ? null : editando}
          opcoes={opcoes}
          aoFechar={(m) => {
            setEditando(null);
            if (m) setMsg(m);
          }}
        />
      ) : null}
      <div className="flex flex-wrap items-end gap-3">
        <label className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-tinta-2" />
          <Entrada aria-label="Buscar" placeholder={`Buscar ${cfg.titulo.toLowerCase()}…`} value={busca} onChange={(e) => setBusca(e.target.value)} className="pl-9" />
        </label>
        <label className="flex items-center gap-2 text-[13px] text-tinta-2">
          <input type="checkbox" checked={inativos} onChange={(e) => setInativos(e.target.checked)} /> Mostrar inativos
        </label>
        {podeEditar && !editando ? (
          <Botao className="ml-auto" onClick={() => { setMsg(null); setEditando('novo'); }}>
            <Plus className="size-4" /> {cfg.feminino ? 'Nova' : 'Novo'} {cfg.singular}
          </Botao>
        ) : null}
      </div>
      <div className="sombra overflow-x-auto rounded-xl border border-linha bg-superficie">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr className="bg-superficie-2 text-left font-mono text-[11px] tracking-wider text-tinta-2 uppercase">
              {cfg.colunas.map((c) => (
                <th key={c.rotulo} className={cn('px-3 py-3', c.num && 'text-right')}>{c.rotulo}</th>
              ))}
              <th className="px-3 py-3">Situação</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {lista.length ? (
              lista.map((r) => (
                <tr key={r.id} className="border-t border-linha hover:bg-superficie-2">
                  {cfg.colunas.map((c) => (
                    <td key={c.rotulo} className={cn('px-3 py-2.5', c.num && 'text-right font-mono', c.mono && 'font-mono')}>
                      {c.link ? <Link href={c.link(r)} className="font-medium text-destaque hover:underline">{c.valor(r)}</Link> : c.valor(r)}
                    </td>
                  ))}
                  <td className="px-3 py-2.5">{r[campoAtivo] === false ? <Selo tipo="neutro">Inativo</Selo> : <Selo>Ativo</Selo>}</td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    {podeEditar ? (
                      <div className="inline-flex items-center gap-1.5">
                        <Botao variante="secundario" tamanho="pequeno" onClick={() => { setMsg(null); setEditando(r); }} aria-label={`Editar ${c0(cfg, r)}`}>
                          <Pencil className="size-3.5" /> Editar
                        </Botao>
                        <Botao variante="secundario" tamanho="pequeno" disabled={pendente} onClick={() => alternar(r)}>
                          {r[campoAtivo] === false ? 'Reativar' : 'Inativar'}
                        </Botao>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={cfg.colunas.length + 2} className="px-3 py-8 text-center text-tinta-2">
                  {registros.length ? 'Nada encontrado com esse filtro.' : `Nenhum ${cfg.singular} cadastrado.`}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-[12.5px] text-tinta-2">{lista.length} de {registros.length} registro(s)</p>
    </div>
  );
}

const c0 = (cfg: (typeof CADASTROS)[string], r: Registro) => cfg.colunas[0]!.valor(r);

function valorInicial(campo: CampoForm, r: Registro | null): string | string[] {
  const v = r?.[campo.nome];
  if (campo.tipo === 'multipla') return Array.isArray(v) ? (v as string[]) : [];
  if (v === null || v === undefined) return r ? '' : (campo.padrao ?? '');
  if (campo.tipo === 'data') return String(v).slice(0, 10);
  if (campo.tipo === 'decimal') return String(v).replace('.', ',');
  return String(v);
}

function Formulario({ recurso, registro, opcoes, aoFechar }: { recurso: string; registro: Registro | null; opcoes: Record<string, Opcao[]>; aoFechar: (m?: Msg) => void }) {
  const cfg = CADASTROS[recurso]!;
  const [valores, setValores] = useState<Record<string, string | string[]>>(() => Object.fromEntries(cfg.campos.map((c) => [c.nome, valorInicial(c, registro)])));
  const [erro, setErro] = useState<{ texto: string; campo?: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  const lista = (c: CampoForm): Opcao[] => {
    const base = typeof c.opcoes === 'string' ? (opcoes[c.opcoes] ?? []) : (c.opcoes ?? []);
    return c.filtraPor ? base.filter((o) => !valores[c.filtraPor!] || o.grupo === valores[c.filtraPor!]) : base;
  };

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    iniciar(async () => {
      const dados = Object.fromEntries(Object.entries(valores).map(([k, v]) => [k, v === '' ? null : v]));
      const res = await salvarCadastro(recurso, registro?.id ?? null, dados);
      if (!res.ok) return setErro({ texto: res.erro, campo: res.campo });
      aoFechar(res.avisos?.length ? { tipo: 'aviso', texto: `${res.mensagem} ${res.avisos.join(' ')}` } : { tipo: 'ok', texto: res.mensagem ?? 'Salvo.' });
    });
  }

  return (
    <form onSubmit={enviar} className="sombra grid gap-4 rounded-xl border border-linha bg-superficie p-5">
      <h2 className="font-display text-[19px] font-semibold">{registro ? `Editar ${cfg.singular}` : `${cfg.feminino ? 'Nova' : 'Novo'} ${cfg.singular}`}</h2>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
        {cfg.campos.map((c) => (
          <Campo key={c.nome} rotulo={c.rotulo + (c.obrigatorio ? ' *' : '')} dica={c.dica} className={cn(c.largura === 'cheia' && 'col-span-full', erro?.campo === c.nome && '[&_input]:border-erro [&_select]:border-erro')}>
            {c.tipo === 'selecao' ? (
              <Selecao name={c.nome} value={valores[c.nome] as string} onChange={(e) => setValores((v) => ({ ...v, [c.nome]: e.target.value }))} required={c.obrigatorio}>
                {c.obrigatorio && !c.padrao ? <option value="">Escolha…</option> : null}
                {!c.obrigatorio ? <option value="">{c.vazio ?? '—'}</option> : null}
                {lista(c).map((o) => (
                  <option key={o.valor} value={o.valor}>{o.rotulo}</option>
                ))}
              </Selecao>
            ) : c.tipo === 'multipla' ? (
              <span className="flex flex-wrap gap-2">
                {lista(c).map((o) => {
                  const marcado = (valores[c.nome] as string[]).includes(o.valor);
                  return (
                    <label key={o.valor} className={cn('flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-[13px] font-normal', marcado ? 'border-destaque bg-destaque-suave' : 'border-linha')}>
                      <input
                        type="checkbox"
                        checked={marcado}
                        onChange={(e) => setValores((v) => ({ ...v, [c.nome]: e.target.checked ? [...(v[c.nome] as string[]), o.valor] : (v[c.nome] as string[]).filter((x) => x !== o.valor) }))}
                      />
                      {o.rotulo}
                    </label>
                  );
                })}
              </span>
            ) : (
              <Entrada
                name={c.nome}
                type={c.tipo === 'data' ? 'date' : 'text'}
                inputMode={c.tipo === 'decimal' ? 'decimal' : c.tipo === 'inteiro' ? 'numeric' : undefined}
                value={valores[c.nome] as string}
                onChange={(e) => setValores((v) => ({ ...v, [c.nome]: e.target.value }))}
                required={c.obrigatorio}
              />
            )}
          </Campo>
        ))}
      </div>
      {erro ? <Aviso tipo="erro">{erro.texto}</Aviso> : null}
      <div className="flex gap-2">
        <Botao type="submit" disabled={pendente}>{pendente ? 'Salvando…' : 'Salvar'}</Botao>
        <Botao type="button" variante="secundario" onClick={() => aoFechar()}>Cancelar</Botao>
      </div>
    </form>
  );
}
