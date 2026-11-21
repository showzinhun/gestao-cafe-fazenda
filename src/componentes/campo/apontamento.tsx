'use client';
import { useEffect, useMemo, useState } from 'react';
import Decimal from 'decimal.js';
import { CloudOff, Minus, RefreshCw } from 'lucide-react';
import { bancoCampo, sincronizarPendentes, useConsulta, useOnline, type DadosCampo, type RegistroLocal } from '@/lib/campo-db';
import { formatarNumero } from '@/lib/formatacao';
import { paraApi } from '@/lib/formatos';
import { cn } from '@/lib/cn';

const PREFS = 'cafe-campo-escolha';

/** Tela do apontador (§6.1): teclado numérico grande, +1/+0,5, funciona sem sinal (RN-23). */
export function Apontamento({ empresaId, dadosServidor, hoje }: { empresaId: string; dadosServidor: DadosCampo | null; hoje: string }) {
  const online = useOnline();
  const [dados, setDados] = useState<DadosCampo | null>(dadosServidor);
  const [escolha, setEscolha] = useState<{ fazendaId: string; talhaoId: string; turmaId: string }>({ fazendaId: '', talhaoId: '', turmaId: '' });
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Guarda os cadastros no aparelho; sem sinal, usa a última cópia.
  useEffect(() => {
    const db = bancoCampo();
    if (dadosServidor) void db.cache.put({ chave: empresaId, empresaId, dados: dadosServidor, baixadoEm: new Date().toISOString() });
    else void db.cache.get(empresaId).then((c) => c && setDados(c.dados));
  }, [dadosServidor, empresaId]);

  useEffect(() => {
    if (!dados) return;
    let salvo: Partial<typeof escolha> = {};
    try {
      salvo = JSON.parse(localStorage.getItem(PREFS) ?? '{}');
    } catch {
      /* sem preferências */
    }
    const fazendaId = dados.fazendas.some((f) => f.id === salvo.fazendaId) ? salvo.fazendaId! : (dados.fazendas[0]?.id ?? '');
    const talhoes = dados.talhoes.filter((t) => t.fazendaId === fazendaId);
    const turmas = dados.turmas.filter((t) => t.fazendaId === fazendaId);
    setEscolha({
      fazendaId,
      talhaoId: talhoes.some((t) => t.id === salvo.talhaoId) ? salvo.talhaoId! : (talhoes[0]?.id ?? ''),
      turmaId: turmas.some((t) => t.id === salvo.turmaId) ? salvo.turmaId! : (turmas[0]?.id ?? ''),
    });
  }, [dados]);

  const mudar = (n: Partial<typeof escolha>) => {
    const novo = { ...escolha, ...n };
    if (n.fazendaId) {
      novo.talhaoId = dados?.talhoes.find((t) => t.fazendaId === n.fazendaId)?.id ?? '';
      novo.turmaId = dados?.turmas.find((t) => t.fazendaId === n.fazendaId)?.id ?? '';
    }
    setEscolha(novo);
    try {
      localStorage.setItem(PREFS, JSON.stringify(novo));
    } catch {
      /* ok */
    }
  };

  const registros = useConsulta(
    () => bancoCampo().registros.where('[empresaId+data+talhaoId]').equals([empresaId, hoje, escolha.talhaoId]).toArray(),
    [empresaId, hoje, escolha.talhaoId],
    [] as RegistroLocal[],
  );
  const pendentes = useConsulta(async () => (await bancoCampo().registros.where({ empresaId, pendente: 1 }).count()) + (await bancoCampo().leituras.where({ empresaId, pendente: 1 }).count()), [empresaId], 0);

  const sincronizar = async (silencioso = false) => {
    if (!navigator.onLine) return !silencioso && setAviso({ tipo: 'erro', texto: 'Sem sinal. Os apontamentos ficam guardados no aparelho.' });
    setEnviando(true);
    try {
      const r = await sincronizarPendentes(empresaId);
      if (!silencioso || r.conflitos) setAviso(r.conflitos ? { tipo: 'erro', texto: `${r.conflitos} apontamento(s) mudaram no escritório: vale o valor do servidor.` } : { tipo: 'ok', texto: r.enviados ? `${r.enviados} registro(s) sincronizado(s).` : 'Tudo em dia.' });
    } catch (e) {
      if (!silencioso) setAviso({ tipo: 'erro', texto: e instanceof Error ? e.message : 'Falha na sincronização.' });
    } finally {
      setEnviando(false);
    }
  };

  // Volta o sinal → sincroniza sozinho.
  useEffect(() => {
    if (online && pendentes) {
      const t = setTimeout(() => void sincronizar(true), 600);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, pendentes]);

  const safra = useMemo(() => dados?.safras.find((s) => s.inicio <= hoje && hoje <= s.fim) ?? dados?.safras[0], [dados, hoje]);
  const turma = dados?.turmas.find((t) => t.id === escolha.turmaId);
  const talhao = dados?.talhoes.find((t) => t.id === escolha.talhaoId);
  const total = registros.reduce((s, r) => s.plus(r.medidas || 0), new Decimal(0));

  const gravar = async (colhedorId: string, medidas: Decimal) => {
    if (!safra || !escolha.talhaoId) return;
    const db = bancoCampo();
    const agora = new Date().toISOString();
    const valor = Decimal.max(medidas, 0).toDecimalPlaces(3).toString();
    const atual = await db.registros.where('[empresaId+data+talhaoId+colhedorId]').equals([empresaId, hoje, escolha.talhaoId, colhedorId]).first();
    if (atual) await db.registros.update(atual.id, { medidas: valor, alteradoEm: agora, pendente: 1, erro: null });
    else
      await db.registros.add({
        id: crypto.randomUUID(), empresaId, data: hoje, fazendaId: escolha.fazendaId, talhaoId: escolha.talhaoId, safraId: safra.id, turmaId: escolha.turmaId || null,
        colhedorId, medidas: valor, criadoEm: agora, alteradoEm: agora, pendente: 1, versao: null, conflito: null, erro: null,
      });
  };

  if (!dados) return <p className="text-tinta-2">Sem dados no aparelho. Abra esta tela uma vez com sinal para baixar fazendas, talhões e turmas.</p>;
  if (!dados.fazendas.length) return <p className="text-tinta-2">Nenhuma fazenda liberada para você. Peça ao administrador.</p>;

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="col-span-2 grid gap-1 text-[12px] font-medium text-tinta-2">
          Fazenda
          <select className="h-11 rounded-lg border border-linha bg-superficie px-2 text-[15px] text-tinta" value={escolha.fazendaId} onChange={(e) => mudar({ fazendaId: e.target.value })}>
            {dados.fazendas.map((f) => <option key={f.id} value={f.id}>{f.codigo} · {f.nome}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-[12px] font-medium text-tinta-2">
          Talhão
          <select className="h-11 rounded-lg border border-linha bg-superficie px-2 text-[15px] text-tinta" value={escolha.talhaoId} onChange={(e) => mudar({ talhaoId: e.target.value })}>
            {dados.talhoes.filter((t) => t.fazendaId === escolha.fazendaId).map((t) => <option key={t.id} value={t.id}>{t.codigo} · {t.nome}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-[12px] font-medium text-tinta-2">
          Turma
          <select className="h-11 rounded-lg border border-linha bg-superficie px-2 text-[15px] text-tinta" value={escolha.turmaId} onChange={(e) => mudar({ turmaId: e.target.value })}>
            {dados.turmas.filter((t) => t.fazendaId === escolha.fazendaId).map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
        </label>
      </div>

      <div className={cn('flex items-center gap-2 rounded-xl px-3 py-2.5 text-[13px]', online ? 'bg-destaque-suave' : 'bg-aviso-fundo text-aviso')} role="status">
        {online ? <RefreshCw className={cn('size-4', enviando && 'animate-spin')} /> : <CloudOff className="size-4" />}
        <span className="flex-1">
          {online ? (pendentes ? `${pendentes} pendente(s) de sincronizar` : 'Tudo sincronizado') : `Sem sinal · ${pendentes} pendente(s) guardado(s) no aparelho`}
        </span>
        <button type="button" onClick={() => void sincronizar()} disabled={enviando} className="rounded-lg bg-destaque px-3 py-1.5 font-semibold text-destaque-tinta disabled:opacity-50">
          Sincronizar
        </button>
      </div>
      {aviso ? <p role="alert" className={cn('rounded-lg px-3 py-2 text-[13px]', aviso.tipo === 'ok' ? 'bg-ok-fundo text-ok' : 'bg-erro-fundo text-erro')}>{aviso.texto}</p> : null}

      <div className="flex items-baseline justify-between px-1">
        <b className="font-display text-[17px]">{talhao ? `Talhão ${talhao.codigo}` : 'Escolha o talhão'}</b>
        <span className="text-[13px] text-tinta-2">Total hoje <b className="font-mono text-[16px] text-tinta" data-testid="total-talhao">{formatarNumero(total)}</b> medidas</span>
      </div>

      <ul className="grid gap-2" aria-label="Colhedores">
        {(turma?.colhedores ?? []).map((c) => {
          const r = registros.find((x) => x.colhedorId === c.id);
          const valor = new Decimal(r?.medidas || 0);
          const nome = c.apelido ?? c.nome;
          return (
            <li key={c.id} className="sombra grid gap-2 rounded-2xl border border-linha bg-superficie p-3">
              <div className="flex items-center justify-between gap-2">
                <b className="text-[16px]">{nome}</b>
                {r ? <span className={cn('text-[11px] font-semibold', r.pendente ? 'text-aviso' : 'text-ok')}>{r.pendente ? 'pendente' : 'sincronizado'}</span> : null}
              </div>
              <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2">
                <input
                  aria-label={`Medidas de ${nome}`}
                  inputMode="decimal"
                  className="h-14 w-full rounded-xl border border-linha bg-fundo px-3 text-center font-mono text-[24px] font-semibold"
                  key={`${c.id}-${r?.alteradoEm ?? ''}-${r?.medidas ?? ''}`}
                  defaultValue={r ? formatarNumero(r.medidas) : ''}
                  placeholder="0"
                  onBlur={(e) => {
                    const t = e.target.value.trim();
                    if (!t && !r) return;
                    let d: Decimal;
                    try {
                      d = new Decimal(paraApi(t) || 0);
                    } catch {
                      return setAviso({ tipo: 'erro', texto: 'Medida inválida.' });
                    }
                    if (!d.eq(valor)) void gravar(c.id, d);
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                />
                <button type="button" aria-label={`Menos 1 para ${nome}`} className="grid h-14 w-12 place-items-center rounded-xl border border-linha bg-superficie" onClick={() => void gravar(c.id, valor.minus(1))}><Minus className="size-5" /></button>
                <button type="button" aria-label={`Mais meia medida para ${nome}`} className="h-14 w-14 rounded-xl border border-destaque bg-destaque-suave text-[16px] font-bold text-destaque" onClick={() => void gravar(c.id, valor.plus('0.5'))}>+0,5</button>
                <button type="button" aria-label={`Mais 1 para ${nome}`} className="h-14 w-14 rounded-xl bg-destaque text-[18px] font-bold text-destaque-tinta" onClick={() => void gravar(c.id, valor.plus(1))}>+1</button>
              </div>
              {r?.conflito ? <p className="text-[12.5px] text-erro">{r.conflito}</p> : null}
              {r?.erro ? <p className="text-[12.5px] text-erro">{r.erro}</p> : null}
            </li>
          );
        })}
      </ul>
      {turma && !turma.colhedores.length ? <p className="text-tinta-2">A turma não tem colhedores ativos.</p> : null}
    </div>
  );
}
