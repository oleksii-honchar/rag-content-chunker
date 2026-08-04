import { FILE_EVENTS, FileAddedEvent, FileChangedEvent, FileDeletedEvent } from './events/file-events';
import { FILE_TRACKER_STATUS, FileTracker } from './file-tracker.aggregate';

describe('FileTracker', () => {
  describe('static add', () => {
    it('creates FileTracker with ADDED status and FileAddedEvent in AggregateResult', () => {
      const result = FileTracker.add('/test/file.txt');

      expect(result.isOk()).toBe(true);
      const fileTracker = result.getValue();
      expect(fileTracker.filePath).toBe('/test/file.txt');
      expect(fileTracker.status).toBe(FILE_TRACKER_STATUS.ADDED);
      const events = result.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(FileAddedEvent);
      expect((events[0] as FileAddedEvent).type).toBe(FILE_EVENTS.ADDED);
      expect((events[0] as FileAddedEvent).path).toBe('/test/file.txt');
    });

    it('returns ko for empty path', () => {
      const result = FileTracker.add('');

      expect(result.isKo()).toBe(true);
    });
  });

  describe('instance change', () => {
    it('transitions to CHANGED status and emits FileChangedEvent in AggregateResult', () => {
      const addResult = FileTracker.add('/test/file.txt');
      expect(addResult.isOk()).toBe(true);

      const fileTracker = addResult.getValue();
      const changeResult = fileTracker.change();

      expect(changeResult.isOk()).toBe(true);
      const changed = changeResult.getValue();
      expect(changed.filePath).toBe('/test/file.txt');
      expect(changed.status).toBe(FILE_TRACKER_STATUS.CHANGED);
      const events = changeResult.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(FileChangedEvent);
      expect((events[0] as FileChangedEvent).type).toBe(FILE_EVENTS.CHANGED);
    });

    it('original aggregate remains unchanged after change', () => {
      const addResult = FileTracker.add('/test/file.txt');
      expect(addResult.isOk()).toBe(true);

      const fileTracker = addResult.getValue();
      expect(fileTracker.status).toBe(FILE_TRACKER_STATUS.ADDED);

      const changeResult = fileTracker.change();
      expect(changeResult.isOk()).toBe(true);
      // Original aggregate is immutable
      expect(fileTracker.status).toBe(FILE_TRACKER_STATUS.ADDED);
    });
  });

  describe('instance delete', () => {
    it('transitions to DELETED status and emits FileDeletedEvent in AggregateResult', () => {
      const addResult = FileTracker.add('/test/file.txt');
      expect(addResult.isOk()).toBe(true);

      const fileTracker = addResult.getValue();
      const deleteResult = fileTracker.delete();

      expect(deleteResult.isOk()).toBe(true);
      const deleted = deleteResult.getValue();
      expect(deleted.filePath).toBe('/test/file.txt');
      expect(deleted.status).toBe(FILE_TRACKER_STATUS.DELETED);
      const events = deleteResult.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(FileDeletedEvent);
      expect((events[0] as FileDeletedEvent).type).toBe(FILE_EVENTS.DELETED);
    });

    it('original aggregate remains unchanged after delete', () => {
      const addResult = FileTracker.add('/test/file.txt');
      expect(addResult.isOk()).toBe(true);

      const fileTracker = addResult.getValue();
      expect(fileTracker.status).toBe(FILE_TRACKER_STATUS.ADDED);

      const deleteResult = fileTracker.delete();
      expect(deleteResult.isOk()).toBe(true);
      // Original aggregate is immutable
      expect(fileTracker.status).toBe(FILE_TRACKER_STATUS.ADDED);
    });
  });

  describe('static of', () => {
    it('creates FileTracker with valid props', () => {
      const result = FileTracker.of({
        filePath: '/test/file.txt',
        status: FILE_TRACKER_STATUS.ADDED,
      });

      expect(result.isOk()).toBe(true);
      const fileTracker = result.getValue();
      expect(fileTracker.filePath).toBe('/test/file.txt');
      expect(fileTracker.status).toBe(FILE_TRACKER_STATUS.ADDED);
    });

    it('returns ko when filePath is missing', () => {
      const result = FileTracker.of({} as never);

      expect(result.isKo()).toBe(true);
    });

    it('returns ko when filePath is empty', () => {
      const result = FileTracker.of({
        filePath: '',
        status: FILE_TRACKER_STATUS.ADDED,
      });

      expect(result.isKo()).toBe(true);
    });

    it('returns ko when status is invalid', () => {
      const result = FileTracker.of({
        filePath: '/test/file.txt',
        status: 'invalid' as never,
      });

      expect(result.isKo()).toBe(true);
    });
  });

  describe('toJson', () => {
    it('serializes filePath and status without events', () => {
      const result = FileTracker.add('/test/file.txt');
      expect(result.isOk()).toBe(true);

      const fileTracker = result.getValue();
      const json = fileTracker.toJson();

      expect(json).toEqual({
        filePath: '/test/file.txt',
        status: FILE_TRACKER_STATUS.ADDED,
      });
    });
  });

  describe('status enum', () => {
    it('has ADDED, CHANGED, and DELETED values', () => {
      expect(FILE_TRACKER_STATUS.ADDED).toBe('added');
      expect(FILE_TRACKER_STATUS.CHANGED).toBe('changed');
      expect(FILE_TRACKER_STATUS.DELETED).toBe('deleted');
    });
  });
});
