/**
 * Roda os passos 3–8 do §15 no banco de desenvolvimento, com os dados fictícios do seed.
 * Uso: npx tsx --env-file=.env scripts/demo-cenario.ts
 */
import { listar } from '../src/servicos/cadastros';
import { obterFluxo } from '../src/servicos/fluxo';
import { abrirMovimento, lancarResultados, registrarCarga } from '../src/servicos/movimentos';
import { prisma } from '../src/lib/prisma';
import { SEED } from '../prisma/dados-seed';

async function main() {
  const ctx = { empresaId: SEED.empresas.alfa.id, usuarioId: SEED.usuarios[0].id, perfil: 'ADMIN_EMPRESA' as const };
  const E = Object.fromEntries((await obterFluxo(ctx)).etapas.map((e) => [e.codigo, e.id]));
  const m = async (r: 'tipos-cafe' | 'peneiras' | 'locais' | 'safras') => Object.fromEntries(((await listar(ctx, r)) as { id: string; codigo: string }[]).map((x) => [x.codigo, x.id]));
  const [T, P, L, S] = [await m('tipos-cafe'), await m('peneiras'), await m('locais'), await m('safras')];
  const ns = SEED.fazendas[0].id;
  const [t1, t2] = [SEED.talhoes[0].id, SEED.talhoes[1].id];
  const c1 = await registrarCarga(ctx, { fazendaId: ns, talhaoId: t1, safraId: S['2025/26']!, tipoCafeId: T.NAT!, quantidade: '100' });
  const c2 = await registrarCarga(ctx, { fazendaId: ns, talhaoId: t2, safraId: S['2025/26']!, tipoCafeId: T.NAT!, quantidade: '50', modoColheita: 'MECANICA' });
  const ld = await abrirMovimento(ctx, { etapaId: E.LAVADOR!, entradas: [{ loteId: c1.lote.id, quantidade: '100' }, { loteId: c2.lote.id, quantidade: '50' }] });
  const rl = await lancarResultados(ctx, ld.movimento.id, { parametros: { modelo: 'PERCENTUAL_POR_TIPO', resultados: [{ tipoCafeId: T.VER!, percentual: '0.2' }, { tipoCafeId: T.BOI!, percentual: '0.3' }, { tipoCafeId: T.CD!, percentual: '0.4' }] } });
  const cd = rl.lotes.find((l) => l.tipoCafeId === T.CD)!;
  const boi = rl.lotes.find((l) => l.tipoCafeId === T.BOI)!;
  const te = await abrirMovimento(ctx, { etapaId: E.TERREIRO!, localId: L['TE-01'], entradas: [{ loteId: cd.id, quantidade: '60' }, { loteId: boi.id, quantidade: '45' }] });
  const rt = await lancarResultados(ctx, te.movimento.id, { parametros: { modelo: 'CAFE_E_PERDA', fator: '0.9' }, umidadeFinal: '12' });
  const se = await abrirMovimento(ctx, { etapaId: E.SECADOR!, localId: L['SE-01'], entradas: rt.lotes.map((l) => ({ loteId: l.id, quantidade: l.quantidade.toString() })) });
  const rs = await lancarResultados(ctx, se.movimento.id, { parametros: { modelo: 'CAFE_E_PERDA', fator: '0.95' } });
  const tu = await abrirMovimento(ctx, { etapaId: E.TULHA!, localId: L['TU-01'], entradas: rs.lotes.map((l) => ({ loteId: l.id, quantidade: l.quantidade.toString() })) });
  const ru = await lancarResultados(ctx, tu.movimento.id, { parametros: { modelo: 'CAFE_E_PERDA', fator: '1' } });
  const ar = await abrirMovimento(ctx, { etapaId: E.ARMAZEM!, localId: L['Q-01'], entradas: ru.lotes.map((l) => ({ loteId: l.id, quantidade: l.quantidade.toString() })) });
  const ra = await lancarResultados(ctx, ar.movimento.id, { parametros: { modelo: 'CONVERSAO_ESTOQUE', lotes: [{ quantidade: '1200', peneiraId: P['17'] }] } });
  // Um movimento aberto para a tela mostrar o formulário de resultados.
  const { lote: c3 } = await registrarCarga(ctx, { fazendaId: ns, talhaoId: t1, safraId: S['2025/26']!, tipoCafeId: T.NAT!, quantidade: '80' });
  await abrirMovimento(ctx, { etapaId: E.LAVADOR!, entradas: [{ loteId: c3.id, quantidade: '80' }] });
  console.log(JSON.stringify({ te: te.movimento.id, ar: ar.movimento.id, loteAr: ra.lotes[0]!.id, ef1: c1.lote.id, ld: ld.movimento.id }));
}
main().finally(() => prisma.$disconnect());
