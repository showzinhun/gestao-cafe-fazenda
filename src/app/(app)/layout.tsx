import { auth } from '@/auth';
import { exigirContexto } from '@/lib/contexto';
import { listarEmpresasDoUsuario } from '@/servicos/acesso';
import { NOME_PERFIL } from '@/dominio/perfis';
import { MenuLateral } from '@/componentes/menu-lateral';
import { sair, trocarEmpresa } from './acoes';

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const ctx = await exigirContexto();
  const s = await auth();
  const empresa = (await listarEmpresasDoUsuario(ctx.usuarioId)).find((e) => e.empresaId === ctx.empresaId);
  return (
    <div className="lg:pl-63">
      <MenuLateral empresa={empresa?.nome ?? ''} usuario={s?.user?.name ?? ''} perfil={NOME_PERFIL[ctx.perfil]} acaoSair={sair} acaoTrocar={trocarEmpresa} />
      <main className="pb-12">{children}</main>
    </div>
  );
}
