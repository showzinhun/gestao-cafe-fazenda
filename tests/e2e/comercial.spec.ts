import { expect, test } from '@playwright/test';
import { entrar, escolher, SEED } from './apoio';

/**
 * §15, passos 10, 12 e 15 pela interface (Fase 6). Roda depois de cenario-3-8 (ordem alfabética),
 * que deixa o lote AR-NS-2526-000001-P17 com 1.200 kg RFA no estoque. O dossiê do passo 12 chega na Fase 7.
 */
test.describe.configure({ mode: 'serial' });

test('passos 10, 12 e 15: contrato, reserva no estoque, embarque com pesagem e romaneio', async ({ page }) => {
  await entrar(page, 'admin@alfa.exemplo');
  await escolher(page, SEED.empresas.alfa.nome);

  // Passo 10: contrato de 15 sacas, FIXO R$ 1.800,00/saca, exige RFA e EUDR.
  await page.goto('/contratos');
  await page.getByRole('link', { name: 'Novo contrato' }).click();
  await page.getByLabel(/^Cliente \*/).selectOption({ label: 'Exportadora Exemplo Ltda (fictícia) · 77.888.999/0001-81' });
  await page.getByLabel(/^Sacas/).fill('15');
  await page.getByLabel(/^Preço por saca/).fill('1.800,00');
  await page.getByLabel('Embarque até').fill('2026-12-31');
  await page.getByRole('checkbox', { name: 'RFA' }).check();
  await page.getByRole('checkbox', { name: 'Exige EUDR' }).check();
  await page.getByRole('button', { name: 'Criar contrato' }).click();
  await expect(page).toHaveURL(/\/contratos\/[0-9a-f-]+$/);
  await expect(page.getByRole('heading', { name: /Contrato CT-\d{4}-0001/ })).toBeVisible();
  await expect(page.getByText('Rascunho')).toBeVisible();
  await expect(page.getByText('R$ 1.800,00/sc')).toBeVisible();
  await page.getByRole('button', { name: 'Assinar contrato' }).click();
  await expect(page.getByText('Contrato assinado.')).toBeVisible();
  const urlContrato = page.url();

  // Reserva a partir do Estoque: 900 kg do lote AR (aviso de amostra ausente).
  await page.goto('/estoque');
  await page.getByRole('row', { name: /AR-NS-2526-000001-P17/ }).getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Reservar para contrato' }).click();
  await page.getByLabel('Reservar do lote AR-NS-2526-000001-P17').fill('900');
  await page.getByRole('button', { name: 'Reservar', exact: true }).click();
  await expect(page.getByText('1 reserva(s) criada(s).')).toBeVisible();
  await expect(page.getByText(/Sem amostra do lote AR-NS-2526-000001-P17/)).toBeVisible();
  await expect(page.getByRole('row', { name: /^Selecionar AR-NS-2526-000001-P17/ })).toContainText('contrato 900');

  // O contrato passa para Em execução com 900 kg reservados.
  await page.goto(urlContrato);
  await expect(page.getByText('Em execução')).toBeVisible();
  await expect(page.getByRole('row', { name: /AR-NS-2526-000001-P17/ })).toContainText('900');

  // Passo 12/15: embarque a partir do contrato → programação puxa a reserva (RN-26).
  await page.getByRole('button', { name: 'Novo embarque' }).click();
  await expect(page).toHaveURL(/\/embarques\/[0-9a-f-]+$/);
  await page.getByRole('button', { name: 'Programar embarque' }).click();
  await expect(page.getByText(/Embarque programado/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Lotes programados' })).toBeVisible();

  // Carregamento: bruto 15.905, tara 15.000 → líquido 905, diferença 0,56% > 0,5% → exige motivo (RN-27).
  await page.getByLabel('Motorista').selectOption({ label: 'Pedro Motorista (fictício)' });
  await expect(page.getByLabel(/^Placa/)).toHaveValue('ABC1D23');
  await page.getByLabel(/^Lacres/).fill('L-001, L-002');
  await page.getByLabel(/^Peso bruto/).fill('15.905');
  await page.getByLabel(/^Tara/).fill('15.000');
  await expect(page.getByText(/diferença 5 kg \(0,56%\)/)).toBeVisible();
  await page.getByRole('button', { name: 'Registrar carregamento' }).click();
  await expect(page.getByText(/\(RN-27\)/)).toBeVisible();
  await page.getByLabel(/^Motivo da diferença/).fill('Umidade da sacaria na pesagem');
  await page.getByRole('button', { name: 'Registrar carregamento' }).click();
  await expect(page.getByText('Carregamento registrado.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Lotes carregados' })).toBeVisible();
  await expect(page.getByRole('row', { name: /AR-NS-2526-000001-P17/ })).toContainText('RFA');

  // Nota fiscal e romaneio A4.
  await page.getByLabel('Número').fill('1001');
  await page.getByRole('button', { name: 'Adicionar nota' }).click();
  await expect(page.getByText('Nota fiscal registrada.')).toBeVisible();
  const romaneio = await page.request.get(await page.getByRole('link', { name: /Romaneio/ }).getAttribute('href') ?? '');
  expect(romaneio.status()).toBe(200);
  expect(romaneio.headers()['content-type']).toContain('application/pdf');

  // Finaliza: 900 kg embarcados; contrato concluído (15 sacas cumpridas).
  await page.getByRole('button', { name: 'Finalizar embarque' }).click();
  await expect(page.getByText('Embarque finalizado.')).toBeVisible();
  await expect(page.getByText('Finalizado').first()).toBeVisible();
  await page.goto(urlContrato);
  await expect(page.getByText('Concluído')).toBeVisible();

  // A lista de embarques e o painel comercial refletem o embarque.
  await page.goto('/embarques');
  await expect(page.getByRole('row', { name: /CT-\d{4}-0001/ })).toContainText('Finalizado');
});
