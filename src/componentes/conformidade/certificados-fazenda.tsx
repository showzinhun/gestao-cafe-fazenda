'use client';
import { Fragment, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { acaoAlterarCertificadoFazenda, acaoCertificadosFazenda, acaoStatusCertificado } from '@/app/(app)/conformidade/acoes';
import type { listarCertificadosFazenda } from '@/servicos/conformidade';
import { rotuloCertificacao } from '@/dominio/certificacao';
import { Botao } from '@/componentes/ui/botao';
import { Campo, Entrada } from '@/componentes/ui/campo';
import { Aviso } from '@/componentes/ui/aviso';
import { Selo } from '@/componentes/ui/selo';
import { ConfirmarComMotivo } from '@/componentes/operacao/comum';
import { SeloCertificado } from './selos';

type Linha = Awaited<ReturnType<typeof listarCertificadosFazenda>>[number];
type ItemCatalogo = { id: string; codigo: string; nome: string };
const data = (d: string) => d.split('-').reverse().join('/');

/**
 * Certificados da fazenda (§10). Marque os que a fazenda possui; o ID de cada um é opcional (nem todo certificado tem),
 * e "parcial" vale para certificação de só parte da fazenda. Base da herança de certificação (RN-08).
 */
export function CertificadosFazenda({ fazendaId, linhas, catalogo, podeEditar, hoje }: { fazendaId: string; linhas: Linha[]; catalogo: ItemCatalogo[]; podeEditar: boolean; hoje: string }) {
  const router = useRouter();
  const [novo, setNovo] = useState(false);
  const [marcados, setMarcados] = useState<string[]>([]);
  const [editando, setEditando] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  const rodar = (f: () => Promise<{ ok: boolean; mensagem?: string; erro?: string }>, depois?: () => void) =>
    iniciar(async () => {
      const r = await f();
      setMsg(r.ok ? { tipo: 'ok', texto: r.mensagem ?? '' } : { tipo: 'erro', texto: r.erro ?? '' });
      if (r.ok) { depois?.(); router.refresh(); }
    });
  const resumo = rotuloCertificacao(linhas.map((l) => ({ codigo: l.certificado, status: l.status, validadeInicio: l.validadeInicio, validadeFim: l.validadeFim, parcial: l.parcial })), hoje);
  const fechar = () => { setNovo(false); setMarcados([]); };
  return (
    <section className="sombra grid gap-3 rounded-xl border border-linha bg-superficie p-4" aria-labelledby="titulo-certificados">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="titulo-certificados" className="font-display text-[17px] font-semibold">Certificados</h2>
        <Selo tipo={resumo === 'Sem certificado' ? 'neutro' : 'ok'}>{resumo}</Selo>
        {podeEditar && !novo ? <Botao className="ml-auto" variante="secundario" onClick={() => setNovo(true)}>Cadastrar certificados</Botao> : null}
      </div>
      <p className="text-[12.5px] text-tinta-2">
        Um lote só tem o certificado se todas as fazendas da composição o tiverem válido na data (RN-08). Certificação <b>parcial</b> (só parte da fazenda) fica registrada, mas não passa para os lotes.
      </p>
      {msg ? <Aviso tipo={msg.tipo}>{msg.texto}</Aviso> : null}

      {novo ? (
        <form className="grid gap-3 rounded-lg border border-linha bg-superficie-2 p-3" onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          rodar(() => acaoCertificadosFazenda(fazendaId, f), fechar);
        }}>
          <p className="text-[13px]"><b>Marque os certificados que a fazenda possui.</b> O ID é opcional: preencha só quando o certificado tiver um.</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-[13px] [&_td]:px-2 [&_th]:px-2">
              <thead><tr className="text-left font-mono text-[10.5px] tracking-wider text-tinta-2 uppercase"><th scope="col" className="py-1.5">Certificado</th><th scope="col">ID (opcional)</th><th scope="col">Válido de</th><th scope="col">Válido até</th><th scope="col">Parcial</th><th scope="col">PDF (opcional)</th></tr></thead>
              <tbody>
                {catalogo.map((c) => {
                  const on = marcados.includes(c.id);
                  return (
                    <tr key={c.id} className="border-t border-linha align-middle">
                      <td className="py-1.5">
                        <label className="flex items-center gap-2">
                          <input type="checkbox" name="marcados" value={c.id} checked={on} onChange={(e) => setMarcados(e.target.checked ? [...marcados, c.id] : marcados.filter((x) => x !== c.id))} />
                          <span><b>{c.codigo}</b> <span className="text-tinta-2">{c.nome}</span></span>
                        </label>
                      </td>
                      <td><Entrada name={`numero_${c.id}`} aria-label={`ID do certificado ${c.codigo}`} disabled={!on} className="h-8 w-36" /></td>
                      <td><Entrada type="date" name={`inicio_${c.id}`} aria-label={`${c.codigo}: válido de`} disabled={!on} required={on} className="h-8" /></td>
                      <td><Entrada type="date" name={`fim_${c.id}`} aria-label={`${c.codigo}: válido até`} disabled={!on} required={on} className="h-8" /></td>
                      <td><input type="checkbox" name={`parcial_${c.id}`} aria-label={`${c.codigo}: certificação parcial`} disabled={!on} /></td>
                      <td><Entrada type="file" name={`arquivo_${c.id}`} aria-label={`PDF do certificado ${c.codigo}`} accept="application/pdf" disabled={!on} className="h-8 w-52" /></td>
                    </tr>
                  );
                })}
                {!catalogo.length ? <tr><td colSpan={6} className="py-3 text-tinta-2">Nenhum certificado no catálogo. Cadastre em Cadastros → Certificados.</td></tr> : null}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2"><Botao type="submit" disabled={pendente || !marcados.length}>Salvar certificados marcados</Botao><Botao type="button" variante="secundario" onClick={fechar}>Cancelar</Botao></div>
        </form>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-[13px] [&_td]:px-2 [&_th]:px-2">
          <thead><tr className="text-left font-mono text-[10.5px] tracking-wider text-tinta-2 uppercase"><th scope="col" className="py-1.5">Certificado</th><th scope="col">ID</th><th scope="col">Validade</th><th scope="col">Situação</th><th scope="col">Arquivo</th><th scope="col" /></tr></thead>
          <tbody>
            {linhas.map((c) => (
              <Fragment key={c.id}>
                <tr className="border-t border-linha align-top">
                  <td className="py-2 font-semibold">{c.certificado}<div className="text-[12px] font-normal text-tinta-2">{c.nomeCertificado}</div></td>
                  <td className="py-2 font-mono">{c.numero ?? <span className="text-tinta-2">sem ID</span>}</td>
                  <td className="py-2 whitespace-nowrap">{data(c.validadeInicio)} a {data(c.validadeFim)}</td>
                  <td className="py-2">
                    <span className="inline-flex flex-wrap gap-1"><SeloCertificado situacao={c.situacao} dias={c.diasRestantes} />{c.parcial ? <Selo tipo="aviso">Parcial</Selo> : null}</span>
                    {c.motivoStatus ? <div className="text-[12px] text-tinta-2">{c.motivoStatus}</div> : null}
                  </td>
                  <td className="py-2">{c.arquivo ? <a className="text-destaque underline underline-offset-2" href={`/api/arquivos/${c.arquivo.id}`} target="_blank" rel="noreferrer">{c.arquivo.nome}</a> : '—'}</td>
                  <td className="py-1 text-right whitespace-nowrap">
                    {podeEditar ? (
                      <span className="inline-flex flex-wrap items-start justify-end gap-1">
                        <Botao tamanho="pequeno" variante="secundario" aria-label={`Editar ${c.certificado}`} onClick={() => setEditando(editando === c.id ? null : c.id)}>Editar</Botao>
                        {c.status === 'VALIDO' ? <ConfirmarComMotivo rotulo="Suspender" titulo={`Suspender ${c.certificado}?`} explicacao="Lotes novos deixam de herdar este certificado." pendente={pendente} aoConfirmar={(m) => rodar(() => acaoStatusCertificado(c.id, 'SUSPENSO', m))} /> : null}
                        {c.status === 'SUSPENSO' ? <Botao tamanho="pequeno" variante="secundario" disabled={pendente} onClick={() => rodar(() => acaoStatusCertificado(c.id, 'VALIDO'))}>Reativar</Botao> : null}
                      </span>
                    ) : null}
                  </td>
                </tr>
                {editando === c.id ? (
                  <tr>
                    <td colSpan={6} className="pb-3">
                      <form className="grid gap-3 rounded-lg border border-linha bg-superficie-2 p-3" onSubmit={(e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        rodar(() => acaoAlterarCertificadoFazenda(c.id, f), () => setEditando(null));
                      }}>
                        <b className="text-[13.5px]">Corrigir {c.certificado}</b>
                        <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
                          <Campo rotulo="ID do certificado (opcional)"><Entrada name="numero" defaultValue={c.numero ?? ''} /></Campo>
                          <Campo rotulo="Válido de"><Entrada type="date" name="validadeInicio" defaultValue={c.validadeInicio} required /></Campo>
                          <Campo rotulo="Válido até"><Entrada type="date" name="validadeFim" defaultValue={c.validadeFim} required /></Campo>
                          <Campo rotulo="Novo PDF (opcional)"><Entrada type="file" name="arquivo" accept="application/pdf" /></Campo>
                        </div>
                        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="parcial" defaultChecked={c.parcial} /> Certificação parcial (só parte da fazenda)</label>
                        <div className="flex gap-2"><Botao type="submit" disabled={pendente}>Salvar</Botao><Botao type="button" variante="secundario" onClick={() => setEditando(null)}>Cancelar</Botao></div>
                      </form>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
            {!linhas.length ? <tr><td colSpan={6} className="py-4 text-tinta-2">Sem certificado: os lotes desta fazenda saem convencionais.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
