import { createServer, IncomingMessage, ServerResponse, Server } from 'http';
import * as net from 'net';

const DEFAULT_PORT = 8765;

let server: Server | null = null;
let usedPort = 0;
let ingestedChunks: Array<{ text: string; metadata: Record<string, unknown> }> = [];

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const tmp = net.createServer();
    tmp.listen(0, '127.0.0.1', () => {
      const addr = tmp.address();
      if (typeof addr === 'object' && addr != null && 'port' in addr) {
        tmp.close(() => resolve(addr.port));
      } else {
        tmp.close(() => reject(new Error('Failed to get free port')));
      }
    });
    tmp.on('error', reject);
  });
}

function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  let body = '';

  req.on('data', (chunk: Buffer) => {
    body += chunk.toString();
  });

  req.on('end', () => {
    try {
      const parsed = JSON.parse(body);

      if (parsed.method === 'ping') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id: parsed.id, result: {} }));
        return;
      }

      if (parsed.method === 'tools/call' && parsed.params?.name === 'memory_remember') {
        const args = parsed.params.arguments;
        ingestedChunks.push({
          text: args.text,
          metadata: args.metadata,
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            id: parsed.id,
            result: {
              content: [{ type: 'text', text: JSON.stringify({ id: args.metadata?.id }) }],
            },
          }),
        );
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          id: parsed.id,
          error: { code: -32601, message: 'Method not found' },
        }),
      );
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32700, message: 'Parse error' },
        }),
      );
    }
  });
}

export async function startMnemosyne(): Promise<string> {
  if (server != null) {
    return `http://127.0.0.1:${usedPort}/mcp`;
  }

  const port = await findFreePort();
  usedPort = port;
  ingestedChunks = [];

  server = createServer(handleRequest);
  await new Promise<void>((resolve, reject) => {
    server!.listen(port, '127.0.0.1', () => resolve());
    server!.on('error', reject);
  });

  return `http://127.0.0.1:${usedPort}/mcp`;
}

export async function stopMnemosyne(): Promise<void> {
  if (server != null) {
    await new Promise<void>((resolve) => {
      server!.close(() => resolve());
    });
    server = null;
    usedPort = 0;
  }
}

export function getIngestedChunks(): ReadonlyArray<{
  text: string;
  metadata: Record<string, unknown>;
}> {
  return ingestedChunks;
}

export function clearIngestedChunks(): void {
  ingestedChunks = [];
}
