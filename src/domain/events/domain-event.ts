import { ValuesType } from '../../utils/values-type';

export interface DomainEvent {
  readonly type: string;
  readonly timestamp: Date;
}

export const FILE_EVENTS = {
  ADDED: 'file.added' as const,
  CHANGED: 'file.changed' as const,
  DELETED: 'file.deleted' as const,
} as const;

export type FileEventType = ValuesType<typeof FILE_EVENTS>;
