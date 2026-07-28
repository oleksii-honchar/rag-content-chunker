import { ValuesType } from '../../utils/values-type';

export const CHUNKING_STRATEGIES = {
  MARKDOWN: 'markdown' as const,
  RECURSIVE: 'recursive' as const,
  SENTENCE: 'sentence' as const,
  CONFIG: 'config' as const,
  SINGLE: 'single' as const,
  FALLBACK: 'fallback' as const,
} as const;

export type ChunkingStrategy = ValuesType<typeof CHUNKING_STRATEGIES>;
