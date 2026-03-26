import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { PieChart, BarChart } from 'react-native-chart-kit';
import { Colors, Spacing, Typography, BorderRadius, Shadows, CategoryLabels, CategoryColors } from '../utils/theme';
import { useTheme } from '../utils/useTheme';
import { useAppStore } from '../store/useAppStore';
import { formatBytes } from '../utils/format';
import {
  getDocumentsByCategory,
  getDocumentsByMonth,
  getTopSenders,
  getDocumentsByFileType,
  getDocumentStats,
} from '../database/documents';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_WIDTH = SCREEN_WIDTH - 32;

// Avatar-like initials for sender
function SenderAvatar({ name, index }: { name: string; index: number }) {
  const theme = useTheme();
  const COLORS = ['#6366F1', '#EC4899', '#F59E0B', '#10B981', '#3B82F6', '#EF4444', '#8B5CF6', '#14B8A6'];
  const color = COLORS[index % COLORS.length];
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <View style={[styles.senderAvatar, { backgroundColor: color + '22', borderColor: color + '44' }]}>
      <Text style={[styles.senderInitials, { color }]}>{initials || '?'}</Text>
    </View>
  );
}

export default function InsightsScreen() {
  const theme = useTheme();
  const { activeAccountId } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, totalSize: 0 });
  const [categoryData, setCategoryData] = useState<{ category: string; count: number; totalSize: number }[]>([]);
  const [monthlyData, setMonthlyData] = useState<{ month: string; count: number }[]>([]);
  const [topSenders, setTopSenders] = useState<{ name: string; email: string; count: number; totalSize: number }[]>([]);
  const [fileTypes, setFileTypes] = useState<{ ext: string; count: number }[]>([]);

  useFocusEffect(
    useCallback(() => {
      loadAll();
    }, [activeAccountId])
  );

  async function loadAll() {
    setLoading(true);
    const acctId = activeAccountId ?? undefined;
    try {
      const [s, cats, months, senders, types] = await Promise.all([
        getDocumentStats(acctId),
        getDocumentsByCategory(acctId),
        getDocumentsByMonth(6, acctId),
        getTopSenders(8, acctId),
        getDocumentsByFileType(acctId),
      ]);
      setStats(s);
      setCategoryData(cats);
      setMonthlyData(months);
      setTopSenders(senders);
      setFileTypes(types);
    } finally {
      setLoading(false);
    }
  }

  // Build PieChart data from categories
  const CATEGORY_CHART_COLORS = [
    '#6366F1', '#EC4899', '#F59E0B', '#10B981', '#3B82F6',
    '#EF4444', '#8B5CF6', '#14B8A6', '#F97316',
  ];

  const pieData = categoryData.map((c, i) => ({
    name: (CategoryLabels as any)[c.category] ?? c.category,
    count: c.count,
    color: CATEGORY_CHART_COLORS[i % CATEGORY_CHART_COLORS.length],
    legendFontColor: theme.textSecondary,
    legendFontSize: 11,
  }));

  // Build BarChart data from monthly
  // Pad to last 6 months if data is sparse
  const now = new Date();
  const last6Months: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    last6Months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const monthCountMap = Object.fromEntries(monthlyData.map(m => [m.month, m.count]));
  const barLabels = last6Months.map(m => {
    const [year, month] = m.split('-');
    const monthNames = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    return monthNames[parseInt(month) - 1] ?? month;
  });
  const barValues = last6Months.map(m => monthCountMap[m] ?? 0);

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

  const FILE_TYPE_UI: Record<string, { icon: string; color: string }> = {
    pdf:  { icon: 'file-pdf-box',   color: '#EF4444' },
    docx: { icon: 'file-word-box',  color: '#2563EB' },
    xlsx: { icon: 'file-excel-box', color: '#16A34A' },
    jpg:  { icon: 'image-outline',  color: '#8B5CF6' },
    jpeg: { icon: 'image-outline',  color: '#8B5CF6' },
    png:  { icon: 'image-outline',  color: '#8B5CF6' },
    xml:  { icon: 'file-code-outline', color: '#F59E0B' },
    txt:  { icon: 'file-document-outline', color: '#6B7280' },
  };

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

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <MaterialCommunityIcons name="chart-box" size={20} color="#fff" />
          </View>
          <View>
            <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>Insights</Text>
            <Text style={[styles.headerSub, { color: theme.textMuted }]}>
              {stats.total} documentos · {formatBytes(stats.totalSize)}
            </Text>
          </View>
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
            {/* ─── Categorías (Pie Chart) ─── */}
            {pieData.length > 0 && (
              <View style={[styles.card, { backgroundColor: theme.surface }]}>
                <View style={styles.cardHeader}>
                  <MaterialCommunityIcons name="shape-outline" size={18} color="#6366F1" />
                  <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>Por categoría</Text>
                </View>
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
              </View>
            )}

            {/* ─── Actividad mensual (Bar Chart) ─── */}
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
                    const ui = FILE_TYPE_UI[t.ext] ?? { icon: 'file-outline', color: '#6B7280' };
                    const pct = stats.total > 0 ? Math.round((t.count / stats.total) * 100) : 0;
                    return (
                      <View key={t.ext} style={[styles.typeChip, { backgroundColor: ui.color + '14', borderColor: ui.color + '30' }]}>
                        <MaterialCommunityIcons name={ui.icon as any} size={22} color={ui.color} />
                        <Text style={[styles.typeExt, { color: ui.color }]}>{t.ext.toUpperCase()}</Text>
                        <Text style={[styles.typeCount, { color: theme.textPrimary }]}>{t.count}</Text>
                        <Text style={[styles.typePct, { color: theme.textMuted }]}>{pct}%</Text>
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
                {topSenders.map((sender, idx) => (
                  <View key={sender.email} style={[styles.senderRow, idx < topSenders.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
                    <Text style={[styles.senderRank, { color: idx < 3 ? '#F59E0B' : theme.textMuted }]}>#{idx + 1}</Text>
                    <SenderAvatar name={sender.name} index={idx} />
                    <View style={styles.senderInfo}>
                      <Text style={[styles.senderName, { color: theme.textPrimary }]} numberOfLines={1}>{sender.name}</Text>
                      <Text style={[styles.senderEmail, { color: theme.textMuted }]} numberOfLines={1}>{sender.email}</Text>
                    </View>
                    <View style={styles.senderStats}>
                      <Text style={[styles.senderCount, { color: Colors.primary }]}>{sender.count}</Text>
                      <Text style={[styles.senderSize, { color: theme.textMuted }]}>{formatBytes(sender.totalSize)}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Bottom padding */}
            <View style={{ height: 24 }} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 16 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  loadingText: { ...Typography.bodyM },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80, gap: 16 },
  emptyTitle: { ...Typography.headingS, fontWeight: '700' },
  emptyText: { ...Typography.bodyM, textAlign: 'center', lineHeight: 22 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 4,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { ...Typography.headingM, fontWeight: '700' },
  headerSub: { ...Typography.caption, marginTop: 1 },

  card: {
    borderRadius: BorderRadius.card,
    padding: 16,
    ...Shadows.subtle,
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: { ...Typography.bodyM, fontWeight: '700', flex: 1 },
  cardSubtitle: { ...Typography.caption },
  noDataText: { ...Typography.bodyM, textAlign: 'center', paddingVertical: 20 },
  barChart: { marginLeft: -12, borderRadius: 8 },

  // Types grid
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeChip: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    gap: 4,
    minWidth: (SCREEN_WIDTH - 80) / 3,
    flex: 1,
  },
  typeExt: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  typeCount: { ...Typography.headingS, fontWeight: '700' },
  typePct: { ...Typography.caption },

  // Senders
  senderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  senderRank: { ...Typography.bodyS, fontWeight: '700', width: 24, textAlign: 'center' },
  senderAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  senderInitials: { fontSize: 13, fontWeight: '700' },
  senderInfo: { flex: 1, gap: 1 },
  senderName: { ...Typography.bodyS, fontWeight: '600' },
  senderEmail: { ...Typography.caption },
  senderStats: { alignItems: 'flex-end', gap: 1 },
  senderCount: { ...Typography.bodyS, fontWeight: '700' },
  senderSize: { ...Typography.caption },
});
