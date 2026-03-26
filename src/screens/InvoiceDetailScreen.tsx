import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Share,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { useTheme } from '../utils/useTheme';
import { BorderRadius, Shadows, Spacing, Typography } from '../utils/theme';
import { SunatInvoice, SunatLineItem } from '../types';
import { getSunatInvoiceByDocumentId } from '../database/invoices';

type RouteParams = {
  InvoiceDetail: { documentId: string };
};

const SUNAT_TYPE_LABEL: Record<string, string> = {
  factura: 'Factura Electrónica',
  boleta: 'Boleta de Venta',
  nota_credito: 'Nota de Crédito',
  nota_debito: 'Nota de Débito',
  unknown: 'Comprobante',
};

const SUNAT_TYPE_COLOR: Record<string, string> = {
  factura: '#2563EB',
  boleta: '#10B981',
  nota_credito: '#F59E0B',
  nota_debito: '#EF4444',
  unknown: '#6B7280',
};

function formatMoney(amount: number, currency = 'PEN'): string {
  const symbol = currency === 'USD' ? '$' : 'S/';
  return `${symbol} ${amount.toFixed(2)}`;
}

export default function InvoiceDetailScreen() {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RouteParams, 'InvoiceDetail'>>();
  const { documentId } = route.params;

  const [invoice, setInvoice] = useState<SunatInvoice | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const inv = await getSunatInvoiceByDocumentId(documentId);
        setInvoice(inv);
      } catch (err) {
        console.warn('[InvoiceDetailScreen] load error:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [documentId]);

  const handleShare = async () => {
    if (!invoice) return;
    const lines = [
      `${SUNAT_TYPE_LABEL[invoice.sunatDocumentType]} ${invoice.fullNumber}`,
      `Fecha: ${invoice.issueDate}`,
      `Emisor: ${invoice.issuerName} (${invoice.issuerRuc})`,
      invoice.receiverName ? `Receptor: ${invoice.receiverName}` : '',
      `---`,
      `Base imponible: ${formatMoney(invoice.subtotal, invoice.currency)}`,
      `IGV (18%):      ${formatMoney(invoice.igv, invoice.currency)}`,
      `Total:          ${formatMoney(invoice.total, invoice.currency)}`,
    ]
      .filter(Boolean)
      .join('\n');

    await Share.share({ message: lines });
  };

  const s = styles(theme);

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <ActivityIndicator size="large" color={theme.primary} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  if (!invoice) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
            <Ionicons name="chevron-back" size={24} color={theme.textPrimary} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Factura SUNAT</Text>
        </View>
        <View style={s.emptyWrap}>
          <MaterialCommunityIcons name="file-alert-outline" size={64} color={theme.textMuted} />
          <Text style={s.emptyText}>No se encontraron datos de factura.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const typeColor = SUNAT_TYPE_COLOR[invoice.sunatDocumentType] ?? '#6B7280';

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color={theme.textPrimary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Detalle Factura</Text>
        <TouchableOpacity onPress={handleShare} style={s.shareBtn}>
          <Ionicons name="share-outline" size={22} color={theme.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Tipo y número */}
        <View style={s.card}>
          <View style={[s.typeBadge, { backgroundColor: typeColor + '20' }]}>
            <MaterialCommunityIcons name="file-document-outline" size={16} color={typeColor} />
            <Text style={[s.typeBadgeText, { color: typeColor }]}>
              {SUNAT_TYPE_LABEL[invoice.sunatDocumentType]}
            </Text>
          </View>
          <Text style={s.invoiceNumber}>{invoice.fullNumber}</Text>
          <Text style={s.issueDate}>Emitido: {invoice.issueDate}</Text>
          {invoice.dueDate && (
            <Text style={s.dueDate}>Vence: {invoice.dueDate}</Text>
          )}
        </View>

        {/* Emisor */}
        <SectionCard title="Emisor" icon="office-building-outline" theme={theme}>
          <InfoRow label="RUC" value={invoice.issuerRuc} theme={theme} />
          <InfoRow label="Razón social" value={invoice.issuerName} theme={theme} />
          {invoice.issuerAddress && (
            <InfoRow label="Dirección" value={invoice.issuerAddress} theme={theme} />
          )}
        </SectionCard>

        {/* Receptor */}
        {(invoice.receiverRuc || invoice.receiverName) && (
          <SectionCard title="Receptor" icon="account-outline" theme={theme}>
            {invoice.receiverRuc && (
              <InfoRow label="RUC/DNI" value={invoice.receiverRuc} theme={theme} />
            )}
            {invoice.receiverName && (
              <InfoRow label="Nombre" value={invoice.receiverName} theme={theme} />
            )}
          </SectionCard>
        )}

        {/* Montos */}
        <SectionCard title="Importes" icon="calculator-variant-outline" theme={theme}>
          <InfoRow
            label="Base imponible"
            value={formatMoney(invoice.subtotal, invoice.currency)}
            theme={theme}
          />
          <InfoRow
            label="IGV (18%)"
            value={formatMoney(invoice.igv, invoice.currency)}
            theme={theme}
            highlight
          />
          {invoice.otherCharges !== 0 && (
            <InfoRow
              label="Otros cargos"
              value={formatMoney(invoice.otherCharges, invoice.currency)}
              theme={theme}
            />
          )}
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>TOTAL A PAGAR</Text>
            <Text style={[s.totalValue, { color: typeColor }]}>
              {formatMoney(invoice.total, invoice.currency)}
            </Text>
          </View>
        </SectionCard>

        {/* Líneas de detalle */}
        {invoice.lineItems.length > 0 && (
          <SectionCard title={`Detalle (${invoice.lineItems.length} ítem${invoice.lineItems.length !== 1 ? 's' : ''})`} icon="format-list-bulleted" theme={theme}>
            {invoice.lineItems.map((item, idx) => (
              <LineItemRow key={idx} item={item} currency={invoice.currency} theme={theme} />
            ))}
          </SectionCard>
        )}

        {/* Metadatos */}
        <SectionCard title="Extracción" icon="cog-outline" theme={theme}>
          <InfoRow
            label="Fuente"
            value={invoice.extractionSource === 'xml' ? 'XML SUNAT' : invoice.extractionSource === 'pdf_text' ? 'PDF texto' : 'IA'}
            theme={theme}
          />
          <InfoRow
            label="Procesado"
            value={new Date(invoice.extractedAt).toLocaleString('es-PE')}
            theme={theme}
          />
        </SectionCard>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function SectionCard({
  title,
  icon,
  children,
  theme,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
  theme: any;
}) {
  const s = styles(theme);
  return (
    <View style={s.card}>
      <View style={s.sectionHeader}>
        <MaterialCommunityIcons name={icon as any} size={16} color={theme.primary} />
        <Text style={s.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function InfoRow({
  label,
  value,
  theme,
  highlight,
}: {
  label: string;
  value: string;
  theme: any;
  highlight?: boolean;
}) {
  const s = styles(theme);
  return (
    <View style={s.infoRow}>
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={[s.infoValue, highlight && { color: theme.primary, fontWeight: '600' }]}>
        {value}
      </Text>
    </View>
  );
}

function LineItemRow({
  item,
  currency,
  theme,
}: {
  item: SunatLineItem;
  currency: string;
  theme: any;
}) {
  const s = styles(theme);
  return (
    <View style={s.lineItem}>
      <Text style={s.lineDesc} numberOfLines={2}>{item.description}</Text>
      <View style={s.lineAmounts}>
        <Text style={s.lineQty}>{item.quantity} u. × {formatMoney(item.unitPrice, currency)}</Text>
        <Text style={s.lineTotal}>{formatMoney(item.total, currency)}</Text>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function styles(theme: any) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      backgroundColor: theme.surface,
    },
    backBtn: {
      padding: 4,
      marginRight: Spacing.sm,
    },
    headerTitle: {
      flex: 1,
      ...Typography.headingS,
      color: theme.textPrimary,
    },
    shareBtn: {
      padding: 4,
    },
    scroll: {
      padding: Spacing.md,
      gap: Spacing.md,
    },
    card: {
      backgroundColor: theme.surface,
      borderRadius: BorderRadius.card,
      padding: Spacing.md,
      ...Shadows.subtle,
      gap: Spacing.xs,
    },
    typeBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      borderRadius: BorderRadius.input,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 4,
      gap: 4,
      marginBottom: 4,
    },
    typeBadgeText: {
      fontSize: 12,
      fontWeight: '600',
    },
    invoiceNumber: {
      ...Typography.headingM,
      color: theme.textPrimary,
    },
    issueDate: {
      fontSize: 14,
      color: theme.textSecondary,
    },
    dueDate: {
      fontSize: 13,
      color: theme.warning ?? '#F59E0B',
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 8,
      paddingBottom: 8,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    sectionTitle: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.primary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    infoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      paddingVertical: 4,
      gap: Spacing.sm,
    },
    infoLabel: {
      fontSize: 13,
      color: theme.textMuted,
      flexShrink: 0,
    },
    infoValue: {
      fontSize: 13,
      color: theme.textPrimary,
      textAlign: 'right',
      flex: 1,
    },
    totalRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 8,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: theme.border,
    },
    totalLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.textPrimary,
    },
    totalValue: {
      fontSize: 20,
      fontWeight: '700',
    },
    lineItem: {
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      gap: 4,
    },
    lineDesc: {
      fontSize: 13,
      color: theme.textPrimary,
    },
    lineAmounts: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    lineQty: {
      fontSize: 12,
      color: theme.textMuted,
    },
    lineTotal: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.textPrimary,
    },
    emptyWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: Spacing.md,
    },
    emptyText: {
      fontSize: 15,
      color: theme.textMuted,
      textAlign: 'center',
    },
    warning: { color: '#F59E0B' },
  });
}
