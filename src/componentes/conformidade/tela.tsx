'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { acaoChecarTalhao, acaoImportarChecagem } from '@/app/(app)/conformidade/acoes';
import type { painelConformidade } from '@/servicos/conformidade';
import { Botao } from '@/componentes/ui/botao';
import { Campo, Entrada } from '@/componentes/ui/campo';
import { Selecao } from '@/componentes/ui/selecao';
import { Aviso } from '@/componentes/ui/aviso';
import { Indicador } from '@/componentes/ui/cartao';
import { Selo } from '@/componentes/ui/selo';
import { Abas, Documentos } from '@/componentes/operacao/comum';
import { SeloCertificado, SeloChecagem, SeloEudr } from './selos';

type Painel = Awaited<ReturnType<typeof painelConformidade>>;
type Aba = 'talhoes' | 'certificados' | 'dossies';
const data = (d: string | null | undefined) => (d ? d.split('-').reverse().join('/') : '—');
const ha = (v: string | null) => (v ? `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ha` : '—');

/** Conformidade (§10, §12 item 13). */
export function TelaConformidade({ painel, podeEditar, hoje }: { painel: Painel; podeEditar: boolean; hoje: string }) {
  const router = useRouter();
  const [aba, setAba] = useState<Aba>('talhoes');
  const [filtro, setFiltro] = useState<'todos' | 'pendencias'>('pendencias');
  const [importando, setImportando] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  const r = painel.resumo;
  const rodar = (f: () => Promise<{ ok: boolean; mensagem?: string; erro?: string }>, depois?: () => void) =>
    iniciar(async () => {
      const x = await f();
      setMsg(x.ok ? { tipo: 'ok', texto: x.mensagem ?? '' } : { tipo: 'erro', texto: x.erro ?? '' });
      if (x.ok) { depois?.(); router.refresh(); }
    });
  const talhoes = filtro === 'todos' ? painel.talhoes : painel.talhoes.filter((t) => t.situacao !== 'APTO');
  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
        <Indicador valor={r.talhoesAptos} rotulo="talhões aptos à EUDR" cor="ok" />
        <Indicador valor={r.talhoesPendentes} rotulo="talhões com checagem pendente" cor="ouro" />
        <Indicador valor={r.talhoesBloqueados} rotulo="talhões bloqueados" cor="erro" />
        <Indicador valor={r.certificadosVencendo + r.certificadosVencidos} rotulo="certificados vencendo ou vencidos" cor="ouro" />
        <Indicador valor={r.dossiesPendentes} rotulo="dossiês pendentes" cor="destaque" />
      </div>
      {msg ? <Aviso tipo={msg.tipo}>{msg.texto}</Aviso> : null}
      <Abas<Aba> rotulo="Seções da conformidade" atual={aba} aoTrocar={setAba} abas={[
        { id: 'talhoes', rotulo: 'Talhões e EUDR', conta: r.talhoesPendentes + r.talhoesBloqueados },
        { id: 'certificados', rotulo: 'Certificados', conta: painel.certificados.length },
        { id: 'dossies', rotulo: 'Dossiês pendentes', conta: painel.dossies.length },
      ]} />

      {aba === 'talhoes' ? (
        <section className="sombra grid gap-3 rounded-xl border border-linha bg-superficie p-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-display text-[17px] font-semibold">Geometria e checagem de desmatamento</h2>
            <span className="text-[12.5px] text-tinta-2">Data de corte EUDR: 31/12/2020. A checagem vale para a versão do desenho em que foi feita.</span>
            <label className="ml-auto flex items-center gap-2 text-[13px]">Mostrar
              <Selecao value={filtro} onChange={(e) => setFiltro(e.target.value as 'todos')} aria-label="Filtro de talhões" className="h-8 w-auto">
                <option value="pendencias">Só com pendência</option><option value="todos">Todos</option>
              </Selecao>
            </label>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] border-collapse text-[13px] [&_td]:px-2 [&_th]:px-2">
              <thead><tr className="text-left font-mono text-[10.5px] tracking-wider text-tinta-2 uppercase"><th className="py-1.5">Talhão</th><th>Área</th><th>Geometria</th><th>Última checagem</th><th>Situação</th><th>Pendência</th><th /></tr></thead>
              <tbody>
                {talhoes.map((t) => (
                  <tr key={t.id} className="border-t border-linha align-top">
                    <td className="py-2 whitespace-nowrap"><Link href={`/cadastros/fazendas/${t.fazendaId}`} className="font-mono font-semibold text-destaque hover:underline">{t.fazenda}/{t.codigo}</Link><div className="text-[12px] text-tinta-2">{t.nome}</div></td>
                    <td className="py-2 whitespace-nowrap">{ha(t.areaHa)}</td>
                    <td className="py-2">{t.geometriaTipo === 'POLIGONO' ? 'polígono' : t.geometriaTipo === 'PONTO' ? 'ponto' : '—'}</td>
                    <td className="py-2 whitespace-nowrap">{t.ultimaChecagem ? <><SeloChecagem resultado={t.ultimaChecagem.resultado} /> <span className="text-[12px] text-tinta-2">{data(t.ultimaChecagem.dataChecagem)}</span></> : '—'}</td>
                    <td className="py-2"><SeloEudr situacao={t.situacao} /></td>
                    <td className="py-2 text-[12.5px]">{t.pendencias.join(' ') || '—'}</td>
                    <td className="py-2 text-right whitespace-nowrap">
                      {podeEditar && t.geometriaTipo ? (
                        <span className="inline-flex gap-1">
                          <Botao tamanho="pequeno" variante="secundario" disabled={pendente} onClick={() => rodar(() => acaoChecarTalhao(t.id))} aria-label={`Checar ${t.fazenda}/${t.codigo}`}>Checar</Botao>
                          <Botao tamanho="pequeno" variante="secundario" onClick={() => setImportando(importando === t.id ? null : t.id)} aria-label={`Importar laudo de ${t.fazenda}/${t.codigo}`}>Importar laudo</Botao>
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {!talhoes.length ? <tr><td colSpan={7} className="py-4 text-tinta-2">Nenhum talhão com pendência.</td></tr> : null}
              </tbody>
            </table>
          </div>
          {importando ? (() => {
            const t = painel.talhoes.find((x) => x.id === importando)!;
            return (
              <form className="grid gap-3 rounded-lg border border-linha bg-superficie-2 p-3" onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                rodar(() => acaoImportarChecagem(t.id, f), () => setImportando(null));
              }}>
                <b className="text-[14px]">Importar laudo de desmatamento: {t.fazenda}/{t.codigo}</b>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
                  <Campo rotulo="Resultado"><Selecao name="resultado" defaultValue="SEM_ALERTA"><option value="SEM_ALERTA">Sem alerta</option><option value="ALERTA">Alerta</option><option value="INCONCLUSIVO">Inconclusiva</option><option value="ERRO">Erro</option></Selecao></Campo>
                  <Campo rotulo="Data da checagem"><Entrada type="date" name="dataChecagem" defaultValue={hoje} max={hoje} required /></Campo>
                  <Campo rotulo="Provedor / laboratório"><Entrada name="provedor" defaultValue="Importação manual" required /></Campo>
                  <Campo rotulo="Área do alerta (ha)"><Entrada name="areaAlertaHa" inputMode="decimal" /></Campo>
                  <Campo rotulo="Evidência (PDF, até 5 MB)"><Entrada type="file" name="arquivo" accept="application/pdf" /></Campo>
                </div>
                <Campo rotulo="Observação"><Entrada name="observacao" /></Campo>
                <div className="flex gap-2"><Botao type="submit" disabled={pendente}>Importar</Botao><Botao type="button" variante="secundario" onClick={() => setImportando(null)}>Cancelar</Botao></div>
              </form>
            );
          })() : null}
          <p className="text-[12px] text-tinta-2">“Checar” usa o provedor de demonstração (sempre sem alerta), até haver um provedor real configurado. Para laudos de outros provedores, use “Importar laudo”.</p>
          <Documentos csv={{ nome: 'conformidade-talhoes', linhas: [['Fazenda', 'Talhão', 'Área (ha)', 'Geometria', 'Checagem', 'Data', 'Situação', 'Pendências'], ...painel.talhoes.map((t) => [t.fazenda, t.codigo, t.areaHa, t.geometriaTipo, t.ultimaChecagem?.resultado ?? null, t.ultimaChecagem?.dataChecagem ?? null, t.situacao, t.pendencias.join(' ')])] }} />
        </section>
      ) : null}

      {aba === 'certificados' ? (
        <section className="sombra grid gap-3 rounded-xl border border-linha bg-superficie p-4">
          <h2 className="font-display text-[17px] font-semibold">Certificados das fazendas</h2>
          <p className="text-[12.5px] text-tinta-2">Alertas a 60, 30 e 7 dias do fim da validade. Para cadastrar, renovar ou suspender, abra a fazenda.</p>
          <table className="w-full border-collapse text-[13px] [&_td]:px-2 [&_th]:px-2">
            <thead><tr className="text-left font-mono text-[10.5px] tracking-wider text-tinta-2 uppercase"><th className="py-1.5">Fazenda</th><th>Certificado</th><th>Número</th><th>Validade</th><th>Situação</th></tr></thead>
            <tbody>
              {painel.certificados.map((c) => (
                <tr key={c.id} className="border-t border-linha">
                  <td className="py-2"><Link href={`/cadastros/fazendas/${c.fazenda.id}`} className="font-mono font-semibold text-destaque hover:underline">{c.fazenda.codigo}</Link></td>
                  <td>{c.certificado}</td><td>{c.numero ?? '—'}</td><td>{data(c.validadeInicio)} a {data(c.validadeFim)}</td><td><span className="inline-flex flex-wrap gap-1"><SeloCertificado situacao={c.situacao} dias={c.diasRestantes} />{c.parcial ? <Selo tipo="aviso">Parcial</Selo> : null}</span></td>
                </tr>
              ))}
              {!painel.certificados.length ? <tr><td colSpan={5} className="py-4 text-tinta-2">Nenhum certificado cadastrado.</td></tr> : null}
            </tbody>
          </table>
        </section>
      ) : null}

      {aba === 'dossies' ? (
        <section className="sombra grid gap-3 rounded-xl border border-linha bg-superficie p-4">
          <h2 className="font-display text-[17px] font-semibold">Dossiês pendentes</h2>
          <table className="w-full border-collapse text-[13px] [&_td]:px-2 [&_th]:px-2">
            <thead><tr className="text-left font-mono text-[10.5px] tracking-wider text-tinta-2 uppercase"><th className="py-1.5">Embarque</th><th>Contrato</th><th>EUDR</th><th>Pendência</th></tr></thead>
            <tbody>
              {painel.dossies.map((d) => (
                <tr key={d.id} className="border-t border-linha">
                  <td className="py-2"><Link href={`/embarques/${d.id}`} className="font-mono font-semibold text-destaque hover:underline">{d.rotulo}</Link></td>
                  <td className="font-mono">{d.contrato}</td><td>{d.exigeEudr ? 'exigida' : '—'}</td><td>{d.motivo}</td>
                </tr>
              ))}
              {!painel.dossies.length ? <tr><td colSpan={4} className="py-4 text-tinta-2">Nenhum dossiê pendente.</td></tr> : null}
            </tbody>
          </table>
        </section>
      ) : null}
    </>
  );
}
