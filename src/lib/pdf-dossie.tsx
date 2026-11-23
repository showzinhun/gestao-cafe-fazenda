import { Document, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';
import type { ConteudoDossie } from '@/dominio/pacote';
import { formatarNumero } from './formatacao';

/** Dossiê EUDR/certificações do embarque em PDF (§10). */

const e = StyleSheet.create({
  pagina: { padding: 36, fontSize: 9.5, fontFamily: 'Helvetica', color: '#14211b' },
  titulo: { fontSize: 17, fontFamily: 'Helvetica-Bold', color: '#132a1f' },
  sub: { fontSize: 9, color: '#4b5b52', marginTop: 3, marginBottom: 10 },
  secao: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginTop: 12, marginBottom: 5, color: '#2e6b4c' },
  linha: { flexDirection: 'row', borderBottom: '0.5pt solid #d6dcd3', paddingVertical: 3 },
  cab: { flexDirection: 'row', borderBottom: '1pt solid #2e6b4c', paddingVertical: 3, fontFamily: 'Helvetica-Bold' },
  ok: { color: '#2e6b4c', fontFamily: 'Helvetica-Bold' },
  erro: { color: '#a1321f', fontFamily: 'Helvetica-Bold' },
  rodape: { position: 'absolute', bottom: 22, left: 36, right: 36, fontSize: 7, color: '#5e6e63' },
});
const data = (d: string | null) => (d ? d.split('-').reverse().join('/') : '—');
const col = (w: string, right = false) => ({ width: w, ...(right ? { textAlign: 'right' as const } : {}) });

function Dossie({ empresa, d, versao, congelado }: { empresa: string; d: ConteudoDossie & { hash_sha256: string }; versao: number; congelado: boolean }) {
  return (
    <Document title={`Dossiê ${d.embarque.codigo} v${versao}`} author={empresa}>
      <Page size="A4" style={e.pagina}>
        <Text style={e.titulo}>Dossiê EUDR e certificações</Text>
        <Text style={e.sub}>
          {empresa} · embarque {d.embarque.codigo} · contrato {d.embarque.contrato} · {d.embarque.cliente} · data {data(d.embarque.data)} · versão {versao}{congelado ? ' (congelada na finalização)' : ''}
        </Text>
        <Text>Total: {formatarNumero(String(d.total_kg))} kg · vendido como {d.embarque.certificados_vendidos.join(' + ') || 'convencional'} · EUDR {d.embarque.exige_eudr ? 'exigida' : 'não exigida'} · DDS {d.embarque.numero_dds ?? 'não informada'}</Text>
        <Text style={d.pendencias.length ? e.erro : e.ok}>{d.pendencias.length ? `${d.pendencias.length} pendência(s)` : 'Sem pendências'}</Text>

        <Text style={e.secao}>Origem por talhão (composição, RN-09)</Text>
        <View style={e.cab}><Text style={col('14%')}>Fazenda</Text><Text style={col('22%')}>Produtor</Text><Text style={col('10%')}>Talhão</Text><Text style={col('10%', true)}>Área (ha)</Text><Text style={col('11%')}>Geometria</Text><Text style={col('11%', true)}>kg</Text><Text style={col('7%', true)}>%</Text><Text style={col('15%')}>Checagem</Text></View>
        {d.talhoes.map((t) => (
          <View key={t.id} style={e.linha} wrap={false}>
            <Text style={col('14%')}>{t.fazenda}</Text><Text style={col('22%')}>{t.produtor ?? '—'}</Text><Text style={col('10%')}>{t.talhao}</Text>
            <Text style={col('10%', true)}>{t.area_ha === null ? '—' : formatarNumero(String(t.area_ha), 2)}</Text><Text style={col('11%')}>{t.geometria_tipo === 'POLIGONO' ? 'polígono' : t.geometria_tipo === 'PONTO' ? 'ponto' : 'sem'}</Text>
            <Text style={col('11%', true)}>{formatarNumero(String(t.kg))}</Text><Text style={col('7%', true)}>{formatarNumero(String(t.percentual * 100), 2)}</Text>
            <Text style={col('15%')}>{t.checagem ? `${t.checagem.resultado.replace('_', ' ')} ${data(t.checagem.data)}` : 'sem checagem'}</Text>
          </View>
        ))}

        <Text style={e.secao}>Lotes</Text>
        {d.lotes.map((l) => <Text key={l.codigo}>{l.codigo} · {formatarNumero(String(l.kg))} kg · {l.certificados.join(', ') || 'convencional'}</Text>)}

        <Text style={e.secao}>Certificados das fazendas na data do embarque</Text>
        {d.certificados.length ? d.certificados.map((c, i) => (
          <Text key={i}>{c.fazenda} · {c.certificado}{c.numero ? ` nº ${c.numero}` : ''} · validade até {data(c.validade_fim)} · <Text style={c.valido ? e.ok : e.erro}>{c.valido ? 'válido' : c.parcial ? 'parcial (não herdado pelos lotes)' : 'não válido'}</Text></Text>
        )) : <Text>—</Text>}

        <Text style={e.secao}>Cadeia de movimentos</Text>
        {d.cadeia.map((c) => <Text key={c.movimento}>{data(c.data)} · {c.movimento} · {c.etapa} · {c.status.toLowerCase()}</Text>)}

        <Text style={e.secao}>Pendências</Text>
        {d.pendencias.length ? d.pendencias.map((p, i) => <Text key={i} style={e.erro}>• {p.mensagem}</Text>) : <Text style={e.ok}>Nenhuma.</Text>}

        <Text style={e.rodape} fixed>Gerado em {d.gerado_em} · SHA-256 {d.hash_sha256}</Text>
      </Page>
    </Document>
  );
}

export async function gerarDossiePdf(empresa: string, d: ConteudoDossie & { hash_sha256: string }, versao: number, congelado: boolean): Promise<Buffer> {
  return renderToBuffer(<Dossie empresa={empresa} d={d} versao={versao} congelado={congelado} />);
}
