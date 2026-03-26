import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { BorderRadius, Shadows, Spacing } from '../../utils/theme';
import { useTheme } from '../../utils/useTheme';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  padding?: number;
}

export const Card: React.FC<CardProps> = ({ children, style, padding = Spacing.base }) => {
  const theme = useTheme();
  return (
    <View style={[styles.card, { padding, backgroundColor: theme.surface, borderColor: theme.border }, style]}>
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.card,
    borderWidth: 1,
    ...Shadows.subtle,
  },
});
