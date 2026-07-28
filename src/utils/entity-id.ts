import { ErrorWithDetails } from './error-with-details';

/**
 * EntityId wrapper for consistent ID handling across the application.
 */

export class EntityId {
  private constructor(private readonly value: string) {}

  static of(value: string): EntityId {
    if (!value || typeof value !== 'string') {
      throw new ErrorWithDetails('EntityId must be a non-empty string', 'InvalidEntityId');
    }
    return new EntityId(value);
  }

  getValue(): string {
    return this.value;
  }

  toString(): string {
    return this.value;
  }
}
