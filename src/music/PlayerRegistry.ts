import { EventEmitter } from 'node:events';
import type { GuildPlayer } from './GuildPlayer.js';
import type { PlayerLookup } from './types.js';

/** One GuildPlayer per guild, created on demand and forgotten once destroyed. */
export class PlayerRegistry extends EventEmitter<{ created: [player: GuildPlayer] }> implements PlayerLookup {
  private readonly players = new Map<string, GuildPlayer>();

  constructor(private readonly factory: (guildId: string) => GuildPlayer) {
    super();
  }

  get size(): number {
    return this.players.size;
  }

  get(guildId: string): GuildPlayer | undefined {
    return this.players.get(guildId);
  }

  getOrCreate(guildId: string): GuildPlayer {
    const existing = this.players.get(guildId);
    if (existing) return existing;

    const player = this.factory(guildId);
    player.once('destroyed', () => {
      if (this.players.get(guildId) === player) this.players.delete(guildId);
    });
    this.players.set(guildId, player);
    this.emit('created', player);
    return player;
  }

  destroyAll(reason: string): void {
    for (const player of [...this.players.values()]) player.destroy(reason);
  }
}
