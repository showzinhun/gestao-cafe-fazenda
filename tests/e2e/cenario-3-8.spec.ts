import { expect, test, type Page } from '@playwright/test';
import { entrar, escolher, SEED } from './apoio';

/** §15, passos 3–8, feitos pela interface (Fase 3). */
test.describe.configure({ mode: 'serial' });

async function comoAdmin(page: Page) {
  await entrar(page, 'admin@alfa.exemplo');
  await escolher(page, SEED.empresas.alfa.nome);
}

async function novaCarga(page: Page, talhao: string, medidas: string, modo?: string) {
  await page.getByRole('button', { name: 'Nova carga' }).click();
  const f = page.locator('form', { hasText: 'Nova carga' });
  await f.getByLabel(/^Fazenda \*/).selectOption({ label: 'NS · Fazenda Nascente' });
  await f.getByLabel(/^Talhão \*/).selectOption({ label: talhao });
  await f.getByLabel('Medidas na recepção').fill(medidas);
  if (modo) await f.getByLabel(/^Modo de colheita/).selectOption({ label: modo });
  await f.getByRole('button', { name: 'Registrar carga' }).click();
  await expect(page.getByText(/Carga registrada: lote EF-NS-2526-\d{6}-NAT/)).toBeVisible();
}

/** Abre um movimento na etapa escolhendo os lotes pelo padrão do código. */
async function abrir(page: Page, etapa: string, lotes: RegExp[], local?: string) {
  await page.goto('/etapas');
  await page.getByRole('link', { name: new RegExp(etapa) }).click();
  await page.getByRole('link', { name: 'Novo movimento' }).click();
  if (local) await page.getByLabel(/^Local \*/).selectOption({ label: local });
  for (const l of lotes) await page.getByRole('checkbox', { name: l }).check();
  await page.getByRole('button', { name: 'Abrir movimento' }).click();
  await expect(page).toHaveURL(/\/movimentos\//);
}

async function lancar(page: Page) {
  await page.getByRole('button', { name: 'Lançar resultados' }).last().click();
  await expect(page.getByText('Resultados lançados.')).toBeVisible();
  await expect(page.getByText('Processado').first()).toBeVisible();
}

test('passos 3–8 do §15 pela interface', async ({ page }) => {
  await comoAdmin(page);

  // Passo 3: cargas C1 (T1, 100) e C2 (T2, mecânica, 50).
  await page.goto('/colheita');
  await novaCarga(page, 'T1 · Talhão 1', '100');
  await novaCarga(page, 'T2 · Talhão 2', '50', 'Mecânica');
  await expect(page.getByText('150', { exact: true })).toBeVisible();

  // Passo 4: lavador com EF1 + EF2 → VER 20%, BOI 30%, CD 40% → perda 15 (quebra 10%).
  // Abre com a C1 e acrescenta a C2 depois (aba Entradas).
  await abrir(page, 'Lavador', [/^Usar EF-NS-2526-000001-NAT$/]);
  await page.getByRole('button', { name: /Entradas/ }).click();
  await page.getByRole('button', { name: 'Acrescentar entradas' }).click();
  await page.getByRole('checkbox', { name: /^Usar EF-NS-2526-000002-NAT$/ }).check();
  await page.getByRole('button', { name: 'Acrescentar', exact: true }).click();
  await expect(page.getByText('Entradas acrescentadas.')).toBeVisible();
  await expect(page.getByText('150 med.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Resultados/ }).first().click();
  await page.getByLabel('VER · Verde (%)').fill('20');
  await page.getByLabel('BOI · Boia (%)').fill('30');
  await page.getByLabel(/^CD · .*\(%\)$/).fill('40');
  await expect(page.getByText(/perda 15 · quebra 10%/)).toBeVisible();
  await lancar(page);
  await expect(page.getByText('10%', { exact: true })).toBeVisible();
  await expect(page.getByRole('row', { name: /LD-NS-2526-000001-CD/ })).toContainText('60 med.');
  await page.getByRole('button', { name: 'Composição por talhão' }).click();
  await expect(page.getByRole('row', { name: /T1/ })).toContainText('66,67%');
  await expect(page.getByRole('row', { name: /T2/ })).toContainText('33,33%');

  // Passo 5: terreiro TE-01 com CD 60 e BOI 45 → café 90% → CD 54 e BOI 40,5.
  await abrir(page, 'Terreiro', [/^Usar LD-NS-2526-000001-CD$/, /^Usar LD-NS-2526-000001-BOI$/], 'TE-01 · Terreiro 1');
  await expect(page.getByText('105 med.', { exact: true })).toBeVisible();
  await page.getByLabel('Café CD (%)').fill('90');
  await page.getByLabel('Café BOI (%)').fill('90');
  await page.getByLabel('Umidade final (%)').fill('12');
  await lancar(page);
  await expect(page.getByRole('row', { name: /TE-NS-2526-000001-CD/ })).toContainText('54 med.');
  await expect(page.getByRole('row', { name: /TE-NS-2526-000001-BOI/ })).toContainText('40,5 med.');

  // Passo 6: secador SE-01 com 94,5 → 95% → 89,775.
  await abrir(page, 'Secador', [/^Usar TE-NS-2526-000001-CD$/, /^Usar TE-NS-2526-000001-BOI$/], 'SE-01 · Secador 1');
  await page.getByLabel('Café CD (%)').fill('95');
  await page.getByLabel('Café BOI (%)').fill('95');
  await lancar(page);
  await expect(page.getByText('89,775 med.', { exact: true })).toBeVisible();

  // Passo 7: tulha TU-01 → 100% → 89,775.
  await abrir(page, 'Tulha', [/^Usar SE-NS-2526-000001-CD$/, /^Usar SE-NS-2526-000001-BOI$/], 'TU-01 · Tulha 1');
  await page.getByLabel('Café CD (%)').fill('100');
  await page.getByLabel('Café BOI (%)').fill('100');
  await lancar(page);
  await expect(page.getByText('89,775 med.', { exact: true }).first()).toBeVisible();

  // Passo 8: armazém Q-01 → 1.200 kg peneira 17 → 20 sacas, rendimento 13,367; só RFA; AAA bloqueado.
  await abrir(page, 'Armazém', [/^Usar TU-NS-2526-000001-CD$/, /^Usar TU-NS-2526-000001-BOI$/], 'Q-01 · Quadra 1');
  await page.getByLabel('Lote 1: peso (kg) *').fill('1.200');
  await page.getByLabel(/^Peneira/).selectOption({ label: '17' });
  await expect(page.getByText(/rendimento 13,367 kg\/medida · 20 sacas/)).toBeVisible();
  await lancar(page);
  await expect(page.getByText('13,367', { exact: true })).toBeVisible();
  const lote = page.getByRole('row', { name: /AR-NS-2526-000001-P17/ });
  await expect(lote).toContainText('1.200 kg');
  await expect(lote).toContainText('20 sacas');
  await expect(lote).toContainText('RFA');
  await expect(lote).toContainText('Q-01: 1.200');
  await lote.getByRole('button', { name: 'alterar' }).click();
  await lote.getByRole('checkbox', { name: 'AAA' }).check();
  await lote.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText(/não pode ter AAA/)).toBeVisible();

  // O lote aparece no estoque com 1.200 kg (20 sacas).
  await page.goto('/estoque');
  await expect(page.getByRole('row', { name: /AR-NS-2526-000001-P17/ })).toContainText('1.200 kg');
  await expect(page.getByText('20', { exact: true })).toBeVisible();

  // Rastreabilidade: do lote AR até as cargas de T1 e T2, com o mapa.
  await page.getByRole('link', { name: 'AR-NS-2526-000001-P17' }).click();
  await expect(page.getByRole('tree', { name: 'Origens do lote' })).toContainText('talhão T1');
  await expect(page.getByRole('tree', { name: 'Origens do lote' })).toContainText('talhão T2');
  await expect(page.getByRole('row', { name: /T1/ })).toContainText('800 kg');
});
