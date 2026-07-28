import { ErrorWithDetails } from './error-with-details';

/**
 * AggregateResult for operations that can partially succeed.
 * Pattern copied from voqaria typescript-common.
 */

export class AggregateResult<T> {
  private readonly value: T | null;
  private readonly errors: ErrorWithDetails[];

  constructor(value: T | null, errors: ErrorWithDetails[]) {
    this.value = value;
    this.errors = errors;
  }

  static of<T>(value: T | null, errors: ErrorWithDetails[]): AggregateResult<T> {
    return new AggregateResult(value, errors);
  }

  static ok<T>(value: T): AggregateResult<T> {
    return new AggregateResult(value, []);
  }

  static ko<T>(errors: ErrorWithDetails[]): AggregateResult<T> {
    return new AggregateResult(null as unknown as T, errors);
  }

  isOk(): boolean {
    return this.value !== null && this.errors.length === 0;
  }

  isKo(): boolean {
    return !this.isOk();
  }

  getValue(): T {
    if (this.value === null) {
      throw new Error('Cannot get value from AggregateResult.ko');
    }
    return this.value;
  }

  getErrors(): ErrorWithDetails[] {
    return this.errors;
  }

  hasErrors(): boolean {
    return this.errors.length > 0;
  }

  isPartial(): boolean {
    return this.value !== null && this.errors.length > 0;
  }
}
