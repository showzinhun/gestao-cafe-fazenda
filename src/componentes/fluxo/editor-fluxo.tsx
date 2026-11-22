'use client';
import { useMemo, useState, useTransition } from 'react';
import { ArrowDown, ArrowUp, Pencil, Plus } from 'lucide-react';
import { acaoAplicarModelo, acaoEtapaAtiva, acaoMoverEtapa, acaoSalvarEtapa, acaoSalvarTransicoes } from '@/app/(app)/config/acoes';
import { CLASSES, NOME_CLASSE, NOME_MODELO, REGRAS_CLASSE, transicaoPermitida, type Classe, type EtapaConfig, type ModeloResultado, type Unidade } from '@/dominio/fluxo';
import { DiagramaFluxo } from './diagrama';
import { Botao } from '@/componentes/ui/botao';
import { Campo, Entrada } from '@/componentes/ui/campo';
import { Selecao } from '@/componentes/ui/selecao';
import { Selo } from '@/componentes/ui/selo';
import { Aviso } from '@/componentes/ui/aviso';
import { cn } from '@/lib/cn';

type Etapa = EtapaConfig & { ordem: number; locais: number };
type Transicao = { id: string; origem: string; destino: string; fazendaId: string | null };
type Opcao = { valor: string; rotulo: string };
type Msg = { tipo: 'ok' | 'aviso' | 'erro'; texto: string } | null;

const UN: Record<Unidade, string> = { MEDIDA: 'medidas', KG: 'kg' };

export function EditorFluxo({ etapas, transicoes, pendencias, tiposCafe, fazendas, modelos, podeEditar }: {
  etapas: Etapa[]; transicoes: Transicao[]; pendencias: { etapa?: string; mensagem: string }[]; tiposCafe: Opcao[]; fazendas: Opcao[]; modelos: { codigo: string; nome: string; descricao: string }[]; podeEditar: boolean;
}) {
  const [msg, setMsg] = useState<Msg>(null);
  const [editando, setEditando] = useState<Etapa | 'nova' | null>(null);
  const [pendente, iniciar] = useTransition();
  const rodar = (f: () => Promise<{ ok: boolean; mensagem?: string; erro?: string; avisos?: string[] }>, depois?: () => void) =>
    iniciar(async () => {
      const r = await f();
      if (!r.ok) return setMsg({ tipo: 'erro', texto: r.erro ?? 'Erro.' });
      setMsg(r.avisos?.length ? { tipo: 'aviso', texto: `${r.mensagem} Pendências: ${r.avisos.join(' ')}` } : { tipo: 'ok', texto: r.mensagem ?? 'Pronto.' });
      depois?.();
    });

  if (!etapas.length) {
    return (
      <div className="grid gap-4">
        <p className="text-tinta-2">A empresa ainda não tem fluxo. Escolha um modelo pronto (§5.3); depois você pode editar tudo.</p>
        {msg ? <Aviso tipo={msg.tipo}>{msg.texto}</Aviso> : null}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-3">
          {modelos.map((m) => (
            <div key={m.codigo} className="sombra grid gap-2 rounded-xl border border-linha bg-superficie p-4">
              <b>{m.nome}</b>
              <small className="text-tinta-2">{m.descricao}</small>
              {podeEditar ? <Botao className="mt-2 justify-self-start" disabled={pendente} onClick={() => rodar(() => acaoAplicarModelo(m.codigo))}>Usar este modelo</Botao> : null}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const ativas = etapas.filter((e) => e.ativa);
  const daEmpresa = transicoes.filter((t) => t.fazendaId === null);
  return (
    <div className="grid gap-5">
      {msg ? <Aviso tipo={msg.tipo}>{msg.texto}</Aviso> : null}
      <DiagramaFluxo etapas={ativas} transicoes={daEmpresa} />
      <div className="flex flex-wrap gap-3 text-[12.5px] text-tinta-2">
        <span><span className="text-destaque">━</span> segue para a frente</span>
        <span><span className="text-ouro-texto">━</span> volta (ex.: secador → terreiro)</span>
        {CLASSES.map((c) => <span key={c}>· {NOME_CLASSE[c]}</span>)}
      </div>
      {pendencias.length ? (
        <Aviso tipo="aviso">
          <b>Pendências do fluxo</b>
          <ul className="mt-1 list-disc pl-5">{pendencias.map((p, i) => <li key={i}>{p.etapa ? `${p.etapa}: ` : ''}{p.mensagem}</li>)}</ul>
        </Aviso>
      ) : (
        <Aviso tipo="ok">O fluxo está completo: colheita, estoque e saída ativas e todas as etapas alcançáveis.</Aviso>
      )}

      <section className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-[19px] font-semibold">Etapas</h2>
          {podeEditar && !editando ? <Botao onClick={() => { setMsg(null); setEditando('nova'); }}><Plus className="size-4" /> Nova etapa</Botao> : null}
        </div>
        {editando ? <FormEtapa key={editando === 'nova' ? 'nova' : editando.id} etapa={editando === 'nova' ? null : editando} tiposCafe={tiposCafe} pendente={pendente} aoSalvar={(id, d) => rodar(() => acaoSalvarEtapa(id, d), () => setEditando(null))} aoCancelar={() => setEditando(null)} /> : null}
        <div className="sombra overflow-x-auto rounded-xl border border-linha bg-superficie">
          <table className="w-full min-w-[860px] border-collapse text-[13.5px]">
            <thead>
              <tr className="bg-superficie-2 text-left font-mono text-[11px] tracking-wider text-tinta-2 uppercase">
                <th className="px-3 py-2.5">Ordem</th><th className="px-3 py-2.5">Etapa</th><th className="px-3 py-2.5">Classe</th><th className="px-3 py-2.5">Prefixo</th><th className="px-3 py-2.5">Unidades</th><th className="px-3 py-2.5">Resultado</th><th className="px-3 py-2.5">Secagem</th><th className="px-3 py-2.5 text-right">Locais</th><th className="px-3 py-2.5">Situação</th><th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {etapas.map((e, i) => (
                <tr key={e.id} className={cn('border-t border-linha', !e.ativa && 'opacity-60')}>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {podeEditar ? (
                      <>
                        <button type="button" aria-label={`Subir ${e.nome}`} className="rounded p-1 hover:bg-superficie-2 disabled:opacity-30" disabled={i === 0 || pendente} onClick={() => rodar(() => acaoMoverEtapa(e.id, -1))}><ArrowUp className="size-4" /></button>
                        <button type="button" aria-label={`Descer ${e.nome}`} className="rounded p-1 hover:bg-superficie-2 disabled:opacity-30" disabled={i === etapas.length - 1 || pendente} onClick={() => rodar(() => acaoMoverEtapa(e.id, 1))}><ArrowDown className="size-4" /></button>
                      </>
                    ) : i + 1}
                  </td>
                  <td className="px-3 py-2"><b>{e.nome}</b><div className="font-mono text-[11.5px] text-tinta-2">{e.codigo}</div></td>
                  <td className="px-3 py-2">{NOME_CLASSE[e.classe]}</td>
                  <td className="px-3 py-2 font-mono font-semibold">{e.prefixoLote}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{UN[e.unidadeEntrada]} → {UN[e.unidadeSaida]}</td>
                  <td className="px-3 py-2">{NOME_MODELO[e.modeloResultado]}{e.tiposResultado.length ? <div className="text-[11.5px] text-tinta-2">{e.tiposResultado.map((t) => tiposCafe.find((o) => o.valor === t)?.rotulo.split(' · ')[0] ?? '?').join(', ')}</div> : null}</td>
                  <td className="px-3 py-2">{e.monitoraSecagem ? `${Number(e.umidadeMetaMin).toLocaleString('pt-BR')}–${Number(e.umidadeMetaMax).toLocaleString('pt-BR')}%` : '—'}</td>
                  <td className="px-3 py-2 text-right font-mono">{e.locais}</td>
                  <td className="px-3 py-2">{e.ativa ? <Selo>Ativa</Selo> : <Selo tipo="neutro">Inativa</Selo>}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {podeEditar ? (
                      <div className="inline-flex items-center gap-1.5">
                        <Botao variante="secundario" tamanho="pequeno" onClick={() => { setMsg(null); setEditando(e); }} aria-label={`Editar ${e.nome}`}><Pencil className="size-3.5" /> Editar</Botao>
                        <Botao variante="secundario" tamanho="pequeno" disabled={pendente} onClick={() => rodar(() => acaoEtapaAtiva(e.id, !e.ativa))}>{e.ativa ? 'Desativar' : 'Reativar'}</Botao>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Transicoes etapas={ativas} transicoes={transicoes} fazendas={fazendas} podeEditar={podeEditar} pendente={pendente} aoSalvar={(faz, pares) => rodar(() => acaoSalvarTransicoes(faz, pares))} />
    </div>
  );
}

function FormEtapa({ etapa, tiposCafe, pendente, aoSalvar, aoCancelar }: { etapa: Etapa | null; tiposCafe: Opcao[]; pendente: boolean; aoSalvar: (id: string | null, d: Parameters<typeof acaoSalvarEtapa>[1]) => void; aoCancelar: () => void }) {
  const [classe, setClasse] = useState<Classe>(etapa?.classe ?? 'PROCESSAMENTO');
  const r = REGRAS_CLASSE[classe];
  const [modelo, setModelo] = useState<ModeloResultado>(etapa?.modeloResultado ?? r.modelos[0]!);
  const [secagem, setSecagem] = useState(etapa?.monitoraSecagem ?? false);
  const [tipos, setTipos] = useState<string[]>(etapa?.tiposResultado ?? []);
  function mudarClasse(c: Classe) {
    setClasse(c);
    setModelo(REGRAS_CLASSE[c].modelos[0]!);
    if (!REGRAS_CLASSE[c].podeSecagem) setSecagem(false);
  }
  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const s = (k: string) => String(fd.get(k) ?? '');
    aoSalvar(etapa?.id ?? null, {
      codigo: s('codigo'), nome: s('nome'), classe, prefixoLote: s('prefixoLote'), unidadeEntrada: s('unidadeEntrada') as Unidade, unidadeSaida: s('unidadeSaida') as Unidade,
      modeloResultado: modelo, monitoraSecagem: secagem, umidadeMetaMin: s('umidadeMetaMin'), umidadeMetaMax: s('umidadeMetaMax'), exigeLocal: fd.get('exigeLocal') === 'on', tiposResultado: tipos,
    });
  }
  return (
    <form onSubmit={enviar} className="sombra grid gap-4 rounded-xl border border-linha bg-superficie p-5">
      <h3 className="font-display text-[17px] font-semibold">{etapa ? `Editar ${etapa.nome}` : 'Nova etapa'}</h3>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
        <Campo rotulo="Nome *"><Entrada name="nome" defaultValue={etapa?.nome} required /></Campo>
        <Campo rotulo="Código *" dica="Letras, números e _"><Entrada name="codigo" defaultValue={etapa?.codigo} required /></Campo>
        <Campo rotulo="Classe *" dica="Define o comportamento (§5.1)">
          <Selecao value={classe} onChange={(e) => mudarClasse(e.target.value as Classe)}>{CLASSES.map((c) => <option key={c} value={c}>{NOME_CLASSE[c]}</option>)}</Selecao>
        </Campo>
        <Campo rotulo="Prefixo do lote *" dica="2 ou 3 letras (§8)"><Entrada name="prefixoLote" defaultValue={etapa?.prefixoLote} maxLength={3} required /></Campo>
        <Campo rotulo="Recebe em">
          <Selecao name="unidadeEntrada" key={'e' + classe} defaultValue={etapa?.classe === classe ? etapa.unidadeEntrada : r.entrada[0]}>{r.entrada.map((u) => <option key={u} value={u}>{UN[u]}</option>)}</Selecao>
        </Campo>
        <Campo rotulo="Gera em">
          <Selecao name="unidadeSaida" key={'s' + classe} defaultValue={etapa?.classe === classe ? etapa.unidadeSaida : r.saida[0]}>{r.saida.map((u) => <option key={u} value={u}>{UN[u]}</option>)}</Selecao>
        </Campo>
        <Campo rotulo="Resultado">
          <Selecao value={modelo} onChange={(e) => setModelo(e.target.value as ModeloResultado)}>{r.modelos.map((m) => <option key={m} value={m}>{NOME_MODELO[m]}</option>)}</Selecao>
        </Campo>
        <label className="flex items-center gap-2 self-end pb-2.5 text-[13px] font-medium"><input type="checkbox" name="exigeLocal" defaultChecked={etapa?.exigeLocal} /> Exige local (terreiro, secador, quadra…)</label>
      </div>
      {modelo === 'PERCENTUAL_POR_TIPO' ? (
        <div className="grid gap-2">
          <b className="text-[13px]">Tipos de café que a etapa gera</b>
          <div className="flex flex-wrap gap-2">
            {tiposCafe.map((t) => (
              <label key={t.valor} className={cn('flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-[13px]', tipos.includes(t.valor) ? 'border-destaque bg-destaque-suave' : 'border-linha')}>
                <input type="checkbox" checked={tipos.includes(t.valor)} onChange={(e) => setTipos((v) => (e.target.checked ? [...v, t.valor] : v.filter((x) => x !== t.valor)))} /> {t.rotulo}
              </label>
            ))}
          </div>
        </div>
      ) : null}
      {r.podeSecagem ? (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] items-end gap-4">
          <label className="flex items-center gap-2 pb-2.5 text-[13px] font-medium"><input type="checkbox" checked={secagem} onChange={(e) => setSecagem(e.target.checked)} /> Aparece no painel de secagem</label>
          {secagem ? (
            <>
              <Campo rotulo="Umidade meta mínima (%)"><Entrada name="umidadeMetaMin" inputMode="decimal" defaultValue={etapa?.umidadeMetaMin?.replace('.', ',') ?? '11'} /></Campo>
              <Campo rotulo="Umidade meta máxima (%)"><Entrada name="umidadeMetaMax" inputMode="decimal" defaultValue={etapa?.umidadeMetaMax?.replace('.', ',') ?? '12,5'} /></Campo>
            </>
          ) : null}
        </div>
      ) : null}
      <div className="flex gap-2">
        <Botao type="submit" disabled={pendente}>{pendente ? 'Salvando…' : 'Salvar etapa'}</Botao>
        <Botao type="button" variante="secundario" onClick={aoCancelar}>Cancelar</Botao>
      </div>
    </form>
  );
}

function Transicoes({ etapas, transicoes, fazendas, podeEditar, pendente, aoSalvar }: { etapas: Etapa[]; transicoes: Transicao[]; fazendas: Opcao[]; podeEditar: boolean; pendente: boolean; aoSalvar: (fazendaId: string | null, pares: [string, string][]) => void }) {
  const [escopo, setEscopo] = useState<string>('');
  const doEscopo = useMemo(() => new Set(transicoes.filter((t) => (t.fazendaId ?? '') === escopo).map((t) => `${t.origem}>${t.destino}`)), [transicoes, escopo]);
  const [marcadas, setMarcadas] = useState<Set<string>>(doEscopo);
  const [base, setBase] = useState(doEscopo);
  if (base !== doEscopo) {
    setBase(doEscopo);
    setMarcadas(doEscopo);
  }
  const permitido = (o: Etapa, d: Etapa) => transicaoPermitida(o, d);
  const mudou = marcadas.size !== doEscopo.size || [...marcadas].some((k) => !doEscopo.has(k));
  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-[19px] font-semibold">Transições</h2>
          <p className="text-tinta-2">Marque para onde cada etapa pode transferir. Na fazenda, as transições próprias substituem as da empresa para aquela origem (§5.2).</p>
        </div>
        <Campo rotulo="Vale para" className="w-64">
          <Selecao value={escopo} onChange={(e) => setEscopo(e.target.value)} aria-label="Escopo das transições">
            <option value="">Empresa toda</option>
            {fazendas.map((f) => <option key={f.valor} value={f.valor}>Só na fazenda {f.rotulo}</option>)}
          </Selecao>
        </Campo>
      </div>
      <div className="sombra overflow-x-auto rounded-xl border border-linha bg-superficie">
        <table className="border-collapse text-[13px]">
          <thead>
            <tr>
              <th className="sticky left-0 bg-superficie-2 px-3 py-2.5 text-left font-mono text-[11px] tracking-wider text-tinta-2 uppercase">De ↓ · Para →</th>
              {etapas.map((d) => <th key={d.id} className="bg-superficie-2 px-2 py-2.5 text-center font-mono text-[11px] text-tinta-2" title={d.nome}>{d.prefixoLote}<div className="max-w-[90px] truncate font-sans text-[11px] font-normal normal-case">{d.nome}</div></th>)}
            </tr>
          </thead>
          <tbody>
            {etapas.map((o) => (
              <tr key={o.id} className="border-t border-linha">
                <th className="sticky left-0 bg-superficie px-3 py-2 text-left font-medium whitespace-nowrap">{o.nome} <span className="font-mono text-tinta-2">{o.prefixoLote}</span></th>
                {etapas.map((d) => {
                  const k = `${o.id}>${d.id}`;
                  const ok = permitido(o, d);
                  return (
                    <td key={d.id} className={cn('px-2 py-2 text-center', !ok && 'bg-superficie-2')}>
                      {ok ? (
                        <input type="checkbox" aria-label={`${o.nome} para ${d.nome}`} checked={marcadas.has(k)} disabled={!podeEditar} onChange={(e) => setMarcadas((m) => { const n = new Set(m); if (e.target.checked) n.add(k); else n.delete(k); return n; })} />
                      ) : <span className="text-tinta-2/50">·</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {podeEditar ? (
        <div className="flex items-center gap-3">
          <Botao disabled={!mudou || pendente} onClick={() => aoSalvar(escopo || null, [...marcadas].map((k) => k.split('>') as [string, string]))}>Salvar transições</Botao>
          {mudou ? <span className="text-[12.5px] text-aviso">Há alterações não salvas.</span> : null}
          {escopo && !doEscopo.size ? <span className="text-[12.5px] text-tinta-2">Esta fazenda usa as transições da empresa.</span> : null}
        </div>
      ) : null}
    </section>
  );
}
