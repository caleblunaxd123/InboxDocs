import { Colors } from './theme';

export interface FileTypeUI {
  icon: string;
  color: string;
  bgColor: string;
}

export function getFileTypeUI(extension: string): FileTypeUI {
  const ext = extension.toLowerCase();
  
  // PDF
  if (['pdf'].includes(ext)) {
    return { icon: 'file-pdf-box', color: '#EF4444', bgColor: '#FEF2F2' }; // Red
  }
  
  // Excel / Spreadsheets
  if (['xls', 'xlsx', 'csv'].includes(ext)) {
    return { icon: 'file-excel-box', color: '#10B981', bgColor: '#ECFDF5' }; // Green
  }
  
  // Word / Text
  if (['doc', 'docx', 'rtf', 'txt'].includes(ext)) {
    return { icon: 'file-word-box', color: '#3B82F6', bgColor: '#EFF6FF' }; // Blue
  }
  
  // PowerPoint
  if (['ppt', 'pptx'].includes(ext)) {
    return { icon: 'file-powerpoint-box', color: '#F97316', bgColor: '#FFF7ED' }; // Orange
  }
  
  // Images
  if (['jpg', 'jpeg', 'png', 'gif', 'heic', 'webp'].includes(ext)) {
    return { icon: 'image-outline', color: '#F59E0B', bgColor: '#FFFBEB' }; // Amber
  }
  
  // Code / XML / JSON
  if (['xml', 'json', 'html', 'js', 'ts', 'css'].includes(ext)) {
    return { icon: 'file-code-outline', color: '#6366F1', bgColor: '#EEF2FF' }; // Indigo
  }
  
  // Audio/Video
  if (['mp3', 'wav', 'mp4', 'mov', 'avi'].includes(ext)) {
    return { icon: 'play-box-outline', color: '#8B5CF6', bgColor: '#F5F3FF' }; // Purple
  }
  
  // Archives
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
    return { icon: 'folder-zip-outline', color: '#14B8A6', bgColor: '#F0FDFA' }; // Teal
  }

  // Default
  return { icon: 'file-document-outline', color: Colors.primary, bgColor: Colors.primarySubtle };
}
