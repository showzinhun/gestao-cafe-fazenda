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

/**
 * Formulário de certificados da fazenda: "marcados" repete o id de cada certificado marcado e cada um traz
 * numero_<id>, inicio_<id>, fim_<id>, parcial_<id> e arquivo_<id> (PDF opcional).
 */
export async function certificadosDoForm(f: FormData) {
  const itens = [];
  for (const id of f.getAll('marcados').map(String)) {
    const texto = (k: string) => String(f.get(`${k}_${id}`) ?? '').trim();
    itens.push({
      entrada: { certificadoId: id, numero: texto('numero') || null, validadeInicio: texto('inicio'), validadeFim: texto('fim'), parcial: f.get(`parcial_${id}`) === 'on' },
      arquivo: await arquivoDoForm(f, `arquivo_${id}`),
    });
  }
  return itens;
}
