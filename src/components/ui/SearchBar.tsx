import React, { useRef } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Text,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, BorderRadius, Spacing, Typography } from '../../utils/theme';

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  onFocus?: () => void;
  onCancel?: () => void;
  focused?: boolean;
  placeholder?: string;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  value,
  onChangeText,
  onFocus,
  onCancel,
  focused,
  placeholder = 'Buscar documentos...',
}) => {
  const inputRef = useRef<TextInput>(null);

  return (
    <View style={styles.container}>
      <View style={[styles.inputContainer, focused && styles.inputFocused]}>
        <Ionicons name="search" size={18} color={Colors.textMuted} />
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          onFocus={onFocus}
          placeholder={placeholder}
          placeholderTextColor={Colors.textMuted}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {value.length > 0 && (
          <TouchableOpacity onPress={() => onChangeText('')}>
            <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>
      {focused && onCancel && (
        <TouchableOpacity onPress={onCancel} style={styles.cancelBtn}>
          <Text style={styles.cancelText}>Cancelar</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  inputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.input,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    gap: Spacing.sm,
  },
  inputFocused: {
    borderColor: Colors.primaryLight,
    borderWidth: 1.5,
  },
  input: {
    flex: 1,
    ...Typography.bodyM,
    color: Colors.textPrimary,
    padding: 0,
  },
  cancelBtn: {
    paddingVertical: Spacing.sm,
  },
  cancelText: {
    ...Typography.bodyM,
    color: Colors.primary,
    fontWeight: '500',
  },
});
