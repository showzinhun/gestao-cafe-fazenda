import type { Classe } from '@/dominio/fluxo';

const COR: Record<Classe, string> = { COLHEITA: '#b5822a', PROCESSAMENTO: '#2e6b4c', ESTOQUE: '#1f5f7a', SERVICO: '#6b4fa0', SAIDA: '#8e2416' };

/**
 * Diagrama em arcos: etapas em linha na ordem do fluxo; transições para a frente por cima,
 * para trás (⇄) por baixo. Só leitura; a edição é na matriz.
 */
export function DiagramaFluxo({ etapas, transicoes }: { etapas: { id: string; nome: string; classe: Classe; prefixoLote: string }[]; transicoes: { origem: string; destino: string }[] }) {
  const L = 132, R = 26, topo = 112, H = 236;
  const x = new Map(etapas.map((e, i) => [e.id, 20 + i * L + L / 2]));
  const W = etapas.length * L + 40;
  return (
    <div className="sombra overflow-x-auto rounded-xl border border-linha bg-superficie">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" style={{ minWidth: Math.min(W, 640) }} role="img" aria-label="Diagrama do fluxo de etapas">
        <defs>
          <marker id="seta" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="currentColor" className="text-tinta-2" />
          </marker>
        </defs>
        {transicoes.map((t, i) => {
          const a = x.get(t.origem), b = x.get(t.destino);
          if (a === undefined || b === undefined) return null;
          const frente = b > a;
          const d = Math.abs(b - a);
          const alt = Math.min(85, 18 + d * 0.18);
          const y0 = frente ? topo - R : topo + R;
          const cy = frente ? y0 - alt : y0 + alt;
          return <path key={i} d={`M${a + (frente ? 6 : -6)},${y0} Q${(a + b) / 2},${cy} ${b + (frente ? -6 : 6)},${y0}`} fill="none" stroke="currentColor" strokeWidth={1.6} className={frente ? 'text-destaque' : 'text-ouro'} markerEnd="url(#seta)" opacity={0.85} />;
        })}
        {etapas.map((e) => (
          <g key={e.id} transform={`translate(${x.get(e.id)},${topo})`}>
            <circle r={R} fill={COR[e.classe]} />
            <text textAnchor="middle" dy="0.35em" fill="#fff" fontFamily="var(--font-mono)" fontSize="13" fontWeight="600">{e.prefixoLote}</text>
            <text textAnchor="middle" y={R + 17} fill="currentColor" className="text-tinta" fontSize="12.5" fontWeight="600" stroke="var(--superficie)" strokeWidth={4} paintOrder="stroke">{e.nome.length > 18 ? e.nome.slice(0, 17) + '…' : e.nome}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}
