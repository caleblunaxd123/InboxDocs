export const Colors = {
  primary: '#2563EB', // Blue 600 (Profesional e Índigo vibrante)
  primaryLight: '#60A5FA',
  primarySubtle: '#EFF6FF',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  surface: '#FFFFFF',
  background: '#F8FAFC', // Fondo gris muy claro para contrastar la tarjeta blanca pura
  border: '#E2E8F0', // Slate 200 - Más suave y limpio
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  // Dark mode
  darkBackground: '#0F172A',
  darkSurface: '#1E293B',
  darkBorder: '#334155',
  darkTextPrimary: '#F1F5F9',
  darkTextSecondary: '#94A3B8',
};

export const DarkColors = {
  primary: '#3B82F6',
  primaryLight: '#60A5FA',
  primarySubtle: '#1E3A5F',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  surface: '#1E293B',
  background: '#0F172A',
  border: '#334155',
  textPrimary: '#F1F5F9',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  darkBackground: '#0F172A',
  darkSurface: '#1E293B',
  darkBorder: '#334155',
  darkTextPrimary: '#F1F5F9',
  darkTextSecondary: '#94A3B8',
};

export type ThemeColors = typeof Colors;

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
  receipt: 'receipt',
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
  input: 10,
  card: 16, // Tarjetas más redondeadas, estilo moderno
  sheet: 24,
  pill: 24,
  full: 9999,
};

export const Typography = {
  headingXL: { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.5 },
  headingL: { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.3 },
  headingM: { fontSize: 18, fontWeight: '600' as const },
  headingS: { fontSize: 13, fontWeight: '600' as const, lineHeight: 18 },
  bodyL: { fontSize: 16, fontWeight: '400' as const, lineHeight: 24 },
  bodyM: { fontSize: 14, fontWeight: '400' as const, lineHeight: 20 },
  bodyS: { fontSize: 12, lineHeight: 18, fontWeight: '400' as const },
  caption: { fontSize: 12, fontWeight: '400' as const },
  caption2: { fontSize: 10, lineHeight: 14, fontWeight: '400' as const },
  mono: { fontSize: 13, fontFamily: 'monospace' as const },
};

export const Shadows = {
  subtle: {
    shadowColor: '#64748B', // Sombra tintada en azul-gris en lugar de negro puro
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  medium: {
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 4,
  },
  card: {
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 4,
  },
  large: {
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 8,
  },
  strong: {
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 8,
  },
};
