import { ErrorWithDetails } from './error-with-details';

interface AggregateResultOk<TAggregate, TEvent> {
  aggregate: TAggregate;
  events: TEvent[];
  errors: never[];
}

interface AggregateResultKo {
  aggregate: never;
  events: never;
  errors: ErrorWithDetails[];
}

type AggregateResultOf<TAggregate, TEvent> = AggregateResultOk<TAggregate, TEvent> | AggregateResultKo;

/**
 * Aggregate operation result — returns both the aggregate and domain events.
 * Used by aggregate root domain operations (following DDD pattern).
 */
export class AggregateResult<TAggregate, TEvent> {
  private constructor(private readonly result: AggregateResultOf<TAggregate, TEvent>) {}

  static of<TAggregate, TEvent>(
    aggregate: TAggregate,
    events: TEvent[],
    errors?: ErrorWithDetails[],
  ): AggregateResult<TAggregate, TEvent> {
    if (errors && errors.length > 0) {
      return new AggregateResult({
        aggregate: undefined as unknown as TAggregate,
        events: undefined as unknown as TEvent,
        errors,
      } as AggregateResultKo);
    }
    return new AggregateResult({ aggregate, events, errors: [] });
  }

  static ok<TAggregate, TEvent>(
    aggregate: TAggregate,
    events: TEvent[],
  ): AggregateResult<TAggregate, TEvent> {
    return AggregateResult.of(aggregate, events);
  }

  static ko<TAggregate, TEvent>(error: ErrorWithDetails | Error): AggregateResult<TAggregate, TEvent> {
    const details = error instanceof ErrorWithDetails ? error : ErrorWithDetails.of(error);
    return AggregateResult.of(undefined as unknown as TAggregate, undefined as unknown as TEvent[], [
      details,
    ]);
  }

  isOk(): boolean {
    return (this.result as AggregateResultOk<TAggregate, TEvent>).errors.length === 0;
  }

  isKo(): boolean {
    return !this.isOk();
  }

  getErrors(): ErrorWithDetails[] {
    return (this.result as AggregateResultKo).errors;
  }

  getAggregate(): TAggregate {
    if (this.isKo()) {
      const errors = this.getErrors();
      const errorMessages = errors.map(e => e.message).join(', ');
      throw new Error(`Cannot get aggregate from a Ko result: ${errorMessages}`);
    }
    return (this.result as AggregateResultOk<TAggregate, TEvent>).aggregate;
  }

  getEvents(): TEvent[] {
    if (this.isKo()) {
      const errors = this.getErrors();
      const errorMessages = errors.map(e => e.message).join(', ');
      throw new Error(`Cannot get events from a Ko result: ${errorMessages}`);
    }
    return (this.result as AggregateResultOk<TAggregate, TEvent>).events;
  }
}
