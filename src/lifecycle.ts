import type { Logger } from './core/logger.js';

const FORCE_EXIT_AFTER_MS = 10_000;

/**
 * Graceful shutdown on SIGINT/SIGTERM, logging for stray promise rejections,
 * and a clean exit after an uncaught exception (state may be corrupt, so we
 * let the process manager restart us rather than limp on).
 */
export function installProcessHandlers(opts: { logger: Logger; shutdown: () => Promise<void> }): void {
  const { logger } = opts;
  let shuttingDown = false;

  const stop = async (reason: string, exitCode: number) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ reason }, 'Shutting down');
    const force = setTimeout(() => process.exit(exitCode), FORCE_EXIT_AFTER_MS);
    force.unref();
    try {
      await opts.shutdown();
    } catch (err) {
      logger.error({ err }, 'Error during shutdown');
    } finally {
      process.exit(exitCode);
    }
  };

  process.on('SIGINT', () => void stop('SIGINT', 0));
  process.on('SIGTERM', () => void stop('SIGTERM', 0));
  process.on('unhandledRejection', (reason) => logger.error({ err: reason }, 'Unhandled promise rejection'));
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception');
    void stop('uncaughtException', 1);
  });
}
