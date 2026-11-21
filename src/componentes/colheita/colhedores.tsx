'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, Plus } from 'lucide-react';
import { acaoAtivoColhedor, acaoRevelar, acaoSalvarColhedor, acaoSalvarTurma } from '@/app/(app)/colheita/acoes';
import { Botao } from '@/componentes/ui/botao';
import { Campo, Entrada } from '@/componentes/ui/campo';
import { Selecao } from '@/componentes/ui/selecao';
import { Selo } from '@/componentes/ui/selo';
import { Aviso } from '@/componentes/ui/aviso';
import { Abas } from '@/componentes/operacao/comum';

type Colhedor = { id: string; nome: string; apelido: string | null; telefone: string | null; turmaId: string | null; turma: string | null; cpf: string | null; chavePix: string | null; ativo: boolean };
type Turma = { id: string; nome: string; fazendaId: string; fazenda: string; responsavel: string | null; ativo: boolean; colhedores: number };
type Msg = { tipo: 'ok' | 'erro'; texto: string } | null;

/**
 * Colhedores e turmas (§4.5). CPF e PIX aparecem mascarados; "Revelar" (FINANCEIRO/ADMIN) mostra o dado aberto
 * só nesta tela e registra na auditoria (§3.3).
 */
export function TelaColhedores({ colhedores, turmas, fazendas, podeEditar, podeRevelar }: { colhedores: Colhedor[]; turmas: Turma[]; fazendas: { valor: string; rotulo: string }[]; podeEditar: boolean; podeRevelar: boolean }) {
  const router = useRouter();
  const [aba, setAba] = useState<'colhedores' | 'turmas'>('colhedores');
  const [editando, setEditando] = useState<Colhedor | 'novo' | null>(null);
  const [editTurma, setEditTurma] = useState<Turma | 'nova' | null>(null);
  const [revelados, setRevelados] = useState<Record<string, { cpf: string | null; chavePix: string | null }>>({});
  const [msg, setMsg] = useState<Msg>(null);
  const [pendente, iniciar] = useTransition();
  const rodar = (f: () => Promise<{ ok: boolean; mensagem?: string; erro?: string }>, depois?: () => void) =>
    iniciar(async () => {
      const r = await f();
      setMsg(r.ok ? { tipo: 'ok', texto: r.mensagem ?? '' } : { tipo: 'erro', texto: r.erro ?? '' });
      if (r.ok) {
        depois?.();
        router.refresh();
      }
    });
  return (
    <>
      <Abas<'colhedores' | 'turmas'> rotulo="Cadastros da colheita" atual={aba} aoTrocar={setAba} abas={[{ id: 'colhedores', rotulo: 'Colhedores', conta: colhedores.filter((c) => c.ativo).length }, { id: 'turmas', rotulo: 'Turmas', conta: turmas.filter((t) => t.ativo).length }]} />
      {msg ? <Aviso tipo={msg.tipo}>{msg.texto}</Aviso> : null}
      {aba === 'colhedores' ? (
        <>
          <p className="text-[13.5px] text-tinta-2">CPF e chave PIX são dados pessoais: ficam cifrados e aparecem mascarados. {podeRevelar ? 'Revelar fica registrado na auditoria.' : 'Só o financeiro e o administrador veem sem máscara.'}</p>
          {podeEditar && !editando ? <Botao className="justify-self-start" onClick={() => setEditando('novo')}><Plus className="size-4" /> Novo colhedor</Botao> : null}
          {editando ? (
            <FormColhedor
              atual={editando === 'novo' ? null : editando}
              turmas={turmas.filter((t) => t.ativo)}
              pendente={pendente}
              aoCancelar={() => setEditando(null)}
              aoSalvar={(d) => rodar(() => acaoSalvarColhedor(editando === 'novo' ? null : editando.id, d), () => setEditando(null))}
            />
          ) : null}
          <div className="sombra overflow-x-auto rounded-xl border border-linha bg-superficie">
            <table className="w-full min-w-[820px] border-collapse text-[13.5px]">
              <thead>
                <tr className="bg-superficie-2 text-left font-mono text-[11px] tracking-wider text-tinta-2 uppercase">
                  <th className="px-3 py-3">Colhedor</th><th className="px-3 py-3">Turma</th><th className="px-3 py-3">CPF</th><th className="px-3 py-3">Chave PIX</th><th className="px-3 py-3">Situação</th><th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {colhedores.map((c) => {
                  const r = revelados[c.id];
                  return (
                    <tr key={c.id} className={`border-t border-linha ${c.ativo ? '' : 'opacity-60'}`}>
                      <td className="px-3 py-2.5"><b>{c.nome}</b>{c.apelido ? <span className="text-tinta-2"> · {c.apelido}</span> : null}{c.telefone ? <div className="text-[12px] text-tinta-2">{c.telefone}</div> : null}</td>
                      <td className="px-3 py-2.5">{c.turma ?? '—'}</td>
                      <td className="px-3 py-2.5 font-mono">{r ? r.cpf ?? '—' : c.cpf ?? '—'}</td>
                      <td className="px-3 py-2.5 font-mono text-[12.5px]">{r ? r.chavePix ?? '—' : c.chavePix ?? '—'}</td>
                      <td className="px-3 py-2.5">{c.ativo ? <Selo>Ativo</Selo> : <Selo tipo="neutro">Inativo</Selo>}</td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="inline-flex gap-1.5">
                          {podeRevelar && (c.cpf || c.chavePix) && !r ? (
                            <Botao variante="secundario" tamanho="pequeno" aria-label={`Revelar dados de ${c.nome}`} disabled={pendente} onClick={() => iniciar(async () => {
                              const x = await acaoRevelar(c.id);
                              if (x.ok && x.dados) setRevelados({ ...revelados, [c.id]: x.dados });
                              else if (!x.ok) setMsg({ tipo: 'erro', texto: x.erro });
                            })}><Eye className="size-3.5" /> Revelar</Botao>
                          ) : null}
                          {podeEditar ? <Botao variante="secundario" tamanho="pequeno" onClick={() => setEditando(c)}>Editar</Botao> : null}
                          {podeEditar ? <Botao variante="secundario" tamanho="pequeno" disabled={pendente} onClick={() => rodar(() => acaoAtivoColhedor(c.id, !c.ativo))}>{c.ativo ? 'Inativar' : 'Reativar'}</Botao> : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!colhedores.length ? <tr><td colSpan={6} className="px-3 py-8 text-center text-tinta-2">Nenhum colhedor cadastrado.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          {podeEditar && !editTurma ? <Botao className="justify-self-start" onClick={() => setEditTurma('nova')}><Plus className="size-4" /> Nova turma</Botao> : null}
          {editTurma ? (
            <form className="sombra grid gap-4 rounded-xl border border-linha bg-superficie p-5" onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              rodar(() => acaoSalvarTurma(editTurma === 'nova' ? null : editTurma.id, { fazendaId: String(f.get('fazendaId')), nome: String(f.get('nome')), responsavel: String(f.get('responsavel') ?? '') }), () => setEditTurma(null));
            }}>
              <h2 className="font-display text-[19px] font-semibold">{editTurma === 'nova' ? 'Nova turma' : 'Editar turma'}</h2>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
                <Campo rotulo="Fazenda *"><Selecao name="fazendaId" defaultValue={editTurma === 'nova' ? fazendas[0]?.valor : editTurma.fazendaId} required>{fazendas.map((f) => <option key={f.valor} value={f.valor}>{f.rotulo}</option>)}</Selecao></Campo>
                <Campo rotulo="Nome *"><Entrada name="nome" defaultValue={editTurma === 'nova' ? '' : editTurma.nome} required /></Campo>
                <Campo rotulo="Responsável (turmeiro)"><Entrada name="responsavel" defaultValue={editTurma === 'nova' ? '' : (editTurma.responsavel ?? '')} /></Campo>
              </div>
              <div className="flex gap-2"><Botao type="submit" disabled={pendente}>Salvar</Botao><Botao type="button" variante="secundario" onClick={() => setEditTurma(null)}>Cancelar</Botao></div>
            </form>
          ) : null}
          <div className="sombra overflow-x-auto rounded-xl border border-linha bg-superficie">
            <table className="w-full min-w-[560px] border-collapse text-[13.5px]">
              <thead><tr className="bg-superficie-2 text-left font-mono text-[11px] tracking-wider text-tinta-2 uppercase"><th className="px-3 py-3">Turma</th><th className="px-3 py-3">Fazenda</th><th className="px-3 py-3">Responsável</th><th className="px-3 py-3 text-right">Colhedores</th><th className="px-3 py-3" /></tr></thead>
              <tbody>
                {turmas.map((t) => (
                  <tr key={t.id} className="border-t border-linha">
                    <td className="px-3 py-2.5"><b>{t.nome}</b></td><td className="px-3 py-2.5">{t.fazenda}</td><td className="px-3 py-2.5">{t.responsavel ?? '—'}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{t.colhedores}</td>
                    <td className="px-3 py-2.5 text-right">{podeEditar ? <Botao variante="secundario" tamanho="pequeno" onClick={() => setEditTurma(t)}>Editar</Botao> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

function FormColhedor({ atual, turmas, pendente, aoSalvar, aoCancelar }: { atual: Colhedor | null; turmas: Turma[]; pendente: boolean; aoSalvar: (d: { nome: string; apelido: string; turmaId: string; telefone: string; cpf: string; chavePix: string }) => void; aoCancelar: () => void }) {
  return (
    <form className="sombra grid gap-4 rounded-xl border border-linha bg-superficie p-5" onSubmit={(e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const v = (k: string) => String(f.get(k) ?? '');
      aoSalvar({ nome: v('nome'), apelido: v('apelido'), turmaId: v('turmaId'), telefone: v('telefone'), cpf: v('cpf'), chavePix: v('chavePix') });
    }}>
      <h2 className="font-display text-[19px] font-semibold">{atual ? 'Editar colhedor' : 'Novo colhedor'}</h2>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
        <Campo rotulo="Nome *"><Entrada name="nome" defaultValue={atual?.nome} required /></Campo>
        <Campo rotulo="Apelido" dica="Como aparece no app de campo"><Entrada name="apelido" defaultValue={atual?.apelido ?? ''} /></Campo>
        <Campo rotulo="Turma"><Selecao name="turmaId" defaultValue={atual?.turmaId ?? ''}><option value="">Sem turma</option>{turmas.map((t) => <option key={t.id} value={t.id}>{t.fazenda} · {t.nome}</option>)}</Selecao></Campo>
        <Campo rotulo="Telefone"><Entrada name="telefone" defaultValue={atual?.telefone ?? ''} /></Campo>
        <Campo rotulo="CPF" dica={atual?.cpf ? `Atual ${atual.cpf}. Deixe em branco para manter.` : 'Guardado cifrado'}><Entrada name="cpf" autoComplete="off" /></Campo>
        <Campo rotulo="Chave PIX" dica={atual?.chavePix ? `Atual ${atual.chavePix}. Deixe em branco para manter.` : 'Guardada cifrada'}><Entrada name="chavePix" autoComplete="off" /></Campo>
      </div>
      <div className="flex gap-2"><Botao type="submit" disabled={pendente}>Salvar</Botao><Botao type="button" variante="secundario" onClick={aoCancelar}>Cancelar</Botao></div>
    </form>
  );
}
