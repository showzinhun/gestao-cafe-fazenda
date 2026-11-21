import { expect, test } from '@playwright/test';
import { entrar, escolher, SEED } from './apoio';

test('PWA: manifesto, ícones e service worker disponíveis', async ({ request }) => {
  const m = await request.get('/manifest.webmanifest');
  expect(m.ok()).toBe(true);
  const manifesto = await m.json();
  expect(manifesto).toMatchObject({ display: 'standalone', start_url: '/campo', lang: 'pt-BR' });
  const tamanhos = manifesto.icons.map((i: { sizes: string }) => i.sizes);
  expect(tamanhos).toEqual(expect.arrayContaining(['192x192', '512x512']));
  for (const i of manifesto.icons) expect((await request.get(i.src)).ok()).toBe(true);
  expect((await request.get('/sw.js')).ok()).toBe(true);
  expect((await request.get('/offline.html')).ok()).toBe(true);
});

test('app de campo no celular: layout próprio, sem rolagem lateral', async ({ page }) => {
  await entrar(page, 'operador@alfa.exemplo');
  await escolher(page, SEED.empresas.alfa.nome);
  await page.goto('/campo');
  await expect(page.getByText('Apontamento de colheita')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Campo' })).toBeVisible();
  const largura = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(largura).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test('menu lateral vira menu ☰ no celular', async ({ page }) => {
  await entrar(page, 'operador@alfa.exemplo');
  await escolher(page, SEED.empresas.alfa.nome);
  const nav = page.getByRole('navigation', { name: 'Seções' });
  await expect(nav).toBeHidden();
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  await expect(nav).toBeVisible();
});
