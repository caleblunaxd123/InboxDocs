export const Colors = {
  primary: '#1E40AF',
  primaryLight: '#3B82F6',
  primarySubtle: '#EFF6FF',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  surface: '#FFFFFF',
  background: '#F8FAFC',
  border: '#E2E8F0',
  textPrimary: '#0F172A',
  textSecondary: '#64748B',
  textMuted: '#94A3B8',
  // Dark mode
  darkBackground: '#0F172A',
  darkSurface: '#1E293B',
  darkBorder: '#334155',
  darkTextPrimary: '#F1F5F9',
  darkTextSecondary: '#94A3B8',
};

export const CategoryColors: Record<string, string> = {
  invoice: '#3B82F6',
  receipt: '#10B981',
  statement: '#8B5CF6',
  contract: '#F59E0B',
  tax: '#EF4444',
  insurance: '#06B6D4',
  medical: '#EC4899',
  other: '#6B7280',
};

export const CategoryLabels: Record<string, string> = {
  invoice: 'Factura',
  receipt: 'Recibo',
  statement: 'Estado de Cuenta',
  contract: 'Contrato',
  tax: 'Impuesto',
  insurance: 'Seguro',
  medical: 'Médico',
  other: 'Otro',
};

export const CategoryIcons: Record<string, string> = {
  invoice: 'receipt',
  receipt: 'shopping-bag',
  statement: 'bank',
  contract: 'file-sign',
  tax: 'calculator',
  insurance: 'shield',
  medical: 'heart-pulse',
  other: 'file-document-outline',
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 48,
  huge: 64,
};

export const BorderRadius = {
  input: 8,
  card: 12,
  sheet: 16,
  pill: 24,
  full: 9999,
};

export const Typography = {
  headingXL: { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.5 },
  headingL: { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.3 },
  headingM: { fontSize: 18, fontWeight: '600' as const },
  bodyL: { fontSize: 16, fontWeight: '400' as const, lineHeight: 24 },
  bodyM: { fontSize: 14, fontWeight: '400' as const, lineHeight: 20 },
  caption: { fontSize: 12, fontWeight: '400' as const },
  mono: { fontSize: 13, fontFamily: 'monospace' as const },
};

export const Shadows = {
  subtle: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  medium: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 4,
  },
  large: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 15,
    elevation: 8,
  },
};
