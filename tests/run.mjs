#!/usr/bin/env node
//
// The test suite for index.html. See tests/README.md.
//
//     node tests/run.mjs [--filter <text>] [--headed] [--screenshots <dir>]
//
// Requires Node 22+ (for the global WebSocket) and a local Chrome. Nothing to
// install: the tool has no dependencies and neither do its tests.

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { access, mkdir } from 'node:fs/promises';

import { launch } from './lib/browser.mjs';
import { serve } from './lib/server.mjs';
import { connect } from './lib/cdp.mjs';
import { createPage, createRecorder } from './lib/harness.mjs';

import * as focus from './suites/focus.mjs';
import * as widgets from './suites/widgets.mjs';
import * as resilience from './suites/resilience.mjs';

const SUITES = [focus, widgets, resilience];

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => { const i = args.indexOf(name); return i === -1 ? null : args[i + 1]; };

const exists = async (p) => { try { await access(p); return true; } catch { return false; } };

// Each app is a route table. Nothing outside it is reachable, which is how the
// user's private data/local.js is kept out of the run — and how the "no data
// file" case is produced, by simply not listing one.
const APPS = {
  example: {
    '/index.html': join(repoRoot, 'index.html'),
    '/data/example.js': join(repoRoot, 'data', 'example.js'),
  },
  'edge-cases': {
    '/index.html': join(repoRoot, 'index.html'),
    '/data/local.js': join(here, 'fixtures', 'edge-cases.js'),
  },
  noData: {
    '/index.html': join(repoRoot, 'index.html'),
  },
};

async function main() {
  const selected = SUITES.filter((s) => !value('--filter') || s.name.includes(value('--filter')));
  if (!selected.length) {
    console.error(`No suite matches --filter ${value('--filter')}`);
    console.error('Available: ' + SUITES.map((s) => s.name).join(', '));
    process.exit(2);
  }

  const shotDir = value('--screenshots');
  if (shotDir) await mkdir(shotDir, { recursive: true });

  const servers = {};
  for (const [name, routes] of Object.entries(APPS)) servers[name] = await serve(routes);

  const browser = await launch({ headed: flag('--headed') });
  const cdp = await connect(browser.port);
  const page = await createPage(cdp);
  const t = createRecorder();

  const ctx = {
    repoRoot,
    hasLocalData: await exists(join(repoRoot, 'data', 'local.js')),
    origins: { example: servers.example.origin, edgeCases: servers['edge-cases'].origin, noData: servers.noData.origin },
  };

  console.log(`\ndataflow tests — Chrome on port ${browser.port}${ctx.hasLocalData ? ', data/local.js present' : ''}`);

  try {
    for (const suite of selected) {
      console.log(`\n${suite.name}`);
      const origin = servers[suite.app].origin;
      // A suite that loads its own pages (resilience) says so by not relying on
      // this; the rest get a freshly loaded diagram.
      if (suite.app !== 'edge-cases') await page.goto(`${origin}/index.html`);
      await suite.run(page, t, { ...ctx, origin });
      if (shotDir) await page.screenshot(join(shotDir, `${suite.name.replace(/\W+/g, '-')}.png`));
    }

    t.section('console');
    t.eq('no javascript errors during the run', page.errors(), []);
  } catch (err) {
    t.section('runner');
    t.ok(`the run completed without throwing`, false, String(err && err.stack || err));
  } finally {
    cdp.close();
    await browser.close();
    await Promise.all(Object.values(servers).map((s) => s.close()));
  }

  const { passed, failures } = t;
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  ${f.section} › ${f.name}`);
  }
  process.exit(failures.length ? 1 : 0);
}

main();
