import { PrismaClient, type Perfil } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { CERTIFICADOS_PADRAO, modeloFluxo, PENEIRAS_PADRAO, TIPOS_CAFE_PADRAO } from '@/dominio/modelos-fluxo';
import { ErroValidacao } from '@/dominio/erros';
import { copiarModelo } from './fluxo';

/**
 * Criação de empresa (tenant). É operação da plataforma: roda com a conexão de dono (DIRECT_URL),
 * fora da RLS. A tela do SUPERADMIN chega na Fase 8; por enquanto: script e seed.
 * Copia o modelo de fluxo escolhido (§5.3) e os cadastros-base (tipos de café, peneiras, certificados, turnos).
 */
export async function criarEmpresa(
  db: PrismaClient,
  dados: { id?: string; nome: string; cnpj?: string | null; modelo: string; admin: { nome: string; email: string; senha?: string } },
) {
  const modelo = modeloFluxo(dados.modelo);
  if (!modelo) throw new ErroValidacao(`Modelo de fluxo desconhecido: ${dados.modelo}.`);
  return db.$transaction(async (tx) => {
    const empresa = await tx.empresa.create({
      data: { ...(dados.id ? { id: dados.id } : {}), nome: dados.nome, cnpj: dados.cnpj ?? null, configuracoes: { unidade_medida_litros: 60, moeda_padrao: 'BRL', fuso: 'America/Sao_Paulo', modelo_inicial: modelo.codigo } },
    });
    const e = empresa.id;
    await tx.tipoCafe.createMany({ data: TIPOS_CAFE_PADRAO.map(([codigo, nome]) => ({ empresaId: e, codigo, nome })) });
    await tx.peneira.createMany({ data: PENEIRAS_PADRAO.map(([codigo, descricao], i) => ({ empresaId: e, codigo, descricao, ordem: (i + 1) * 10 })) });
    await tx.certificado.createMany({ data: CERTIFICADOS_PADRAO.map(([codigo, nome]) => ({ empresaId: e, codigo, nome })) });
    await tx.turno.createMany({ data: ['Manhã', 'Tarde', 'Noite'].map((nome) => ({ empresaId: e, nome })) });
    await copiarModelo(tx, e, modelo, null);

    const email = dados.admin.email.trim().toLowerCase();
    let u = await tx.usuario.findUnique({ where: { email } });
    if (!u) {
      if (!dados.admin.senha) throw new ErroValidacao('Informe a senha do administrador.');
      u = await tx.usuario.create({ data: { nome: dados.admin.nome, email, senhaHash: await bcrypt.hash(dados.admin.senha, 10) } });
    }
    await tx.usuarioEmpresa.create({ data: { usuarioId: u.id, empresaId: e, perfil: 'ADMIN_EMPRESA' as Perfil } });
    await tx.auditoria.create({ data: { empresaId: e, entidade: 'empresa', entidadeId: e, acao: 'CRIAR', depois: { nome: dados.nome, modelo: modelo.codigo, admin: email } } });
    return empresa;
  });
}
