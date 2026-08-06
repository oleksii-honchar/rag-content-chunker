import { AppEventEmitter } from './app-event-emitter';

export function aAppEventEmitter(
  overrides: Partial<jest.Mocked<AppEventEmitter>> = {},
): jest.Mocked<AppEventEmitter> {
  const mock = {
    publish: jest.fn(),
    publishMany: jest.fn(),
    ...overrides,
  } as unknown as jest.Mocked<AppEventEmitter>;

  return mock;
}
