// Why a hand-added picture didn't take, in words (never a path or a file name). Shared by the
// Inspector's picture card and Settings → Captain Avatars.
import type { PictureResult } from '@shared/contracts/ipc';

export const PICTURE_WHY: Record<NonNullable<PictureResult['reason']>, string> = {
  cancelled: '',
  unreadable: 'That file couldn’t be read as a picture. Try a PNG, JPEG, GIF or WebP.',
  tooBig: 'That file is too large. Pick one under 12 MB.',
  notConnected: 'Connect to ADO first: a picture is kept for a person in your org.',
};
