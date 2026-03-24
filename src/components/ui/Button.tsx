import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  Animated,
} from 'react-native';
import { Colors, BorderRadius, Spacing, Typography } from '../../utils/theme';

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

type Variant = 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  style,
  textStyle,
  icon,
}) => {
  const isDisabled = disabled || loading;
  const scale = React.useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    if (!isDisabled) {
      Animated.spring(scale, {
        toValue: 0.96,
        useNativeDriver: true,
      }).start();
    }
  };

  const handlePressOut = () => {
    if (!isDisabled) {
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
      }).start();
    }
  };

  return (
    <AnimatedTouchableOpacity
      style={[
        styles.base,
        styles[variant],
        styles[`size_${size}`],
        isDisabled && styles.disabled,
        { transform: [{ scale }] },
        style,
      ]}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={isDisabled}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'outline' || variant === 'ghost' ? Colors.primary : '#fff'}
          size="small"
        />
      ) : (
        <>
          {icon}
          <Text style={[styles.text, styles[`text_${variant}`], styles[`textSize_${size}`], textStyle]}>
            {label}
          </Text>
        </>
      )}
    </AnimatedTouchableOpacity>
  );
};

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    borderRadius: BorderRadius.input,
  },
  primary: {
    backgroundColor: Colors.primary,
  },
  secondary: {
    backgroundColor: Colors.primarySubtle,
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  danger: {
    backgroundColor: Colors.danger,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  disabled: {
    opacity: 0.5,
  },
  size_sm: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm - 2,
  },
  size_md: {
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
  },
  size_lg: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.base,
  },
  text: {
    fontWeight: '600',
  },
  text_primary: { color: '#FFFFFF' },
  text_secondary: { color: Colors.primary },
  text_outline: { color: Colors.primary },
  text_danger: { color: '#FFFFFF' },
  text_ghost: { color: Colors.primary },
  textSize_sm: { ...Typography.bodyM, fontWeight: '600' },
  textSize_md: { ...Typography.bodyL, fontWeight: '600' },
  textSize_lg: { fontSize: 17, fontWeight: '600' },
});
