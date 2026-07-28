import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

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
 * Creates sample markdown content for testing.
 */
export function sampleMarkdownContent(): string {
  return `# Project Overview

## Introduction

This is a sample markdown document for testing the RAG content chunker.

## Features

- Feature 1: File watching
- Feature 2: Content chunking
- Feature 3: MCP integration

## Configuration

Configure the chunker via \`~/.config/rag-content-chunker.yaml\`.

## Getting Started

Run \`npx rag-content-chunker\` to start the service.
`;
}

/**
 * Creates sample TypeScript code for testing.
 */
export function sampleCodeContent(): string {
  return `import { Injectable } from '@nestjs/common';

@Injectable()
export class ExampleService {
  async processData(input: string): Promise<string> {
    const result = input.toUpperCase();
    return result;
  }

  private validate(input: string): boolean {
    return input.length > 0;
  }
}
`;
}

/**
 * Creates sample JSON config for testing.
 */
export function sampleConfigContent(): string {
  return `{
  "database": {
    "host": "localhost",
    "port": 5432,
    "name": "testdb"
  },
  "cache": {
    "enabled": true,
    "ttl": 3600
  },
  "logging": {
    "level": "info",
    "format": "json"
  }
}`;
}

/**
 * Creates sample plain text content for testing.
 */
export function sampleTextContent(): string {
  return `This is a sample plain text document for testing purposes.

It contains multiple paragraphs separated by blank lines.

The chunker should handle this content appropriately by splitting on paragraph boundaries.

Each paragraph represents a logical unit of information that can be processed independently.`;
}
