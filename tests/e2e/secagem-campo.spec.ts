import { expect, test, type Browser } from '@playwright/test';
import { entrar, escolher, SEED } from './apoio';

/** §15, passo 5: terreiro TE#1 com 105 medidas (87,5%), leituras 55 → 40 → 28 → 18 → 12,0 pelo celular sem sinal, alerta e cartão "no ponto". */
async function sessao(browser: Browser, email: string, opcoes: Parameters<Browser['newContext']>[0] = {}) {
  const ctx = await browser.newContext(opcoes);
  const page = await ctx.newPage();
  await entrar(page, email);
  await escolher(page, SEED.empresas.alfa.nome);
  return { ctx, page };
}

test('passo 5: leituras offline, alerta PONTO_SECAGEM e cartão no ponto', async ({ browser, page, context }) => {
  // Preparação pelo escritório (API): carga de 105 medidas em T1 e terreiro TE-01.
  const adm = await sessao(browser, 'admin@alfa.exemplo', { viewport: { width: 1360, height: 900 } });
  const api = adm.page.request;
  const codigos = async (url: string) => Object.fromEntries(((await (await api.get(url)).json()) as { id: string; codigo: string }[]).map((x) => [x.codigo, x.id]));
  const etapas = Object.fromEntries(((await (await api.get('/api/config/fluxo')).json()).etapas as { id: string; codigo: string }[]).map((e) => [e.codigo, e.id]));
  const [locais, safras, tipos] = [await codigos('/api/cadastros/locais'), await codigos('/api/cadastros/safras'), await codigos('/api/cadastros/tipos-cafe')];
  const carga = await (await api.post('/api/colheita/cargas', { data: { fazendaId: SEED.fazendas[0].id, talhaoId: SEED.talhoes[0].id, safraId: safras['2025/26'], tipoCafeId: tipos.NAT, quantidade: '105' } })).json();
  const te = await (await api.post('/api/movimentos', { data: { etapaId: etapas.TERREIRO, localId: locais['TE-01'], entradas: [{ loteId: carga.lote.id, quantidade: '105' }] } })).json();
  expect(te.ocupacao.percentual).toBe('0.8750');
  const rotulo = `Terreiro TE#${te.movimento.numero}`;

  // Celular do apontador, sem sinal.
  await entrar(page, 'apontador@alfa.exemplo');
  await escolher(page, SEED.empresas.alfa.nome);
  await page.goto('/campo/secagem');
  await page.getByRole('button', { name: new RegExp(rotulo) }).click();
  await context.setOffline(true);
  for (const [i, u] of ['55', '40', '28', '18', '12,0'].entries()) {
    await page.getByLabel(`Umidade de ${rotulo}`).fill(u);
    await page.getByRole('button', { name: 'Registrar leitura' }).click();
    await expect(page.getByRole('status')).toContainText(`${i + 1} leitura(s)`);
  }
  await expect(page.getByRole('status')).toContainText('Sem sinal · 5 leitura(s) guardada(s)');
  await expect(page.getByRole('button', { name: new RegExp(rotulo) })).toContainText('no ponto');
  await context.setOffline(false);
  await expect(page.getByRole('status')).toContainText('Tudo sincronizado', { timeout: 15_000 });

  // Escritório: cartão do TE-01 no ponto, ocupação 87,5% e alerta.
  await adm.page.goto('/secagem');
  const cartao = adm.page.getByRole('article', { name: /TE-01/ });
  await expect(cartao).toContainText('No ponto');
  await expect(cartao).toContainText('Ocupação 87,5%');
  await expect(cartao).toContainText('12%');
  await adm.page.goto('/alertas');
  await expect(adm.page.getByText(new RegExp(`${rotulo.replace('#', '#')} chegou ao ponto: umidade 12%`))).toBeVisible();

  // Curva e umidade final sugerida pela última leitura.
  await adm.page.goto(`/movimentos/${te.movimento.id}?aba=leituras`);
  await expect(adm.page.getByRole('img', { name: /Curva de umidade: 55%, 40%, 28%, 18%, 12%/ })).toBeVisible();
  await adm.page.getByRole('button', { name: /^Resultados/ }).click();
  await expect(adm.page.getByLabel('Umidade final (%)')).toHaveValue('12');
  await adm.ctx.close();
});
