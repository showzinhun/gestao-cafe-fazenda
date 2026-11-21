import prepararBanco from '../integracao/preparar-banco';

/** Mesmo banco de teste dos testes de integração, recriado do zero com o seed fictício. */
export default async function preparar() {
  await prepararBanco();
}
