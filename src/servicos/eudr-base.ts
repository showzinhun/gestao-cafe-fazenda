import type { TalhaoEudr } from '@/dominio/eudr';
import { dataLocal } from './rastreio-base';
import type { Tx } from './transacao';

/** Talhões com o que a EUDR precisa (§10): tipo e versão da geometria, área e a checagem mais recente. */
export async function talhoesEudr(tx: Tx, talhaoIds: string[]): Promise<Map<string, TalhaoEudr>> {
  const ids = [...new Set(talhaoIds)];
  if (!ids.length) return new Map();
  const talhoes = await tx.talhao.findMany({
    where: { id: { in: ids } },
    include: { fazenda: { select: { codigo: true } }, checagens: { orderBy: [{ dataChecagem: 'desc' }, { criadoEm: 'desc' }], take: 1 } },
  });
  return new Map(talhoes.map((t) => {
    const c = t.checagens[0];
    return [t.id, {
      id: t.id, codigo: t.codigo, fazenda: t.fazenda.codigo, geometriaTipo: t.geometriaTipo, geometriaHash: t.geometriaHash,
      areaHa: (t.areaHaInformada ?? t.areaHaCalculada)?.toString() ?? null,
      ultimaChecagem: c ? { resultado: c.resultado, dataChecagem: dataLocal(c.dataChecagem), versaoGeometriaHash: c.versaoGeometriaHash } : null,
    }];
  }));
}

/** Talhões da composição de cada lote (RN-09). */
export async function talhoesDosLotes(tx: Tx, loteIds: string[]): Promise<Map<string, string[]>> {
  const linhas = await tx.loteTalhao.findMany({ where: { loteId: { in: loteIds } }, select: { loteId: true, talhaoId: true } });
  const r = new Map<string, string[]>();
  for (const l of linhas) r.set(l.loteId, [...(r.get(l.loteId) ?? []), l.talhaoId]);
  return r;
}
