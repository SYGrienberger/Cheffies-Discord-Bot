import type { KeyService } from './KeyService.js';
import type { MusicService } from './MusicService.js';

/** Everything commands are allowed to use. Add new services here and in container.ts. */
export interface Services {
  keys: KeyService;
  music: MusicService;
}
