import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  Modal,
  TouchableOpacity,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, Typography, BorderRadius, Shadows } from '../../utils/theme';

interface Props {
  visible: boolean;
  progress: string;
  emailsScanned: number;
  documentsFound: number;
  documentsDownloaded?: number;
  onCancel?: () => void;
}

export const SyncProgressOverlay: React.FC<Props> = ({
  visible,
  progress,
  emailsScanned,
  documentsFound,
  documentsDownloaded = 0,
  onCancel,
}) => {
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const cancelPressAnim = useRef(new Animated.Value(1)).current;

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

      // Subtle pulse on the card
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.04,
            duration: 1000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      rotateAnim.stopAnimation();
      pulseAnim.stopAnimation();
      rotateAnim.setValue(0);
      pulseAnim.setValue(1);
    }
  }, [visible]);

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const handleCancelPress = () => {
    // Quick press-in animation feedback
    Animated.sequence([
      Animated.timing(cancelPressAnim, { toValue: 0.94, duration: 80, useNativeDriver: true }),
      Animated.timing(cancelPressAnim, { toValue: 1, duration: 80, useNativeDriver: true }),
    ]).start();
    onCancel?.();
  };

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
            <StatChip icon="email-search-outline" label="Correos" value={emailsScanned} />
            <StatChip icon="file-find-outline" label="Encontrados" value={documentsFound} />
            <StatChip icon="download-outline" label="Descargados" value={documentsDownloaded} color={Colors.success} />
          </View>

          <Text style={styles.hint}>Esto puede tomar unos segundos</Text>

          {/* Cancel button */}
          {onCancel && (
            <Animated.View style={{ transform: [{ scale: cancelPressAnim }], width: '100%' }}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={handleCancelPress}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons name="stop-circle-outline" size={18} color={Colors.danger} />
                <Text style={styles.cancelText}>Cancelar sincronización</Text>
              </TouchableOpacity>
            </Animated.View>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
};

function StatChip({ icon, label, value, color }: { icon: string; label: string; value: number; color?: string }) {
  return (
    <View style={styles.statChip}>
      <MaterialCommunityIcons name={icon as any} size={16} color={color ?? Colors.primary} />
      <Text style={[styles.statValue, color ? { color } : {}]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
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
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  statChip: {
    alignItems: 'center',
    backgroundColor: Colors.primarySubtle,
    borderRadius: BorderRadius.card,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: 2,
    minWidth: 72,
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
  cancelBtn: {
    marginTop: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.pill,
    borderWidth: 1.5,
    borderColor: '#EF444440',
    backgroundColor: '#EF444410',
  },
  cancelText: {
    ...Typography.bodyM,
    color: '#EF4444',
    fontWeight: '600',
  },
});
