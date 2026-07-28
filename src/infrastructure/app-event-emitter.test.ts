import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { DomainCommand, ProcessFileCommand } from '../domain/commands/process-file-command';
import { DomainEvent } from '../domain/events/domain-event';
import { FileAddedEvent, FileChangedEvent, FileDeletedEvent } from '../domain/events/file-events';
import { AppEventEmitter } from './app-event-emitter';

describe('AppEventEmitter', () => {
  let appEventEmitter: AppEventEmitter;
  let eventEmitter: EventEmitter2;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AppEventEmitter, EventEmitter2],
    }).compile();

    appEventEmitter = module.get<AppEventEmitter>(AppEventEmitter);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
  });

  it('should be defined', () => {
    expect(appEventEmitter).toBeDefined();
  });

  describe('publish', () => {
    it('should emit event with correct type and payload', () => {
      const eventResult = FileAddedEvent.of('/test/file.md');
      const event = eventResult.getValue();

      const emitSpy = jest.spyOn(eventEmitter, 'emit');

      appEventEmitter.publish(event);

      expect(emitSpy).toHaveBeenCalledWith('file.added', event);
    });

    it('should emit FileChangedEvent with correct type', () => {
      const eventResult = FileChangedEvent.of('/test/file.md');
      const event = eventResult.getValue();

      const emitSpy = jest.spyOn(eventEmitter, 'emit');

      appEventEmitter.publish(event);

      expect(emitSpy).toHaveBeenCalledWith('file.changed', event);
    });

    it('should emit FileDeletedEvent with correct type', () => {
      const eventResult = FileDeletedEvent.of('/test/file.md');
      const event = eventResult.getValue();

      const emitSpy = jest.spyOn(eventEmitter, 'emit');

      appEventEmitter.publish(event);

      expect(emitSpy).toHaveBeenCalledWith('file.deleted', event);
    });

    it('should emit DomainCommand with correct type', () => {
      const commandResult = ProcessFileCommand.of('/test/file.md', 'source-1');
      const command = commandResult.getValue();

      const emitSpy = jest.spyOn(eventEmitter, 'emit');

      appEventEmitter.publish(command);

      expect(emitSpy).toHaveBeenCalledWith('process.file', command);
    });
  });

  describe('publishMany', () => {
    it('should emit all events in the array', () => {
      const addedResult = FileAddedEvent.of('/test/file1.md');
      const changedResult = FileChangedEvent.of('/test/file2.md');
      const deletedResult = FileDeletedEvent.of('/test/file3.md');

      const events: (DomainEvent | DomainCommand)[] = [
        addedResult.getValue(),
        changedResult.getValue(),
        deletedResult.getValue(),
      ];

      const emitSpy = jest.spyOn(eventEmitter, 'emit');

      appEventEmitter.publishMany(events);

      expect(emitSpy).toHaveBeenCalledTimes(3);
      expect(emitSpy).toHaveBeenCalledWith('file.added', events[0]);
      expect(emitSpy).toHaveBeenCalledWith('file.changed', events[1]);
      expect(emitSpy).toHaveBeenCalledWith('file.deleted', events[2]);
    });

    it('should do nothing when given empty array', () => {
      const emitSpy = jest.spyOn(eventEmitter, 'emit');

      appEventEmitter.publishMany([]);

      expect(emitSpy).not.toHaveBeenCalled();
    });
  });

  describe('event listeners', () => {
    it('should allow listeners to receive published events via OnEvent', async () => {
      const receivedEvents: DomainEvent[] = [];

      eventEmitter.on('file.added', (event: DomainEvent) => {
        receivedEvents.push(event);
      });

      const eventResult = FileAddedEvent.of('/test/listener.md');
      const event = eventResult.getValue();

      appEventEmitter.publish(event);

      await new Promise(resolve => process.nextTick(resolve));

      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0]).toBe(event);
      expect((event as FileAddedEvent).path).toBe('/test/listener.md');
    });
  });
});
