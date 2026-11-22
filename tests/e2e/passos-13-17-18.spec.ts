import { expect, test, type Page } from '@playwright/test';
import { entrar, escolher, SEED } from './apoio';

/**
 * §15, passos 13, 17 e 18 pela interface (Fase 8). Roda depois de cenario-3-8 e comercial (ordem alfabética):
 * usa o LD#1, o EB#1 finalizado e o lote AR-NS-2526-000001-P17 (300 kg) que eles deixam.
 */
test.describe.configure({ mode: 'serial' });

async function comoAdmin(page: Page) {
  await entrar(page, 'admin@alfa.exemplo');
  await escolher(page, SEED.empresas.alfa.nome);
}

async function abrirEtapa(page: Page, etapa: string) {
  await page.goto('/etapas');
  await page.getByRole('link', { name: new RegExp(etapa) }).first().click();
  await expect(page).toHaveURL(/\/etapas\/[0-9a-f-]+/);
}

/** Abre um movimento na etapa escolhendo os lotes pelo padrão do código. */
async function abrir(page: Page, etapa: string, lotes: RegExp[], local?: string) {
  await abrirEtapa(page, etapa);
  await page.getByRole('link', { name: 'Novo movimento' }).click();
  if (local) await page.getByLabel(/^Local \*/).selectOption({ label: local });
  for (const l of lotes) await page.getByRole('checkbox', { name: l }).check();
  await page.getByRole('button', { name: 'Abrir movimento' }).click();
  await expect(page).toHaveURL(/\/movimentos\//);
}

async function lancar(page: Page) {
  await page.getByRole('button', { name: 'Lançar resultados' }).last().click();
  await expect(page.getByText('Resultados lançados.')).toBeVisible();
}

test('passo 13: estornar LD#1 (RN-05) e EB#1 (RN-14) é bloqueado; a Beta não vê o lote AR (RN-22)', async ({ page, browser }) => {
  await comoAdmin(page);
  // RN-05: os lotes do LD#1 já foram usados no terreiro.
  await abrirEtapa(page, 'Lavador');
  await page.goto(`${page.url().split('?')[0]}?status=todos`);
  await page.getByRole('link', { name: 'LD#1', exact: true }).click();
  await page.getByRole('button', { name: 'Estornar' }).click();
  await page.getByLabel('Motivo').fill('Teste do passo 13');
  await page.getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByText(/já foi usado em .*\(RN-05\)/)).toBeVisible();

  // RN-14: embarque finalizado não se estorna (a tela nem oferece; a API recusa com 422).
  await page.goto('/embarques');
  const eb = (await page.getByRole('link', { name: 'EB#1', exact: true }).getAttribute('href'))!.split('/').pop();
  const r = await page.request.post(`/api/movimentos/${eb}/estornar`, { data: { motivo: 'Teste do passo 13' } });
  expect(r.status()).toBe(422);
  expect((await r.json()).codigo).toBe('RN-14');

  // RN-22: o administrador da Beta recebe 404 no lote AR da Alfa.
  await page.goto('/estoque');
  const loteAr = (await page.getByRole('link', { name: 'AR-NS-2526-000001-P17' }).getAttribute('href'))!.split('/').pop();
  const beta = await browser.newContext();
  const pb = await beta.newPage();
  await entrar(pb, 'admin@beta.exemplo');
  await escolher(pb, SEED.empresas.beta.nome);
  expect((await pb.request.get(`/api/lotes/${loteAr}`)).status()).toBe(404);
  await beta.close();
});

test('passo 17: blend de lote RFA com lote convencional só sai convencional; exige motivo (RN-28)', async ({ page }) => {
  await comoAdmin(page);
  // Um segundo lote no armazém (T1, RFA) e, no estoque, tira-se o RFA dele: fica convencional.
  await page.goto('/colheita');
  await page.getByRole('button', { name: 'Nova carga' }).click();
  const f = page.locator('form', { hasText: 'Nova carga' });
  await f.getByLabel(/^Fazenda \*/).selectOption({ label: 'NS · Fazenda Nascente' });
  await f.getByLabel(/^Talhão \*/).selectOption({ label: 'T1 · Talhão 1' });
  await f.getByLabel('Medidas na recepção').fill('20');
  await f.getByRole('button', { name: 'Registrar carga' }).click();
  const carga = (await page.getByText(/Carga registrada: lote (EF-NS-2526-\d{6}-NAT)/).textContent())!.match(/EF-NS-2526-\d{6}-NAT/)![0];

  await abrir(page, 'Terreiro', [new RegExp(`^Usar ${carga}$`)], 'TE-01 · Terreiro 1');
  await page.getByLabel(/^Café NAT \(%\)/).fill('100');
  await page.getByLabel('Umidade final (%)').fill('12');
  await lancar(page);
  const te = (await page.getByRole('row', { name: /TE-NS-2526-\d{6}-NAT/ }).first().textContent())!.match(/TE-NS-2526-\d{6}-NAT/)![0];
  await abrir(page, 'Tulha', [new RegExp(`^Usar ${te}$`)], 'TU-01 · Tulha 1');
  await page.getByLabel(/^Café NAT \(%\)/).fill('100');
  await lancar(page);
  const tu = (await page.getByRole('row', { name: /TU-NS-2526-\d{6}-NAT/ }).first().textContent())!.match(/TU-NS-2526-\d{6}-NAT/)![0];
  await abrir(page, 'Armazém', [new RegExp(`^Usar ${tu}$`)], 'Q-01 · Quadra 1');
  await page.getByLabel('Lote 1: peso (kg) *').fill('200');
  await page.getByLabel(/^Peneira/).selectOption({ label: '17' });
  await lancar(page);
  const linha = page.getByRole('row', { name: /AR-NS-2526-\d{6}/ }).first();
  const novo = (await linha.textContent())!.match(/AR-NS-2526-\d{6}(-[A-Z]{2,4})?-P\d+/)![0];
  await linha.getByRole('button', { name: 'alterar' }).click();
  await linha.getByRole('checkbox', { name: 'RFA' }).uncheck();
  await linha.getByLabel('Motivo de tirar o certificado').fill('Lote vendido como convencional (teste)');
  await linha.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('row', { name: new RegExp(novo) })).toContainText('convencional');

  // Blend: 100 kg do AR RFA + 100 kg do convencional.
  await abrirEtapa(page, 'Benefício');
  await page.getByRole('link', { name: 'Novo movimento' }).click();
  await page.getByRole('checkbox', { name: /^Usar AR-NS-2526-000001-P17$/ }).check();
  await page.getByRole('checkbox', { name: new RegExp(`^Usar ${novo}$`) }).check();
  await page.getByLabel('Tipo de serviço').selectOption('BLEND');
  await page.getByLabel('Quantidade de AR-NS-2526-000001-P17').fill('100');
  await page.getByLabel(`Quantidade de ${novo}`).fill('100');
  await page.getByRole('button', { name: 'Abrir movimento' }).click();
  await expect(page).toHaveURL(/\/movimentos\//);
  await page.getByRole('button', { name: 'Lançar resultados' }).first().click();
  await page.getByLabel('Lote 1: quantidade (kg) *').fill('200');
  await page.getByLabel(/^Peneira/).selectOption({ label: '17' });
  await page.getByRole('button', { name: 'Lançar resultados' }).last().click();
  await expect(page.getByText(/AR-NS-2526-000001-P17 perde RFA \(100 kg\).*\(RN-28\)/)).toBeVisible();
  await page.getByLabel(/^Motivo do rebaixamento/).fill('Blend para o padrão do cliente');
  await lancar(page);
  await expect(page.getByRole('row', { name: /GS-NS-2526-\d{6}/ }).first()).toContainText('convencional');
});

test('passo 18: inventário não mexe no estoque até aprovar; ao aprovar, ajuste de −10 kg (RN-29)', async ({ page }) => {
  await comoAdmin(page);
  await page.goto('/estoque/inventarios');
  await page.getByRole('checkbox', { name: 'Q-01 · Quadra 1' }).check();
  await page.getByRole('button', { name: 'Abrir inventário' }).click();
  await expect(page).toHaveURL(/\/estoque\/inventarios\/[0-9a-f-]+/);
  const linhas = page.locator('tbody tr');
  const n = await linhas.count();
  let alvo = '';
  let sistemaAlvo = 0;
  for (let i = 0; i < n; i++) {
    const tds = linhas.nth(i).locator('td');
    const codigo = (await tds.nth(0).textContent())!.trim();
    const sistema = (await tds.nth(2).textContent())!.trim();
    const valor = Number(sistema.replace(/\./g, '').replace(',', '.'));
    if (!alvo && valor > 10) {
      alvo = codigo;
      sistemaAlvo = valor;
      await page.getByLabel(`Contado ${codigo}`).fill(String(valor - 10).replace('.', ','));
    } else await page.getByLabel(`Contado ${codigo}`).fill(sistema);
  }
  await page.getByRole('button', { name: 'Salvar contagem' }).click();
  await expect(page.getByRole('row', { name: new RegExp(alvo) })).toContainText('-10');
  // A contagem não altera o estoque.
  const conferir = async () => (await (await page.request.get('/api/lotes')).json()) as { lotes: { codigo: string; saldo: string }[] };
  expect(Number((await conferir()).lotes.find((l) => l.codigo === alvo)!.saldo)).toBe(sistemaAlvo);
  await page.getByRole('button', { name: 'Aprovar e ajustar estoque' }).click();
  await expect(page.getByRole('link', { name: 'ver ajuste' }).first()).toBeVisible();
  expect(Number((await conferir()).lotes.find((l) => l.codigo === alvo)!.saldo)).toBe(sistemaAlvo - 10);
});
