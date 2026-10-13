import { describe, expect, it } from 'vitest';
import { loadCommands } from '../src/discord/commandLoader.js';

describe('loadCommands', () => {
  it('discovers every command with valid, unique definitions', async () => {
    const commands = await loadCommands();
    expect([...commands.keys()].sort()).toEqual(
      ['keystatus', 'nowplaying', 'pause', 'play', 'queue', 'removekey', 'resume', 'setkey', 'shuffle', 'skip', 'stop'].sort(),
    );
    for (const command of commands.values()) {
      const json = command.data.toJSON();
      expect(json.description.length).toBeGreaterThan(0);
      expect(json.description.length).toBeLessThanOrEqual(100);
    }
  });
});
