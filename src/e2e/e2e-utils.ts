import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

/**
 * Absolute paths to e2e fixture files.
 */
export const FIXTURES_DIR = path.resolve(__dirname, 'fixtures');
export const FIXTURE_MARKDOWN = path.join(FIXTURES_DIR, 'sample.md');
export const FIXTURE_TYPESCRIPT = path.join(FIXTURES_DIR, 'sample.ts');
export const FIXTURE_JSON = path.join(FIXTURES_DIR, 'sample.json');
export const FIXTURE_YAML = path.join(FIXTURES_DIR, 'sample.yaml');
export const FIXTURE_TEXT = path.join(FIXTURES_DIR, 'sample.txt');

/**
 * Creates a temporary directory for e2e test files.
 * Directory is NOT auto-cleaned — call cleanupTempDir when done.
 */
export async function createTempDir(prefix = 'rag-e2e-'): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

/**
 * Cleans up a temporary directory created by createTempDir.
 */
export async function cleanupTempDir(dirPath: string): Promise<void> {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Creates a sample file in the given directory with the specified content.
 */
export async function createSampleFile(dirPath: string, fileName: string, content: string): Promise<string> {
  const filePath = path.join(dirPath, fileName);
  await fs.writeFile(filePath, content, 'utf-8');
  return filePath;
}

/**
 * Reads content from a fixture file.
 */
export async function readFixture(fixturePath: string): Promise<string> {
  return fs.readFile(fixturePath, 'utf-8');
}

/**
 * Reads sample markdown content from fixture.
 */
export async function sampleMarkdownContent(): Promise<string> {
  return readFixture(FIXTURE_MARKDOWN);
}

/**
 * Reads sample TypeScript code from fixture.
 */
export async function sampleCodeContent(): Promise<string> {
  return readFixture(FIXTURE_TYPESCRIPT);
}

/**
 * Reads sample JSON config from fixture.
 */
export async function sampleConfigContent(): Promise<string> {
  return readFixture(FIXTURE_JSON);
}

/**
 * Reads sample YAML config from fixture.
 */
export async function sampleYamlContent(): Promise<string> {
  return readFixture(FIXTURE_YAML);
}

/**
 * Reads sample plain text content from fixture.
 */
export async function sampleTextContent(): Promise<string> {
  return readFixture(FIXTURE_TEXT);
}
