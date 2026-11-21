'use client';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { FileUp, PenLine, Plus, Trash2 } from 'lucide-react';
import type { Geometry, Polygon } from 'geojson';
import { alternarAtivo, salvarCadastro } from '@/app/(app)/cadastros/acoes';
import { Botao } from '@/componentes/ui/botao';
import { Campo, Entrada } from '@/componentes/ui/campo';
import { Aviso } from '@/componentes/ui/aviso';
import { Selo } from '@/componentes/ui/selo';
import type { TalhaoMapa } from '@/componentes/mapa/mapa-talhoes';
import { cn } from '@/lib/cn';

const MapaTalhoes = dynamic(() => import('@/componentes/mapa/mapa-talhoes').then((m) => m.MapaTalhoes), { ssr: false, loading: () => <div className="h-[380px] rounded-xl border border-linha bg-superficie-2" /> });

export interface Talhao {
  id: string;
  codigo: string;
  nome: string;
  areaHaInformada: string | null;
  areaHaCalculada: string | null;
  variedade: string | null;
  anoPlantio: number | null;
  geometria: Geometry | null;
  geometriaTipo: 'PONTO' | 'POLIGONO' | null;
  ativo: boolean;
}

type Msg = { tipo: 'ok' | 'aviso' | 'erro'; texto: string } | null;
const ha = (v: string | null) => (v ? Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ha' : '—');

/** Talhões da fazenda: tabela, mapa, desenho e importação de GeoJSON (§10, geometria). */
export function GestaoTalhoes({ fazendaId, talhoes, podeEditar }: { fazendaId: string; talhoes: Talhao[]; podeEditar: boolean }) {
  const router = useRouter();
  const [editando, setEditando] = useState<Talhao | 'novo' | null>(null);
  const [destaque, setDestaque] = useState<string | null>(null);
  const [desenhando, setDesenhando] = useState(false);
  const [geoNova, setGeoNova] = useState<{ geometria: unknown; origem: string } | null | undefined>(undefined); // undefined = não muda; null = remover
  const [msg, setMsg] = useState<Msg>(null);
  const [pendente, iniciar] = useTransition();
  const arquivo = useRef<HTMLInputElement>(null);
  const ativos = talhoes.filter((t) => t.ativo);
  const noMapa: TalhaoMapa[] = ativos.map((t) => ({ id: t.id, codigo: t.codigo, geometria: t.id === (editando !== 'novo' && editando ? editando.id : '') && geoNova ? (geoNova.geometria as Geometry) : t.geometria }));
  if (editando === 'novo' && geoNova) noMapa.push({ id: 'novo', codigo: 'novo', geometria: geoNova.geometria as Geometry });

  function abrir(t: Talhao | 'novo') {
    setMsg(null);
    setGeoNova(undefined);
    setDesenhando(false);
    setEditando(t);
    setDestaque(t === 'novo' ? 'novo' : t.id);
  }

  function lerArquivo(f: File) {
    const r = new FileReader();
    r.onload = () => {
      try {
        setGeoNova({ geometria: JSON.parse(String(r.result)), origem: f.name });
        setMsg({ tipo: 'ok', texto: `Arquivo ${f.name} carregado. A área é calculada ao salvar.` });
      } catch {
        setMsg({ tipo: 'erro', texto: 'O arquivo não é um GeoJSON válido.' });
      }
    };
    r.readAsText(f);
  }

  function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const dados: Record<string, unknown> = Object.fromEntries(['codigo', 'nome', 'areaHaInformada', 'variedade', 'anoPlantio'].map((k) => [k, String(fd.get(k) ?? '') || null]));
    dados.fazendaId = fazendaId;
    if (geoNova !== undefined) dados.geometria = geoNova === null ? null : geoNova.geometria;
    iniciar(async () => {
      const res = await salvarCadastro('talhoes', editando === 'novo' || !editando ? null : editando.id, dados);
      if (!res.ok) return setMsg({ tipo: 'erro', texto: res.erro });
      setEditando(null);
      setGeoNova(undefined);
      setMsg(res.avisos?.length ? { tipo: 'aviso', texto: `${res.mensagem} ${res.avisos.join(' ')}` } : { tipo: 'ok', texto: res.mensagem ?? 'Salvo.' });
      router.refresh();
    });
  }

  const atual = editando && editando !== 'novo' ? editando : null;
  return (
    <div className="grid gap-4">
      {msg ? <Aviso tipo={msg.tipo}>{msg.texto}</Aviso> : null}
      <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <MapaTalhoes
          talhoes={noMapa}
          destaque={destaque}
          desenhando={desenhando}
          aoCancelarDesenho={() => setDesenhando(false)}
          aoConcluirDesenho={(p: Polygon) => {
            setGeoNova({ geometria: p, origem: 'desenho' });
            setDesenhando(false);
            setMsg({ tipo: 'ok', texto: 'Polígono desenhado. Salve o talhão para gravar e calcular a área.' });
          }}
        />
        <div className="grid content-start gap-3">
          {editando ? (
            <form onSubmit={salvar} className="sombra grid gap-3 rounded-xl border border-linha bg-superficie p-4" key={atual?.id ?? 'novo'}>
              <h3 className="font-display text-[17px] font-semibold">{atual ? `Talhão ${atual.codigo}` : 'Novo talhão'}</h3>
              <div className="grid grid-cols-2 gap-3">
                <Campo rotulo="Código *" dica="Ex.: T1"><Entrada name="codigo" defaultValue={atual?.codigo ?? ''} required /></Campo>
                <Campo rotulo="Nome *"><Entrada name="nome" defaultValue={atual?.nome ?? ''} required /></Campo>
                <Campo rotulo="Área informada (ha)"><Entrada name="areaHaInformada" inputMode="decimal" defaultValue={atual?.areaHaInformada?.replace('.', ',') ?? ''} /></Campo>
                <Campo rotulo="Variedade"><Entrada name="variedade" defaultValue={atual?.variedade ?? ''} /></Campo>
                <Campo rotulo="Ano de plantio"><Entrada name="anoPlantio" inputMode="numeric" defaultValue={atual?.anoPlantio ?? ''} /></Campo>
                <Campo rotulo="Área calculada"><Entrada readOnly value={atual?.areaHaCalculada ? ha(atual.areaHaCalculada) : '—'} /></Campo>
              </div>
              <div className="grid gap-2 rounded-lg bg-superficie-2 p-3 text-[13px]">
                <b>Geometria (WGS84)</b>
                <span className="text-tinta-2">
                  {geoNova === null ? 'Será removida ao salvar.' : geoNova ? `Nova geometria: ${geoNova.origem === 'desenho' ? 'desenhada no mapa' : geoNova.origem}.` : atual?.geometriaTipo ? `Atual: ${atual.geometriaTipo === 'PONTO' ? 'ponto' : 'polígono'}.` : 'Sem geometria.'}
                </span>
                <div className="flex flex-wrap gap-2">
                  <Botao type="button" variante="secundario" tamanho="pequeno" onClick={() => arquivo.current?.click()}>
                    <FileUp className="size-3.5" /> Importar GeoJSON
                  </Botao>
                  <Botao type="button" variante="secundario" tamanho="pequeno" onClick={() => setDesenhando(true)} disabled={desenhando}>
                    <PenLine className="size-3.5" /> Desenhar no mapa
                  </Botao>
                  {atual?.geometriaTipo || geoNova ? (
                    <Botao type="button" variante="secundario" tamanho="pequeno" onClick={() => setGeoNova(null)}>
                      <Trash2 className="size-3.5" /> Remover geometria
                    </Botao>
                  ) : null}
                </div>
                <input ref={arquivo} type="file" accept=".geojson,.json,application/geo+json,application/json" className="hidden" aria-label="Arquivo GeoJSON" onChange={(e) => e.target.files?.[0] && lerArquivo(e.target.files[0])} />
              </div>
              <div className="flex gap-2">
                <Botao type="submit" disabled={pendente}>{pendente ? 'Salvando…' : 'Salvar talhão'}</Botao>
                <Botao type="button" variante="secundario" onClick={() => { setEditando(null); setGeoNova(undefined); setDesenhando(false); }}>Cancelar</Botao>
              </div>
            </form>
          ) : podeEditar ? (
            <Botao className="justify-self-start" onClick={() => abrir('novo')}>
              <Plus className="size-4" /> Novo talhão
            </Botao>
          ) : null}
          <div className="sombra overflow-x-auto rounded-xl border border-linha bg-superficie">
            <table className="w-full min-w-[600px] border-collapse text-[13.5px]">
              <thead>
                <tr className="bg-superficie-2 text-left font-mono text-[11px] tracking-wider text-tinta-2 uppercase">
                  <th className="px-3 py-2.5">Talhão</th><th className="px-3 py-2.5 text-right">Informada</th><th className="px-3 py-2.5 text-right">Calculada</th><th className="px-3 py-2.5">Geometria</th><th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {talhoes.length ? talhoes.map((t) => (
                  <tr key={t.id} className={cn('border-t border-linha', destaque === t.id && 'bg-destaque-suave', !t.ativo && 'opacity-60')} onMouseEnter={() => t.ativo && setDestaque(t.id)}>
                    <td className="px-3 py-2"><b className="font-mono">{t.codigo}</b> <span className="text-tinta-2">{t.nome}</span></td>
                    <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{ha(t.areaHaInformada)}</td>
                    <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{ha(t.areaHaCalculada)}</td>
                    <td className="px-3 py-2">{!t.ativo ? <Selo tipo="neutro">Inativo</Selo> : t.geometriaTipo === 'POLIGONO' ? <Selo>Polígono</Selo> : t.geometriaTipo === 'PONTO' ? <Selo tipo="aviso">Ponto</Selo> : <Selo tipo="erro">Sem geometria</Selo>}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {podeEditar ? (
                        <div className="inline-flex items-center gap-1.5">
                          {t.ativo ? <Botao variante="secundario" tamanho="pequeno" onClick={() => abrir(t)}>Editar</Botao> : null}
                          <Botao variante="secundario" tamanho="pequeno" disabled={pendente} onClick={() => iniciar(async () => { const r = await alternarAtivo('talhoes', t.id, !t.ativo); setMsg(r.ok ? { tipo: 'ok', texto: r.mensagem ?? '' } : { tipo: 'erro', texto: r.erro }); router.refresh(); })}>
                            {t.ativo ? 'Inativar' : 'Reativar'}
                          </Botao>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan={5} className="px-3 py-6 text-center text-tinta-2">Nenhum talhão. Use Novo talhão e desenhe ou importe o polígono.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
