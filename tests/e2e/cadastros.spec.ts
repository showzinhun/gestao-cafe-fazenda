import { expect, test, type Page } from '@playwright/test';
import { entrar, escolher, SEED } from './apoio';
import { retangulo } from '../../prisma/dados-seed';

const alfa = SEED.empresas.alfa.nome;
const ns = SEED.fazendas.find((f) => f.codigo === 'NS')!;

async function comoAdmin(page: Page) {
  await entrar(page, 'admin@alfa.exemplo');
  await escolher(page, alfa);
}

test('cadastro genérico: cria parceiro, recusa CPF inválido, inativa e reativa', async ({ page }) => {
  await comoAdmin(page);
  await page.goto('/cadastros/parceiros');
  await page.getByRole('button', { name: 'Novo parceiro' }).click();
  const form = page.locator('form');
  await form.getByLabel('Nome', { exact: false }).first().fill('Rita Rocha (fictícia)');
  await form.getByLabel('CPF / CNPJ', { exact: false }).fill('529.982.247-20');
  await form.getByRole('checkbox', { name: 'Produtor' }).check();
  await form.getByRole('button', { name: 'Salvar' }).click();
  await expect(form.getByRole('alert')).toContainText('CPF inválido');

  await form.getByLabel('CPF / CNPJ', { exact: false }).fill('529.982.247-25');
  await form.getByRole('button', { name: 'Salvar' }).click();
  const linha = page.getByRole('row', { name: /Rita Rocha/ });
  await expect(linha).toContainText('529.982.247-25');

  await linha.getByRole('button', { name: 'Inativar' }).click();
  await expect(page.getByRole('row', { name: /Rita Rocha/ })).toHaveCount(0);
  await page.getByLabel('Mostrar inativos').check();
  await page.getByRole('row', { name: /Rita Rocha/ }).getByRole('button', { name: 'Reativar' }).click();
  await page.getByLabel('Mostrar inativos').uncheck();
  await expect(page.getByRole('row', { name: /Rita Rocha/ })).toBeVisible();
});

test('fazenda NS: talhões T1 e T2 no mapa e importação de GeoJSON para um talhão novo', async ({ page }) => {
  await comoAdmin(page);
  await page.goto(`/cadastros/fazendas/${ns.id}`);
  await expect(page.getByRole('heading', { name: /Fazenda NS/ })).toBeVisible();
  await expect(page.getByRole('row', { name: /T1/ })).toContainText('Polígono');
  await expect(page.getByRole('row', { name: /T2/ })).toContainText('Polígono');
  await expect(page.getByRole('region', { name: 'Mapa dos talhões' })).toBeVisible();

  await page.getByRole('button', { name: 'Novo talhão' }).click();
  await page.getByLabel('Código', { exact: false }).fill('T3');
  await page.getByLabel('Nome', { exact: false }).fill('Talhão 3');
  await page.getByLabel('Área informada (ha)').fill('4');
  const geo = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { Name: 'T3' }, geometry: retangulo(-46.985, -18.94, 200, 200) }] };
  await page.getByLabel('Arquivo GeoJSON').setInputFiles({ name: 't3.geojson', mimeType: 'application/geo+json', buffer: Buffer.from(JSON.stringify(geo)) });
  await expect(page.getByText('Arquivo t3.geojson carregado')).toBeVisible();
  await page.getByRole('button', { name: 'Salvar talhão' }).click();
  const t3 = page.getByRole('row', { name: /T3/ });
  await expect(t3).toContainText('Polígono');
  await expect(t3).toContainText('4,00 ha');
});

test('editor do fluxo: Via úmida com 8 etapas, edita meta de secagem e transições', async ({ page }) => {
  await comoAdmin(page);
  await page.goto('/config/fluxo');
  await expect(page.getByRole('img', { name: 'Diagrama do fluxo de etapas' })).toBeVisible();
  await expect(page.getByText('Pendências do fluxo')).toHaveCount(0);

  await page.getByRole('button', { name: 'Editar Terreiro' }).click();
  await page.getByLabel('Umidade meta mínima (%)').fill('10,5');
  await page.getByRole('button', { name: 'Salvar etapa' }).click();
  await expect(page.getByRole('row', { name: /Terreiro/ }).first()).toContainText('10,5–12,5%');

  const caixa = page.getByRole('checkbox', { name: 'Tulha para Armazém' });
  await caixa.uncheck();
  await page.getByRole('button', { name: 'Salvar transições' }).click();
  await expect(page.getByText('Pendências do fluxo')).toBeVisible();
  await caixa.check();
  await page.getByRole('button', { name: 'Salvar transições' }).click();
  await expect(page.getByText('Pendências do fluxo')).toHaveCount(0);
  // Saída é o fim do fluxo: a linha do Embarque não tem nenhuma caixa para marcar.
  await expect(page.getByRole('checkbox', { name: /^Embarque para / })).toHaveCount(0);
});

test('usuários: libera fazenda para o operador; operador não vê a gestão de usuários', async ({ page }) => {
  await comoAdmin(page);
  await page.goto('/config/usuarios');
  await page.getByRole('row', { name: /Otávio Operador/ }).getByRole('button', { name: 'Editar' }).click();
  await page.getByRole('row', { name: /Otávio Operador/ }).getByRole('checkbox', { name: /NS/ }).check();
  await page.getByRole('row', { name: /Otávio Operador/ }).getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('row', { name: /Otávio Operador/ })).toContainText('NS');

  await page.getByRole('button', { name: 'Permissões por perfil' }).click();
  await expect(page.getByRole('checkbox', { name: 'Administrador: Editar cadastros' })).toBeDisabled();

  await page.getByRole('button', { name: 'Sair' }).click();
  await entrar(page, 'operador@alfa.exemplo');
  await escolher(page, alfa);
  await page.goto('/config/usuarios');
  await expect(page.getByText('Seu perfil não pode gerenciar usuários')).toBeVisible();
});
