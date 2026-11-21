import type { Metadata } from 'next';
import { exigirContexto } from '@/lib/contexto';
import { listarOpcoes } from '@/servicos/cadastros';
import { listar } from '@/servicos/cadastros';
import { TituloPagina } from '@/componentes/titulo-pagina';
import { NovoContrato } from '@/componentes/comercial/novo-contrato';

export const metadata: Metadata = { title: 'Novo contrato' };

export default async function PaginaNovoContrato() {
  const ctx = await exigirContexto();
  const [opcoes, parceiros] = await Promise.all([listarOpcoes(ctx, ['safras', 'peneiras', 'certificados']), listar(ctx, 'parceiros') as Promise<{ id: string; nome: string; cpfCnpj: string | null; papeis: string[] }[]>]);
  const clientes = parceiros.filter((p) => p.papeis.includes('CLIENTE')).map((p) => ({ valor: p.id, rotulo: p.cpfCnpj ? `${p.nome} · ${p.cpfCnpj}` : p.nome }));
  return (
    <>
      <TituloPagina grupo="Contratos" titulo="Novo contrato" />
      <div className="grid gap-4 px-4 py-6 lg:px-6"><NovoContrato clientes={clientes} opcoes={opcoes} /></div>
    </>
  );
}
