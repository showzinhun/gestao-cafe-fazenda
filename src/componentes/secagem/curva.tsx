'use client';
import { CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

/** Curva umidade × tempo com a faixa da meta (§7). Número só para desenhar; os valores vêm do servidor como texto. */
export function CurvaUmidade({ leituras, metaMin, metaMax }: { leituras: { dataHora: string; umidade: string }[]; metaMin: string | null; metaMax: string | null }) {
  const dados = leituras.map((l) => ({ t: new Date(l.dataHora).getTime(), u: Number(l.umidade) }));
  const fmt = (t: number) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit' }).format(new Date(t));
  return (
    <div className="h-[280px] w-full" role="img" aria-label={`Curva de umidade: ${leituras.map((l) => l.umidade.replace('.', ',') + '%').join(', ')}`}>
      <ResponsiveContainer>
        <LineChart data={dados} margin={{ top: 12, right: 16, bottom: 4, left: -8 }}>
          <CartesianGrid stroke="var(--linha)" strokeDasharray="3 3" />
          <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={fmt} stroke="var(--tinta-2)" fontSize={11} />
          <YAxis domain={[0, 'auto']} unit="%" stroke="var(--tinta-2)" fontSize={11} />
          {metaMin && metaMax ? <ReferenceArea y1={Number(metaMin)} y2={Number(metaMax)} fill="var(--ok)" fillOpacity={0.15} stroke="var(--ok)" strokeOpacity={0.4} label={{ value: 'meta', position: 'insideTopRight', fontSize: 11, fill: 'var(--ok)' }} /> : null}
          <Tooltip labelFormatter={(t) => fmt(Number(t))} formatter={(v) => [`${String(v).replace('.', ',')}%`, 'Umidade']} />
          <Line type="monotone" dataKey="u" stroke="var(--destaque)" strokeWidth={2.5} dot={{ r: 4 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
