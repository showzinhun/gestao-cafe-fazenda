import 'server-only';
import type { ArquivoEnviado } from '@/servicos/conformidade';

/** Lê um campo de arquivo de um FormData (multipart). Vazio → null. */
export async function arquivoDoForm(f: FormData, campo = 'arquivo'): Promise<ArquivoEnviado | null> {
  const v = f.get(campo);
  if (!v || typeof v === 'string' || v.size === 0) return null;
  return { nome: v.name, tipo: v.type, conteudo: Buffer.from(await v.arrayBuffer()) };
}

/** Campos de texto de um FormData (sem os arquivos). */
export const camposDoForm = (f: FormData) => Object.fromEntries([...f.entries()].filter(([, v]) => typeof v === 'string')) as Record<string, string>;
