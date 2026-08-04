import { FILE_EVENTS, FileAddedEvent, FileChangedEvent, FileDeletedEvent } from './events/file-events';
import { FILE_CHANGE_STATUS, FileChange } from './file-change.aggregate';

describe('FileChange', () => {
  describe('static add', () => {
    it('creates FileChange with ADDED status and FileAddedEvent in AggregateResult', () => {
      const result = FileChange.add('/test/file.txt');

      expect(result.isOk()).toBe(true);
      const fileChange = result.getAggregate();
      expect(fileChange.filePath).toBe('/test/file.txt');
      expect(fileChange.status).toBe(FILE_CHANGE_STATUS.ADDED);
      const events = result.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(FileAddedEvent);
      expect((events[0] as FileAddedEvent).type).toBe(FILE_EVENTS.ADDED);
      expect((events[0] as FileAddedEvent).path).toBe('/test/file.txt');
    });

    it('returns ko for empty path', () => {
      const result = FileChange.add('');

      expect(result.isKo()).toBe(true);
    });
  });

  describe('instance change', () => {
    it('transitions to CHANGED status and emits FileChangedEvent in AggregateResult', () => {
      const addResult = FileChange.add('/test/file.txt');
      expect(addResult.isOk()).toBe(true);

      const fileChange = addResult.getAggregate();
      const changeResult = fileChange.change();

      expect(changeResult.isOk()).toBe(true);
      const changed = changeResult.getAggregate();
      expect(changed.filePath).toBe('/test/file.txt');
      expect(changed.status).toBe(FILE_CHANGE_STATUS.CHANGED);
      const events = changeResult.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(FileChangedEvent);
      expect((events[0] as FileChangedEvent).type).toBe(FILE_EVENTS.CHANGED);
    });

    it('original aggregate remains unchanged after change', () => {
      const addResult = FileChange.add('/test/file.txt');
      expect(addResult.isOk()).toBe(true);

      const fileChange = addResult.getAggregate();
      expect(fileChange.status).toBe(FILE_CHANGE_STATUS.ADDED);

      const changeResult = fileChange.change();
      expect(changeResult.isOk()).toBe(true);
      // Original aggregate is immutable
      expect(fileChange.status).toBe(FILE_CHANGE_STATUS.ADDED);
    });
  });

  describe('instance delete', () => {
    it('transitions to DELETED status and emits FileDeletedEvent in AggregateResult', () => {
      const addResult = FileChange.add('/test/file.txt');
      expect(addResult.isOk()).toBe(true);

      const fileChange = addResult.getAggregate();
      const deleteResult = fileChange.delete();

      expect(deleteResult.isOk()).toBe(true);
      const deleted = deleteResult.getAggregate();
      expect(deleted.filePath).toBe('/test/file.txt');
      expect(deleted.status).toBe(FILE_CHANGE_STATUS.DELETED);
      const events = deleteResult.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(FileDeletedEvent);
      expect((events[0] as FileDeletedEvent).type).toBe(FILE_EVENTS.DELETED);
    });

    it('original aggregate remains unchanged after delete', () => {
      const addResult = FileChange.add('/test/file.txt');
      expect(addResult.isOk()).toBe(true);

      const fileChange = addResult.getAggregate();
      expect(fileChange.status).toBe(FILE_CHANGE_STATUS.ADDED);

      const deleteResult = fileChange.delete();
      expect(deleteResult.isOk()).toBe(true);
      // Original aggregate is immutable
      expect(fileChange.status).toBe(FILE_CHANGE_STATUS.ADDED);
    });
  });

  describe('static of', () => {
    it('creates FileChange with valid props', () => {
      const result = FileChange.of({
        filePath: '/test/file.txt',
        status: FILE_CHANGE_STATUS.ADDED,
      });

      expect(result.isOk()).toBe(true);
      const fileChange = result.getValue();
      expect(fileChange.filePath).toBe('/test/file.txt');
      expect(fileChange.status).toBe(FILE_CHANGE_STATUS.ADDED);
    });

    it('returns ko when filePath is missing', () => {
      const result = FileChange.of({} as never);

      expect(result.isKo()).toBe(true);
    });

    it('returns ko when filePath is empty', () => {
      const result = FileChange.of({
        filePath: '',
        status: FILE_CHANGE_STATUS.ADDED,
      });

      expect(result.isKo()).toBe(true);
    });

    it('returns ko when status is invalid', () => {
      const result = FileChange.of({
        filePath: '/test/file.txt',
        status: 'invalid' as never,
      });

      expect(result.isKo()).toBe(true);
    });
  });

  describe('toJson', () => {
    it('serializes filePath and status without events', () => {
      const result = FileChange.add('/test/file.txt');
      expect(result.isOk()).toBe(true);

      const fileChange = result.getAggregate();
      const json = fileChange.toJson();

      expect(json).toEqual({
        filePath: '/test/file.txt',
        status: FILE_CHANGE_STATUS.ADDED,
      });
    });
  });

  describe('status enum', () => {
    it('has ADDED, CHANGED, and DELETED values', () => {
      expect(FILE_CHANGE_STATUS.ADDED).toBe('added');
      expect(FILE_CHANGE_STATUS.CHANGED).toBe('changed');
      expect(FILE_CHANGE_STATUS.DELETED).toBe('deleted');
    });
  });
});
