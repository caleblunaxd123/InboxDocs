import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Dimensions,
  ScrollView,
  Platform,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Typography, Spacing, BorderRadius } from '../utils/theme';
import { setSetting } from '../database/settings';
import { useAppStore } from '../store/useAppStore';

const { width, height } = Dimensions.get('window');

// ─── Slide data ────────────────────────────────────────────────────────────────

interface SlideFeature {
  icon: string;
  color: string;
  label: string;
}

interface Slide {
  id: string;
  gradient: string[];
  mainIcon: string;
  mainIconColor: string;
  title: string;
  body: string;
  features: SlideFeature[] | null;
  accentElements: { icon: string; color: string; size: number; top: number; left?: number; right?: number }[];
}

const SLIDES: Slide[] = [
  {
    id: 'welcome',
    gradient: ['#0F2460', '#1E40AF', '#3B82F6'],
    mainIcon: 'inbox-arrow-down',
    mainIconColor: '#FDE68A',
    title: 'Bienvenido a\nInboxDocs',
    body: 'Deja de perder tiempo buscando documentos en tu correo.\nNosotros los encuentran y organizan por ti, automáticamente.',
    features: null,
    accentElements: [
      { icon: 'file-pdf-box', color: 'rgba(239,68,68,0.6)', size: 28, top: 0.12, right: 0.08 },
      { icon: 'file-word-box', color: 'rgba(37,99,235,0.5)', size: 22, top: 0.28, left: 0.06 },
      { icon: 'file-excel-box', color: 'rgba(22,163,74,0.5)', size: 24, top: 0.62, right: 0.05 },
      { icon: 'star-four-points', color: 'rgba(253,230,138,0.8)', size: 16, top: 0.18, left: 0.14 },
    ],
  },
  {
    id: 'connect',
    gradient: ['#064E3B', '#065F46', '#10B981'],
    mainIcon: 'email-fast-outline',
    mainIconColor: '#A7F3D0',
    title: 'Conecta tu correo\nen segundos',
    body: 'Vincula Gmail u Outlook con un solo toque.\nSolo leemos los adjuntos, tus datos quedan en tu dispositivo.',
    features: [
      { icon: 'gmail', color: '#EA4335', label: 'Gmail' },
      { icon: 'microsoft-outlook', color: '#0078D4', label: 'Outlook' },
    ],
    accentElements: [
      { icon: 'lock-outline', color: 'rgba(167,243,208,0.6)', size: 20, top: 0.1, right: 0.1 },
      { icon: 'shield-check-outline', color: 'rgba(167,243,208,0.5)', size: 24, top: 0.65, left: 0.07 },
    ],
  },
  {
    id: 'organize',
    gradient: ['#2E1065', '#5B21B6', '#7C3AED'],
    mainIcon: 'robot-happy-outline',
    mainIconColor: '#DDD6FE',
    title: 'IA que organiza\ntodo sin esfuerzo',
    body: 'Cada documento se clasifica automáticamente al llegar.\nNunca más tendrás que organizar nada manualmente.',
    features: [
      { icon: 'receipt', color: '#60A5FA', label: 'Facturas' },
      { icon: 'cash-multiple', color: '#34D399', label: 'Recibos' },
      { icon: 'file-sign', color: '#FCD34D', label: 'Contratos' },
      { icon: 'shield-check', color: '#67E8F9', label: 'Seguros' },
      { icon: 'calculator-variant', color: '#F87171', label: 'Impuestos' },
      { icon: 'heart-pulse', color: '#F9A8D4', label: 'Médico' },
    ],
    accentElements: [
      { icon: 'star-four-points', color: 'rgba(221,214,254,0.7)', size: 14, top: 0.08, left: 0.08 },
      { icon: 'star-four-points', color: 'rgba(221,214,254,0.5)', size: 10, top: 0.7, right: 0.1 },
    ],
  },
  {
    id: 'ready',
    gradient: ['#451A03', '#92400E', '#D97706'],
    mainIcon: 'rocket-launch-outline',
    mainIconColor: '#FEF3C7',
    title: 'Todo siempre\na la mano',
    body: 'Busca, filtra, comparte y analiza tus documentos al instante.\nTu archivo personal, siempre organizado.',
    features: [
      { icon: 'magnify', color: '#FEF3C7', label: 'Búsqueda inteligente' },
      { icon: 'chart-pie', color: '#FEF3C7', label: 'Estadísticas' },
      { icon: 'share-variant-outline', color: '#FEF3C7', label: 'Compartir fácil' },
      { icon: 'fingerprint', color: '#FEF3C7', label: 'Seguridad biométrica' },
    ],
    accentElements: [
      { icon: 'lightning-bolt', color: 'rgba(254,243,199,0.6)', size: 22, top: 0.1, right: 0.08 },
      { icon: 'check-decagram', color: 'rgba(254,243,199,0.5)', size: 18, top: 0.65, left: 0.06 },
    ],
  },
];

// ─── Main Component ────────────────────────────────────────────────────────────

export default function WalkthroughScreen() {
  const navigation = useNavigation<any>();
  const { setHasSeenWalkthrough } = useAppStore();
  const scrollRef = useRef<ScrollView>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollX = useRef(new Animated.Value(0)).current;

  const goNext = useCallback(async () => {
    if (activeIndex < SLIDES.length - 1) {
      const nextIndex = activeIndex + 1;
      scrollRef.current?.scrollTo({ x: nextIndex * width, animated: true });
      setActiveIndex(nextIndex);
    } else {
      await finish();
    }
  }, [activeIndex]);

  const handleSkip = useCallback(async () => {
    await finish();
  }, []);

  const finish = async () => {
    await setSetting('has_seen_walkthrough', 'true');
    setHasSeenWalkthrough(true);
    navigation.replace('Onboarding');
  };

  const handleScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
    {
      useNativeDriver: false,
      listener: (e: any) => {
        const idx = Math.round(e.nativeEvent.contentOffset.x / width);
        if (idx !== activeIndex) setActiveIndex(idx);
      },
    }
  );

  const isLast = activeIndex === SLIDES.length - 1;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      {/* Horizontal paged slides */}
      <Animated.ScrollView
        ref={scrollRef as any}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        decelerationRate="fast"
        bounces={false}
        style={StyleSheet.absoluteFill}
      >
        {SLIDES.map((slide, index) => (
          <SlideView
            key={slide.id}
            slide={slide}
            index={index}
            scrollX={scrollX}
          />
        ))}
      </Animated.ScrollView>

      {/* Skip button */}
      {!isLast && (
        <SafeAreaView style={styles.skipSafe} edges={['top']}>
          <TouchableOpacity onPress={handleSkip} style={styles.skipBtn} activeOpacity={0.7} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={styles.skipText}>Omitir</Text>
            <MaterialCommunityIcons name="chevron-right" size={16} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>
        </SafeAreaView>
      )}

      {/* Bottom controls */}
      <SafeAreaView style={styles.bottomSafe} edges={['bottom']}>
        <View style={styles.bottomContent}>
          {/* Dot indicators */}
          <View style={styles.dotsRow}>
            {SLIDES.map((_, i) => {
              const inputRange = [(i - 1) * width, i * width, (i + 1) * width];
              const dotW = scrollX.interpolate({
                inputRange,
                outputRange: [8, 24, 8],
                extrapolate: 'clamp',
              });
              const dotOp = scrollX.interpolate({
                inputRange,
                outputRange: [0.35, 1, 0.35],
                extrapolate: 'clamp',
              });
              return (
                <Animated.View
                  key={i}
                  style={[styles.dot, { width: dotW, opacity: dotOp }]}
                />
              );
            })}
          </View>

          {/* Next / Comenzar */}
          <TouchableOpacity
            style={[styles.nextBtn, isLast && styles.nextBtnLast]}
            onPress={goNext}
            activeOpacity={0.85}
          >
            {isLast ? (
              <>
                <MaterialCommunityIcons name="rocket-launch-outline" size={20} color="#92400E" />
                <Text style={[styles.nextBtnText, styles.nextBtnTextLast]}>Comenzar ahora</Text>
              </>
            ) : (
              <>
                <Text style={styles.nextBtnText}>Siguiente</Text>
                <MaterialCommunityIcons name="arrow-right" size={20} color="#fff" />
              </>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

// ─── Slide View ────────────────────────────────────────────────────────────────

function SlideView({
  slide,
  index,
  scrollX,
}: {
  slide: Slide;
  index: number;
  scrollX: Animated.Value;
}) {
  // Parallax for the content
  const inputRange = [(index - 1) * width, index * width, (index + 1) * width];

  const contentTranslate = scrollX.interpolate({
    inputRange,
    outputRange: [width * 0.2, 0, -width * 0.2],
    extrapolate: 'clamp',
  });
  const contentOpacity = scrollX.interpolate({
    inputRange,
    outputRange: [0, 1, 0],
    extrapolate: 'clamp',
  });

  // Icon bounce entrance
  const iconScale = scrollX.interpolate({
    inputRange,
    outputRange: [0.7, 1, 0.7],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.slide}>
      <LinearGradient
        colors={slide.gradient as any}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Floating accent elements */}
      {slide.accentElements.map((el, i) => (
        <View
          key={i}
          style={[
            styles.accentEl,
            {
              top: height * el.top,
              ...(el.left !== undefined ? { left: width * el.left } : {}),
              ...(el.right !== undefined ? { right: width * el.right } : {}),
            },
          ]}
        >
          <MaterialCommunityIcons name={el.icon as any} size={el.size} color={el.color} />
        </View>
      ))}

      {/* Decorative circles */}
      <View style={[styles.decoCircle, styles.decoCircle1]} />
      <View style={[styles.decoCircle, styles.decoCircle2]} />

      <SafeAreaView style={styles.slideInner} edges={['top']}>
        <Animated.View
          style={[
            styles.slideContent,
            {
              opacity: contentOpacity,
              transform: [{ translateX: contentTranslate }],
            },
          ]}
        >
          {/* Main icon */}
          <Animated.View style={[styles.iconWrap, { transform: [{ scale: iconScale }] }]}>
            <View style={styles.iconCircleOuter}>
              <View style={styles.iconCircleInner}>
                <MaterialCommunityIcons
                  name={slide.mainIcon as any}
                  size={64}
                  color={slide.mainIconColor}
                />
              </View>
            </View>
          </Animated.View>

          {/* Feature pills / chips */}
          {slide.features && (
            <View style={styles.featuresWrap}>
              {slide.id === 'connect' ? (
                /* Email providers — two large pills */
                <View style={styles.connectRow}>
                  {slide.features.map((f) => (
                    <View key={f.label} style={styles.providerPill}>
                      <MaterialCommunityIcons name={f.icon as any} size={28} color={f.color} />
                      <Text style={styles.providerLabel}>{f.label}</Text>
                    </View>
                  ))}
                </View>
              ) : slide.id === 'ready' ? (
                /* Ready features — 2×2 grid */
                <View style={styles.readyGrid}>
                  {slide.features.map((f) => (
                    <View key={f.label} style={styles.readyChip}>
                      <MaterialCommunityIcons name={f.icon as any} size={18} color={f.color} />
                      <Text style={styles.readyChipLabel}>{f.label}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                /* Category grid */
                <View style={styles.categoryGrid}>
                  {slide.features.map((f) => (
                    <View key={f.label} style={[styles.categoryChip, { borderColor: f.color + '55' }]}>
                      <MaterialCommunityIcons name={f.icon as any} size={20} color={f.color} />
                      <Text style={styles.categoryLabel}>{f.label}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* Text */}
          <View style={styles.textBlock}>
            <Text style={styles.slideTitle}>{slide.title}</Text>
            <Text style={styles.slideBody}>{slide.body}</Text>
          </View>
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0F2460',
  },
  slide: {
    width,
    flex: 1,
    overflow: 'hidden',
  },
  slideInner: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 180,
  },
  slideContent: {
    paddingHorizontal: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.xl,
  },

  // Decorative
  decoCircle: {
    position: 'absolute',
    borderRadius: 9999,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  decoCircle1: {
    width: 320,
    height: 320,
    top: -80,
    right: -100,
  },
  decoCircle2: {
    width: 220,
    height: 220,
    bottom: 100,
    left: -60,
  },
  accentEl: {
    position: 'absolute',
    zIndex: 0,
  },

  // Main icon
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleOuter: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  iconCircleInner: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Features
  featuresWrap: {
    width: '100%',
    alignItems: 'center',
  },

  // Connect providers
  connectRow: {
    flexDirection: 'row',
    gap: Spacing.base,
    justifyContent: 'center',
  },
  providerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: BorderRadius.pill,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  providerLabel: {
    ...Typography.bodyL,
    color: '#fff',
    fontWeight: '700',
  },

  // Categories grid
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
    paddingVertical: Spacing.xs + 2,
    paddingHorizontal: Spacing.md,
  },
  categoryLabel: {
    ...Typography.bodyM,
    color: '#fff',
    fontWeight: '500',
  },

  // Ready grid
  readyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
  readyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: BorderRadius.pill,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.base,
  },
  readyChipLabel: {
    ...Typography.bodyM,
    color: 'rgba(255,255,255,0.95)',
    fontWeight: '600',
  },

  // Text
  textBlock: {
    width: '100%',
  },
  slideTitle: {
    fontSize: 30,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: Spacing.md,
    lineHeight: 38,
    letterSpacing: -0.5,
  },
  slideBody: {
    ...Typography.bodyL,
    color: 'rgba(255,255,255,0.8)',
    lineHeight: 26,
  },

  // Skip
  skipSafe: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    alignItems: 'flex-end',
    paddingRight: Spacing.xl,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) + 8 : 8,
  },
  skipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(0,0,0,0.2)',
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  skipText: {
    ...Typography.bodyM,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '500',
  },

  // Bottom controls
  bottomSafe: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 20,
  },
  bottomContent: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xl,
    paddingTop: Spacing.base,
    backgroundColor: 'rgba(0,0,0,0.25)',
    gap: Spacing.base,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  dot: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    borderRadius: BorderRadius.input,
    paddingVertical: Spacing.base,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  nextBtnLast: {
    backgroundColor: '#FFFFFF',
    borderColor: 'transparent',
  },
  nextBtnText: {
    ...Typography.bodyL,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  nextBtnTextLast: {
    color: '#92400E',
  },
});
