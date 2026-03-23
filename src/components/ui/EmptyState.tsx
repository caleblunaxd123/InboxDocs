import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, Typography } from '../../utils/theme';
import { Button } from './Button';

interface EmptyStateProps {
  icon: string;
  title: string;
  subtitle: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  subtitle,
  actionLabel,
  onAction,
}) => (
  <View style={styles.container}>
    <View style={styles.iconContainer}>
      <MaterialCommunityIcons name={icon as any} size={48} color={Colors.textMuted} />
    </View>
    <Text style={styles.title}>{title}</Text>
    <Text style={styles.subtitle}>{subtitle}</Text>
    {actionLabel && onAction && (
      <Button label={actionLabel} onPress={onAction} style={styles.button} />
    )}
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xxl,
    paddingVertical: Spacing.xxxl,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.base,
  },
  title: {
    ...Typography.headingM,
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  subtitle: {
    ...Typography.bodyM,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  button: {
    marginTop: Spacing.xl,
    paddingHorizontal: Spacing.xl,
  },
});
