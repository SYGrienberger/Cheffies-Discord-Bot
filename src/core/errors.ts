/**
 * Error hierarchy.
 *
 * - `UserError` and subclasses: expected failures. Their message is safe to show
 *   to the Discord user verbatim, and they are not logged as errors.
 * - Anything else: a bug or an outage. The user gets a generic message with a
 *   reference id, and the full error is logged under that id.
 */
export class AppError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class ConfigError extends AppError {}

export class UserError extends AppError {}

export class KeyMissingError extends UserError {
  constructor() {
    super(
      "You haven't set a YouTube API key yet. Run `/setkey` first " +
        '(get one at https://console.cloud.google.com/apis/library/youtube.googleapis.com).',
    );
  }
}

export class InvalidKeyError extends UserError {}

export class ApiNotEnabledError extends UserError {
  constructor() {
    super(
      'That key works, but the **YouTube Data API v3** is not enabled for its Google Cloud project. ' +
        'Enable it at https://console.cloud.google.com/apis/library/youtube.googleapis.com and try again.',
    );
  }
}

export class QuotaExceededError extends UserError {
  constructor() {
    super('Your YouTube API key has run out of quota for today. It resets at midnight Pacific Time.');
  }
}

export class SourceUnavailableError extends UserError {
  constructor(service: string) {
    super(`${service} is not responding right now. Please try again in a moment.`);
  }
}

/** No results, unsupported link, private video, etc. */
export class SourceError extends UserError {}

export class QueueFullError extends UserError {}
