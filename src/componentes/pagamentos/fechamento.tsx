'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileDown, FileText } from 'lucide-react';
import { acaoAbrirFechamento, acaoAtualizarFechamento, acaoCancelarFechamento, acaoFechar, acaoLancar, acaoPagar, acaoReabrir } from '@/app/(app)/colheita/acoes';
import { Botao, estiloBotao } from '@/componentes/ui/botao';
import { Campo, Entrada } from '@/componentes/ui/campo';
import { Selecao } from '@/componentes/ui/selecao';
import { Indicador } from '@/componentes/ui/cartao';
import { Aviso } from '@/componentes/ui/aviso';
import { Abas, ConfirmarComMotivo, LinhaDoTempo, SeloSituacao, dataHora, num } from '@/componentes/operacao/comum';
import { formatarMoeda } from '@/lib/formatacao';
import { paraApi } from '@/lib/formatos';

const hojeIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const data = (iso: string) => iso.split('-').reverse().join('/');

export function NovoFechamento({ fazendas }: { fazendas: { valor: string; rotulo: string }[] }) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  return (
    <form
      className="sombra grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] items-end gap-3 rounded-xl border border-linha bg-superficie p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        iniciar(async () => {
          const r = await acaoAbrirFechamento({ fazendaId: String(f.get('fazendaId')), periodoInicio: String(f.get('inicio')), periodoFim: String(f.get('fim')) });
          if (!r.ok) return setErro(r.erro);
          router.push(`/pagamentos/${r.dados}`);
        });
      }}
    >
      <Campo rotulo="Fazenda"><Selecao name="fazendaId" defaultValue={fazendas.find((f) => f.rotulo.startsWith('NS'))?.valor ?? fazendas[0]?.valor}>{fazendas.map((f) => <option key={f.valor} value={f.valor}>{f.rotulo}</option>)}</Selecao></Campo>
      <Campo rotulo="Início"><Entrada type="date" name="inicio" defaultValue={hojeIso()} required /></Campo>
      <Campo rotulo="Fim"><Entrada type="date" name="fim" defaultValue={hojeIso()} required /></Campo>
      <Botao type="submit" disabled={pendente}>Abrir fechamento</Botao>
      {erro ? <div className="col-span-full"><Aviso tipo="erro">{erro}</Aviso></div> : null}
    </form>
  );
}

type F = {
  id: string; numero: number; status: string; fazenda: string; periodoInicio: string; periodoFim: string; fechadoEm: string | null; pagoEm: string | null; motivoReabertura: string | null; motivoCancelamento: string | null;
  totais: { medidas: string; bruto: string; descontos: string; liquido: string };
  itens: { colhedorId: string; colhedor: string; cpf: string | null; chavePix: string | null; medidas: string; bruto: string; adiantamentos: string; descontos: string; adicionais: string; liquido: string }[];
  apontamentos: { id: string; data: string; colhedor: string; talhao: string; medidas: string; valorUnitario: string | null; congelado: boolean; status: string }[];
  lancamentos: { id: string; data: string; colhedor: string; tipo: string; valor: string; descricao: string | null }[];
};

export function DetalheFechamento({ f, admin, podePix }: { f: F; admin: boolean; podePix: boolean }) {
  const router = useRouter();
  const [aba, setAba] = useState<'itens' | 'apontamentos' | 'lancamentos'>('itens');
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  const rodar = (fn: () => Promise<{ ok: boolean; mensagem?: string; erro?: string }>) =>
    iniciar(async () => {
      const r = await fn();
      setMsg(r.ok ? { tipo: 'ok', texto: r.mensagem ?? '' } : { tipo: 'erro', texto: r.erro ?? '' });
      if (r.ok) router.refresh();
    });
  const semPreco = f.apontamentos.filter((a) => !a.valorUnitario).length;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2.5">
        <SeloSituacao status={f.status} />
        <span className="text-[13px] text-tinta-2">{f.fazenda} · {data(f.periodoInicio)} a {data(f.periodoFim)}</span>
        <div className="ml-auto flex flex-wrap items-start gap-2">
          <Link href="/pagamentos" className={estiloBotao({ variante: 'secundario' })}>Voltar</Link>
          {(f.status === 'FECHADO' || f.status === 'PAGO') && podePix ? <a href={`/api/pagamentos/fechamentos/${f.id}/pix.csv`} className={estiloBotao({ variante: 'secundario' })}><FileDown className="size-4" /> Lista PIX</a> : null}
          {f.status === 'FECHADO' || f.status === 'PAGO' ? <a href={`/api/pagamentos/fechamentos/${f.id}/recibos.pdf`} target="_blank" rel="noreferrer" className={estiloBotao({ variante: 'secundario' })}><FileText className="size-4" /> Recibos (PDF)</a> : null}
          {f.status === 'ABERTO' ? <Botao variante="secundario" disabled={pendente} onClick={() => rodar(() => acaoAtualizarFechamento(f.id))}>Recalcular</Botao> : null}
          {f.status === 'ABERTO' ? <Botao disabled={pendente || semPreco > 0 || !f.apontamentos.length} onClick={() => rodar(() => acaoFechar(f.id))}>Fechar período</Botao> : null}
          {f.status === 'FECHADO' ? <Botao disabled={pendente} onClick={() => rodar(() => acaoPagar(f.id))}>Marcar como pago</Botao> : null}
          {f.status === 'FECHADO' && admin ? <ConfirmarComMotivo rotulo="Reabrir" perigo={false} titulo="Reabrir o fechamento?" explicacao="Os apontamentos voltam a pendentes e o preço deixa de estar congelado." pendente={pendente} aoConfirmar={(m) => rodar(() => acaoReabrir(f.id, m))} /> : null}
          {f.status === 'ABERTO' ? <ConfirmarComMotivo rotulo="Cancelar" titulo="Cancelar o fechamento?" explicacao="Os apontamentos ficam livres para outro período." pendente={pendente} aoConfirmar={(m) => rodar(() => acaoCancelarFechamento(f.id, m))} /> : null}
        </div>
      </div>
      {msg ? <Aviso tipo={msg.tipo}>{msg.texto}</Aviso> : null}
      {f.status === 'ABERTO' && semPreco ? <Aviso tipo="erro">{semPreco} apontamento(s) sem preço vigente. Cadastre a tabela de preços de colheita antes de fechar.</Aviso> : null}
      {f.motivoReabertura && f.status !== 'PAGO' ? <Aviso tipo="aviso">Reaberto: {f.motivoReabertura}</Aviso> : null}
      <LinhaDoTempo passos={[
        { etapa: 'Aberto', feita: true, quando: null, quem: null },
        { etapa: 'Fechado', feita: !!f.fechadoEm || f.status === 'PAGO', quando: f.fechadoEm, quem: null },
        { etapa: 'Pago', feita: f.status === 'PAGO', quando: f.pagoEm, quem: null },
      ]} />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
        <Indicador valor={num(f.totais.medidas)} rotulo="medidas" />
        <Indicador valor={formatarMoeda(f.totais.bruto)} rotulo="bruto (com adicionais)" cor="ok" />
        <Indicador valor={formatarMoeda(f.totais.descontos)} rotulo="adiantamentos e descontos" cor="erro" />
        <Indicador valor={formatarMoeda(f.totais.liquido)} rotulo="líquido a pagar" cor="ouro" />
      </div>
      <Abas<'itens' | 'apontamentos' | 'lancamentos'> rotulo="Seções do fechamento" atual={aba} aoTrocar={setAba} abas={[{ id: 'itens', rotulo: 'Por colhedor', conta: f.itens.length }, { id: 'apontamentos', rotulo: 'Apontamentos', conta: f.apontamentos.length }, { id: 'lancamentos', rotulo: 'Adiantamentos e descontos', conta: f.lancamentos.length }]} />
      {aba === 'itens' ? (
        <div className="sombra overflow-x-auto rounded-xl border border-linha bg-superficie">
          <table className="w-full min-w-[820px] border-collapse text-[13.5px]">
            <thead><tr className="bg-superficie-2 text-left font-mono text-[11px] tracking-wider text-tinta-2 uppercase"><th className="px-3 py-3">Colhedor</th><th className="px-3 py-3">CPF</th><th className="px-3 py-3 text-right">Medidas</th><th className="px-3 py-3 text-right">Bruto</th><th className="px-3 py-3 text-right">Adicionais</th><th className="px-3 py-3 text-right">Adiant.</th><th className="px-3 py-3 text-right">Descontos</th><th className="px-3 py-3 text-right">Líquido</th></tr></thead>
            <tbody>
              {f.itens.map((i) => (
                <tr key={i.colhedorId} className="border-t border-linha">
                  <td className="px-3 py-2.5"><b>{i.colhedor}</b></td><td className="px-3 py-2.5 font-mono text-[12.5px]">{i.cpf ?? '—'}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{num(i.medidas)}</td><td className="px-3 py-2.5 text-right font-mono">{formatarMoeda(i.bruto)}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{formatarMoeda(i.adicionais)}</td><td className="px-3 py-2.5 text-right font-mono">{formatarMoeda(i.adiantamentos)}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{formatarMoeda(i.descontos)}</td><td className="px-3 py-2.5 text-right font-mono font-semibold">{formatarMoeda(i.liquido)}</td>
                </tr>
              ))}
              {!f.itens.length ? <tr><td colSpan={8} className="px-3 py-8 text-center text-tinta-2">Nenhum apontamento pendente no período.</td></tr> : null}
            </tbody>
          </table>
        </div>
      ) : null}
      {aba === 'apontamentos' ? (
        <div className="sombra overflow-x-auto rounded-xl border border-linha bg-superficie">
          <table className="w-full min-w-[620px] border-collapse text-[13.5px]">
            <thead><tr className="bg-superficie-2 text-left font-mono text-[11px] tracking-wider text-tinta-2 uppercase"><th className="px-3 py-3">Dia</th><th className="px-3 py-3">Colhedor</th><th className="px-3 py-3">Talhão</th><th className="px-3 py-3 text-right">Medidas</th><th className="px-3 py-3 text-right">Preço</th><th className="px-3 py-3">Situação</th></tr></thead>
            <tbody>
              {f.apontamentos.map((a) => (
                <tr key={a.id} className="border-t border-linha">
                  <td className="px-3 py-2.5">{data(a.data)}</td><td className="px-3 py-2.5">{a.colhedor}</td><td className="px-3 py-2.5">{a.talhao}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{num(a.medidas)}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{a.valorUnitario ? formatarMoeda(a.valorUnitario) : <span className="text-erro">sem preço</span>}{a.congelado ? <span className="ml-1 text-[11px] text-tinta-2">congelado</span> : null}</td>
                  <td className="px-3 py-2.5"><SeloSituacao status={a.status === 'PENDENTE' ? 'ABERTO' : a.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {aba === 'lancamentos' ? (
        <div className="grid gap-3">
          {f.status === 'ABERTO' ? <NovoLancamento itens={f.itens} pendente={pendente} aoSalvar={(d) => rodar(() => acaoLancar(d))} padraoData={f.periodoFim} /> : null}
          <div className="sombra overflow-x-auto rounded-xl border border-linha bg-superficie">
            <table className="w-full min-w-[560px] border-collapse text-[13.5px]">
              <thead><tr className="bg-superficie-2 text-left font-mono text-[11px] tracking-wider text-tinta-2 uppercase"><th className="px-3 py-3">Dia</th><th className="px-3 py-3">Colhedor</th><th className="px-3 py-3">Tipo</th><th className="px-3 py-3 text-right">Valor</th><th className="px-3 py-3">Descrição</th></tr></thead>
              <tbody>
                {f.lancamentos.map((l) => (
                  <tr key={l.id} className="border-t border-linha"><td className="px-3 py-2.5">{data(l.data)}</td><td className="px-3 py-2.5">{l.colhedor}</td><td className="px-3 py-2.5">{l.tipo.toLowerCase()}</td><td className="px-3 py-2.5 text-right font-mono">{formatarMoeda(l.valor)}</td><td className="px-3 py-2.5">{l.descricao ?? '—'}</td></tr>
                ))}
                {!f.lancamentos.length ? <tr><td colSpan={5} className="px-3 py-6 text-center text-tinta-2">Sem lançamentos.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
      <p className="text-[12px] text-tinta-2">Atualizado em {dataHora(new Date())}.</p>
    </>
  );
}

function NovoLancamento({ itens, pendente, aoSalvar, padraoData }: { itens: F['itens']; pendente: boolean; aoSalvar: (d: Parameters<typeof acaoLancar>[0]) => void; padraoData: string }) {
  return (
    <form className="sombra grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] items-end gap-3 rounded-xl border border-linha bg-superficie p-4" onSubmit={(e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      aoSalvar({ colhedorId: String(f.get('colhedorId')), data: String(f.get('data')), tipo: f.get('tipo') as 'ADIANTAMENTO', valor: paraApi(String(f.get('valor'))), descricao: String(f.get('descricao') ?? '') });
    }}>
      <Campo rotulo="Colhedor"><Selecao name="colhedorId" required>{itens.map((i) => <option key={i.colhedorId} value={i.colhedorId}>{i.colhedor}</option>)}</Selecao></Campo>
      <Campo rotulo="Tipo"><Selecao name="tipo"><option value="ADIANTAMENTO">Adiantamento</option><option value="DESCONTO">Desconto</option><option value="ADICIONAL">Adicional</option></Selecao></Campo>
      <Campo rotulo="Valor (R$)"><Entrada name="valor" inputMode="decimal" required /></Campo>
      <Campo rotulo="Dia"><Entrada type="date" name="data" defaultValue={padraoData} required /></Campo>
      <Campo rotulo="Descrição"><Entrada name="descricao" /></Campo>
      <Botao type="submit" disabled={pendente || !itens.length}>Lançar</Botao>
    </form>
  );
}
