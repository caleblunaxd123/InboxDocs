import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Animated,
  TouchableOpacity,
  Alert,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Typography, BorderRadius, Shadows } from '../utils/theme';
import { useAppStore } from '../store/useAppStore';
import { signInWithGoogle, signInWithMicrosoft } from '../services/authService';
import { upsertAccount } from '../database/accounts';
import { Account } from '../types';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import { format, subDays } from 'date-fns';

const { width } = Dimensions.get('window');

const VALUE_PROPS = [
  { icon: 'inbox-arrow-down', text: 'Escanea tu correo automáticamente' },
  { icon: 'robot-happy-outline', text: 'IA organiza todo sin esfuerzo' },
  { icon: 'magnify', text: 'Encuentra cualquier documento al instante' },
];

export default function OnboardingScreen() {
  const { addAccount, setInitialized } = useAppStore();
  const [loadingProvider, setLoadingProvider] = useState<'gmail' | 'outlook' | null>(null);

  const fadeAnims = VALUE_PROPS.map(() => useRef(new Animated.Value(0)).current);
  const cardAnim = useRef(new Animated.Value(60)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Stagger value prop rows
    const anims = fadeAnims.map((anim, i) =>
      Animated.timing(anim, {
        toValue: 1,
        duration: 400,
        delay: 300 + i * 150,
        useNativeDriver: true,
      })
    );
    // Card slide up
    const cardSlide = Animated.parallel([
      Animated.timing(cardAnim, {
        toValue: 0,
        duration: 500,
        delay: 800,
        useNativeDriver: true,
      }),
      Animated.timing(cardOpacity, {
        toValue: 1,
        duration: 500,
        delay: 800,
        useNativeDriver: true,
      }),
    ]);

    Animated.parallel([...anims, cardSlide]).start();
  }, []);

  async function handleConnect(provider: 'gmail' | 'outlook') {
    setLoadingProvider(provider);
    try {
      const result =
        provider === 'gmail' ? await signInWithGoogle() : await signInWithMicrosoft();

      const account: Account = {
        id: uuidv4(),
        provider,
        email: result.email,
        displayName: result.displayName,
        avatarUrl: result.avatarUrl,
        accessTokenEncrypted: result.accessToken,
        refreshTokenEncrypted: result.refreshToken,
        tokenExpiresAt: result.expiresAt,
        lastSyncAt: null,
        syncFromDate: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
        isActive: true,
        createdAt: Date.now(),
      };

      await upsertAccount(account);
      addAccount(account);
    } catch (err: any) {
      Alert.alert(
        'Error de conexión',
        err.message ?? 'No se pudo conectar la cuenta. Por favor intenta de nuevo.'
      );
    } finally {
      setLoadingProvider(null);
    }
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#1E40AF', '#3B82F6']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView style={styles.safe}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <MaterialCommunityIcons name="inbox-arrow-down" size={40} color="#fff" />
            <MaterialCommunityIcons
              name="star-four-points"
              size={16}
              color="#FDE68A"
              style={styles.sparkle}
            />
          </View>
          <Text style={styles.appName}>InboxDocs</Text>
          <Text style={styles.tagline}>Tus documentos, finalmente en un solo lugar.</Text>
        </View>

        {/* Value Props */}
        <View style={styles.valueProps}>
          {VALUE_PROPS.map((item, i) => (
            <Animated.View
              key={i}
              style={[styles.valuePropRow, { opacity: fadeAnims[i] }]}
            >
              <View style={styles.valuePropIcon}>
                <MaterialCommunityIcons name={item.icon as any} size={20} color="#fff" />
              </View>
              <Text style={styles.valuePropText}>{item.text}</Text>
            </Animated.View>
          ))}
        </View>

        {/* CTA Card */}
        <Animated.View
          style={[
            styles.card,
            { transform: [{ translateY: cardAnim }], opacity: cardOpacity },
          ]}
        >
          <ConnectButton
            provider="gmail"
            loading={loadingProvider === 'gmail'}
            disabled={loadingProvider !== null}
            onPress={() => handleConnect('gmail')}
          />
          <View style={styles.divider} />
          <ConnectButton
            provider="outlook"
            loading={loadingProvider === 'outlook'}
            disabled={loadingProvider !== null}
            onPress={() => handleConnect('outlook')}
          />
          <Text style={styles.privacyNote}>
            Tus documentos se almacenan únicamente en este dispositivo.
          </Text>
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

function ConnectButton({
  provider,
  loading,
  disabled,
  onPress,
}: {
  provider: 'gmail' | 'outlook';
  loading: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const isGmail = provider === 'gmail';
  return (
    <TouchableOpacity
      style={[styles.connectBtn, disabled && !loading && styles.connectBtnDisabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
    >
      {loading ? (
        <ActivityIndicator color={Colors.primary} size="small" />
      ) : (
        <MaterialCommunityIcons
          name={isGmail ? 'gmail' : 'microsoft-outlook'}
          size={22}
          color={isGmail ? '#EA4335' : '#0078D4'}
        />
      )}
      <Text style={styles.connectBtnText}>
        {loading
          ? 'Conectando...'
          : isGmail
          ? 'Conectar Gmail'
          : 'Conectar Outlook'}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1, justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingTop: Spacing.xxl },
  header: { alignItems: 'center', paddingTop: Spacing.xxxl },
  logoContainer: { position: 'relative', marginBottom: Spacing.base },
  sparkle: { position: 'absolute', top: -4, right: -8 },
  appName: { ...Typography.headingXL, color: '#fff', marginBottom: Spacing.sm },
  tagline: { ...Typography.bodyL, color: 'rgba(255,255,255,0.8)', textAlign: 'center' },
  valueProps: { gap: Spacing.base, paddingHorizontal: Spacing.sm },
  valuePropRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  valuePropIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  valuePropText: { ...Typography.bodyL, color: '#fff', flex: 1 },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.sheet,
    padding: Spacing.xl,
    gap: Spacing.md,
    marginBottom: Spacing.base,
    ...Shadows.large,
  },
  divider: { height: 1, backgroundColor: Colors.border },
  connectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: BorderRadius.input,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.base,
  },
  connectBtnDisabled: { opacity: 0.5 },
  connectBtnText: { ...Typography.bodyL, fontWeight: '600', color: Colors.textPrimary },
  privacyNote: {
    ...Typography.caption,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
});
