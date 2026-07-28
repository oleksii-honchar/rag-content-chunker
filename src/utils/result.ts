/**
 * Result pattern for handling success/failure without exceptions.
 * Follows DDD rules for domain/application error handling.
 */

export class Result<T> {
  constructor(
    private readonly _isOk: boolean,
    private readonly _value: T | undefined,
    private readonly _error: Error | undefined,
  ) {}

  /**
   * Check if result is successful.
   */
  isOk(): boolean {
    return this._isOk;
  }

  /**
   * Check if result is failed.
   */
  isKo(): boolean {
    return !this._isOk;
  }

  /**
   * Get the value (throws if failed).
   */
  getValue(): T {
    if (!this._isOk) {
      throw new Error('Cannot get value from failed Result');
    }
    return this._value!;
  }

  /**
   * Get the error (throws if successful).
   */
  getError(): Error {
    if (this._isOk) {
      throw new Error('Cannot get error from successful Result');
    }
    return this._error!;
  }

  /**
   * Get errors (method-style for compatibility).
   * Returns error message string.
   */
  getErrors(): string {
    return this.getError().message;
  }

  static ok<T>(value: T): Result<T> {
    return new Result(true, value, undefined);
  }

  static ko<T>(error: Error): Result<T> {
    return new Result<T>(false, undefined as unknown as T, error);
  }

  map<U>(fn: (value: T) => U): Result<U> {
    if (!this._isOk) return this as unknown as Result<U>;
    try {
      return Result.ok(fn(this._value!));
    } catch (error) {
      return Result.ko(error as Error);
    }
  }

  mapErr(fn: (error: Error) => Error): Result<T> {
    if (this._isOk) return this;
    return Result.ko(fn(this._error!));
  }

  flatMap<U>(fn: (value: T) => Result<U>): Result<U> {
    if (!this._isOk) return this as unknown as Result<U>;
    return fn(this._value!);
  }
}
