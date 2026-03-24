import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  Modal,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, Typography, BorderRadius, Shadows } from '../../utils/theme';

interface Props {
  visible: boolean;
  progress: string;
  emailsScanned: number;
  documentsFound: number;
}

export const SyncProgressOverlay: React.FC<Props> = ({
  visible,
  progress,
  emailsScanned,
  documentsFound,
}) => {
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const dotsAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      // Spinning icon
      Animated.loop(
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 1200,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ).start();

      // Pulse effect
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.08,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      ).start();

      // Dots animation
      Animated.loop(
        Animated.timing(dotsAnim, {
          toValue: 3,
          duration: 900,
          easing: Easing.linear,
          useNativeDriver: false,
        })
      ).start();
    } else {
      rotateAnim.stopAnimation();
      pulseAnim.stopAnimation();
      dotsAnim.stopAnimation();
      rotateAnim.setValue(0);
      pulseAnim.setValue(1);
    }
  }, [visible]);

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="fade">
      <View style={styles.overlay}>
        <Animated.View style={[styles.card, { transform: [{ scale: pulseAnim }] }]}>
          {/* Spinning icon */}
          <View style={styles.iconRing}>
            <Animated.View style={{ transform: [{ rotate: spin }] }}>
              <MaterialCommunityIcons name="sync" size={36} color={Colors.primary} />
            </Animated.View>
          </View>

          <Text style={styles.title}>Sincronizando</Text>
          <Text style={styles.progressText} numberOfLines={2}>
            {progress || 'Buscando correos con adjuntos...'}
          </Text>

          {/* Stats */}
          <View style={styles.statsRow}>
            <StatChip icon="email-outline" label="Correos" value={emailsScanned} />
            <StatChip icon="file-outline" label="Encontrados" value={documentsFound} />
          </View>

          <Text style={styles.hint}>Esto puede tomar unos segundos</Text>
        </Animated.View>
      </View>
    </Modal>
  );
};

function StatChip({ icon, label, value }: { icon: string; label: string; value: number }) {
  return (
    <View style={styles.statChip}>
      <MaterialCommunityIcons name={icon as any} size={16} color={Colors.primary} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.sheet,
    padding: Spacing.xxl,
    width: '100%',
    alignItems: 'center',
    gap: Spacing.md,
    ...Shadows.large,
  },
  iconRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.primarySubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  title: {
    ...Typography.headingM,
    color: Colors.textPrimary,
  },
  progressText: {
    ...Typography.bodyM,
    color: Colors.textSecondary,
    textAlign: 'center',
    minHeight: 40,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  statChip: {
    alignItems: 'center',
    backgroundColor: Colors.primarySubtle,
    borderRadius: BorderRadius.card,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    gap: 4,
  },
  statValue: {
    ...Typography.headingM,
    color: Colors.primary,
  },
  statLabel: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  hint: {
    ...Typography.caption,
    color: Colors.textMuted,
    marginTop: Spacing.xs,
  },
});
