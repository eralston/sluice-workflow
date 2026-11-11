import { describe, expect, it } from 'vitest';
import { PICTURE_BYTES_MAX } from '../../src/shared/contracts/ipc';
import { isImageFile, pictureFileProblem } from '../../src/shared/pictureFile';

describe('pictureFileProblem (23 E8)', () => {
  it('takes an image by type or by extension', () => {
    expect(pictureFileProblem({ name: 'a.bin', type: 'image/png', size: 10 })).toBeNull();
    expect(pictureFileProblem({ name: 'face.JPG', type: '', size: 10 })).toBeNull();
    expect(isImageFile({ name: 'x.webp', type: '' })).toBe(true);
  });
  it('refuses what is not an image', () => {
    expect(pictureFileProblem({ name: 'notes.txt', type: 'text/plain', size: 10 })).toBe('notImage');
    expect(pictureFileProblem({ name: 'run.sh', type: '', size: 10 })).toBe('notImage');
  });
  it('refuses empty and over-cap files', () => {
    expect(pictureFileProblem({ name: 'a.png', type: 'image/png', size: 0 })).toBe('empty');
    expect(pictureFileProblem({ name: 'a.png', type: 'image/png', size: PICTURE_BYTES_MAX })).toBeNull();
    expect(pictureFileProblem({ name: 'a.png', type: 'image/png', size: PICTURE_BYTES_MAX + 1 })).toBe('tooBig');
  });
});
