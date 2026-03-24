import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Document } from '../types';
import { CategoryLabels } from './theme';
import { formatBytes } from './format';

function esc(v: string): string {
  return `"${v.replace(/"/g, '""')}"`;
}

export async function exportDocumentsCsv(
  documents: Document[],
  filename = 'documentos_inboxdocs'
): Promise<void> {
  const headers = [
    'Nombre de archivo',
    'Categoría',
    'Remitente',
    'Email remitente',
    'Asunto',
    'Fecha del email',
    'Tamaño',
    'Tipo',
    'Destacado',
    'Descargado',
  ];

  const rows = documents.map((d) =>
    [
      esc(d.originalFilename),
      esc(CategoryLabels[d.category] ?? d.category),
      esc(d.senderName ?? ''),
      esc(d.senderEmail ?? ''),
      esc(d.subject ?? ''),
      esc(format(d.emailDate, 'dd/MM/yyyy', { locale: es })),
      esc(formatBytes(d.fileSize)),
      esc(d.fileExtension.toUpperCase()),
      esc(d.isStarred ? 'Sí' : 'No'),
      esc(format(d.downloadedAt, 'dd/MM/yyyy', { locale: es })),
    ].join(',')
  );

  const csvContent = [headers.join(','), ...rows].join('\n');
  const csvPath = `${FileSystem.cacheDirectory}${filename}_${Date.now()}.csv`;

  await FileSystem.writeAsStringAsync(csvPath, csvContent, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  await Sharing.shareAsync(csvPath, {
    mimeType: 'text/csv',
    dialogTitle: 'Exportar documentos InboxDocs',
    UTI: 'public.comma-separated-values-text',
  });
}
