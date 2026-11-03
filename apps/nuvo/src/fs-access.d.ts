// File System Access API 중 TS 기본 lib에 없는 부분 (Chrome/Edge)
interface FileSystemHandlePermissionDescriptor {
  mode?: "read" | "readwrite";
}
interface FileSystemHandle {
  queryPermission(d?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
  requestPermission(d?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
}
interface Window {
  showDirectoryPicker?(opts?: { id?: string; mode?: "read" | "readwrite"; startIn?: string }): Promise<FileSystemDirectoryHandle>;
}
