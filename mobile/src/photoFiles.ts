import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

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

// A phone's camera makes 2-5 MB photos, which is minutes over one bar of signal and never gets there over less.
// This many pixels on the long side still reads an ear tag, at about a tenth of the size.
export const PHOTO_LONG_SIDE = 2048;
const PHOTO_QUALITY = 0.7;

// The camera's photo, made small enough to send from the field. If shrinking fails the full photo is kept:
// a big photo that's slow to sync beats no photo.
export async function shrinkPhoto(cameraUri: string): Promise<string> {
  try {
    // Measured once it's loaded, the right way up: the camera reports the sensor's width and height, which
    // are swapped for a photo taken holding the phone upright
    const loaded = await ImageManipulator.manipulate(cameraUri).renderAsync();
    const wide = loaded.width >= loaded.height;
    const image =
      Math.max(loaded.width, loaded.height) > PHOTO_LONG_SIDE
        ? await ImageManipulator.manipulate(loaded).resize(wide ? { width: PHOTO_LONG_SIDE } : { height: PHOTO_LONG_SIDE }).renderAsync()
        : loaded;
    const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: PHOTO_QUALITY });
    const original = new File(cameraUri);
    if (saved.uri !== cameraUri && original.exists) original.delete();
    return saved.uri;
  } catch {
    return cameraUri;
  }
}

export async function keepPhoto(cameraUri: string, photoId: string): Promise<File> {
  const destination = photoFile(photoId);
  await new File(cameraUri).move(destination);
  return destination;
}
