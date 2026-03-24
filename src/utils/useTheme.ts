import { useColorScheme } from 'react-native';
import { Colors, DarkColors, ThemeColors } from './theme';
import { useAppStore } from '../store/useAppStore';

export function useTheme(): ThemeColors {
  const systemScheme = useColorScheme();
  const themePreference = useAppStore((s) => s.settings?.theme ?? 'system');
  const isDark =
    themePreference === 'dark' ||
    (themePreference === 'system' && systemScheme === 'dark');
  return isDark ? (DarkColors as ThemeColors) : Colors;
}
