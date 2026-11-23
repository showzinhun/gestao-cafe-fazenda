import { expect, test } from '@playwright/test';
import { entrar, escolher, SEED } from './apoio';

/**
 * Certificados da fazenda pela interface: marcar vários de uma vez com ID opcional, parcial, corrigir e conferir a coluna
 * "Certificados" da lista. Usa uma fazenda nova (ZCE) para não mudar a herança de certificados da NS, que outros testes conferem.
 */
test('cadastra os certificados da fazenda (ID opcional, parcial), corrige e vê o resumo na lista', async ({ page }) => {
  await entrar(page, 'admin@alfa.exemplo');
  await escolher(page, SEED.empresas.alfa.nome);

  await page.goto('/cadastros/fazendas');
  await page.getByRole('button', { name: 'Nova fazenda' }).click();
  const form = page.locator('form');
  await form.getByLabel(/^Código/).fill('ZCE');
  await form.getByLabel(/^Nome/).fill('Fazenda dos certificados (fictícia)');
  await form.getByRole('button', { name: 'Salvar' }).click();
  const linha = page.getByRole('row', { name: /ZCE/ });
  await expect(linha).toContainText('Sem certificado');
  await linha.getByRole('link', { name: 'ZCE' }).click();

  // Marca RFA (com ID), UTZ (parcial, sem ID) e TAG Cerrado (sem ID e sem PDF).
  await page.getByRole('button', { name: 'Cadastrar certificados' }).click();
  await expect(page.getByLabel('ID do certificado RFA')).toBeDisabled(); // só habilita quando marca
  for (const cod of ['RFA', 'UTZ', 'TAG']) await page.getByRole('checkbox', { name: new RegExp(`^${cod}\\s`) }).check();
  await page.getByLabel('ID do certificado RFA').fill('RFA-9988');
  await page.getByLabel('RFA: válido de').fill('2026-01-01');
  await page.getByLabel('RFA: válido até').fill('2030-12-31');
  await page.getByLabel('UTZ: válido de').fill('2026-01-01');
  await page.getByLabel('UTZ: válido até').fill('2030-12-31');
  await page.getByLabel('UTZ: certificação parcial').check();
  await page.getByLabel('TAG: válido de').fill('2026-01-01');
  await page.getByLabel('TAG: válido até').fill('2030-12-31');
  await page.getByRole('button', { name: 'Salvar certificados marcados' }).click();
  await expect(page.getByText('Certificados cadastrados.')).toBeVisible();

  const tabela = page.getByRole('table').last();
  await expect(tabela.getByRole('row', { name: /^RFA\s/ })).toContainText('RFA-9988');
  await expect(tabela.getByRole('row', { name: /^UTZ\s/ })).toContainText('sem ID');
  await expect(tabela.getByRole('row', { name: /^UTZ\s/ })).toContainText('Parcial');
  await expect(tabela.getByRole('row', { name: /^TAG\s/ })).toContainText('sem ID');
  await expect(page.locator('#titulo-certificados').locator('xpath=following-sibling::*[1]')).toContainText('RFA + TAG + UTZ (parcial)');

  // O mesmo período do mesmo certificado é recusado (renovar = período seguinte).
  await page.getByRole('button', { name: 'Cadastrar certificados' }).click();
  await page.getByRole('checkbox', { name: /^RFA\s/ }).check();
  await page.getByLabel('RFA: válido de').fill('2027-01-01');
  await page.getByLabel('RFA: válido até').fill('2031-12-31');
  await page.getByRole('button', { name: 'Salvar certificados marcados' }).click();
  await expect(page.getByText(/já tem RFA de 01\/01\/2026 a 31\/12\/2030/)).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar' }).first().click();

  // Corrige: coloca ID no TAG e tira o "parcial" do UTZ.
  await page.getByRole('button', { name: 'Editar TAG' }).click();
  await page.getByLabel('ID do certificado (opcional)').fill('TAG-0042');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByText('Certificado atualizado.')).toBeVisible();
  await expect(tabela.getByRole('row', { name: /^TAG\s/ })).toContainText('TAG-0042');
  await page.getByRole('button', { name: 'Editar UTZ' }).click();
  await page.getByRole('checkbox', { name: /Certificação parcial/ }).uncheck();
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByText('Certificado atualizado.')).toBeVisible();
  await expect(tabela.getByRole('row', { name: /^UTZ\s/ })).not.toContainText('Parcial');

  // A lista de fazendas mostra a certificação no formato da lista do negócio.
  await page.goto('/cadastros/fazendas');
  await expect(page.getByRole('row', { name: /ZCE/ })).toContainText('RFA + TAG + UTZ');
  await expect(page.getByRole('row', { name: /^.*\bNS\b.*Nascente/ })).toContainText('RFA');
});
