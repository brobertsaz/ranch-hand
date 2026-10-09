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

export async function keepPhoto(cameraUri: string, photoId: string): Promise<File> {
  const destination = photoFile(photoId);
  await new File(cameraUri).move(destination);
  return destination;
}
