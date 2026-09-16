// A static server with an explicit route table.
//
// Routes are explicit rather than "serve the repo directory" for one important
// reason: the loader prefers data/local.js over data/example.js, and on a real
// machine data/local.js is the user's private diagram. Serving the repo root
// would make the tests run against whatever infrastructure that person happens
// to have mapped — different every time, and none of it ours to read. So each
// suite names exactly which files exist, and everything else 404s (which is
// itself a path worth testing: it's how the setup screen is reached).

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

export async function serve(routes) {
  const server = createServer(async (req, res) => {
    const path = req.url.split('?')[0];
    const file = routes[path];
    if (!file) { res.writeHead(404); res.end('not found'); return; }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404); res.end('not found');
    }
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
