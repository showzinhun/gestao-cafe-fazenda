import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { entrar, escolher, SEED } from './apoio';

/**
 * Acessibilidade (Fase 8): axe-core (WCAG 2.1 A/AA) nas telas principais, com os dados deixados pelos outros
 * testes do desktop (roda por último, ordem alfabética). Falha em violação séria ou crítica.
 */
test.describe.configure({ mode: 'serial' });

const achados: string[] = [];
async function conferir(page: Page, rotulo: string) {
  await page.waitForLoadState('networkidle');
  const r = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .exclude('.maplibregl-canvas') // o mapa tem alternativa em tabela (talhões)
    .analyze();
  const graves = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const resumo = graves.map((v) => `${v.id} (${v.impact}): ${v.help} → ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  achados.push(...resumo.map((x) => `${rotulo}: ${x}`));
}
const semAchados = () => {
  const lista = achados.splice(0);
  expect(lista, 'violações graves de acessibilidade').toEqual([]);
};

test('telas da empresa sem violações graves de acessibilidade', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/login');
  await conferir(page, '/login');
  await entrar(page, 'admin@alfa.exemplo');
  await conferir(page, '/empresa');
  await escolher(page, SEED.empresas.alfa.nome);
  for (const rota of ['/inicio', '/colheita', '/colheita/colhedores', '/pagamentos', '/etapas', '/secagem', '/estoque', '/rastreabilidade', '/alertas', '/contratos', '/contratos/novo', '/embarques', '/conformidade', '/cadastros', '/cadastros/fazendas', '/config/fluxo', '/config/usuarios']) {
    await page.goto(rota);
    await conferir(page, rota);
  }
  // Detalhes: primeiro item de cada lista.
  for (const [lista, link] of [['/contratos', /^CT-/], ['/embarques', /#/], ['/cadastros/fazendas', /NS/]] as const) {
    await page.goto(lista);
    if (!(await page.getByRole('link', { name: link }).count())) continue;
    await page.getByRole('link', { name: link }).first().click();
    await page.waitForURL((u) => u.pathname !== lista);
    await conferir(page, page.url());
  }
  await page.goto('/etapas');
  await page.getByRole('link', { name: /Armazém/ }).first().click();
  await conferir(page, page.url());
  if (await page.getByRole('link', { name: /#\d+/ }).count()) {
    await page.getByRole('link', { name: /#\d+/ }).first().click();
    await conferir(page, page.url());
  }
  semAchados();
});

test('área da plataforma sem violações graves de acessibilidade', async ({ page }) => {
  await entrar(page, SEED.plataforma.email);
  await page.getByRole('link', { name: /Área da plataforma/ }).click();
  await expect(page.getByRole('heading', { name: 'Empresas' })).toBeVisible();
  await conferir(page, '/plataforma');
  semAchados();
});
