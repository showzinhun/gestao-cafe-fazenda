import { expect, test } from '@playwright/test';
import { entrar, escolher, literal, SEED } from './apoio';

const alfa = SEED.empresas.alfa.nome;
const beta = SEED.empresas.beta.nome;
const serraLeste = SEED.fazendas.find((f) => f.codigo === 'SL')!;

test('sem sessão, as telas levam ao login', async ({ page }) => {
  await page.goto('/inicio');
  await expect(page).toHaveURL(/\/login/);
});

test('senha errada mostra o aviso e não entra', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill('admin@alfa.exemplo');
  await page.getByLabel('Senha').fill('errada');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.locator('form [role=alert]')).toHaveText('E-mail ou senha inválidos.');
  await expect(page).toHaveURL(/\/login/);
});

test('RN-22 usuário com duas empresas só vê os dados da empresa ativa', async ({ page }) => {
  await entrar(page, 'consultora@exemplo.com');
  await expect(page.getByRole('button', { name: literal(alfa) })).toBeVisible();
  await expect(page.getByRole('button', { name: literal(beta) })).toBeVisible();

  await escolher(page, alfa);
  await expect(page.getByRole('heading', { name: 'Início' })).toBeVisible();
  await page.getByRole('link', { name: 'Fazendas' }).click();
  const tabela = page.locator('table');
  await expect(tabela).toContainText('Fazenda Nascente');
  await expect(tabela).toContainText('Sítio Boa Vista');
  await expect(tabela).not.toContainText('Serra Leste');

  // Fazenda da outra empresa, por id direto na URL e pela API: 404 (nunca 403).
  await page.goto(`/cadastros/fazendas/${serraLeste.id}`);
  await expect(page.getByRole('heading', { name: 'Não encontrado' })).toBeVisible();
  const api = await page.request.get(`/api/cadastros/fazendas/${serraLeste.id}`);
  expect(api.status()).toBe(404);

  // Trocar de empresa pelo menu.
  await page.goto('/inicio');
  await page.getByRole('button', { name: 'Trocar empresa' }).click();
  await expect(page).toHaveURL(/\/empresa$/);
  await escolher(page, beta);
  await page.getByRole('link', { name: 'Fazendas' }).click();
  await expect(page.locator('table')).toContainText('Serra Leste');
  await expect(page.locator('table')).not.toContainText('Fazenda Nascente');
});

test('a API de empresa ativa recusa empresa sem vínculo com 404', async ({ page }) => {
  await entrar(page, 'admin@alfa.exemplo');
  const r = await page.request.post('/api/auth/empresa-ativa', { data: { empresaId: SEED.empresas.beta.id } });
  expect(r.status()).toBe(404);
  const ok = await page.request.post('/api/auth/empresa-ativa', { data: { empresaId: SEED.empresas.alfa.id } });
  expect(ok.status()).toBe(200);
  await page.goto('/cadastros/fazendas');
  await expect(page.locator('table')).toContainText('Fazenda Nascente');
});

test('sair encerra a sessão', async ({ page }) => {
  await entrar(page, 'admin@beta.exemplo');
  await escolher(page, beta);
  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto('/inicio');
  await expect(page).toHaveURL(/\/login/);
});
