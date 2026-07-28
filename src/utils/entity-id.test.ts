import { EntityId } from './entity-id';

describe('EntityId', () => {
  it('should create an EntityId from a valid string', () => {
    const id = EntityId.of('test-id-123');
    expect(id.getValue()).toBe('test-id-123');
  });

  it('should return the same value via toString', () => {
    const id = EntityId.of('test-id-123');
    expect(id.toString()).toBe('test-id-123');
  });

  it('should throw when value is empty string', () => {
    expect(() => EntityId.of('')).toThrow('EntityId must be a non-empty string');
  });

  it('should throw when value is null', () => {
    expect(() => EntityId.of(null as unknown as string)).toThrow('EntityId must be a non-empty string');
  });

  it('should throw when value is undefined', () => {
    expect(() => EntityId.of(undefined as unknown as string)).toThrow('EntityId must be a non-empty string');
  });

  it('should throw when value is not a string', () => {
    expect(() => EntityId.of(123 as unknown as string)).toThrow('EntityId must be a non-empty string');
  });
});
