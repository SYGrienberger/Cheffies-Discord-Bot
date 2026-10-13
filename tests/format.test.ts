import { describe, expect, it } from 'vitest';
import { formatDuration, trackLine } from '../src/discord/format.js';

describe('format', () => {
  it('formats durations', () => {
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(3725)).toBe('1:02:05');
    expect(formatDuration(undefined)).toBe('live');
  });

  it('builds safe track links', () => {
    const line = trackLine({ id: 'x', title: '[Official] *Video*', url: 'https://y/x', durationSeconds: 5, source: 's', requestedBy: 'u' });
    expect(line).toBe('[Official \\*Video\\*](<https://y/x>) `0:05`');
  });
});
