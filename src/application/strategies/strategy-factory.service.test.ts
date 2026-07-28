import { CHUNKING_STRATEGIES } from './chunking-strategies';
import { CodeChunker } from './code-chunker.service';
import { ConfigChunker } from './config-chunker.service';
import { MarkdownChunker } from './markdown-chunker.service';
import { StrategyFactory } from './strategy-factory.service';
import { TextChunker } from './text-chunker.service';

describe('StrategyFactory', () => {
  let factory: StrategyFactory;
  let mockMarkdownChunker: MarkdownChunker;
  let mockCodeChunker: CodeChunker;
  let mockTextChunker: TextChunker;
  let mockConfigChunker: ConfigChunker;

  beforeEach(() => {
    mockMarkdownChunker = new MarkdownChunker();
    mockCodeChunker = new CodeChunker();
    mockTextChunker = new TextChunker();
    mockConfigChunker = new ConfigChunker();
    factory = new StrategyFactory(mockMarkdownChunker, mockCodeChunker, mockTextChunker, mockConfigChunker);
  });

  describe('determineStrategy', () => {
    describe('markdown files', () => {
      it('should return MARKDOWN strategy for .md files', () => {
        expect(factory.determineStrategy('README.md')).toBe(CHUNKING_STRATEGIES.MARKDOWN);
      });

      it('should return MARKDOWN strategy for .mdx files', () => {
        expect(factory.determineStrategy('page.mdx')).toBe(CHUNKING_STRATEGIES.MARKDOWN);
      });

      it('should return MARKDOWN strategy for nested .md files', () => {
        expect(factory.determineStrategy('/path/to/docs/notes.md')).toBe(CHUNKING_STRATEGIES.MARKDOWN);
      });
    });

    describe('code files - recursive', () => {
      it('should return RECURSIVE strategy for .ts files', () => {
        expect(factory.determineStrategy('index.ts')).toBe(CHUNKING_STRATEGIES.RECURSIVE);
      });

      it('should return RECURSIVE strategy for .tsx files', () => {
        expect(factory.determineStrategy('App.tsx')).toBe(CHUNKING_STRATEGIES.RECURSIVE);
      });

      it('should return RECURSIVE strategy for .js files', () => {
        expect(factory.determineStrategy('script.js')).toBe(CHUNKING_STRATEGIES.RECURSIVE);
      });

      it('should return RECURSIVE strategy for .jsx files', () => {
        expect(factory.determineStrategy('Component.jsx')).toBe(CHUNKING_STRATEGIES.RECURSIVE);
      });

      it('should return RECURSIVE strategy for .py files', () => {
        expect(factory.determineStrategy('app.py')).toBe(CHUNKING_STRATEGIES.RECURSIVE);
      });

      it('should return RECURSIVE strategy for .go files', () => {
        expect(factory.determineStrategy('main.go')).toBe(CHUNKING_STRATEGIES.RECURSIVE);
      });

      it('should return RECURSIVE strategy for .java files', () => {
        expect(factory.determineStrategy('Application.java')).toBe(CHUNKING_STRATEGIES.RECURSIVE);
      });

      it('should return RECURSIVE strategy for .rs files', () => {
        expect(factory.determineStrategy('lib.rs')).toBe(CHUNKING_STRATEGIES.RECURSIVE);
      });

      it('should return RECURSIVE strategy for .cs files', () => {
        expect(factory.determineStrategy('Program.cs')).toBe(CHUNKING_STRATEGIES.RECURSIVE);
      });

      it('should return RECURSIVE strategy for .php files', () => {
        expect(factory.determineStrategy('index.php')).toBe(CHUNKING_STRATEGIES.RECURSIVE);
      });
    });

    describe('config files', () => {
      it('should return CONFIG strategy for .json files', () => {
        expect(factory.determineStrategy('package.json')).toBe(CHUNKING_STRATEGIES.CONFIG);
      });

      it('should return CONFIG strategy for .yml files', () => {
        expect(factory.determineStrategy('config.yml')).toBe(CHUNKING_STRATEGIES.CONFIG);
      });

      it('should return CONFIG strategy for .yaml files', () => {
        expect(factory.determineStrategy('docker-compose.yaml')).toBe(CHUNKING_STRATEGIES.CONFIG);
      });

      it('should return CONFIG strategy for .toml files', () => {
        expect(factory.determineStrategy('Cargo.toml')).toBe(CHUNKING_STRATEGIES.CONFIG);
      });
    });

    describe('single chunk files', () => {
      it('should return SINGLE strategy for .env files', () => {
        expect(factory.determineStrategy('.env')).toBe(CHUNKING_STRATEGIES.SINGLE);
      });

      it('should return SINGLE strategy for .env.local files', () => {
        expect(factory.determineStrategy('.env.local')).toBe(CHUNKING_STRATEGIES.SINGLE);
      });
    });

    describe('text files', () => {
      it('should return SENTENCE strategy for .txt files', () => {
        expect(factory.determineStrategy('notes.txt')).toBe(CHUNKING_STRATEGIES.SENTENCE);
      });
    });

    describe('fallback', () => {
      it('should return FALLBACK strategy for unknown extensions', () => {
        expect(factory.determineStrategy('file.unknown')).toBe(CHUNKING_STRATEGIES.FALLBACK);
      });

      it('should return FALLBACK strategy for files without extension', () => {
        expect(factory.determineStrategy('Dockerfile')).toBe(CHUNKING_STRATEGIES.FALLBACK);
      });

      it('should return FALLBACK strategy for binary-like extensions', () => {
        expect(factory.determineStrategy('image.png')).toBe(CHUNKING_STRATEGIES.FALLBACK);
      });
    });

    describe('case insensitivity', () => {
      it('should handle uppercase extensions', () => {
        expect(factory.determineStrategy('README.MD')).toBe(CHUNKING_STRATEGIES.MARKDOWN);
      });

      it('should handle mixed case extensions', () => {
        expect(factory.determineStrategy('file.Ts')).toBe(CHUNKING_STRATEGIES.RECURSIVE);
      });
    });
  });

  describe('createChunker', () => {
    it('should return Result.ok with MarkdownChunker for MARKDOWN strategy', () => {
      const result = factory.createChunker(CHUNKING_STRATEGIES.MARKDOWN);
      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toBe(mockMarkdownChunker);
    });

    it('should return Result.ok with CodeChunker for RECURSIVE strategy', () => {
      const result = factory.createChunker(CHUNKING_STRATEGIES.RECURSIVE);
      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toBe(mockCodeChunker);
    });

    it('should return Result.ok with TextChunker for SENTENCE strategy', () => {
      const result = factory.createChunker(CHUNKING_STRATEGIES.SENTENCE);
      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toBe(mockTextChunker);
    });

    it('should return Result.ok with TextChunker for FALLBACK strategy', () => {
      const result = factory.createChunker(CHUNKING_STRATEGIES.FALLBACK);
      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toBe(mockTextChunker);
    });

    it('should return Result.ok with ConfigChunker for CONFIG strategy', () => {
      const result = factory.createChunker(CHUNKING_STRATEGIES.CONFIG);
      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toBe(mockConfigChunker);
    });

    it('should return Result.ok with ConfigChunker for SINGLE strategy', () => {
      const result = factory.createChunker(CHUNKING_STRATEGIES.SINGLE);
      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toBe(mockConfigChunker);
    });

    it('should return Result.ko for unknown strategy', () => {
      const result = factory.createChunker('unknown' as any);
      expect(result.isKo()).toBe(true);
      expect(result.getError().code).toBe('UnknownStrategy');
    });
  });
});
