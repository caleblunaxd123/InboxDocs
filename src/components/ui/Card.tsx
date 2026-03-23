import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Colors, BorderRadius, Shadows, Spacing } from '../../utils/theme';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  padding?: number;
}

export const Card: React.FC<CardProps> = ({ children, style, padding = Spacing.base }) => (
  <View style={[styles.card, { padding }, style]}>
    {children}
  </View>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.card,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.subtle,
  },
});
