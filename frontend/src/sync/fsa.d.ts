// Complementos de tipos de la File System Access API que la lib DOM de
// TypeScript (5.5) aún no incluye: `showDirectoryPicker` y los permisos por
// handle. Soportado en navegadores Chromium (Chrome, Edge, Brave, Opera).
// Este archivo NO tiene import/export: se trata como script global, así que
// las interfaces se FUSIONAN con las de la librería.

interface FileSystemHandlePermissionDescriptor {
  mode?: 'read' | 'readwrite'
}

interface FileSystemHandle {
  queryPermission?(
    descriptor?: FileSystemHandlePermissionDescriptor,
  ): Promise<PermissionState>
  requestPermission?(
    descriptor?: FileSystemHandlePermissionDescriptor,
  ): Promise<PermissionState>
}

interface Window {
  showDirectoryPicker?(options?: {
    id?: string
    mode?: 'read' | 'readwrite'
    startIn?: string | FileSystemHandle
  }): Promise<FileSystemDirectoryHandle>
}
