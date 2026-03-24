import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  ActivityIndicator,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Image } from 'expo-image';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as IntentLauncher from 'expo-intent-launcher';
import { Colors, Spacing, Typography, BorderRadius, Shadows } from '../utils/theme';
import { useTheme } from '../utils/useTheme';
import { getFileTypeUI } from '../utils/fileTypes';

type ViewerParams = {
  filePath: string;
  filename: string;
  mimeType: string;
  fileExtension: string;
};

export default function DocumentViewerScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { filePath, filename, mimeType, fileExtension } = route.params as ViewerParams;
  const theme = useTheme();

  const [webLoading, setWebLoading] = useState(true);
  const [webError, setWebError] = useState(false);
  const [base64Data, setBase64Data] = useState<string | null>(null);
  const [dataReady, setDataReady] = useState(false);
  const [fileExists, setFileExists] = useState<boolean | null>(null);

  const isPdf = fileExtension === 'pdf';
  const isImage = ['jpg', 'jpeg', 'png', 'heic', 'webp'].includes(fileExtension);
  const isViewable = isPdf || isImage;
  const ui = getFileTypeUI(fileExtension);

  useEffect(() => {
    async function prepare() {
      try {
        const info = await FileSystem.getInfoAsync(filePath);
        if (!info.exists) {
          setFileExists(false);
          return;
        }
        setFileExists(true);

        // Read PDF as base64 on BOTH platforms (avoids iOS onLoadEnd bug with file:// URIs)
        if (isPdf) {
          const data = await FileSystem.readAsStringAsync(filePath, {
            encoding: FileSystem.EncodingType.Base64,
          });
          setBase64Data(data);
        }
        setDataReady(true);
      } catch {
        setFileExists(false);
      }
    }
    prepare();
  }, [filePath, isPdf]);

  const pdfJsHtml = useMemo(() => {
    if (!base64Data) return '';
    return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=yes">
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #1e1e2e; padding: 8px; }
canvas { display: block; margin: 0 auto 10px auto; border-radius: 6px; box-shadow: 0 2px 12px rgba(0,0,0,0.4); width: 100% !important; height: auto !important; }
#loading { color: #94a3b8; text-align: center; padding: 60px 20px; font-family: -apple-system, sans-serif; font-size: 15px; }
#error { color: #ef4444; text-align: center; padding: 60px 20px; font-family: -apple-system, sans-serif; font-size: 14px; }
#pageCount { color: #64748b; text-align: center; font-family: -apple-system, sans-serif; font-size: 12px; margin-bottom: 8px; }
</style>
</head>
<body>
<div id="loading">⏳ Cargando PDF...</div>
<div id="error" style="display:none"></div>
<div id="container"></div>
<script>
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const b64 = '${base64Data}';
const binary = atob(b64);
const bytes = new Uint8Array(binary.length);
for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
pdfjsLib.getDocument({ data: bytes }).promise.then(function(pdf) {
  document.getElementById('loading').style.display = 'none';
  const container = document.getElementById('container');
  const pageCount = document.createElement('div');
  pageCount.id = 'pageCount';
  pageCount.textContent = pdf.numPages + ' página' + (pdf.numPages !== 1 ? 's' : '');
  container.before(pageCount);
  const promises = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const p = i;
    promises.push(pdf.getPage(p).then(function(page) {
      const vp = page.getViewport({ scale: window.devicePixelRatio * 1.8 });
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = vp.width;
      canvas.height = vp.height;
      return page.render({ canvasContext: ctx, viewport: vp }).promise.then(function() {
        return { page: p, canvas };
      });
    }));
  }
  Promise.all(promises).then(function(results) {
    results.sort((a, b) => a.page - b.page);
    results.forEach(function(r) { container.appendChild(r.canvas); });
  });
}).catch(function(err) {
  document.getElementById('loading').style.display = 'none';
  const errDiv = document.getElementById('error');
  errDiv.style.display = 'block';
  errDiv.textContent = 'Error al renderizar: ' + err.message;
});
</script>
</body>
</html>`;
  }, [base64Data]);

  const handleOpenExternal = useCallback(async () => {
    try {
      if (Platform.OS === 'android') {
        const contentUri = await FileSystem.getContentUriAsync(filePath);
        await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
          data: contentUri,
          flags: 1,
          type: mimeType || 'application/octet-stream',
        });
      } else {
        await Sharing.shareAsync(filePath, { mimeType: mimeType || 'application/octet-stream' });
      }
    } catch {
      await Sharing.shareAsync(filePath, { mimeType: mimeType || 'application/octet-stream' }).catch(() => {});
    }
  }, [filePath, mimeType]);

  const renderContent = () => {
    // Still checking file existence
    if (fileExists === null) {
      return (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.statusText, { color: theme.textMuted }]}>Verificando archivo...</Text>
        </View>
      );
    }

    // File not on device
    if (!fileExists) {
      return (
        <View style={styles.centerContainer}>
          <MaterialCommunityIcons name="file-alert-outline" size={72} color={theme.textMuted} />
          <Text style={[styles.errorTitle, { color: theme.textPrimary }]}>Archivo no disponible</Text>
          <Text style={[styles.errorSub, { color: theme.textMuted }]}>
            El archivo no está en este dispositivo. Sincroniza de nuevo para descargarlo.
          </Text>
        </View>
      );
    }

    // Loading base64 data (for PDFs)
    if (!dataReady) {
      return (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.statusText, { color: theme.textMuted }]}>Preparando documento...</Text>
        </View>
      );
    }

    // ─── IMAGES: use expo-image directly (handles file:// on both platforms) ───
    if (isImage) {
      return (
        <View style={{ flex: 1, backgroundColor: '#111' }}>
          <Image
            source={{ uri: filePath }}
            style={{ flex: 1 }}
            contentFit="contain"
          />
        </View>
      );
    }

    // ─── PDFs: PDF.js via base64 (works on iOS + Android, avoids onLoadEnd bug) ───
    if (isPdf && base64Data) {
      return (
        <View style={{ flex: 1 }}>
          {webLoading && (
            <View style={[styles.webLoadingOverlay, { backgroundColor: theme.background }]}>
              <ActivityIndicator size="large" color={theme.primary} />
              <Text style={[styles.statusText, { color: theme.textMuted }]}>
                Renderizando PDF...{'\n'}
                <Text style={{ fontSize: 12, color: theme.textMuted }}>Requiere conexión a internet</Text>
              </Text>
            </View>
          )}
          <WebView
            source={{ html: pdfJsHtml }}
            style={{ flex: 1 }}
            onLoadEnd={() => setWebLoading(false)}
            onError={() => { setWebLoading(false); setWebError(true); }}
            originWhitelist={['*']}
            allowFileAccess
            javaScriptEnabled
            mixedContentMode="always"
            scrollEnabled
          />
          {webError && (
            <View style={[styles.errorOverlay, { backgroundColor: theme.surface }]}>
              <MaterialCommunityIcons name="alert-circle-outline" size={28} color={Colors.danger} />
              <Text style={[styles.errorTitle, { color: theme.textPrimary }]}>Error al mostrar</Text>
              <TouchableOpacity style={[styles.externalBtn, { backgroundColor: theme.primarySubtle }]} onPress={handleOpenExternal}>
                <Text style={[styles.externalBtnText, { color: theme.primary }]}>Abrir con otra app</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      );
    }

    // ─── Word, Excel, PPT, etc. — can't render natively ───
    const label =
      fileExtension === 'docx' ? 'documento Word' :
      fileExtension === 'xlsx' ? 'hoja de cálculo Excel' :
      fileExtension === 'pptx' ? 'presentación PowerPoint' :
      `archivo ${fileExtension.toUpperCase()}`;

    return (
      <View style={styles.centerContainer}>
        <View style={[styles.fileIconBox, { backgroundColor: ui.bgColor }]}>
          <MaterialCommunityIcons name={ui.icon as any} size={56} color={ui.color} />
          <Text style={[styles.fileExtText, { color: ui.color }]}>{fileExtension.toUpperCase()}</Text>
        </View>
        <Text style={[styles.errorTitle, { color: theme.textPrimary }]}>Vista previa no disponible</Text>
        <Text style={[styles.errorSub, { color: theme.textMuted }]}>
          Los {label}s no pueden previsualizarse aquí. Ábrelo con una app compatible instalada en tu dispositivo.
        </Text>
        <TouchableOpacity style={[styles.externalBtn, { backgroundColor: theme.primarySubtle }]} onPress={handleOpenExternal} activeOpacity={0.8}>
          <MaterialCommunityIcons name="open-in-app" size={18} color={theme.primary} />
          <Text style={[styles.externalBtnText, { color: theme.primary }]}>Abrir con otra app</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={theme.surface} />
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border, backgroundColor: theme.surface }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <Ionicons name="close" size={24} color={theme.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: theme.textPrimary }]} numberOfLines={1}>{filename}</Text>
          <Text style={[styles.headerSub, { color: theme.textMuted }]}>{fileExtension.toUpperCase()} · {isViewable ? 'Vista previa' : 'No previsualizable'}</Text>
        </View>
        <TouchableOpacity onPress={handleOpenExternal} style={styles.headerBtn}>
          <MaterialCommunityIcons name="share-variant-outline" size={22} color={theme.primary} />
        </TouchableOpacity>
      </View>

      {renderContent()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
    gap: Spacing.sm,
  },
  headerBtn: { padding: Spacing.sm, minWidth: 40, alignItems: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: {
    ...Typography.bodyM,
    fontWeight: '600',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  headerSub: {
    ...Typography.caption,
    color: Colors.textMuted,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xxl,
    gap: Spacing.md,
  },
  statusText: {
    ...Typography.bodyM,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  errorTitle: {
    ...Typography.headingS,
    color: Colors.textPrimary,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  errorSub: {
    ...Typography.bodyM,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  webLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    gap: Spacing.sm,
  },
  fileIconBox: {
    width: 100,
    height: 120,
    borderRadius: BorderRadius.card,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    ...Shadows.subtle,
  },
  fileExtText: { fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  externalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primarySubtle,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.input,
    marginTop: Spacing.sm,
  },
  externalBtnText: { ...Typography.bodyM, color: Colors.primary, fontWeight: '600' },
  errorOverlay: {
    position: 'absolute',
    bottom: 32,
    left: 20,
    right: 20,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.card,
    padding: Spacing.base,
    alignItems: 'center',
    gap: Spacing.sm,
    ...Shadows.large,
  },
});
