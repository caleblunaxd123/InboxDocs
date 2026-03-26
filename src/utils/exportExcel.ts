import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Document } from '../types';
import { CategoryLabels } from './theme';
import { formatBytes } from './format';

/**
 * Exporta un Excel multi-hoja con datos profesionales:
 * 1. Documentos: listado completo
 * 2. Remitentes: agrupado por sender con conteo y tamaño
 * 3. Categorías: resumen por categoría
 * 4. Tipos de archivo: resumen por extensión
 * 5. Resumen mensual: documentos por mes
 */
export async function exportDocumentsExcel(
  documents: Document[],
  filename = 'InboxDocs_Reporte'
): Promise<void> {
  const wb = XLSX.utils.book_new();

  // ─── Hoja 1: Documentos ────────────────────────────────────────────
  const docsData = documents.map((d) => ({
    'Archivo': d.originalFilename,
    'Categoría': CategoryLabels[d.category] ?? d.category,
    'Remitente': d.senderName ?? '',
    'Email': d.senderEmail ?? '',
    'Asunto': d.subject ?? '',
    'Fecha email': format(d.emailDate, 'dd/MM/yyyy', { locale: es }),
    'Tamaño': formatBytes(d.fileSize),
    'Bytes': d.fileSize,
    'Tipo': d.fileExtension.toUpperCase(),
    'Destacado': d.isStarred ? 'Sí' : 'No',
    'Descargado': format(d.downloadedAt, 'dd/MM/yyyy', { locale: es }),
    'Notas': d.notes ?? '',
  }));
  const wsDocuments = XLSX.utils.json_to_sheet(docsData);
  // Anchos de columna
  wsDocuments['!cols'] = [
    { wch: 35 }, { wch: 14 }, { wch: 25 }, { wch: 30 },
    { wch: 40 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
    { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 30 },
  ];
  XLSX.utils.book_append_sheet(wb, wsDocuments, 'Documentos');

  // ─── Hoja 2: Remitentes ────────────────────────────────────────────
  const senderMap = new Map<string, { name: string; count: number; totalSize: number; categories: Set<string> }>();
  for (const d of documents) {
    const email = d.senderEmail ?? 'desconocido';
    const existing = senderMap.get(email);
    if (existing) {
      existing.count++;
      existing.totalSize += d.fileSize;
      existing.categories.add(CategoryLabels[d.category] ?? d.category);
    } else {
      senderMap.set(email, {
        name: d.senderName ?? email,
        count: 1,
        totalSize: d.fileSize,
        categories: new Set([CategoryLabels[d.category] ?? d.category]),
      });
    }
  }
  const sendersData = [...senderMap.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .map(([email, s]) => ({
      'Remitente': s.name,
      'Email': email,
      'Documentos': s.count,
      'Tamaño total': formatBytes(s.totalSize),
      'Categorías': [...s.categories].join(', '),
    }));
  const wsSenders = XLSX.utils.json_to_sheet(sendersData);
  wsSenders['!cols'] = [{ wch: 25 }, { wch: 30 }, { wch: 12 }, { wch: 14 }, { wch: 35 }];
  XLSX.utils.book_append_sheet(wb, wsSenders, 'Remitentes');

  // ─── Hoja 3: Categorías ────────────────────────────────────────────
  const catMap = new Map<string, { count: number; totalSize: number }>();
  for (const d of documents) {
    const label = CategoryLabels[d.category] ?? d.category;
    const existing = catMap.get(label);
    if (existing) {
      existing.count++;
      existing.totalSize += d.fileSize;
    } else {
      catMap.set(label, { count: 1, totalSize: d.fileSize });
    }
  }
  const totalDocs = documents.length;
  const catsData = [...catMap.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .map(([cat, s]) => ({
      'Categoría': cat,
      'Documentos': s.count,
      'Porcentaje': `${Math.round((s.count / totalDocs) * 100)}%`,
      'Tamaño total': formatBytes(s.totalSize),
    }));
  const wsCats = XLSX.utils.json_to_sheet(catsData);
  wsCats['!cols'] = [{ wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsCats, 'Categorías');

  // ─── Hoja 4: Tipos de archivo ──────────────────────────────────────
  const typeMap = new Map<string, { count: number; totalSize: number }>();
  for (const d of documents) {
    const ext = d.fileExtension.toUpperCase();
    const existing = typeMap.get(ext);
    if (existing) {
      existing.count++;
      existing.totalSize += d.fileSize;
    } else {
      typeMap.set(ext, { count: 1, totalSize: d.fileSize });
    }
  }
  const typesData = [...typeMap.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .map(([ext, s]) => ({
      'Tipo': ext,
      'Documentos': s.count,
      'Porcentaje': `${Math.round((s.count / totalDocs) * 100)}%`,
      'Tamaño total': formatBytes(s.totalSize),
    }));
  const wsTypes = XLSX.utils.json_to_sheet(typesData);
  wsTypes['!cols'] = [{ wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsTypes, 'Tipos de archivo');

  // ─── Hoja 5: Resumen mensual ───────────────────────────────────────
  const monthMap = new Map<string, { count: number; totalSize: number }>();
  for (const d of documents) {
    const month = format(d.emailDate, 'yyyy-MM');
    const existing = monthMap.get(month);
    if (existing) {
      existing.count++;
      existing.totalSize += d.fileSize;
    } else {
      monthMap.set(month, { count: 1, totalSize: d.fileSize });
    }
  }
  const monthsData = [...monthMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, s]) => {
      const [y, m] = month.split('-');
      const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
      return {
        'Mes': `${monthNames[parseInt(m) - 1]} ${y}`,
        'Documentos': s.count,
        'Tamaño total': formatBytes(s.totalSize),
      };
    });
  const wsMonths = XLSX.utils.json_to_sheet(monthsData);
  wsMonths['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsMonths, 'Mensual');

  // ─── Generar y compartir ───────────────────────────────────────────
  const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  const xlsxPath = `${FileSystem.cacheDirectory}${filename}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`;

  await FileSystem.writeAsStringAsync(xlsxPath, wbout, {
    encoding: FileSystem.EncodingType.Base64,
  });

  await Sharing.shareAsync(xlsxPath, {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    dialogTitle: 'Exportar reporte InboxDocs',
  });
}
