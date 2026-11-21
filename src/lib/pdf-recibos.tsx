import { Document, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';
import { formatarMoeda, formatarNumero } from './formatacao';

/** Recibos individuais do fechamento (§6.3), um por página. CPF sai mascarado (§3.3). */

type Dados = {
  empresa: string;
  cnpj: string | null;
  fechamento: {
    numero: number; fazenda: string; periodoInicio: string; periodoFim: string; pagoEm: Date | null;
    itens: { colhedor: string; cpf: string | null; chavePix: string | null; medidas: string; bruto: string; adiantamentos: string; descontos: string; adicionais: string; liquido: string }[];
  };
};

const e = StyleSheet.create({
  pagina: { padding: 40, fontSize: 11, fontFamily: 'Helvetica', color: '#14211b' },
  topo: { borderBottom: '2pt solid #2e6b4c', paddingBottom: 8, marginBottom: 18 },
  titulo: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: '#132a1f' },
  sub: { fontSize: 10, color: '#4b5b52', marginTop: 3 },
  linha: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottom: '0.5pt solid #d6dcd3' },
  total: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, marginTop: 6, fontFamily: 'Helvetica-Bold', fontSize: 13 },
  texto: { marginTop: 18, lineHeight: 1.5 },
  assinatura: { marginTop: 60, borderTop: '0.5pt solid #14211b', width: 260, paddingTop: 4, fontSize: 10 },
});

const real = formatarMoeda;
const data = (iso: string) => iso.split('-').reverse().join('/');

function Recibos({ d }: { d: Dados }) {
  const f = d.fechamento;
  return (
    <Document title={`Recibos — fechamento ${f.numero}`} author={d.empresa}>
      {f.itens.map((i) => (
        <Page key={i.colhedor} size="A4" style={e.pagina}>
          <View style={e.topo}>
            <Text style={e.titulo}>Recibo de pagamento de colheita</Text>
            <Text style={e.sub}>{d.empresa}{d.cnpj ? ` · CNPJ ${d.cnpj}` : ''} · {f.fazenda} · fechamento nº {f.numero} · {data(f.periodoInicio)} a {data(f.periodoFim)}</Text>
          </View>
          <View style={e.linha}><Text>Colhedor</Text><Text>{i.colhedor}</Text></View>
          <View style={e.linha}><Text>CPF</Text><Text>{i.cpf ?? '—'}</Text></View>
          <View style={e.linha}><Text>Chave PIX</Text><Text>{i.chavePix ?? '—'}</Text></View>
          <View style={e.linha}><Text>Medidas colhidas</Text><Text>{formatarNumero(i.medidas)}</Text></View>
          <View style={e.linha}><Text>Valor da colheita</Text><Text>{real(i.bruto)}</Text></View>
          <View style={e.linha}><Text>Adicionais</Text><Text>{real(i.adicionais)}</Text></View>
          <View style={e.linha}><Text>Adiantamentos</Text><Text>- {real(i.adiantamentos)}</Text></View>
          <View style={e.linha}><Text>Descontos</Text><Text>- {real(i.descontos)}</Text></View>
          <View style={e.total}><Text>Valor líquido</Text><Text>{real(i.liquido)}</Text></View>
          <Text style={e.texto}>
            Recebi de {d.empresa} a importância de {real(i.liquido)} referente à colheita de café no período de {data(f.periodoInicio)} a {data(f.periodoFim)}.
          </Text>
          <Text style={e.assinatura}>{i.colhedor}</Text>
        </Page>
      ))}
    </Document>
  );
}

export async function gerarRecibosPdf(d: Dados): Promise<Buffer> {
  return renderToBuffer(<Recibos d={d} />);
}
