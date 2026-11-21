import type { MultiPolygon, Polygon } from 'geojson';
import { sobreposicoes } from '@/dominio/eudr';
import { emitirAlerta } from './alertas';
import type { Contexto, Tx } from './transacao';

type Registro = Record<string, unknown>;

/**
 * Depois de salvar um talhão (§10):
 * - geometria mudou e havia checagem → a checagem deixa de valer (EUDR_PENDENTE);
 * - polígono que se sobrepõe a talhão de outro produtor → SOBREPOSICAO_TALHAO (risco de terra contada em dobro).
 */
export async function alertasDoTalhao(tx: Tx, ctx: Contexto, r: Registro, atual: Registro | null): Promise<string[]> {
  const avisos: string[] = [];
  const hash = (r.geometriaHash as string | null) ?? null;
  if (!hash || (atual && atual.geometriaHash === hash)) return avisos;
  const id = String(r.id);
  const fazenda = await tx.fazenda.findFirstOrThrow({ where: { id: String(r.fazendaId) }, select: { codigo: true, produtorId: true } });
  const nome = `${fazenda.codigo}/${String(r.codigo)}`;

  if (atual && (await tx.checagemDesmatamento.count({ where: { talhaoId: id } }))) {
    avisos.push('A geometria mudou: a checagem de desmatamento anterior deixa de valer. Refaça a checagem.');
    await emitirAlerta(tx, ctx.empresaId, {
      tipo: 'EUDR_PENDENTE', chave: `EUDR_PENDENTE:geometria:${id}:${hash.slice(0, 16)}`, entidade: 'talhao', entidadeId: id,
      mensagem: `Talhão ${nome}: a geometria mudou. Refaça a checagem de desmatamento.`,
    });
  }

  if (r.geometriaTipo !== 'POLIGONO') return avisos;
  const outros = await tx.talhao.findMany({
    where: { ativo: true, geometriaTipo: 'POLIGONO', id: { not: id }, fazendaId: { not: String(r.fazendaId) } },
    include: { fazenda: { select: { codigo: true, produtorId: true } } },
  });
  const deOutroProdutor = outros.filter((o) => !fazenda.produtorId || !o.fazenda.produtorId || o.fazenda.produtorId !== fazenda.produtorId);
  const achados = sobreposicoes(r.geometria as Polygon | MultiPolygon, deOutroProdutor.map((o) => ({ id: o.id, codigo: o.codigo, fazenda: o.fazenda.codigo, geometria: o.geometria as unknown as Polygon | MultiPolygon })));
  for (const s of achados) {
    const area = Number(s.areaHa).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
    avisos.push(`Sobreposição de ${area} ha com o talhão ${s.fazenda}/${s.codigo}, de outro produtor.`);
    await emitirAlerta(tx, ctx.empresaId, {
      tipo: 'SOBREPOSICAO_TALHAO', chave: `SOBREPOSICAO_TALHAO:${[id, s.id].sort().join(':')}:${hash.slice(0, 16)}`, entidade: 'talhao', entidadeId: id, severidade: 'CRITICO',
      mensagem: `Talhão ${nome} se sobrepõe ${area} ha ao talhão ${s.fazenda}/${s.codigo} de outro produtor (terra contada em dobro).`,
    });
  }
  return avisos;
}
