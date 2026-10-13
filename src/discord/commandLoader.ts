import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Command } from './Command.js';

const DEFAULT_DIR = fileURLToPath(new URL('../commands/', import.meta.url));

/**
 * Imports every command file under `dir` (recursively). Works with both
 * `src/*.ts` (tsx, vitest) and `dist/*.js` (production). Fails fast on a file
 * that doesn't export a command or on duplicate names.
 */
export async function loadCommands(dir: string = DEFAULT_DIR): Promise<Map<string, Command>> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  const files = entries
    .filter((e) => e.isFile() && /\.(js|ts)$/.test(e.name) && !/\.(d|test)\.(js|ts)$/.test(e.name))
    .map((e) => join(e.parentPath, e.name))
    .sort();

  const commands = new Map<string, Command>();
  for (const file of files) {
    const mod = (await import(pathToFileURL(file).href)) as { default?: unknown };
    const command = mod.default;
    if (!isCommand(command)) {
      throw new Error(`${file} must default-export a command created with defineCommand()`);
    }
    if (commands.has(command.data.name)) {
      throw new Error(`Duplicate command name "${command.data.name}" in ${file}`);
    }
    commands.set(command.data.name, command);
  }
  return commands;
}

function isCommand(value: unknown): value is Command {
  const c = value as Partial<Command> | undefined;
  return typeof c?.execute === 'function' && typeof c.data?.name === 'string' && typeof c.data.toJSON === 'function';
}
