import { FILE_EVENTS, FileAddedEvent, FileChangedEvent, FileDeletedEvent } from './events/file-events';
import { FileChange } from './file-change.aggregate';

describe('FileChange', () => {
  describe('of', () => {
    it('creates FileChange with valid props', () => {
      const result = FileChange.of({ events: [] });

      expect(result.isOk()).toBe(true);
      const fileChange = result.getValue();
      expect(fileChange.events).toEqual([]);
    });

    it('creates FileChange with events in props', () => {
      const event = FileAddedEvent.of('/test/file.txt').getValue();
      const result = FileChange.of({ events: [event] });

      expect(result.isOk()).toBe(true);
      const fileChange = result.getValue();
      expect(fileChange.events).toHaveLength(1);
      expect(fileChange.events[0]).toBe(event);
    });

    it('returns ko when events is missing', () => {
      const result = FileChange.of({} as never);

      expect(result.isKo()).toBe(true);
    });

    it('returns ko when events is not an array', () => {
      const result = FileChange.of({ events: 'not-an-array' } as never);

      expect(result.isKo()).toBe(true);
    });
  });

  describe('empty', () => {
    it('creates empty aggregate', () => {
      const fileChange = FileChange.empty();

      expect(fileChange.events).toEqual([]);
    });
  });

  describe('add', () => {
    it('creates FileChange with FileAddedEvent for valid path', () => {
      const fileChange = FileChange.empty();
      const result = fileChange.add('/test/file.txt');

      expect(result.isOk()).toBe(true);
      const changed = result.getValue();
      expect(changed.events).toHaveLength(1);
      expect(changed.events[0]).toBeInstanceOf(FileAddedEvent);
      expect((changed.events[0] as FileAddedEvent).type).toBe(FILE_EVENTS.ADDED);
    });

    it('returns ko for empty path', () => {
      const fileChange = FileChange.empty();
      const result = fileChange.add('');

      expect(result.isKo()).toBe(true);
    });
  });

  describe('change', () => {
    it('creates FileChange with FileChangedEvent for valid path', () => {
      const fileChange = FileChange.empty();
      const result = fileChange.change('/test/file.txt');

      expect(result.isOk()).toBe(true);
      const changed = result.getValue();
      expect(changed.events).toHaveLength(1);
      expect(changed.events[0]).toBeInstanceOf(FileChangedEvent);
      expect((changed.events[0] as FileChangedEvent).type).toBe(FILE_EVENTS.CHANGED);
    });

    it('returns ko for empty path', () => {
      const fileChange = FileChange.empty();
      const result = fileChange.change('');

      expect(result.isKo()).toBe(true);
    });
  });

  describe('delete', () => {
    it('creates FileChange with FileDeletedEvent for valid path', () => {
      const fileChange = FileChange.empty();
      const result = fileChange.delete('/test/file.txt');

      expect(result.isOk()).toBe(true);
      const changed = result.getValue();
      expect(changed.events).toHaveLength(1);
      expect(changed.events[0]).toBeInstanceOf(FileDeletedEvent);
      expect((changed.events[0] as FileDeletedEvent).type).toBe(FILE_EVENTS.DELETED);
    });

    it('returns ko for empty path', () => {
      const fileChange = FileChange.empty();
      const result = fileChange.delete('');

      expect(result.isKo()).toBe(true);
    });
  });
});
