import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { PieChart, BarChart } from 'react-native-chart-kit';
import { Colors, Spacing, Typography, BorderRadius, Shadows, CategoryLabels, CategoryColors } from '../utils/theme';
import { useTheme } from '../utils/useTheme';
import { formatBytes } from '../utils/format';
import {
  getDocumentsByCategory,
  getDocumentsByMonth,
  getTopSenders,
  getDocumentsByFileType,
  getDocumentStats,
  getAllFilteredDocuments,
} from '../database/documents';
import {
  getInvoiceGlobalStats,
  getInvoiceMonthlySummary,
  getTopIssuers,
  InvoiceMonthlySummary,
  InvoiceIssuerSummary,
} from '../database/invoices';
import { exportDocumentsExcel } from '../utils/exportExcel';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_WIDTH = SCREEN_WIDTH - 32;

const AVATAR_COLORS = ['#6366F1', '#EC4899', '#F59E0B', '#10B981', '#3B82F6', '#EF4444', '#8B5CF6', '#14B8A6'];

const CATEGORY_CHART_COLORS = [
  '#6366F1', '#EC4899', '#F59E0B', '#10B981', '#3B82F6',
  '#EF4444', '#8B5CF6', '#14B8A6', '#F97316',
];

const FILE_TYPE_UI: Record<string, { icon: string; color: string }> = {
  pdf:  { icon: 'file-pdf-box',         color: '#EF4444' },
  docx: { icon: 'file-word-box',        color: '#2563EB' },
  xlsx: { icon: 'file-excel-box',       color: '#16A34A' },
  jpg:  { icon: 'image-outline',        color: '#8B5CF6' },
  jpeg: { icon: 'image-outline',        color: '#8B5CF6' },
  png:  { icon: 'image-outline',        color: '#8B5CF6' },
  xml:  { icon: 'file-code-outline',    color: '#F59E0B' },
  txt:  { icon: 'file-document-outline',color: '#6B7280' },
};

// ─── Sub-components ──────────────────────────────────────────────────────────

function SenderAvatar({ name, index }: { name: string; index: number }) {
  const color = AVATAR_COLORS[index % AVATAR_COLORS.length];
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <View style={[styles.senderAvatar, { backgroundColor: color + '22', borderColor: color + '55' }]}>
      <Text style={[styles.senderInitials, { color }]}>{initials || '?'}</Text>
    </View>
  );
}

/** Colorful horizontal progress bar */
function ProgressBar({ pct, color, height = 6 }: { pct: number; color: string; height?: number }) {
  return (
    <View style={[styles.progressTrack, { height }]}>
      <View style={[styles.progressFill, { width: `${Math.max(pct, 2)}%`, backgroundColor: color, height }]} />
    </View>
  );
}

/** KPI stat card used in the hero banner */
function StatCard({ value, label, icon, color, bg }: {
  value: string; label: string; icon: string; color: string; bg: string;
}) {
  return (
    <View style={[styles.statCard, { backgroundColor: bg }]}>
      <View style={[styles.statIconWrap, { backgroundColor: color + '22' }]}>
        <MaterialCommunityIcons name={icon as any} size={18} color={color} />
      </View>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: color + 'CC' }]}>{label}</Text>
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function InsightsScreen() {
  const theme = useTheme();
  const [loading, setLoading]           = useState(true);
  const [exporting, setExporting]       = useState(false);
  const [stats, setStats]               = useState({ total: 0, totalSize: 0 });
  const [categoryData, setCategoryData] = useState<{ category: string; count: number; totalSize: number }[]>([]);
  const [monthlyData, setMonthlyData]   = useState<{ month: string; count: number }[]>([]);
  const [topSenders, setTopSenders]     = useState<{ name: string; email: string; count: number; totalSize: number }[]>([]);
  const [fileTypes, setFileTypes]       = useState<{ ext: string; count: number }[]>([]);

  // SUNAT invoice analytics
  const [invoiceGlobal, setInvoiceGlobal] = useState({ totalFacturas: 0, totalBoletas: 0, totalGastado: 0, totalIgv: 0 });
  const [invoiceMonthly, setInvoiceMonthly] = useState<InvoiceMonthlySummary[]>([]);
  const [topIssuers, setTopIssuers]         = useState<InvoiceIssuerSummary[]>([]);

  useFocusEffect(
    useCallback(() => { loadAll(); }, [])
  );

  async function loadAll() {
    setLoading(true);
    try {
      const [s, cats, months, senders, types, invGlobal, invMonthly, issuers] = await Promise.all([
        getDocumentStats(),
        getDocumentsByCategory(),
        getDocumentsByMonth(6),
        getTopSenders(8),
        getDocumentsByFileType(),
        getInvoiceGlobalStats(),
        getInvoiceMonthlySummary(6),
        getTopIssuers(5),
      ]);
      setStats(s);
      setCategoryData(cats);
      setMonthlyData(months);
      setTopSenders(senders);
      setFileTypes(types);
      setInvoiceGlobal(invGlobal);
      setInvoiceMonthly(invMonthly);
      setTopIssuers(issuers);
    } finally {
      setLoading(false);
    }
  }

  async function handleExport() {
    try {
      setExporting(true);
      const docs = await getAllFilteredDocuments({
        category: 'all', provider: 'all', fileType: 'all',
        dateRange: 'all', starredOnly: false, searchQuery: '', sortBy: 'date_desc',
      });
      if (docs.length === 0) {
        Alert.alert('Sin documentos', 'No hay documentos para exportar.');
        return;
      }
      await exportDocumentsExcel(docs);
    } catch (e: any) {
      Alert.alert('Error al exportar', e?.message ?? 'Ocurrió un error inesperado.');
    } finally {
      setExporting(false);
    }
  }

  // ── Chart data ──────────────────────────────────────────────────────────────

  const pieData = categoryData.map((c, i) => ({
    name: (CategoryLabels as any)[c.category] ?? c.category,
    count: c.count,
    color: CATEGORY_CHART_COLORS[i % CATEGORY_CHART_COLORS.length],
    legendFontColor: theme.textSecondary,
    legendFontSize: 11,
  }));

  const totalCategoryCount = categoryData.reduce((s, c) => s + c.count, 0) || 1;

  const now = new Date();
  const last6Months: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    last6Months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const monthCountMap = Object.fromEntries(monthlyData.map(m => [m.month, m.count]));
  const MONTH_NAMES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const barLabels  = last6Months.map(m => MONTH_NAMES[parseInt(m.split('-')[1]) - 1] ?? m.split('-')[1]);
  const barValues  = last6Months.map(m => monthCountMap[m] ?? 0);

  const chartConfig = {
    backgroundGradientFrom: theme.surface,
    backgroundGradientTo: theme.surface,
    backgroundGradientFromOpacity: 1,
    backgroundGradientToOpacity: 1,
    color: (opacity = 1) => `rgba(99, 102, 241, ${opacity})`,
    labelColor: () => theme.textMuted,
    strokeWidth: 2,
    barPercentage: 0.65,
    decimalPlaces: 0,
    propsForLabels: { fontSize: 10 },
  };

  const totalSenderCount = topSenders.reduce((s, x) => s + x.count, 0) || 1;
  const totalFileCount   = fileTypes.reduce((s, x) => s + x.count, 0) || 1;

  // ── Loading ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={[styles.loadingText, { color: theme.textMuted }]}>Analizando documentos...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isEmpty = stats.total === 0;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ═══ HERO HEADER ═══ */}
        <View style={styles.heroHeader}>
          {/* Title row */}
          <View style={styles.heroTitleRow}>
            <View style={styles.heroIconWrap}>
              <MaterialCommunityIcons name="chart-box" size={22} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroTitle}>Insights</Text>
              <Text style={styles.heroSub}>Resumen de tu archivo digital</Text>
            </View>
            {/* Export button */}
            <TouchableOpacity
              style={[styles.exportBtn, exporting && { opacity: 0.6 }]}
              onPress={handleExport}
              disabled={exporting}
              activeOpacity={0.75}
            >
              {exporting
                ? <ActivityIndicator size="small" color="#fff" />
                : <MaterialCommunityIcons name="export-variant" size={16} color="#fff" />
              }
              <Text style={styles.exportBtnText}>{exporting ? 'Exportando…' : 'Exportar'}</Text>
            </TouchableOpacity>
          </View>

          {/* KPI stat cards */}
          {!isEmpty && (
            <View style={styles.statRow}>
              <StatCard
                value={String(stats.total)}
                label="Documentos"
                icon="file-multiple"
                color="#6366F1"
                bg="#EEF2FF"
              />
              <StatCard
                value={formatBytes(stats.totalSize)}
                label="Almacenados"
                icon="database"
                color="#10B981"
                bg="#ECFDF5"
              />
              <StatCard
                value={String(categoryData.length)}
                label="Categorías"
                icon="shape"
                color="#F59E0B"
                bg="#FFFBEB"
              />
            </View>
          )}
        </View>

        {isEmpty ? (
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="chart-box-outline" size={72} color={theme.textMuted} />
            <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>Sin datos todavía</Text>
            <Text style={[styles.emptyText, { color: theme.textMuted }]}>
              Sincroniza tu correo para ver análisis de tus documentos
            </Text>
          </View>
        ) : (
          <>
            {/* ─── Categorías: Pie + Progress bars ─── */}
            {pieData.length > 0 && (
              <View style={[styles.card, { backgroundColor: theme.surface }]}>
                <View style={styles.cardHeader}>
                  <MaterialCommunityIcons name="shape-outline" size={18} color="#6366F1" />
                  <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>Por categoría</Text>
                </View>

                {/* Pie chart */}
                <PieChart
                  data={pieData}
                  width={CHART_WIDTH - 32}
                  height={180}
                  chartConfig={chartConfig}
                  accessor="count"
                  backgroundColor="transparent"
                  paddingLeft="8"
                  absolute
                  hasLegend
                  style={{ marginLeft: -8 }}
                />

                {/* Colored progress bars per category */}
                <View style={styles.catBarsWrap}>
                  {categoryData.map((c, i) => {
                    const color  = CATEGORY_CHART_COLORS[i % CATEGORY_CHART_COLORS.length];
                    const pct    = Math.round((c.count / totalCategoryCount) * 100);
                    const label  = (CategoryLabels as any)[c.category] ?? c.category;
                    return (
                      <View key={c.category} style={styles.catBarRow}>
                        <View style={[styles.catDot, { backgroundColor: color }]} />
                        <Text style={[styles.catBarLabel, { color: theme.textSecondary }]} numberOfLines={1}>
                          {label}
                        </Text>
                        <View style={{ flex: 1 }}>
                          <ProgressBar pct={pct} color={color} height={7} />
                        </View>
                        <Text style={[styles.catBarPct, { color }]}>{pct}%</Text>
                        <Text style={[styles.catBarCount, { color: theme.textMuted }]}>{c.count}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {/* ─── Actividad mensual ─── */}
            <View style={[styles.card, { backgroundColor: theme.surface }]}>
              <View style={styles.cardHeader}>
                <MaterialCommunityIcons name="chart-bar" size={18} color="#10B981" />
                <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>Actividad mensual</Text>
                <Text style={[styles.cardSubtitle, { color: theme.textMuted }]}>últimos 6 meses</Text>
              </View>
              {barValues.every(v => v === 0) ? (
                <Text style={[styles.noDataText, { color: theme.textMuted }]}>Sin actividad en los últimos 6 meses</Text>
              ) : (
                <BarChart
                  data={{ labels: barLabels, datasets: [{ data: barValues }] }}
                  width={CHART_WIDTH - 32}
                  height={180}
                  chartConfig={chartConfig}
                  style={styles.barChart}
                  fromZero
                  showValuesOnTopOfBars
                  withInnerLines={false}
                  yAxisLabel=""
                  yAxisSuffix=""
                />
              )}
            </View>

            {/* ─── Tipos de archivo ─── */}
            {fileTypes.length > 0 && (
              <View style={[styles.card, { backgroundColor: theme.surface }]}>
                <View style={styles.cardHeader}>
                  <MaterialCommunityIcons name="file-multiple-outline" size={18} color="#F59E0B" />
                  <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>Tipos de archivo</Text>
                </View>
                <View style={styles.typeGrid}>
                  {fileTypes.slice(0, 6).map((t) => {
                    const ui  = FILE_TYPE_UI[t.ext] ?? { icon: 'file-outline', color: '#6B7280' };
                    const pct = Math.round((t.count / totalFileCount) * 100);
                    return (
                      <View key={t.ext} style={[styles.typeCard, { backgroundColor: ui.color + '12', borderColor: ui.color + '35' }]}>
                        {/* Big icon */}
                        <View style={[styles.typeIconWrap, { backgroundColor: ui.color + '20' }]}>
                          <MaterialCommunityIcons name={ui.icon as any} size={28} color={ui.color} />
                        </View>
                        <Text style={[styles.typeExt, { color: ui.color }]}>{t.ext.toUpperCase()}</Text>
                        <Text style={[styles.typeCount, { color: ui.color }]}>{t.count}</Text>
                        {/* Mini progress bar */}
                        <View style={styles.typePctBarWrap}>
                          <View style={[styles.typePctFill, { width: `${Math.max(pct, 4)}%`, backgroundColor: ui.color }]} />
                        </View>
                        <Text style={[styles.typePctLabel, { color: theme.textMuted }]}>{pct}%</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {/* ─── Top remitentes ─── */}
            {topSenders.length > 0 && (
              <View style={[styles.card, { backgroundColor: theme.surface }]}>
                <View style={styles.cardHeader}>
                  <MaterialCommunityIcons name="email-multiple-outline" size={18} color="#EC4899" />
                  <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>Top remitentes</Text>
                </View>
                {topSenders.map((sender, idx) => {
                  const color  = AVATAR_COLORS[idx % AVATAR_COLORS.length];
                  const pct    = Math.round((sender.count / totalSenderCount) * 100);
                  return (
                    <View key={sender.email} style={[styles.senderRow, idx < topSenders.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
                      <Text style={[styles.senderRank, { color: idx < 3 ? '#F59E0B' : theme.textMuted }]}>#{idx + 1}</Text>
                      <SenderAvatar name={sender.name} index={idx} />
                      <View style={styles.senderInfo}>
                        <Text style={[styles.senderName, { color: theme.textPrimary }]} numberOfLines={1}>{sender.name}</Text>
                        <Text style={[styles.senderEmail, { color: theme.textMuted }]} numberOfLines={1}>{sender.email}</Text>
                        {/* Contribution bar */}
                        <View style={styles.senderBarWrap}>
                          <View style={[styles.senderBarFill, { width: `${Math.max(pct, 3)}%`, backgroundColor: color }]} />
                        </View>
                      </View>
                      <View style={styles.senderStats}>
                        <Text style={[styles.senderCount, { color }]}>{sender.count} docs</Text>
                        <Text style={[styles.senderPct, { color }]}>{pct}%</Text>
                        <Text style={[styles.senderSize, { color: theme.textMuted }]}>{formatBytes(sender.totalSize)}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {/* ─── Panel financiero SUNAT ─── */}
            {(invoiceGlobal.totalFacturas > 0 || invoiceGlobal.totalBoletas > 0) && (
              <>
                {/* KPIs globales */}
                <View style={[styles.card, { backgroundColor: theme.surface }]}>
                  <View style={styles.cardHeader}>
                    <MaterialCommunityIcons name="receipt" size={18} color="#2563EB" />
                    <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>Panel SUNAT</Text>
                    <Text style={[styles.cardSubtitle, { color: theme.textMuted }]}>comprobantes electrónicos</Text>
                  </View>

                  <View style={styles.kpiRow}>
                    <View style={[styles.kpiBox, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
                      <View style={[styles.kpiIconWrap, { backgroundColor: '#DBEAFE' }]}>
                        <MaterialCommunityIcons name="file-document-outline" size={16} color="#2563EB" />
                      </View>
                      <Text style={[styles.kpiValue, { color: '#2563EB' }]}>{invoiceGlobal.totalFacturas}</Text>
                      <Text style={[styles.kpiLabel, { color: '#2563EB' }]}>Facturas</Text>
                    </View>
                    <View style={[styles.kpiBox, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}>
                      <View style={[styles.kpiIconWrap, { backgroundColor: '#D1FAE5' }]}>
                        <MaterialCommunityIcons name="receipt-text-outline" size={16} color="#16A34A" />
                      </View>
                      <Text style={[styles.kpiValue, { color: '#16A34A' }]}>{invoiceGlobal.totalBoletas}</Text>
                      <Text style={[styles.kpiLabel, { color: '#16A34A' }]}>Boletas</Text>
                    </View>
                    <View style={[styles.kpiBox, { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' }]}>
                      <View style={[styles.kpiIconWrap, { backgroundColor: '#FFEDD5' }]}>
                        <MaterialCommunityIcons name="percent-outline" size={16} color="#D97706" />
                      </View>
                      <Text style={[styles.kpiValue, { color: '#D97706' }]}>S/ {invoiceGlobal.totalIgv.toFixed(0)}</Text>
                      <Text style={[styles.kpiLabel, { color: '#D97706' }]}>IGV pagado</Text>
                    </View>
                  </View>

                  <View style={[styles.totalPaidRow, { borderTopColor: theme.border, backgroundColor: '#F8FAFF' }]}>
                    <View style={styles.totalPaidLeft}>
                      <MaterialCommunityIcons name="cash-multiple" size={20} color={Colors.primary} />
                      <Text style={[styles.totalPaidLabel, { color: theme.textSecondary }]}>Total gastado</Text>
                    </View>
                    <Text style={[styles.totalPaidValue, { color: theme.textPrimary }]}>
                      S/ {invoiceGlobal.totalGastado.toFixed(2)}
                    </Text>
                  </View>
                </View>

                {/* Gasto mensual */}
                {invoiceMonthly.length > 0 && (
                  <View style={[styles.card, { backgroundColor: theme.surface }]}>
                    <View style={styles.cardHeader}>
                      <MaterialCommunityIcons name="chart-timeline-variant" size={18} color="#8B5CF6" />
                      <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>Gasto mensual</Text>
                    </View>
                    {invoiceMonthly.map((m) => {
                      const maxTotal = Math.max(...invoiceMonthly.map(x => x.total), 1);
                      const pct      = m.total / maxTotal;
                      const [year, month] = m.month.split('-');
                      const label    = `${MONTH_NAMES[parseInt(month) - 1]} ${year}`;
                      return (
                        <View key={m.month} style={styles.monthRow}>
                          <Text style={[styles.monthLabel, { color: theme.textSecondary }]}>{label}</Text>
                          <View style={styles.monthBarWrap}>
                            <View style={[styles.monthBar, { width: `${Math.max(pct * 100, 4)}%`, backgroundColor: '#8B5CF6' }]} />
                          </View>
                          <Text style={[styles.monthValue, { color: theme.textPrimary }]}>S/ {m.total.toFixed(0)}</Text>
                        </View>
                      );
                    })}
                  </View>
                )}

                {/* Top proveedores */}
                {topIssuers.length > 0 && (
                  <View style={[styles.card, { backgroundColor: theme.surface }]}>
                    <View style={styles.cardHeader}>
                      <MaterialCommunityIcons name="office-building-outline" size={18} color="#EC4899" />
                      <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>Top proveedores</Text>
                    </View>
                    {topIssuers.map((issuer, idx) => (
                      <View key={issuer.issuerRuc} style={[styles.senderRow, idx < topIssuers.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
                        <Text style={[styles.senderRank, { color: idx < 3 ? '#F59E0B' : theme.textMuted }]}>#{idx + 1}</Text>
                        <View style={styles.senderInfo}>
                          <Text style={[styles.senderName, { color: theme.textPrimary }]} numberOfLines={1}>{issuer.issuerName}</Text>
                          <Text style={[styles.senderEmail, { color: theme.textMuted }]}>RUC: {issuer.issuerRuc}</Text>
                        </View>
                        <View style={styles.senderStats}>
                          <Text style={[styles.senderCount, { color: '#2563EB' }]}>S/ {issuer.total.toFixed(0)}</Text>
                          <Text style={[styles.senderSize, { color: theme.textMuted }]}>{issuer.count} comp.</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </>
            )}

            <View style={{ height: 32 }} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:             { flex: 1 },
  scroll:           { flex: 1 },
  content:          { padding: Spacing.base, gap: Spacing.base },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.base },
  loadingText:      { ...Typography.bodyM },
  emptyContainer:   { alignItems: 'center', justifyContent: 'center', paddingVertical: 80, gap: Spacing.base },
  emptyTitle:       { ...Typography.headingS, fontWeight: '700' },
  emptyText:        { ...Typography.bodyM, textAlign: 'center', lineHeight: 22 },

  // ── Hero header ────────────────────────────────────────────────────────────
  heroHeader: {
    backgroundColor: '#1E1B4B',
    borderRadius: BorderRadius.card,
    padding: Spacing.base,
    gap: Spacing.md,
    ...Shadows.medium,
  },
  heroTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  heroIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.subtle,
  },
  heroTitle: {
    ...Typography.headingM,
    fontWeight: '800',
    color: '#fff',
  },
  heroSub: {
    ...Typography.caption,
    color: '#A5B4FC',
    marginTop: 1,
  },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6366F1',
    borderRadius: BorderRadius.pill,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    gap: Spacing.xs,
    ...Shadows.subtle,
  },
  exportBtnText: {
    ...Typography.caption,
    color: '#fff',
    fontWeight: '700',
  },
  statRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  statCard: {
    flex: 1,
    borderRadius: 14,
    padding: Spacing.md,
    alignItems: 'center',
    gap: 4,
  },
  statIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  statValue: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  statLabel: {
    ...Typography.caption,
    fontWeight: '600',
    textAlign: 'center',
  },

  // ── Generic card ───────────────────────────────────────────────────────────
  card: {
    borderRadius: BorderRadius.card,
    padding: Spacing.base,
    ...Shadows.subtle,
    gap: Spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  cardTitle:    { ...Typography.bodyM, fontWeight: '700', flex: 1 },
  cardSubtitle: { ...Typography.caption },
  noDataText:   { ...Typography.bodyM, textAlign: 'center', paddingVertical: 20 },
  barChart:     { marginLeft: -12, borderRadius: 8 },

  // ── Category progress bars ─────────────────────────────────────────────────
  catBarsWrap: { gap: 8, marginTop: 4 },
  catBarRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  catDot:      { width: 9, height: 9, borderRadius: 5 },
  catBarLabel: { ...Typography.caption, width: 76 },
  catBarPct:   { ...Typography.caption, fontWeight: '700', width: 30, textAlign: 'right' },
  catBarCount: { ...Typography.caption, width: 26, textAlign: 'right' },

  // ── Progress bar ───────────────────────────────────────────────────────────
  progressTrack: {
    flex: 1,
    backgroundColor: '#E5E7EB',
    borderRadius: 6,
    overflow: 'hidden',
  },
  progressFill: { borderRadius: 6 },

  // ── File type cards ────────────────────────────────────────────────────────
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  typeCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: Spacing.md,
    alignItems: 'center',
    gap: 5,
    minWidth: (SCREEN_WIDTH - 88) / 3,
    flex: 1,
  },
  typeIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  typeExt:       { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  typeCount:     { fontSize: 20, fontWeight: '800', letterSpacing: -0.5 },
  typePctBarWrap:{ width: '100%', height: 5, backgroundColor: '#E5E7EB', borderRadius: 3, overflow: 'hidden' },
  typePctFill:   { height: '100%', borderRadius: 3 },
  typePctLabel:  { ...Typography.caption },

  // ── Senders ────────────────────────────────────────────────────────────────
  senderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  senderRank:   { ...Typography.caption, fontWeight: '700', width: 24, textAlign: 'center' },
  senderAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  senderInitials: { fontSize: 13, fontWeight: '800' },
  senderInfo:   { flex: 1, gap: 2 },
  senderName:   { ...Typography.caption, fontWeight: '600' },
  senderEmail:  { ...Typography.caption },
  senderBarWrap:{ height: 5, backgroundColor: '#E5E7EB', borderRadius: 3, overflow: 'hidden', marginTop: 4 },
  senderBarFill:{ height: '100%', borderRadius: 3 },
  senderStats:  { alignItems: 'flex-end', gap: 1 },
  senderCount:  { ...Typography.caption, fontWeight: '700' },
  senderPct:    { ...Typography.caption, fontWeight: '800' },
  senderSize:   { ...Typography.caption },

  // ── SUNAT KPIs ─────────────────────────────────────────────────────────────
  kpiRow:     { flexDirection: 'row', gap: Spacing.sm },
  kpiBox:     {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    padding: Spacing.md,
    alignItems: 'center',
    gap: 3,
  },
  kpiIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  kpiValue:   { fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  kpiLabel:   { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center' },
  totalPaidRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    paddingTop: Spacing.md,
    marginTop: 2,
    borderRadius: 10,
    paddingHorizontal: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  totalPaidLeft:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  totalPaidLabel: { ...Typography.bodyM },
  totalPaidValue: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },

  // Gasto mensual bars
  monthRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  monthLabel:  { width: 60, fontSize: 12, color: '#6B7280' },
  monthBarWrap:{ flex: 1, height: 8, backgroundColor: '#E5E7EB', borderRadius: 4, overflow: 'hidden' },
  monthBar:    { height: '100%', borderRadius: 4 },
  monthValue:  { width: 60, fontSize: 12, fontWeight: '700', textAlign: 'right' },
});
