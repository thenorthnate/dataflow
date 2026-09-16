// Launching and disposing of a headless Chrome.

import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CANDIDATES = [
  process.env.CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);

async function findChrome() {
  const { access } = await import('node:fs/promises');
  for (const path of CANDIDATES) {
    try { await access(path); return path; } catch { /* keep looking */ }
  }
  throw new Error(
    'Could not find Chrome. Set CHROME=/path/to/chrome and try again.\n' +
    'Looked in:\n  ' + CANDIDATES.join('\n  ')
  );
}

export async function launch({ headed = false } = {}) {
  const binary = await findChrome();
  const profile = await mkdtemp(join(tmpdir(), 'dataflow-tests-'));

  // Port 0 makes Chrome choose a free port and write it to DevToolsActivePort,
  // so concurrent runs and an already-running Chrome can't collide.
  const proc = spawn(binary, [
    headed ? '--headless=false' : '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    '--window-size=1400,900',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    // The loader probes for a data file that is deliberately absent, and the
    // page is served from a local origin; neither needs the network.
    '--disable-background-networking',
    'about:blank',
  ], { stdio: 'ignore' });

  const port = await readPort(profile, proc);
  return {
    port,
    close: async () => {
      proc.kill();
      await rm(profile, { recursive: true, force: true }).catch(() => {});
    },
  };
}

async function readPort(profile, proc, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) throw new Error(`Chrome exited early (code ${proc.exitCode})`);
    try {
      const text = await readFile(join(profile, 'DevToolsActivePort'), 'utf8');
      const port = Number(text.split('\n')[0]);
      if (port) return port;
    } catch { /* not written yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Chrome never reported a debugging port');
}
