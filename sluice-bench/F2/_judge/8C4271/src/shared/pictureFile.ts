// Which dropped or chosen files may become a person's picture (23 E8). The same rule for a drop on a
// captain's ship as for Settings' tiles and the Inspector's card: an image type, under the size cap;
// main then decodes it (nativeImage) and refuses what is not a picture. Pure: no DOM, no Electron.
import { PICTURE_BYTES_MAX } from './contracts/ipc';

const IMAGE_NAME = /\.(png|jpe?g|gif|webp|heic|heif|bmp|tiff?)$/i;

/** Whether a file looks like an image by its type or its extension (a Finder drag may carry no type). */
export const isImageFile = (f: { name: string; type: string }): boolean => f.type.startsWith('image/') || IMAGE_NAME.test(f.name);

export type PictureFileProblem = 'notImage' | 'tooBig' | 'empty';

/** What is wrong with a file as a picture, or null when it may go on to be decoded. */
export function pictureFileProblem(f: { name: string; type: string; size: number }): PictureFileProblem | null {
  if (!isImageFile(f)) return 'notImage';
  if (f.size <= 0) return 'empty';
  if (f.size > PICTURE_BYTES_MAX) return 'tooBig';
  return null;
}
