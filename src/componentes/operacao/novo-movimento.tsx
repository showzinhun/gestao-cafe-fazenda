'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { acaoAbrirMovimento } from '@/app/(app)/operacao/acoes';
import { Botao, estiloBotao } from '@/componentes/ui/botao';
import { Campo, Entrada } from '@/componentes/ui/campo';
import { Selecao } from '@/componentes/ui/selecao';
import { Aviso } from '@/componentes/ui/aviso';
import { SeletorLotes, type Escolha, type LoteDisponivel } from './seletor-lotes';

const SERVICOS = { REBENEFICIO: 'Rebenefício', CATACAO: 'Catação', BLEND: 'Blend', REAPROVEITAMENTO: 'Reaproveitamento' };

export function NovoMovimento({ etapa, lotes, locais, inicial }: { etapa: { id: string; nome: string; classe: string; exigeLocal: boolean }; lotes: LoteDisponivel[]; locais: { valor: string; rotulo: string }[]; inicial: string[] }) {
  const router = useRouter();
  const [escolhas, setEscolhas] = useState<Escolha[]>(() => lotes.filter((l) => inicial.includes(l.id)).map((l) => ({ loteId: l.id, quantidade: l.livre.replace('.', ','), localId: l.locais.length === 1 ? l.locais[0]!.id : undefined })));
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  return (
    <form
      className="grid gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        iniciar(async () => {
          const r = await acaoAbrirMovimento({
            etapaId: etapa.id, localId: (f.get('localId') as string) || null, observacao: String(f.get('observacao') ?? ''),
            servicoTipo: (f.get('servicoTipo') as keyof typeof SERVICOS) || null,
            entradas: escolhas.map((x) => ({ loteId: x.loteId, quantidade: x.quantidade, localId: x.localId ?? null })),
          });
          if (!r.ok) return setErro(r.erro);
          const avisos = r.avisos?.length ? `?avisos=${encodeURIComponent(r.avisos.join(' | '))}` : '';
          router.push(`/movimentos/${r.dados!.id}${avisos}`);
        });
      }}
    >
      <div className="sombra grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4 rounded-xl border border-linha bg-superficie p-5">
        <Campo rotulo={`Local${etapa.exigeLocal ? ' *' : ''}`} dica={locais.length ? undefined : 'Cadastre os locais desta etapa em Cadastros → Locais'}>
          <Selecao name="localId" required={etapa.exigeLocal}>
            <option value="">{etapa.exigeLocal ? 'Escolha…' : 'Sem local'}</option>
            {locais.map((l) => <option key={l.valor} value={l.valor}>{l.rotulo}</option>)}
          </Selecao>
        </Campo>
        {etapa.classe === 'SERVICO' ? (
          <Campo rotulo="Tipo de serviço" dica="Só o Blend mistura safras">
            <Selecao name="servicoTipo" defaultValue="REBENEFICIO">{Object.entries(SERVICOS).map(([v, r]) => <option key={v} value={v}>{r}</option>)}</Selecao>
          </Campo>
        ) : null}
        <Campo rotulo="Observação"><Entrada name="observacao" /></Campo>
      </div>
      <section className="grid gap-3">
        <h2 className="font-display text-[19px] font-semibold">Entradas</h2>
        <SeletorLotes lotes={lotes} inicial={inicial} aoMudar={setEscolhas} />
      </section>
      {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}
      <div className="flex gap-2">
        <Botao type="submit" disabled={pendente || !escolhas.length}>{pendente ? 'Abrindo…' : 'Abrir movimento'}</Botao>
        <Link href={`/etapas/${etapa.id}`} className={estiloBotao({ variante: 'secundario' })}>Cancelar</Link>
      </div>
    </form>
  );
}
