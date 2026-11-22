import { expect, test } from '@playwright/test';
import { entrar, SEED } from './apoio';

/** Área da plataforma (SUPERADMIN, §12 item 15): criar empresa, suspender e reativar; outros perfis não entram. */
test.describe.configure({ mode: 'serial' });

test('SUPERADMIN cria empresa, o administrador entra; suspensa, perde o acesso; reativada, volta', async ({ page, browser }) => {
  await entrar(page, SEED.plataforma.email);
  await page.getByRole('link', { name: /Área da plataforma/ }).click();
  await page.getByRole('button', { name: 'Nova empresa' }).click();
  await page.getByLabel('Nome *', { exact: true }).fill('Delta Cafés (fictícia)');
  await page.getByLabel('Modelo de fluxo').selectOption('SIMPLIFICADO');
  await page.getByLabel('Administrador: nome *').fill('Dora Delta');
  await page.getByLabel('Administrador: e-mail *').fill('admin@delta.exemplo');
  await page.getByLabel(/^Senha inicial/).fill('senha-delta-1');
  await page.getByRole('button', { name: 'Criar empresa' }).click();
  await expect(page.getByText('Empresa criada.')).toBeVisible();
  const linha = page.getByRole('row', { name: /Delta Cafés/ });
  await expect(linha).toContainText('Ativa');

  const outra = await browser.newContext();
  const admin = await outra.newPage();
  await entrar(admin, 'admin@delta.exemplo', 'senha-delta-1' as typeof SEED.senha);
  await expect(admin.getByRole('button', { name: /Delta Cafés/ })).toBeVisible();

  await linha.getByRole('button', { name: 'Suspender' }).click();
  await page.getByLabel('Motivo').fill('Teste de suspensão');
  await page.getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByText(/Empresa suspensa/)).toBeVisible();
  await expect(page.getByRole('row', { name: /Delta Cafés/ })).toContainText('Suspensa');
  await admin.reload();
  await expect(admin.getByText(/não tem acesso a nenhuma empresa ativa/)).toBeVisible();

  await page.getByRole('row', { name: /Delta Cafés/ }).getByRole('button', { name: 'Reativar' }).click();
  await expect(page.getByText('Empresa reativada.')).toBeVisible();
  await admin.reload();
  await expect(admin.getByRole('button', { name: /Delta Cafés/ })).toBeVisible();
  await outra.close();
});

test('quem não é SUPERADMIN recebe 404 na área da plataforma', async ({ page }) => {
  await entrar(page, 'admin@alfa.exemplo');
  const r = await page.goto('/plataforma');
  expect(r?.status()).toBe(404);
});
