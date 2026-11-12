import { Directory, File, Paths } from 'expo-file-system';

// One file per photo id, so the path never has to be stored or synced
function photosDir(): Directory {
  const dir = new Directory(Paths.document, 'photos');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

export function photoFile(photoId: string): File {
  return new File(photosDir(), `${photoId}.jpg`);
}

// Where a download lands until it's whole. A cut-off download left under the real name would look finished.
export function partialPhotoFile(photoId: string): File {
  return new File(photosDir(), `${photoId}.jpg.part`);
}

// A photo's file reaching this phone changes no row, so screens showing "arrives on the next sync" listen here
const arrivalListeners = new Set<(photoId: string) => void>();

export function onPhotoArrived(listener: (photoId: string) => void): { remove: () => void } {
  arrivalListeners.add(listener);
  return { remove: () => void arrivalListeners.delete(listener) };
}

export function photoArrived(photoId: string): void {
  arrivalListeners.forEach((listener) => listener(photoId));
}

export function deleteAllPhotos(): void {
  const dir = new Directory(Paths.document, 'photos');
  if (dir.exists) dir.delete();
}

export async function keepPhoto(cameraUri: string, photoId: string): Promise<File> {
  const destination = photoFile(photoId);
  await new File(cameraUri).move(destination);
  return destination;
}
