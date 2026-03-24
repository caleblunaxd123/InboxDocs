import React, { useRef, useEffect } from 'react';
import { TouchableOpacity, Text, StyleSheet, ScrollView, Animated } from 'react-native';
import { Colors, BorderRadius, Spacing, Typography } from '../../utils/theme';

interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

export const FilterChip: React.FC<ChipProps> = ({ label, selected, onPress }) => {
  const anim = useRef(new Animated.Value(selected ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: selected ? 1 : 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [selected]);

  const bgColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [Colors.border, Colors.primary],
  });

  const textColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [Colors.textPrimary, '#FFFFFF'],
  });

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75}>
      <Animated.View style={[styles.chip, { backgroundColor: bgColor }]}>
        <Animated.Text style={[styles.label, { color: textColor }]}>{label}</Animated.Text>
      </Animated.View>
    </TouchableOpacity>
  );
};

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
  },
  label: {
    ...Typography.bodyM,
    fontWeight: '500',
  },
});
