import { ErrorWithDetails } from './error-with-details';
import { AggregateResult } from './aggregate-result';

describe('AggregateResult', () => {
  describe('static ok', () => {
    it('creates an ok result with aggregate and events', () => {
      const aggregate = { id: 1 };
      const events = [{ type: 'event1' }];
      const result = AggregateResult.ok(aggregate, events);

      expect(result.isOk()).toBe(true);
      expect(result.isKo()).toBe(false);
      expect(result.getAggregate()).toBe(aggregate);
      expect(result.getEvents()).toBe(events);
    });
  });

  describe('static ko', () => {
    it('creates a ko result from ErrorWithDetails', () => {
      const error = new ErrorWithDetails('something failed', 'TestError');
      const result = AggregateResult.ko<number, string>(error);

      expect(result.isOk()).toBe(false);
      expect(result.isKo()).toBe(true);
      expect(result.getErrors()).toHaveLength(1);
      expect(result.getErrors()[0]).toBe(error);
    });

    it('creates a ko result from plain Error', () => {
      const error = new Error('plain error');
      const result = AggregateResult.ko<number, string>(error);

      expect(result.isKo()).toBe(true);
      expect(result.getErrors()).toHaveLength(1);
      expect(result.getErrors()[0].message).toBe('plain error');
    });

    it('throws when calling getAggregate on ko result', () => {
      const result = AggregateResult.ko<number, string>(new Error('fail'));

      expect(() => result.getAggregate()).toThrow('Cannot get aggregate from a Ko result');
    });

    it('throws when calling getEvents on ko result', () => {
      const result = AggregateResult.ko<number, string>(new Error('fail'));

      expect(() => result.getEvents()).toThrow('Cannot get events from a Ko result');
    });
  });

  describe('static of', () => {
    it('creates ok result when no errors', () => {
      const aggregate = { id: 1 };
      const events = [{ type: 'event1' }];
      const result = AggregateResult.of(aggregate, events);

      expect(result.isOk()).toBe(true);
      expect(result.getAggregate()).toBe(aggregate);
      expect(result.getEvents()).toBe(events);
    });

    it('creates ko result when errors provided', () => {
      const errors = [new ErrorWithDetails('fail', 'TestError')];
      const result = AggregateResult.of({ id: 1 }, [{ type: 'e' }], errors);

      expect(result.isKo()).toBe(true);
      expect(result.getErrors()).toBe(errors);
    });

    it('creates ok result when errors array is empty', () => {
      const aggregate = { id: 1 };
      const events = [{ type: 'event1' }];
      const result = AggregateResult.of(aggregate, events, []);

      expect(result.isOk()).toBe(true);
      expect(result.getAggregate()).toBe(aggregate);
    });
  });

  describe('getErrors', () => {
    it('returns empty array for ok result', () => {
      const result = AggregateResult.ok({ id: 1 }, []);

      expect(result.getErrors()).toEqual([]);
    });
  });
});
