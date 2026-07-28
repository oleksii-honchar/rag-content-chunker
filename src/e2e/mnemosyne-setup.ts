import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

const MNEMOSYNE_PORT = 8765;
const MNEMOSYNE_VENV_DIR = path.join(os.tmpdir(), 'rag-e2e-mnemosyne-venv');
const MNEMOSYNE_DATA_DIR = path.join(os.tmpdir(), 'rag-e2e-mnemosyne-data');

let mnemosyneProcess: ReturnType<typeof spawn> | null = null;
let cleanupDone = false;

async function ensureVenv(): Promise<void> {
  const venvExists = await fs
    .access(MNEMOSYNE_VENV_DIR)
    .then(() => true)
    .catch(() => false);

  if (venvExists) {
    return;
  }

  console.log('[E2E] Creating Mnemosyne Python venv...');

  const python312 = '/opt/homebrew/bin/python3.12';
  const pythonExists = await fs
    .access(python312)
    .then(() => true)
    .catch(() => false);

  if (!pythonExists) {
    throw new Error(
      `Python 3.12 not found at ${python312}. Install via: brew install python@3.12`,
    );
  }

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(python312, ['-m', 'venv', MNEMOSYNE_VENV_DIR], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`venv creation failed with code ${code}`));
    });
    proc.on('error', reject);
  });

  console.log('[E2E] Installing mnemosyne-memory[mcp]...');

  const pipPath = path.join(MNEMOSYNE_VENV_DIR, 'bin', 'pip');
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(
      pipPath,
      [
        'install',
        '--quiet',
        'mnemosyne-memory[mcp]@git+https://github.com/mnemosyne-oss/mnemosyne.git',
        'mcp>=1.0,<2.0',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );

    let stderr = '';
    proc.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`pip install failed: ${stderr}`));
    });
    proc.on('error', reject);
  });
}

async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status === 200) {
        return;
      }
    } catch {
      // Keep waiting
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Mnemosyne MCP server did not become ready at ${url}`);
}

export async function startMnemosyne(): Promise<void> {
  if (mnemosyneProcess != null) {
    return;
  }

  console.log('[E2E] Starting Mnemosyne MCP server...');

  await ensureVenv();
  await fs.mkdir(MNEMOSYNE_DATA_DIR, { recursive: true });

  const mnemosyneBin = path.join(MNEMOSYNE_VENV_DIR, 'bin', 'mnemosyne');

  mnemosyneProcess = spawn(mnemosyneBin, ['mcp', '--transport', 'sse', '--port', String(MNEMOSYNE_PORT)], {
    env: {
      ...process.env,
      MNEMOSYNE_DATA_DIR,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  mnemosyneProcess.stdout?.on('data', (data) => {
    const text = data.toString().trim();
    if (text) {
      console.log(`[E2E] Mnemosyne: ${text}`);
    }
  });

  mnemosyneProcess.stderr?.on('data', (data) => {
    const text = data.toString().trim();
    if (text) {
      console.error(`[E2E] Mnemosyne ERR: ${text}`);
    }
  });

  await waitForServer(`http://localhost:${MNEMOSYNE_PORT}/sse`, 60000);
  console.log(`[E2E] Mnemosyne MCP server ready on port ${MNEMOSYNE_PORT}`);
}

export async function stopMnemosyne(): Promise<void> {
  if (cleanupDone) {
    return;
  }
  cleanupDone = true;

  if (mnemosyneProcess != null) {
    console.log('[E2E] Stopping Mnemosyne MCP server...');
    mnemosyneProcess.kill('SIGTERM');
    mnemosyneProcess = null;
  }

  try {
    await fs.rm(MNEMOSYNE_DATA_DIR, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

export function getMnemosyneUrl(): string {
  return `http://localhost:${MNEMOSYNE_PORT}/sse`;
}
