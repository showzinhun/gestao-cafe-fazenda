'use client';
import Dexie, { liveQuery, type EntityTable } from 'dexie';
import { useEffect, useState } from 'react';

/**
 * Banco local do app de campo (§6.1, RN-23): IndexedDB via Dexie.
 * Um registro por colhedor, talhão e dia, com UUID gerado no aparelho. "pendente" = ainda não confirmado pelo servidor.
 */

export interface DadosCampo {
  fazendas: { id: string; codigo: string; nome: string }[];
  talhoes: { id: string; codigo: string; nome: string; fazendaId: string }[];
  turmas: { id: string; nome: string; fazendaId: string; colhedores: { id: string; nome: string; apelido: string | null }[] }[];
  safras: { id: string; codigo: string; inicio: string; fim: string }[];
  tipos: { id: string; codigo: string; nome: string }[];
}

export interface RegistroLocal {
  id: string;
  empresaId: string;
  data: string;
  fazendaId: string;
  talhaoId: string;
  safraId: string;
  turmaId: string | null;
  colhedorId: string;
  medidas: string; // texto canônico ("40.5"); nunca number
  criadoEm: string;
  alteradoEm: string;
  pendente: 0 | 1;
  versao: number | null;
  conflito: string | null;
  erro: string | null;
}

export interface LeituraLocal {
  id: string;
  empresaId: string;
  movimentoId: string;
  dataHora: string;
  umidade: string;
  temperaturaMassa: string | null;
  temperaturaAr: string | null;
  observacao: string | null;
  pendente: 0 | 1;
  erro: string | null;
}

export interface MovimentoSecagem {
  id: string;
  rotulo: string;
  local: string | null;
  volume: string;
  metaMin: string | null;
  metaMax: string | null;
  ultimaUmidade: string | null;
}

class BancoCampo extends Dexie {
  registros!: EntityTable<RegistroLocal, 'id'>;
  leituras!: EntityTable<LeituraLocal, 'id'>;
  secagem!: EntityTable<{ chave: string; movimentos: MovimentoSecagem[]; baixadoEm: string }, 'chave'>;
  cache!: EntityTable<{ chave: string; empresaId: string; dados: DadosCampo; baixadoEm: string }, 'chave'>;
  constructor() {
    super('cafe-campo');
    this.version(1).stores({ registros: 'id, empresaId, pendente, [empresaId+data+talhaoId], [empresaId+data+talhaoId+colhedorId]', cache: 'chave' });
    // Fase 5: leituras de secagem (§7) também funcionam sem sinal.
    this.version(2).stores({ leituras: 'id, empresaId, pendente, movimentoId', secagem: 'chave' });
  }
}

let banco: BancoCampo | null = null;
export const bancoCampo = () => (banco ??= new BancoCampo());

/** Identificador estável deste aparelho (vai junto na sincronização). */
export function dispositivoId(): string {
  try {
    let id = localStorage.getItem('cafe-dispositivo');
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem('cafe-dispositivo', id);
    }
    return id;
  } catch {
    return 'desconhecido';
  }
}

export function useConsulta<T>(fn: () => Promise<T>, deps: unknown[], inicial: T): T {
  const [v, setV] = useState<T>(inicial);
  useEffect(() => {
    const s = liveQuery(fn).subscribe({ next: setV, error: () => undefined });
    return () => s.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return v;
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const atualizar = () => setOnline(navigator.onLine);
    atualizar();
    window.addEventListener('online', atualizar);
    window.addEventListener('offline', atualizar);
    return () => {
      window.removeEventListener('online', atualizar);
      window.removeEventListener('offline', atualizar);
    };
  }, []);
  return online;
}

type Resultado =
  | { id: string; situacao: 'gravado' | 'repetido'; medidas: string; versao: number }
  | { id: string; situacao: 'conflito'; mensagem: string; medidas?: string; versao?: number }
  | { id: string; situacao: 'erro'; mensagem: string };

let sincronizando: Promise<{ enviados: number; conflitos: number }> | null = null;

/**
 * Envia os registros pendentes (RN-23). Reenviar é seguro: o servidor reconhece o UUID.
 * Conflito: vale o servidor; o registro local passa a mostrar o valor do servidor e a mensagem.
 */
export function sincronizarPendentes(empresaId: string): Promise<{ enviados: number; conflitos: number }> {
  if (sincronizando) return sincronizando;
  sincronizando = (async () => {
    const db = bancoCampo();
    const pendentes = await db.registros.where({ empresaId, pendente: 1 }).toArray();
    const leituras = await db.leituras.where({ empresaId, pendente: 1 }).toArray();
    if (!pendentes.length && !leituras.length) return { enviados: 0, conflitos: 0 };
    const r = await fetch('/api/campo/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        dispositivoId: dispositivoId(),
        apontamentos: pendentes.map((p) => ({ id: p.id, data: p.data, fazendaId: p.fazendaId, talhaoId: p.talhaoId, safraId: p.safraId, colhedorId: p.colhedorId, turmaId: p.turmaId, medidas: p.medidas, criadoEm: p.criadoEm, versaoBase: p.versao })),
        leituras: leituras.map((l) => ({ id: l.id, movimentoId: l.movimentoId, dataHora: l.dataHora, umidade: l.umidade, temperaturaMassa: l.temperaturaMassa, temperaturaAr: l.temperaturaAr, observacao: l.observacao })),
      }),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => null))?.mensagem ?? `Falha na sincronização (${r.status}).`);
    const { resultados, leituras: resLeituras = [] } = (await r.json()) as { resultados: Resultado[]; leituras?: { id: string; situacao: string; mensagem?: string }[] };
    let conflitos = 0;
    await db.transaction('rw', db.leituras, async () => {
      for (const res of resLeituras) await db.leituras.update(res.id, { pendente: 0, erro: res.situacao === 'erro' ? (res.mensagem ?? 'Erro.') : null });
    });
    await db.transaction('rw', db.registros, async () => {
      for (const res of resultados) {
        const local = await db.registros.get(res.id);
        if (!local) continue;
        // Se mudou de novo durante o envio, continua pendente.
        const mudouDepois = pendentes.find((p) => p.id === res.id)?.alteradoEm !== local.alteradoEm;
        if (res.situacao === 'conflito') {
          conflitos++;
          await db.registros.update(res.id, { pendente: 0, conflito: res.mensagem, erro: null, ...(res.medidas ? { medidas: res.medidas } : {}), ...(res.versao ? { versao: res.versao } : {}) });
        } else if (res.situacao === 'erro') await db.registros.update(res.id, { pendente: 0, erro: res.mensagem });
        else if (!mudouDepois) await db.registros.update(res.id, { pendente: 0, conflito: null, erro: null, versao: res.versao });
      }
    });
    return { enviados: resultados.length + resLeituras.length, conflitos };
  })().finally(() => {
    sincronizando = null;
  });
  return sincronizando;
}
