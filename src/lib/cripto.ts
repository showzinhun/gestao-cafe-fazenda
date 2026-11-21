import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';

/**
 * Cifra de dados pessoais (§3.3, regra 11): AES-256-GCM na aplicação.
 * A chave vem de DADOS_PESSOAIS_CHAVE (32 bytes em base64). Fora de produção, sem a variável,
 * deriva uma chave de AUTH_SECRET para desenvolvimento e testes.
 */
function chave(): Buffer {
  const b64 = process.env.DADOS_PESSOAIS_CHAVE;
  if (b64) {
    const k = Buffer.from(b64, 'base64');
    if (k.length !== 32) throw new Error('DADOS_PESSOAIS_CHAVE deve ter 32 bytes em base64.');
    return k;
  }
  if (process.env.NODE_ENV === 'production') throw new Error('Defina DADOS_PESSOAIS_CHAVE em produção.');
  const segredo = process.env.AUTH_SECRET ?? 'dev-local';
  return Buffer.from(hkdfSync('sha256', segredo, 'cafe-dados-pessoais', 'aes-256-gcm', 32));
}

/** "v1:" + base64(iv | tag | cifra). */
export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', chave(), iv);
  const cifra = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return 'v1:' + Buffer.concat([iv, c.getAuthTag(), cifra]).toString('base64');
}

export function decifrar(valor: string): string {
  if (!valor.startsWith('v1:')) throw new Error('Formato de dado cifrado desconhecido.');
  const b = Buffer.from(valor.slice(3), 'base64');
  const d = createDecipheriv('aes-256-gcm', chave(), b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
}

/** Impressão digital para busca e unicidade sem guardar o dado aberto. */
export function impressao(texto: string): string {
  return createHmac('sha256', chave()).update(texto).digest('base64url');
}
