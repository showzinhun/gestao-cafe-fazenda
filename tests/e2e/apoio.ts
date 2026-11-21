import { expect, type Page } from '@playwright/test';
import { SEED } from '../../prisma/dados-seed';

export { SEED };

export async function entrar(page: Page, email: string, senha = SEED.senha) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(senha);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/empresa$/);
}

export const literal = (t: string) => new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

export async function escolher(page: Page, nomeEmpresa: string) {
  await page.getByRole('button', { name: literal(nomeEmpresa) }).click();
  await expect(page).toHaveURL(/\/inicio$/);
}
