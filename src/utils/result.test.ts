import { Result } from './result';

describe('Result', () => {
  describe('Result.ok', () => {
    it('should return a result with isOk true', () => {
      const result = Result.ok('hello');
      expect(result.isOk()).toBe(true);
    });

    it('should return a result with isKo false', () => {
      const result = Result.ok('hello');
      expect(result.isKo()).toBe(false);
    });

    it('should return the value via getValue', () => {
      const result = Result.ok(42);
      expect(result.getValue()).toBe(42);
    });

    it('should throw when getError is called on ok result', () => {
      const result = Result.ok('hello');
      expect(() => result.getError()).toThrow('Cannot get error from successful Result');
    });

    it('should throw when getErrors is called on ok result', () => {
      const result = Result.ok('hello');
      expect(() => result.getErrors()).toThrow('Cannot get error from successful Result');
    });
  });

  describe('Result.ko', () => {
    it('should return a result with isOk false', () => {
      const error = new Error('something went wrong');
      const result = Result.ko(error);
      expect(result.isOk()).toBe(false);
    });

    it('should return a result with isKo true', () => {
      const error = new Error('something went wrong');
      const result = Result.ko(error);
      expect(result.isKo()).toBe(true);
    });

    it('should return the error via getError', () => {
      const error = new Error('something went wrong');
      const result = Result.ko(error);
      expect(result.getError()).toBe(error);
    });

    it('should throw when getValue is called on ko result', () => {
      const error = new Error('something went wrong');
      const result = Result.ko(error);
      expect(() => result.getValue()).toThrow('Cannot get value from failed Result');
    });

    it('should return error message via getErrors', () => {
      const error = new Error('something went wrong');
      const result = Result.ko(error);
      expect(result.getErrors()).toBe('something went wrong');
    });
  });

  describe('map', () => {
    it('should transform value when ok', () => {
      const result = Result.ok<number>(5);
      const mapped = result.map(v => v * 2);
      expect(mapped.isOk()).toBe(true);
      expect(mapped.getValue()).toBe(10);
    });

    it('should preserve error when ko', () => {
      const error = new Error('ko');
      const result = Result.ko<number>(error);
      const mapped = result.map(v => v * 2);
      expect(mapped.isKo()).toBe(true);
      expect(mapped.getError()).toBe(error);
    });

    it('should return ko when transform function throws', () => {
      const result = Result.ok<number>(5);
      const mapped = result.map(() => {
        throw new Error('transform failed');
      });
      expect(mapped.isKo()).toBe(true);
      expect(mapped.getError().message).toBe('transform failed');
    });
  });

  describe('mapErr', () => {
    it('should transform error when ko', () => {
      const error = new Error('original');
      const result = Result.ko<number>(error);
      const mapped = result.mapErr(e => new Error(`wrapped: ${e.message}`));
      expect(mapped.isKo()).toBe(true);
      expect(mapped.getError().message).toBe('wrapped: original');
    });

    it('should preserve value when ok', () => {
      const result = Result.ok<number>(42);
      const mapped = result.mapErr(e => new Error(`wrapped: ${e.message}`));
      expect(mapped.isOk()).toBe(true);
      expect(mapped.getValue()).toBe(42);
    });
  });

  describe('flatMap', () => {
    it('should chain results when ok', () => {
      const result = Result.ok<number>(5);
      const chained = result.flatMap(v => Result.ok(v * 3));
      expect(chained.isOk()).toBe(true);
      expect(chained.getValue()).toBe(15);
    });

    it('should propagate error when ko', () => {
      const error = new Error('ko');
      const result = Result.ko<number>(error);
      const chained = result.flatMap(v => Result.ok(v * 3));
      expect(chained.isKo()).toBe(true);
      expect(chained.getError()).toBe(error);
    });

    it('should propagate error when flatMap function returns ko', () => {
      const result = Result.ok<number>(5);
      const chained = result.flatMap(v => {
        if (v < 10) {
          return Result.ko(new Error('too small'));
        }
        return Result.ok(v);
      });
      expect(chained.isKo()).toBe(true);
      expect(chained.getError().message).toBe('too small');
    });
  });
});
