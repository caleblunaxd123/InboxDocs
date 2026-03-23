import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CategoryColors, CategoryLabels, CategoryIcons, BorderRadius, Spacing, Typography } from '../../utils/theme';
import { CategoryId } from '../../types';

interface BadgeProps {
  category: CategoryId;
  showIcon?: boolean;
  size?: 'sm' | 'md';
}

export const CategoryBadge: React.FC<BadgeProps> = ({ category, showIcon = true, size = 'md' }) => {
  const color = CategoryColors[category];
  const label = CategoryLabels[category];
  const icon = CategoryIcons[category];

  return (
    <View style={[styles.badge, { backgroundColor: color + '20' }, size === 'sm' && styles.badgeSm]}>
      {showIcon && (
        <MaterialCommunityIcons
          name={icon as any}
          size={size === 'sm' ? 10 : 12}
          color={color}
        />
      )}
      <Text style={[styles.label, { color }, size === 'sm' && styles.labelSm]}>
        {label}
      </Text>
    </View>
  );
};

interface ProviderBadgeProps {
  provider: 'gmail' | 'outlook';
}

export const ProviderBadge: React.FC<ProviderBadgeProps> = ({ provider }) => {
  const isGmail = provider === 'gmail';
  return (
    <View style={[styles.providerBadge, { backgroundColor: isGmail ? '#FEE2E2' : '#DBEAFE' }]}>
      <Text style={[styles.providerLabel, { color: isGmail ? '#DC2626' : '#1D4ED8' }]}>
        {isGmail ? 'Gmail' : 'Outlook'}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.pill,
    alignSelf: 'flex-start',
  },
  badgeSm: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  label: {
    ...Typography.caption,
    fontWeight: '600',
  },
  labelSm: {
    fontSize: 10,
  },
  providerBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.pill,
    alignSelf: 'flex-start',
  },
  providerLabel: {
    ...Typography.caption,
    fontWeight: '700',
  },
});
