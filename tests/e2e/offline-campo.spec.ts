import { expect, test, type Browser, type Page } from '@playwright/test';
import { entrar, escolher, SEED } from './apoio';

/** §15, passos 1, 2 e 9: apontamento sem sinal (setOffline), sincronização idempotente e fechamento do pagamento. */
test.describe.configure({ mode: 'serial' });

const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

async function sessao(browser: Browser, email: string, opcoes: Parameters<Browser['newContext']>[0] = {}) {
  const ctx = await browser.newContext(opcoes);
  const page = await ctx.newPage();
  await entrar(page, email);
  await escolher(page, SEED.empresas.alfa.nome);
  return { ctx, page };
}

async function apontar(page: Page, nome: string, medidas: string) {
  const campo = page.getByLabel(`Medidas de ${nome}`);
  await campo.fill(medidas);
  await campo.press('Enter');
}

test('passos 1, 2 e 9: apontamento offline, sincronização e fechamento', async ({ browser, page, context }) => {
  // Passo 1: apontador no celular, turma A, talhão T1.
  await entrar(page, 'apontador@alfa.exemplo');
  await escolher(page, SEED.empresas.alfa.nome);
  await page.goto('/campo/apontar');
  await expect(page.getByText('Talhão T1')).toBeVisible();
  await expect(page.getByLabel('Medidas de João')).toBeVisible();

  await context.setOffline(true);
  await expect(page.getByTestId('indicador-sync')).toHaveText('Sem sinal');
  await apontar(page, 'João', '39');
  await page.getByRole('button', { name: 'Mais 1 para João' }).click(); // 39 + 1 = 40
  await apontar(page, 'Maria', '35');
  await apontar(page, 'Pedro', '24');
  await page.getByRole('button', { name: 'Mais meia medida para Pedro' }).click();
  await page.getByRole('button', { name: 'Mais meia medida para Pedro' }).click(); // 25
  await expect(page.getByTestId('total-talhao')).toHaveText('100');
  await expect(page.getByRole('status')).toContainText('Sem sinal · 3 pendente(s)');

  // Volta o sinal: sincroniza sozinho.
  await context.setOffline(false);
  await expect(page.getByRole('status')).toContainText('Tudo sincronizado', { timeout: 15_000 });
  await expect(page.getByTestId('indicador-sync')).toHaveText('Em dia');

  // RN-23: reenviar tudo de novo (como se a resposta tivesse se perdido) não duplica.
  await page.evaluate(async () => {
    const req = indexedDB.open('cafe-campo');
    await new Promise<void>((ok) => {
      req.onsuccess = () => {
        const tx = req.result.transaction('registros', 'readwrite');
        const st = tx.objectStore('registros');
        st.openCursor().onsuccess = (e) => {
          const c = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
          if (c) {
            c.update({ ...c.value, pendente: 1 });
            c.continue();
          }
        };
        tx.oncomplete = () => ok();
      };
    });
  });
  await page.getByRole('button', { name: 'Sincronizar' }).click();
  await expect(page.getByText('3 registro(s) sincronizado(s).')).toBeVisible();
  const apontados = await (await page.request.get(`/api/colheita/apontamentos?data=${hoje}`)).json();
  expect(apontados.map((a: { colhedor: string; medidas: string }) => `${a.colhedor.split(' (')[0]}=${a.medidas}`).sort())
    .toEqual(['João da Silva=40.000', 'Maria de Souza=35.000', 'Pedro Lima=25.000']);

  // Passos 2 e 9: R$ 12,00/medida (seed) → João R$ 480, Maria R$ 420, Pedro R$ 300; total R$ 1.200.
  const fin = await sessao(browser, 'financeiro@alfa.exemplo');
  await fin.page.goto('/pagamentos');
  await fin.page.getByRole('button', { name: 'Abrir fechamento' }).click();
  await expect(fin.page).toHaveURL(/\/pagamentos\/[0-9a-f-]{36}$/);
  await expect(fin.page.getByRole('row', { name: /João/ })).toContainText('R$ 480,00');
  await expect(fin.page.getByRole('row', { name: /Maria/ })).toContainText('R$ 420,00');
  await expect(fin.page.getByRole('row', { name: /Pedro/ })).toContainText('R$ 300,00');
  await fin.page.getByRole('button', { name: 'Fechar período' }).click();
  await expect(fin.page.getByText('Fechado: os preços ficaram congelados')).toBeVisible();
  await expect(fin.page.getByText('R$ 1.200,00').first()).toBeVisible();

  // Editar o apontamento de João depois do fechamento → bloqueado (RN-19); vale o servidor.
  await apontar(page, 'João', '41');
  await expect(page.getByText(/já entrou num fechamento/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel('Medidas de João')).toHaveValue('40');

  // Mudar o preço para R$ 13,00 não muda o fechamento (RN-20).
  const adm = await sessao(browser, 'admin@alfa.exemplo');
  const precos = await (await adm.page.request.get('/api/cadastros/precos-colheita')).json();
  const ns = precos.find((p: { fazendaId: string | null }) => p.fazendaId === SEED.fazendas[0].id);
  expect((await adm.page.request.put(`/api/cadastros/precos-colheita/${ns.id}`, { data: { valorPorMedida: '13,00' } })).ok()).toBe(true);
  await fin.page.reload();
  await expect(fin.page.getByRole('row', { name: /João/ })).toContainText('R$ 480,00');
  await expect(fin.page.getByText('R$ 1.200,00').first()).toBeVisible();

  // Lista PIX e recibos.
  const pix = await fin.page.request.get(fin.page.url().replace('/pagamentos/', '/api/pagamentos/fechamentos/') + '/pix.csv');
  expect(await pix.text()).toContain('"Maria de Souza (fictícia)";"275.484.389-23";"maria.ficticia@exemplo.com";"420,00"');
  const pdf = await fin.page.request.get(fin.page.url().replace('/pagamentos/', '/api/pagamentos/fechamentos/') + '/recibos.pdf');
  expect(pdf.headers()['content-type']).toBe('application/pdf');
  await fin.ctx.close();
  await adm.ctx.close();
});
