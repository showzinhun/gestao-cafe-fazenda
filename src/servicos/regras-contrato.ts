import { ErroNaoEncontrado, ErroRegra, ErroValidacao } from '@/dominio/erros';
import { exigirCertificadosDoContrato, peneiraAtende } from '@/dominio/comercial';
import { exigirLoteEudr } from '@/dominio/eudr';
import { talhoesDosLotes, talhoesEudr } from './eudr-base';
import type { Tx } from './transacao';

/**
 * Validações de um lote para um contrato (§9.3): certificados exigidos (RN-17) e peneira mínima.
 * e EUDR (RN-18) quando o contrato exige. Usada na reserva de contrato e na entrada do embarque.
 */
export async function validarLoteParaContrato(tx: Tx, contratoId: string, loteId: string) {
  const contrato = await tx.contrato.findFirst({ where: { id: contratoId }, include: { certificados: { include: { certificado: true } }, peneiraMin: true } });
  if (!contrato) throw new ErroNaoEncontrado('Contrato não encontrado.');
  const lote = await tx.lote.findFirstOrThrow({ where: { id: loteId }, include: { peneira: true, etapa: true, certificados: { where: { removidoEm: null } } } });
  if (lote.unidade !== 'KG') throw new ErroValidacao(`O lote ${lote.codigo} ainda não está em kg (estoque).`);
  exigirCertificadosDoContrato(
    { codigo: lote.codigo, certificados: lote.certificados.map((c) => c.certificadoId) },
    contrato.certificados.map((c) => ({ id: c.certificadoId, codigo: c.certificado.codigo })),
  );
  if (!peneiraAtende(lote.peneira, contrato.peneiraMin))
    throw new ErroRegra('RN-17', `O lote ${lote.codigo} (${lote.peneira ? `P${lote.peneira.codigo}` : 'sem peneira'}) não atende a peneira mínima ${contrato.peneiraMin!.codigo} do contrato.`);
  if (contrato.exigeEudr) {
    const ids = (await talhoesDosLotes(tx, [lote.id])).get(lote.id) ?? [];
    exigirLoteEudr(lote.codigo, [...(await talhoesEudr(tx, ids)).values()]);
  }
  return { contrato, lote };
}

export function exigirContratoAtivo(c: { codigo: string; status: string }) {
  if (c.status === 'RASCUNHO') throw new ErroValidacao(`O contrato ${c.codigo} ainda é rascunho: assine antes de reservar ou embarcar.`);
  if (c.status === 'CANCELADO' || c.status === 'CONCLUIDO') throw new ErroValidacao(`O contrato ${c.codigo} está ${c.status === 'CANCELADO' ? 'cancelado' : 'concluído'}.`);
}
