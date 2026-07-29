import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';

const MNEMOSYNE_PORT = 8765;
const MNEMOSYNE_DATA_DIR = path.join(os.tmpdir(), 'rag-e2e-mnemosyne-data');

export async function startMnemosyne(): Promise<() => Promise<void>> {
  await fs.mkdir(MNEMOSYNE_DATA_DIR, { recursive: true });

  const proc = spawn('python3', ['-c', `
import sys
sys.path.insert(0, '/Users/oleksii.honchar/Library/Python/3.9/lib/python/site-packages')
from mnemosyne.mcp_server import run_mcp_server
import os
os.environ['MNEMOSYNE_DATA_DIR'] = '${MNEMOSYNE_DATA_DIR}'
run_mcp_server(transport='sse', port=${MNEMOSYNE_PORT})
`], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Mnemosyne startup timeout')), 30000);
    proc.stdout?.on('data', (data) => {
      const text = data.toString();
      if (text.includes('ready') || text.includes('started') || text.includes('listening') || text.includes('SSE')) {
        clearTimeout(timeout);
        resolve();
      }
    });
    proc.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });

  return async () => {
    proc.kill('SIGTERM');
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, 5000);
      proc.on('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
    await fs.rm(MNEMOSYNE_DATA_DIR, { recursive: true, force: true }).catch(() => {});
  };
}
