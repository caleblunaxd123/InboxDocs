import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Colors } from '../../utils/theme';

interface AvatarProps {
  name: string | null;
  url?: string | null;
  size?: number;
  color?: string;
}

export const Avatar: React.FC<AvatarProps> = ({ name, url, size = 40, color = Colors.primary }) => {
  const initial = name ? name.charAt(0).toUpperCase() : '?';

  if (url) {
    return (
      <Image
        source={{ uri: url }}
        contentFit="cover"
        style={{ width: size, height: size, borderRadius: size / 2 }}
      />
    );
  }

  return (
    <View
      style={[
        styles.placeholder,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: color + '20' },
      ]}
    >
      <Text style={[styles.initial, { color, fontSize: size * 0.4 }]}>{initial}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    fontWeight: '700',
  },
});
