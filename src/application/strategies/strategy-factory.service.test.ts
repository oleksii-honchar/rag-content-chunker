import { CHUNKING_STRATEGIES } from './chunking-strategies';
import { StrategyFactory } from './strategy-factory.service';

describe('StrategyFactory', () => {
  let factory: StrategyFactory;

  beforeEach(() => {
    factory = new StrategyFactory();
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
    it('should return Result.ko for MARKDOWN strategy (not yet implemented)', () => {
      const result = factory.createChunker(CHUNKING_STRATEGIES.MARKDOWN);
      expect(result.isKo()).toBe(true);
      expect(result.getError().message).toContain('markdown');
    });

    it('should return Result.ko for RECURSIVE strategy (not yet implemented)', () => {
      const result = factory.createChunker(CHUNKING_STRATEGIES.RECURSIVE);
      expect(result.isKo()).toBe(true);
      expect(result.getError().message).toContain('recursive');
    });

    it('should return Result.ko for SENTENCE strategy (not yet implemented)', () => {
      const result = factory.createChunker(CHUNKING_STRATEGIES.SENTENCE);
      expect(result.isKo()).toBe(true);
      expect(result.getError().message).toContain('sentence');
    });

    it('should return Result.ko for CONFIG strategy (not yet implemented)', () => {
      const result = factory.createChunker(CHUNKING_STRATEGIES.CONFIG);
      expect(result.isKo()).toBe(true);
      expect(result.getError().message).toContain('config');
    });

    it('should return Result.ko for SINGLE strategy (not yet implemented)', () => {
      const result = factory.createChunker(CHUNKING_STRATEGIES.SINGLE);
      expect(result.isKo()).toBe(true);
      expect(result.getError().message).toContain('single');
    });

    it('should return Result.ko for FALLBACK strategy (not yet implemented)', () => {
      const result = factory.createChunker(CHUNKING_STRATEGIES.FALLBACK);
      expect(result.isKo()).toBe(true);
      expect(result.getError().message).toContain('fallback');
    });
  });
});
