import Decimal from 'decimal.js';
import { painelComercial } from './contratos';
import { resumoEtapas } from './consultas';
import { painelSecagem } from './secagem';
import { dataLocal, dec } from './rastreio-base';
import { comTransacao, type Contexto } from './transacao';

/**
 * Início (§12, item 2): alertas, cartões (estoque livre/reservado, secagem no ponto, contratos a vencer,
 * apontamentos do dia) e funil de saldo por etapa. Só leitura, a partir dos serviços de cada módulo.
 */
export async function painelInicio(ctx: Contexto) {
  const hoje = dataLocal(new Date());
  const [base, secagem, comercial, etapas] = await Promise.all([
    comTransacao(ctx, async (tx) => {
      const [alertas, naoLidos, estoque, apontamentos, colhedores] = await Promise.all([
        tx.alerta.findMany({ where: { lidoEm: null }, orderBy: [{ severidade: 'desc' }, { criadoEm: 'desc' }], take: 6 }),
        tx.alerta.count({ where: { lidoEm: null } }),
        tx.lote.aggregate({ where: { status: { in: ['ABERTO', 'PARCIAL'] }, unidade: 'KG', etapa: { classe: 'ESTOQUE' } }, _sum: { quantidade: true, quantidadeUtilizada: true, quantidadeReservada: true } }),
        tx.apontamento.aggregate({ where: { data: new Date(`${hoje}T00:00:00Z`), status: { not: 'CANCELADO' } }, _sum: { medidas: true }, _count: true }),
        tx.apontamento.groupBy({ by: ['colhedorId'], where: { data: new Date(`${hoje}T00:00:00Z`), status: { not: 'CANCELADO' } } }),
      ]);
      const saldo = dec(estoque._sum.quantidade).minus(dec(estoque._sum.quantidadeUtilizada));
      const reservado = dec(estoque._sum.quantidadeReservada);
      return {
        alertas: alertas.map((a) => ({ id: a.id, tipo: a.tipo, mensagem: a.mensagem, severidade: a.severidade, criadoEm: a.criadoEm })),
        naoLidos,
        estoque: { saldo: saldo.toFixed(3), reservado: reservado.toFixed(3), livre: Decimal.max(0, saldo.minus(reservado)).toFixed(3), sacas: saldo.div(60).toFixed(2) },
        apontamentos: { medidas: dec(apontamentos._sum.medidas).toFixed(3), lancamentos: apontamentos._count, colhedores: colhedores.length },
      };
    }),
    painelSecagem(ctx),
    painelComercial(ctx),
    resumoEtapas(ctx),
  ]);
  const aVencer = comercial.aEmbarcar.filter((c) => c.dias !== null && c.dias <= comercial.diasAlerta && new Decimal(c.saldo).gt(0));
  return {
    hoje,
    ...base,
    secagem: { noPonto: secagem.resumo.NO_PONTO, atencao: secagem.resumo.ATENCAO, secando: secagem.resumo.SECANDO },
    contratos: { aVencer: aVencer.length, diasAlerta: comercial.diasAlerta, lista: aVencer.slice(0, 5).map((c) => ({ id: c.id, codigo: c.codigo, cliente: c.cliente, dias: c.dias, saldo: c.saldo })) },
    funil: etapas.map((e) => ({ id: e.id, nome: e.nome, classe: e.classe, unidade: e.unidade, saldo: e.saldo, abertos: e.abertos })),
  };
}
