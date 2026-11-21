'use client';
import { useEffect, useState } from 'react';
import Decimal from 'decimal.js';
import { CloudOff, RefreshCw } from 'lucide-react';
import { bancoCampo, sincronizarPendentes, useConsulta, useOnline, type LeituraLocal, type MovimentoSecagem } from '@/lib/campo-db';
import { formatarNumero } from '@/lib/formatacao';
import { paraApi } from '@/lib/formatos';
import { cn } from '@/lib/cn';

/** Leituras de secagem no celular (§7): ficam no aparelho e sincronizam quando houver sinal (RN-23). */
export function LeiturasCampo({ empresaId, movimentosServidor }: { empresaId: string; movimentosServidor: MovimentoSecagem[] | null }) {
  const online = useOnline();
  const [movimentos, setMovimentos] = useState<MovimentoSecagem[] | null>(movimentosServidor);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const chave = `${empresaId}:secagem`;

  useEffect(() => {
    const db = bancoCampo();
    if (movimentosServidor) void db.secagem.put({ chave, movimentos: movimentosServidor, baixadoEm: new Date().toISOString() });
    else void db.secagem.get(chave).then((c) => c && setMovimentos(c.movimentos));
  }, [movimentosServidor, chave]);

  const locais = useConsulta(() => bancoCampo().leituras.where({ empresaId }).toArray(), [empresaId], [] as LeituraLocal[]);
  const pendentes = locais.filter((l) => l.pendente).length;

  const sincronizar = async (silencioso = false) => {
    if (!navigator.onLine) return !silencioso && setAviso({ tipo: 'erro', texto: 'Sem sinal. As leituras ficam guardadas no aparelho.' });
    try {
      const r = await sincronizarPendentes(empresaId);
      if (!silencioso) setAviso({ tipo: 'ok', texto: r.enviados ? `${r.enviados} registro(s) sincronizado(s).` : 'Tudo em dia.' });
    } catch (e) {
      if (!silencioso) setAviso({ tipo: 'erro', texto: e instanceof Error ? e.message : 'Falha na sincronização.' });
    }
  };
  useEffect(() => {
    if (online && pendentes) {
      const t = setTimeout(() => void sincronizar(true), 600);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, pendentes]);

  if (!movimentos) return <p className="text-tinta-2">Sem dados no aparelho. Abra esta tela uma vez com sinal.</p>;

  return (
    <div className="grid gap-3">
      <div className={cn('flex items-center gap-2 rounded-xl px-3 py-2.5 text-[13px]', online ? 'bg-destaque-suave' : 'bg-aviso-fundo text-aviso')} role="status">
        {online ? <RefreshCw className="size-4" /> : <CloudOff className="size-4" />}
        <span className="flex-1">{online ? (pendentes ? `${pendentes} leitura(s) pendente(s)` : 'Tudo sincronizado') : `Sem sinal · ${pendentes} leitura(s) guardada(s) no aparelho`}</span>
        <button type="button" onClick={() => void sincronizar()} className="rounded-lg bg-destaque px-3 py-1.5 font-semibold text-destaque-tinta">Sincronizar</button>
      </div>
      {aviso ? <p className={cn('rounded-lg px-3 py-2 text-[13px]', aviso.tipo === 'ok' ? 'bg-ok-fundo text-ok' : 'bg-erro-fundo text-erro')}>{aviso.texto}</p> : null}
      {!movimentos.length ? <p className="text-tinta-2">Nenhum lote em secagem agora.</p> : null}
      <ul className="grid gap-2" aria-label="Lotes em secagem">
        {movimentos.map((m) => {
          const doMov = locais.filter((l) => l.movimentoId === m.id).sort((a, b) => a.dataHora.localeCompare(b.dataHora));
          const ultima = doMov.at(-1)?.umidade ?? m.ultimaUmidade;
          const naMeta = ultima && m.metaMin && m.metaMax && new Decimal(ultima).gte(m.metaMin) && new Decimal(ultima).lte(m.metaMax);
          return (
            <li key={m.id} className={cn('sombra grid gap-2 rounded-2xl border bg-superficie p-3', naMeta ? 'border-ok' : 'border-linha')}>
              <button type="button" className="flex items-center justify-between gap-2 text-left" onClick={() => setAberto(aberto === m.id ? null : m.id)} aria-expanded={aberto === m.id}>
                <span className="grid"><b className="text-[15px]">{m.rotulo}</b><span className="text-[12px] text-tinta-2">{m.local ? `Local ${m.local} · ` : ''}{formatarNumero(m.volume)} medidas{m.metaMin ? ` · meta ${formatarNumero(m.metaMin, 1)}–${formatarNumero(m.metaMax!, 1)}%` : ''}</span></span>
                <span className="text-right">{ultima ? <b className={cn('font-mono text-[20px]', naMeta && 'text-ok')}>{formatarNumero(ultima, 1)}%</b> : <span className="text-[12px] text-tinta-2">sem leitura</span>}{naMeta ? <span className="block text-[11px] font-bold text-ok">no ponto</span> : null}</span>
              </button>
              {aberto === m.id ? <FormLeitura nome={m.rotulo} aoSalvar={async (d) => {
                await bancoCampo().leituras.add({ id: crypto.randomUUID(), empresaId, movimentoId: m.id, dataHora: new Date().toISOString(), pendente: 1, erro: null, ...d });
                setAviso(null);
              }} /> : null}
              {doMov.some((l) => l.erro) ? <p className="text-[12.5px] text-erro">{doMov.find((l) => l.erro)!.erro}</p> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function FormLeitura({ nome, aoSalvar }: { nome: string; aoSalvar: (d: { umidade: string; temperaturaMassa: string | null; temperaturaAr: string | null; observacao: string | null }) => Promise<void> }) {
  const [erro, setErro] = useState<string | null>(null);
  return (
    <form className="grid gap-2" onSubmit={async (e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const v = (k: string) => String(f.get(k) ?? '').trim();
      let u: Decimal;
      try {
        u = new Decimal(paraApi(v('umidade')));
      } catch {
        return setErro('Umidade inválida.');
      }
      if (u.lt(0) || u.gt(100)) return setErro('Umidade entre 0 e 100%.');
      const dados = { umidade: u.toString(), temperaturaMassa: v('massa') ? paraApi(v('massa')) : null, temperaturaAr: v('ar') ? paraApi(v('ar')) : null, observacao: v('obs') || null };
      // Limpa já, para a próxima leitura não se perder enquanto esta é gravada.
      e.currentTarget.reset();
      setErro(null);
      await aoSalvar(dados);
    }}>
      <input name="umidade" aria-label={`Umidade de ${nome}`} inputMode="decimal" placeholder="Umidade %" required className="h-14 rounded-xl border border-linha bg-fundo px-3 text-center font-mono text-[24px] font-semibold" />
      <div className="grid grid-cols-2 gap-2">
        <input name="massa" aria-label="Temperatura da massa" inputMode="decimal" placeholder="Massa °C" className="h-11 rounded-lg border border-linha bg-fundo px-3 text-center font-mono" />
        <input name="ar" aria-label="Temperatura do ar" inputMode="decimal" placeholder="Ar °C" className="h-11 rounded-lg border border-linha bg-fundo px-3 text-center font-mono" />
      </div>
      <input name="obs" aria-label="Observação" placeholder="Observação" className="h-11 rounded-lg border border-linha bg-fundo px-3" />
      {erro ? <p className="text-[12.5px] text-erro">{erro}</p> : null}
      <button type="submit" className="h-12 rounded-xl bg-destaque text-[16px] font-bold text-destaque-tinta">Registrar leitura</button>
    </form>
  );
}
