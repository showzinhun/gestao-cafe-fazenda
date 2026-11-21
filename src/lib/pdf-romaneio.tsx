import { Document, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';
import Decimal from 'decimal.js';
import { formatarNumero } from './formatacao';

/** Romaneio A4 do embarque (§12): contrato, cliente, lotes, pesagem, motorista, lacres e notas. */

type Embarque = {
  rotulo: string;
  contrato: { codigo: string; cliente: string; certificados: string[] };
  logistica: { dataEmbarque: string | null; container: string | null; navio: string | null; booking: string | null };
  carregamento: { motorista: string | null; placa: string | null; lacres: string[]; pesoBruto: string | null; tara: string | null; pesoLiquido: string | null; diferencaKg: string | null; diferencaPerc: string | null; motivoDiferenca: string | null } | null;
  entradas: { lote: string; peneira: string | null; certificados: string[]; quantidade: string }[];
  kgEntradas: string;
  notas: { numero: string; serie: string | null; dataEmissao: string | null; kg: string }[];
};

const e = StyleSheet.create({
  pagina: { padding: 36, fontSize: 10, fontFamily: 'Helvetica', color: '#14211b' },
  titulo: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: '#132a1f' },
  sub: { fontSize: 9.5, color: '#4b5b52', marginTop: 3, marginBottom: 14 },
  secao: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginTop: 14, marginBottom: 6, color: '#2e6b4c' },
  grade: { flexDirection: 'row', flexWrap: 'wrap' },
  campo: { width: '33%', marginBottom: 6 },
  rotulo: { fontSize: 8, color: '#5e6e63', textTransform: 'uppercase' },
  linha: { flexDirection: 'row', borderBottom: '0.5pt solid #d6dcd3', paddingVertical: 4 },
  cab: { flexDirection: 'row', borderBottom: '1pt solid #2e6b4c', paddingVertical: 4, fontFamily: 'Helvetica-Bold' },
  assinaturas: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 50 },
  assinatura: { width: '30%', borderTop: '0.5pt solid #14211b', paddingTop: 4, fontSize: 9, textAlign: 'center' },
});
const kg = (v: string | null) => (v ? `${formatarNumero(v)} kg` : '—');
const data = (d: string | null) => (d ? d.split('-').reverse().join('/') : '—');

function Romaneio({ empresa, b }: { empresa: string; b: Embarque }) {
  const c = b.carregamento;
  return (
    <Document title={`Romaneio ${b.rotulo}`} author={empresa}>
      <Page size="A4" style={e.pagina}>
        <Text style={e.titulo}>Romaneio de embarque {b.rotulo}</Text>
        <Text style={e.sub}>{empresa} · contrato {b.contrato.codigo} · {b.contrato.cliente} · certificação exigida: {b.contrato.certificados.join(', ') || 'convencional'}</Text>
        <Text style={e.secao}>Transporte</Text>
        <View style={e.grade}>
          {[['Data do embarque', data(b.logistica.dataEmbarque)], ['Motorista', c?.motorista ?? '—'], ['Placa', c?.placa ?? '—'], ['Lacres', c?.lacres.join(', ') || '—'], ['Container', b.logistica.container ?? '—'], ['Navio / booking', [b.logistica.navio, b.logistica.booking].filter(Boolean).join(' / ') || '—']].map(([r, v]) => (
            <View key={r} style={e.campo}><Text style={e.rotulo}>{r}</Text><Text>{v}</Text></View>
          ))}
        </View>
        <Text style={e.secao}>Pesagem</Text>
        <View style={e.grade}>
          {[['Bruto', kg(c?.pesoBruto ?? null)], ['Tara', kg(c?.tara ?? null)], ['Líquido', kg(c?.pesoLiquido ?? null)], ['Soma dos lotes', kg(b.kgEntradas)], ['Diferença', c?.diferencaKg ? `${kg(c.diferencaKg)} (${formatarNumero(new Decimal(c.diferencaPerc ?? 0).times(100), 2)}%)` : '—'], ['Motivo', c?.motivoDiferenca ?? '—']].map(([r, v]) => (
            <View key={r} style={e.campo}><Text style={e.rotulo}>{r}</Text><Text>{v}</Text></View>
          ))}
        </View>
        <Text style={e.secao}>Lotes</Text>
        <View style={e.cab}><Text style={{ width: '40%' }}>Lote</Text><Text style={{ width: '15%' }}>Peneira</Text><Text style={{ width: '20%' }}>Certificados</Text><Text style={{ width: '12%', textAlign: 'right' }}>Kg</Text><Text style={{ width: '13%', textAlign: 'right' }}>Sacas</Text></View>
        {b.entradas.map((l) => (
          <View key={l.lote} style={e.linha}><Text style={{ width: '40%' }}>{l.lote}</Text><Text style={{ width: '15%' }}>{l.peneira ? `P${l.peneira}` : '—'}</Text><Text style={{ width: '20%' }}>{l.certificados.join(', ') || '—'}</Text><Text style={{ width: '12%', textAlign: 'right' }}>{formatarNumero(l.quantidade)}</Text><Text style={{ width: '13%', textAlign: 'right' }}>{formatarNumero(new Decimal(l.quantidade).div(60), 2)}</Text></View>
        ))}
        <Text style={e.secao}>Notas fiscais</Text>
        {b.notas.length ? b.notas.map((n) => <Text key={n.numero}>NF {n.numero}{n.serie ? `-${n.serie}` : ''} · {data(n.dataEmissao)} · {kg(n.kg)}</Text>) : <Text>—</Text>}
        <View style={e.assinaturas}>
          <Text style={e.assinatura}>Conferente</Text><Text style={e.assinatura}>Motorista</Text><Text style={e.assinatura}>Responsável</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function gerarRomaneioPdf(empresa: string, b: Embarque): Promise<Buffer> {
  return renderToBuffer(<Romaneio empresa={empresa} b={b} />);
}
