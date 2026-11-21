'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { acaoCertificadoFazenda, acaoStatusCertificado } from '@/app/(app)/conformidade/acoes';
import type { listarCertificadosFazenda } from '@/servicos/conformidade';
import { Botao } from '@/componentes/ui/botao';
import { Campo, Entrada } from '@/componentes/ui/campo';
import { Selecao } from '@/componentes/ui/selecao';
import { Aviso } from '@/componentes/ui/aviso';
import { ConfirmarComMotivo } from '@/componentes/operacao/comum';
import { SeloCertificado } from './selos';

type Linha = Awaited<ReturnType<typeof listarCertificadosFazenda>>[number];
const data = (d: string) => d.split('-').reverse().join('/');

/** Certificados da fazenda com validade e PDF (§10). Base da herança de certificação (RN-08). */
export function CertificadosFazenda({ fazendaId, linhas, certificados, podeEditar }: { fazendaId: string; linhas: Linha[]; certificados: { valor: string; rotulo: string }[]; podeEditar: boolean }) {
  const router = useRouter();
  const [novo, setNovo] = useState(false);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  const rodar = (f: () => Promise<{ ok: boolean; mensagem?: string; erro?: string }>, depois?: () => void) =>
    iniciar(async () => {
      const r = await f();
      setMsg(r.ok ? { tipo: 'ok', texto: r.mensagem ?? '' } : { tipo: 'erro', texto: r.erro ?? '' });
      if (r.ok) { depois?.(); router.refresh(); }
    });
  return (
    <section className="sombra grid gap-3 rounded-xl border border-linha bg-superficie p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-[17px] font-semibold">Certificados</h2>
        <span className="text-[12.5px] text-tinta-2">Um lote só tem o certificado se todas as fazendas da composição o tiverem válido na data (RN-08).</span>
        {podeEditar && !novo ? <Botao className="ml-auto" variante="secundario" onClick={() => setNovo(true)}>Novo certificado</Botao> : null}
      </div>
      {msg ? <Aviso tipo={msg.tipo}>{msg.texto}</Aviso> : null}
      {novo ? (
        <form className="grid gap-3 rounded-lg border border-linha bg-superficie-2 p-3" onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          rodar(() => acaoCertificadoFazenda(fazendaId, f), () => setNovo(false));
        }}>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
            <Campo rotulo="Certificado"><Selecao name="certificadoId" required>{certificados.map((c) => <option key={c.valor} value={c.valor}>{c.rotulo}</option>)}</Selecao></Campo>
            <Campo rotulo="Número"><Entrada name="numero" /></Campo>
            <Campo rotulo="Válido de"><Entrada type="date" name="validadeInicio" required /></Campo>
            <Campo rotulo="Válido até"><Entrada type="date" name="validadeFim" required /></Campo>
            <Campo rotulo="Arquivo (PDF, até 5 MB)"><Entrada type="file" name="arquivo" accept="application/pdf" /></Campo>
          </div>
          <div className="flex gap-2"><Botao type="submit" disabled={pendente}>Salvar certificado</Botao><Botao type="button" variante="secundario" onClick={() => setNovo(false)}>Cancelar</Botao></div>
        </form>
      ) : null}
      <table className="w-full border-collapse text-[13px] [&_td]:px-2 [&_th]:px-2">
        <thead><tr className="text-left font-mono text-[10.5px] tracking-wider text-tinta-2 uppercase"><th className="py-1.5">Certificado</th><th>Número</th><th>Validade</th><th>Situação</th><th>Arquivo</th><th /></tr></thead>
        <tbody>
          {linhas.map((c) => (
            <tr key={c.id} className="border-t border-linha align-top">
              <td className="py-2 font-semibold">{c.certificado}</td><td className="py-2">{c.numero ?? '—'}</td>
              <td className="py-2">{data(c.validadeInicio)} a {data(c.validadeFim)}</td>
              <td className="py-2"><SeloCertificado situacao={c.situacao} dias={c.diasRestantes} />{c.motivoStatus ? <div className="text-[12px] text-tinta-2">{c.motivoStatus}</div> : null}</td>
              <td className="py-2">{c.arquivo ? <a className="text-destaque hover:underline" href={`/api/arquivos/${c.arquivo.id}`} target="_blank" rel="noreferrer">{c.arquivo.nome}</a> : '—'}</td>
              <td className="py-1 text-right">
                {podeEditar && c.status === 'VALIDO' ? <ConfirmarComMotivo rotulo="Suspender" titulo={`Suspender ${c.certificado}?`} explicacao="Lotes novos deixam de herdar este certificado." pendente={pendente} aoConfirmar={(m) => rodar(() => acaoStatusCertificado(c.id, 'SUSPENSO', m))} /> : null}
                {podeEditar && c.status === 'SUSPENSO' ? <Botao tamanho="pequeno" variante="secundario" disabled={pendente} onClick={() => rodar(() => acaoStatusCertificado(c.id, 'VALIDO'))}>Reativar</Botao> : null}
              </td>
            </tr>
          ))}
          {!linhas.length ? <tr><td colSpan={6} className="py-4 text-tinta-2">Nenhum certificado: os lotes desta fazenda saem convencionais.</td></tr> : null}
        </tbody>
      </table>
    </section>
  );
}
