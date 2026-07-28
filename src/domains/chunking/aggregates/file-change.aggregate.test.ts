import { FileChange } from './file-change.aggregate';
import { FileAddedEvent } from '../events/file-events';
import { FileChangedEvent } from '../events/file-events';
import { FileDeletedEvent } from '../events/file-events';
import { FILE_EVENTS } from '../events/domain-event';

describe('FileChange', () => {
  describe('of', () => {
    it('with valid props returns ok', () => {
      const event = FileAddedEvent.of('/test/file.txt').getValue();
      const result = FileChange.of({ path: '/test/file.txt', events: [event] });

      expect(result.isOk()).toBe(true);
      const aggregate = result.getValue();
      expect(aggregate.path).toBe('/test/file.txt');
      expect(aggregate.events).toHaveLength(1);
    });

    it('with invalid props returns ko', () => {
      const result = FileChange.of({ path: '', events: [] });

      expect(result.isKo()).toBe(true);
    });
  });

  describe('add', () => {
    it('with valid path returns FileChange with FileAddedEvent', () => {
      const result = FileChange.add('/test/file.txt');

      expect(result.isOk()).toBe(true);
      const aggregate = result.getValue();
      expect(aggregate.path).toBe('/test/file.txt');
      expect(aggregate.events).toHaveLength(1);
      expect(aggregate.events[0]).toBeInstanceOf(FileAddedEvent);
      expect((aggregate.events[0] as FileAddedEvent).type).toBe(FILE_EVENTS.ADDED);
    });

    it('with empty path returns ko', () => {
      const result = FileChange.add('');

      expect(result.isKo()).toBe(true);
    });
  });

  describe('change', () => {
    it('with valid path returns FileChange with FileChangedEvent', () => {
      const result = FileChange.change('/test/file.txt');

      expect(result.isOk()).toBe(true);
      const aggregate = result.getValue();
      expect(aggregate.path).toBe('/test/file.txt');
      expect(aggregate.events).toHaveLength(1);
      expect(aggregate.events[0]).toBeInstanceOf(FileChangedEvent);
      expect((aggregate.events[0] as FileChangedEvent).type).toBe(FILE_EVENTS.CHANGED);
    });

    it('with empty path returns ko', () => {
      const result = FileChange.change('');

      expect(result.isKo()).toBe(true);
    });
  });

  describe('delete', () => {
    it('with valid path returns FileChange with FileDeletedEvent', () => {
      const result = FileChange.delete('/test/file.txt');

      expect(result.isOk()).toBe(true);
      const aggregate = result.getValue();
      expect(aggregate.path).toBe('/test/file.txt');
      expect(aggregate.events).toHaveLength(1);
      expect(aggregate.events[0]).toBeInstanceOf(FileDeletedEvent);
      expect((aggregate.events[0] as FileDeletedEvent).type).toBe(FILE_EVENTS.DELETED);
    });

    it('with empty path returns ko', () => {
      const result = FileChange.delete('');

      expect(result.isKo()).toBe(true);
    });
  });
});
