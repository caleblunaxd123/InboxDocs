import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ScrollView, View } from 'react-native';
import { Colors, BorderRadius, Spacing, Typography } from '../../utils/theme';

interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

export const FilterChip: React.FC<ChipProps> = ({ label, selected, onPress }) => (
  <TouchableOpacity
    style={[styles.chip, selected && styles.chipSelected]}
    onPress={onPress}
    activeOpacity={0.75}
  >
    <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
  </TouchableOpacity>
);

interface FilterChipRowProps {
  chips: { key: string; label: string }[];
  selected: string;
  onSelect: (key: string) => void;
}

export const FilterChipRow: React.FC<FilterChipRowProps> = ({ chips, selected, onSelect }) => (
  <ScrollView
    horizontal
    showsHorizontalScrollIndicator={false}
    contentContainerStyle={styles.row}
  >
    {chips.map((chip) => (
      <FilterChip
        key={chip.key}
        label={chip.label}
        selected={selected === chip.key}
        onPress={() => onSelect(chip.key)}
      />
    ))}
  </ScrollView>
);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.base,
  },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.border,
  },
  chipSelected: {
    backgroundColor: Colors.primary,
  },
  label: {
    ...Typography.bodyM,
    fontWeight: '500',
    color: Colors.textPrimary,
  },
  labelSelected: {
    color: '#FFFFFF',
  },
});
