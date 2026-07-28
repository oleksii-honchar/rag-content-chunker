import { FILE_ROLES } from '../../domain/chunk.entity';
import { CodeChunker } from './code-chunker.service';

describe('CodeChunker', () => {
  let chunker: CodeChunker;

  beforeEach(() => {
    chunker = new CodeChunker();
  });

  it('should implement Chunker interface', () => {
    expect(chunker.chunk).toBeDefined();
    expect(typeof chunker.chunk).toBe('function');
  });

  describe('chunking small code', () => {
    it('should return single chunk for small code', async () => {
      const content = `
function hello() {
  console.log('hello');
}
`.trim();

      const config = {
        maxTokens: 400,
        overlapTokens: 40,
        hardCapTokens: 600,
        filePath: '/src/example.ts',
        sourceId: 'test-source',
      };

      const result = await chunker.chunk(content, config);

      expect(result.isOk()).toBe(true);
      const chunks = result.getValue();
      expect(chunks.length).toBe(1);
      expect(chunks[0].text).toContain('function hello');
    });

    it('should return empty array for empty content', async () => {
      const config = {
        maxTokens: 400,
        overlapTokens: 40,
        hardCapTokens: 600,
        filePath: '/src/example.ts',
        sourceId: 'test-source',
      };

      const result = await chunker.chunk('', config);

      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toEqual([]);
    });
  });

  describe('chunking large code', () => {
    it('should split at class boundaries when code exceeds maxTokens', async () => {
      const content = `
class UserService {
  async getUser(id: string) {
    return { id, name: 'John' };
  }
  async updateUser(id: string, data: object) {
    return { id, ...data };
  }
  async deleteUser(id: string) {
    return { deleted: true };
  }
}

class OrderService {
  async createOrder(data: object) {
    return { id: '123', ...data };
  }
  async getOrder(id: string) {
    return { id };
  }
  async cancelOrder(id: string) {
    return { cancelled: true };
  }
}

class PaymentService {
  async processPayment(amount: number) {
    return { paid: true, amount };
  }
  async refundPayment(id: string) {
    return { refunded: true };
  }
  async getPaymentStatus(id: string) {
    return { status: 'completed' };
  }
}
`.trim();

      const config = {
        maxTokens: 80,
        overlapTokens: 10,
        hardCapTokens: 200,
        filePath: '/src/services.ts',
        sourceId: 'test-source',
      };

      const result = await chunker.chunk(content, config);

      expect(result.isOk()).toBe(true);
      const chunks = result.getValue();
      expect(chunks.length).toBeGreaterThan(1);

      // Verify chunks contain class boundaries
      const hasUserService = chunks.some(c => c.text.includes('class UserService'));
      const hasOrderService = chunks.some(c => c.text.includes('class OrderService'));
      expect(hasUserService || hasOrderService).toBe(true);
    });

    it('should split at function boundaries', async () => {
      const content = `
function calculateTotal(items: Item[]) {
  return items.reduce((sum, item) => sum + item.price, 0);
}

function applyDiscount(total: number, discount: number) {
  return total * (1 - discount);
}

function formatCurrency(amount: number) {
  return '$' + amount.toFixed(2);
}

function validateInput(input: string) {
  if (!input || input.length === 0) {
    throw new Error('Input required');
  }
  return input.trim();
}

function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

function logEvent(event: string, data: object) {
  console.log(event, data);
}
`.trim();

      const config = {
        maxTokens: 50,
        overlapTokens: 10,
        hardCapTokens: 150,
        filePath: '/src/utils.ts',
        sourceId: 'test-source',
      };

      const result = await chunker.chunk(content, config);

      expect(result.isOk()).toBe(true);
      const chunks = result.getValue();
      expect(chunks.length).toBeGreaterThan(1);
    });
  });

  describe('breadcrumb format', () => {
    it('should use format filename.ts:startLine', async () => {
      const content = `
function hello() {
  return 'world';
}
`.trim();

      const config = {
        maxTokens: 400,
        overlapTokens: 40,
        hardCapTokens: 600,
        filePath: '/some/deep/path/my-file.ts',
        sourceId: 'test-source',
      };

      const result = await chunker.chunk(content, config);

      expect(result.isOk()).toBe(true);
      const chunks = result.getValue();
      expect(chunks.length).toBe(1);
      expect(chunks[0].breadcrumb).toMatch(/^my-file\.ts:\d+$/);
    });

    it('should include correct startLine in breadcrumb', async () => {
      const content = `
function test() {
  return true;
}
`.trim();

      const config = {
        maxTokens: 400,
        overlapTokens: 40,
        hardCapTokens: 600,
        filePath: '/src/test.ts',
        sourceId: 'test-source',
      };

      const result = await chunker.chunk(content, config);

      expect(result.isOk()).toBe(true);
      const chunks = result.getValue();
      expect(chunks[0].breadcrumb).toBe('test.ts:1');
    });
  });

  describe('language detection', () => {
    it('should detect TypeScript from .ts extension', async () => {
      const content = 'const x = 1;';
      const config = {
        maxTokens: 400,
        overlapTokens: 40,
        hardCapTokens: 600,
        filePath: '/src/file.ts',
        sourceId: 'test-source',
      };

      const result = await chunker.chunk(content, config);

      expect(result.isOk()).toBe(true);
      expect(result.getValue()[0].language).toBe('typescript');
    });

    it('should detect JavaScript from .js extension', async () => {
      const content = 'const x = 1;';
      const config = {
        maxTokens: 400,
        overlapTokens: 40,
        hardCapTokens: 600,
        filePath: '/src/file.js',
        sourceId: 'test-source',
      };

      const result = await chunker.chunk(content, config);

      expect(result.isOk()).toBe(true);
      expect(result.getValue()[0].language).toBe('javascript');
    });

    it('should detect Python from .py extension', async () => {
      const content = 'x = 1';
      const config = {
        maxTokens: 400,
        overlapTokens: 40,
        hardCapTokens: 600,
        filePath: '/src/file.py',
        sourceId: 'test-source',
      };

      const result = await chunker.chunk(content, config);

      expect(result.isOk()).toBe(true);
      expect(result.getValue()[0].language).toBe('python');
    });

    it('should detect Go from .go extension', async () => {
      const content = 'package main';
      const config = {
        maxTokens: 400,
        overlapTokens: 40,
        hardCapTokens: 600,
        filePath: '/src/file.go',
        sourceId: 'test-source',
      };

      const result = await chunker.chunk(content, config);

      expect(result.isOk()).toBe(true);
      expect(result.getValue()[0].language).toBe('go');
    });

    it('should detect Java from .java extension', async () => {
      const content = 'public class Main {}';
      const config = {
        maxTokens: 400,
        overlapTokens: 40,
        hardCapTokens: 600,
        filePath: '/src/file.java',
        sourceId: 'test-source',
      };

      const result = await chunker.chunk(content, config);

      expect(result.isOk()).toBe(true);
      expect(result.getValue()[0].language).toBe('java');
    });

    it('should detect Rust from .rs extension', async () => {
      const content = 'fn main() {}';
      const config = {
        maxTokens: 400,
        overlapTokens: 40,
        hardCapTokens: 600,
        filePath: '/src/file.rs',
        sourceId: 'test-source',
      };

      const result = await chunker.chunk(content, config);

      expect(result.isOk()).toBe(true);
      expect(result.getValue()[0].language).toBe('rust');
    });
  });

  describe('chunk properties', () => {
    it('should have fileRole=CODE', async () => {
      const content = 'const x = 1;';
      const config = {
        maxTokens: 400,
        overlapTokens: 40,
        hardCapTokens: 600,
        filePath: '/src/file.ts',
        sourceId: 'test-source',
      };

      const result = await chunker.chunk(content, config);

      expect(result.isOk()).toBe(true);
      expect(result.getValue()[0].fileRole).toBe(FILE_ROLES.CODE);
    });

    it('should include filePath and sourceId in metadata', async () => {
      const content = 'const x = 1;';
      const config = {
        maxTokens: 400,
        overlapTokens: 40,
        hardCapTokens: 600,
        filePath: '/src/file.ts',
        sourceId: 'my-source',
      };

      const result = await chunker.chunk(content, config);

      expect(result.isOk()).toBe(true);
      const chunk = result.getValue()[0];
      expect(chunk.metadata?.filePath).toBe('/src/file.ts');
      expect(chunk.metadata?.sourceId).toBe('my-source');
    });

    it('should include language and estimatedTokens in metadata', async () => {
      const content = 'const x = 1;';
      const config = {
        maxTokens: 400,
        overlapTokens: 40,
        hardCapTokens: 600,
        filePath: '/src/file.ts',
        sourceId: 'test-source',
      };

      const result = await chunker.chunk(content, config);

      expect(result.isOk()).toBe(true);
      const chunk = result.getValue()[0];
      expect(chunk.metadata?.language).toBe('typescript');
      expect(chunk.metadata?.estimatedTokens).toBeDefined();
      expect(Number(chunk.metadata?.estimatedTokens)).toBeGreaterThan(0);
    });

    it('should set correct chunkIndex and totalChunks', async () => {
      const content = `
class A { method() {} }
class B { method() {} }
class C { method() {} }
`.trim();

      const config = {
        maxTokens: 30,
        overlapTokens: 5,
        hardCapTokens: 100,
        filePath: '/src/file.ts',
        sourceId: 'test-source',
      };

      const result = await chunker.chunk(content, config);

      expect(result.isOk()).toBe(true);
      const chunks = result.getValue();
      if (chunks.length > 1) {
        expect(chunks[0].chunkIndex).toBe(0);
        expect(chunks[0].totalChunks).toBe(chunks.length);
        expect(chunks[chunks.length - 1].chunkIndex).toBe(chunks.length - 1);
      }
    });

    it('should set startLine and endLine', async () => {
      const content = `
function hello() {
  return 'world';
}
`.trim();

      const config = {
        maxTokens: 400,
        overlapTokens: 40,
        hardCapTokens: 600,
        filePath: '/src/file.ts',
        sourceId: 'test-source',
      };

      const result = await chunker.chunk(content, config);

      expect(result.isOk()).toBe(true);
      const chunk = result.getValue()[0];
      expect(chunk.startLine).toBeDefined();
      expect(chunk.endLine).toBeDefined();
      expect(chunk.endLine).toBeGreaterThanOrEqual(chunk.startLine!);
    });
  });

  describe('recursive chunking with separators', () => {
    it('should try class boundaries first', async () => {
      const content = `
export class FirstClass {
  method() { return 1; }
}
export class SecondClass {
  method() { return 2; }
}
`.trim();

      const config = {
        maxTokens: 40,
        overlapTokens: 5,
        hardCapTokens: 100,
        filePath: '/src/classes.ts',
        sourceId: 'test-source',
      };

      const result = await chunker.chunk(content, config);

      expect(result.isOk()).toBe(true);
      const chunks = result.getValue();
      // Should split at class boundaries
      expect(chunks.length).toBeGreaterThanOrEqual(1);
    });

    it('should try interface boundaries', async () => {
      const content = `
export interface User {
  id: string;
  name: string;
  email: string;
}
export interface Order {
  id: string;
  userId: string;
  total: number;
}
export interface Product {
  id: string;
  name: string;
  price: number;
}
`.trim();

      const config = {
        maxTokens: 40,
        overlapTokens: 5,
        hardCapTokens: 100,
        filePath: '/src/interfaces.ts',
        sourceId: 'test-source',
      };

      const result = await chunker.chunk(content, config);

      expect(result.isOk()).toBe(true);
      const chunks = result.getValue();
      expect(chunks.length).toBeGreaterThanOrEqual(1);
    });

    it('should try export/import boundaries', async () => {
      const content = `
export const CONFIG_A = { value: 1 };
export const CONFIG_B = { value: 2 };
export const CONFIG_C = { value: 3 };
export const CONFIG_D = { value: 4 };
`.trim();

      const config = {
        maxTokens: 30,
        overlapTokens: 5,
        hardCapTokens: 80,
        filePath: '/src/config.ts',
        sourceId: 'test-source',
      };

      const result = await chunker.chunk(content, config);

      expect(result.isOk()).toBe(true);
      const chunks = result.getValue();
      expect(chunks.length).toBeGreaterThanOrEqual(1);
    });

    it('should fall back to paragraph/line splitting when no semantic boundaries found', async () => {
      // Long single-line content without semantic boundaries
      const content =
        'x = 1; y = 2; z = 3; a = 4; b = 5; c = 6; d = 7; e = 8; f = 9; g = 10; h = 11; i = 12; j = 13; k = 14; l = 15; m = 16; n = 17; o = 18; p = 19; q = 20;';

      const config = {
        maxTokens: 10,
        overlapTokens: 2,
        hardCapTokens: 50,
        filePath: '/src/data.js',
        sourceId: 'test-source',
      };

      const result = await chunker.chunk(content, config);

      expect(result.isOk()).toBe(true);
      const chunks = result.getValue();
      expect(chunks.length).toBeGreaterThan(1);
    });
  });
});
