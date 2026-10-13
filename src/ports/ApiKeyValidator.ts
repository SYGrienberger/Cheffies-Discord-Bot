/**
 * Checks a user-supplied API key against the real service before we store it.
 * Resolves if the key is usable; throws a UserError subclass explaining why not.
 */
export interface ApiKeyValidator {
  validate(apiKey: string): Promise<void>;
}
