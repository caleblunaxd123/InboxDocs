import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import { Colors, Typography, Spacing, BorderRadius } from '../../utils/theme';

interface Props {
  visible: boolean;
  onAuthenticated: () => void;
}

export function BiometricLock({ visible, onAuthenticated }: Props) {
  // useRef instead of useState so the guard is never stale in async callbacks
  const checkingRef = useRef(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [biometricType, setBiometricType] = useState<'face' | 'fingerprint' | 'none'>('none');

  useEffect(() => {
    if (visible) {
      detectBiometricType();
      authenticate();
    }
  }, [visible]);

  async function detectBiometricType() {
    try {
      const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
      if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
        setBiometricType('face');
      } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
        setBiometricType('fingerprint');
      }
    } catch {
      setBiometricType('none');
    }
  }

  const authenticate = useCallback(async () => {
    // Guard against concurrent calls using ref (never stale in async context)
    if (checkingRef.current) return;
    checkingRef.current = true;
    setChecking(true);
    setError(null);

    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled  = await LocalAuthentication.isEnrolledAsync();

      if (!hasHardware || !isEnrolled) {
        onAuthenticated();
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Accede a InboxDocs',
        fallbackLabel: 'Usar contraseña',
        cancelLabel: 'Cancelar',
        disableDeviceFallback: false,
      });

      if (result.success) {
        onAuthenticated();
      } else if (result.error === 'user_cancel') {
        setError('Toca el botón para intentar de nuevo');
      } else if (result.error === 'lockout' || (result.error as string) === 'lockout_permanent') {
        setError('Demasiados intentos. Usa la contraseña del dispositivo.');
      } else {
        setError('No se pudo verificar. Inténtalo de nuevo.');
      }
    } catch (e: any) {
      setError(e?.message ?? 'Error de autenticación');
    } finally {
      checkingRef.current = false;
      setChecking(false);
    }
  }, [onAuthenticated]);

  const icon  = biometricType === 'face' ? 'face-recognition'
              : biometricType === 'fingerprint' ? 'fingerprint'
              : 'lock-outline';
  const label = biometricType === 'face' ? 'Face ID'
              : biometricType === 'fingerprint' ? 'Huella dactilar'
              : 'Biometría';

  return (
    <Modal
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      // Prevent Android back button from dismissing the lock screen
      onRequestClose={() => {}}
    >
      <View style={styles.container}>
        <View style={styles.content}>
          <View style={styles.appIcon}>
            <MaterialCommunityIcons name="inbox-arrow-down" size={32} color="#fff" />
          </View>
          <Text style={styles.appName}>InboxDocs</Text>
          <Text style={styles.subtitle}>Verifica tu identidad para continuar</Text>

          <TouchableOpacity
            style={[styles.biometricBtn, checking && styles.biometricBtnActive]}
            onPress={authenticate}
            activeOpacity={0.75}
          >
            <MaterialCommunityIcons
              name={icon as any}
              size={48}
              color={checking ? '#6366F1' : Colors.primary}
            />
          </TouchableOpacity>

          <Text style={styles.biometricLabel}>
            {checking ? 'Verificando...' : `Toca para usar ${label}`}
          </Text>

          {error && (
            <View style={styles.errorBox}>
              <MaterialCommunityIcons name="alert-circle-outline" size={16} color="#EF4444" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <TouchableOpacity onPress={authenticate} style={styles.retryBtn} disabled={checking}>
            <Text style={styles.retryText}>Intentar de nuevo</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 40,
  },
  appIcon: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  appName: {
    fontSize: 28,
    fontWeight: '800',
    color: '#F8FAFC',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    color: '#94A3B8',
    textAlign: 'center',
    marginBottom: 16,
  },
  biometricBtn: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#1E293B',
    borderWidth: 2,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  biometricBtnActive: {
    borderColor: '#6366F1',
  },
  biometricLabel: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#EF444420',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  errorText: {
    fontSize: 13,
    color: '#EF4444',
    flex: 1,
  },
  retryBtn: {
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  retryText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '600',
  },
});
