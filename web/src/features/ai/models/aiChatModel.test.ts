import { describe, expect, it } from 'vitest';
import { validateAttachmentFiles } from './aiChatModel';

function file(name: string, size: number): File {
  return { name, size } as File;
}

describe('validateAttachmentFiles', () => {
  it('rejects a file over the per-file limit', () => {
    expect(validateAttachmentFiles([file('large.png', 5 * 1024 * 1024 + 1)], 0))
      .toContain('large.png');
  });

  it('rejects a selection over the cumulative limit', () => {
    expect(validateAttachmentFiles([file('next.pdf', 3 * 1024 * 1024)], 10 * 1024 * 1024))
      .toContain('12 MB');
  });

  it('accepts files within both limits', () => {
    expect(validateAttachmentFiles([file('ok.png', 1024)], 1024)).toBeNull();
  });
});
