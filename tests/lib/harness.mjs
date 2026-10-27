// The page-driving helpers, and the assertion recorder.
//
// Most of what follows exists because a simpler version of it produced a false
// failure at some point. Those reasons are written down next to each one.

// Cytoscape treats two taps inside ~250ms as a double-tap, which the app binds
// to collapse/expand. Synthetic clicks arrive far faster than human ones, so
// consecutive clicks have to be spaced past that window or a test that clicks
// two things in a row silently collapses a group instead.
const DBLTAP_GUARD = 380;
// Focus recomputes are coalesced onto a requestAnimationFrame, so styles are
// read one frame after the event that changed them, not synchronously.
const SETTLE = 200;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function createPage(cdp) {
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Page.enable');

  const logs = [];
  cdp.on((msg) => { if (msg.method === 'Log.entryAdded') logs.push(msg.params.entry); });

  // `cy` is a local inside an IIFE and is never exported, which is correct for
  // the app and inconvenient here. Proxying window.cytoscape before any page
  // script runs captures the instance without the app knowing about tests.
  // The proxy has to pass calls through untouched: cytoscape() is also how
  // extensions register themselves (cytoscape('core', name, fn)), so only a
  // single object argument means "this one is a graph instance".
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      Object.defineProperty(window, 'cytoscape', {
        configurable: true,
        get() { return this.__cyfn; },
        set(v) {
          this.__cyfn = new Proxy(v, {
            apply(target, thisArg, args) {
              const result = Reflect.apply(target, thisArg, args);
              if (args.length === 1 && args[0] && typeof args[0] === 'object') window.__cy = result;
              return result;
            },
          });
        },
      });
    `,
  });

  const page = {
    cdp,
    logs,
    sleep,
    eval: (expr) => cdp.evaluate(expr),
    json: (expr) => cdp.json(expr),

    async goto(url, { expectDiagram = true } = {}) {
      await cdp.send('Page.navigate', { url });
      await (expectDiagram ? page.waitForDiagram() : sleep(1500));
      if (expectDiagram) await page.installHelpers();
    },

    // Polls rather than sleeping a fixed amount: the page pulls Cytoscape from
    // a CDN, so how long "loaded" takes is not ours to predict.
    async waitForDiagram(timeoutMs = 20000) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (await cdp.evaluate('!!(window.__cy && window.__cy.nodes().length)')) return;
        await sleep(150);
      }
      throw new Error('the diagram never finished rendering');
    },

    installHelpers: () => cdp.evaluate(`
      // Styles come back as "rgb(r, g, b)"; compare as hex so failures read.
      window.hex = (v) => {
        const m = String(v).match(/\\d+/g);
        return m && m.length >= 3
          ? '#' + m.slice(0, 3).map((n) => (+n).toString(16).padStart(2, '0')).join('')
          : String(v);
      };
      window.lit = () => __cy.$('.lit').map((e) => e.id()).sort();
      window.st = (id, prop) => __cy.getElementById(id).style(prop);
      window.num = (id, prop) => __cy.getElementById(id).numericStyle(prop);
      window.at = (id) => {
        const el = __cy.getElementById(id);
        const box = document.getElementById('cy').getBoundingClientRect();
        const p = el.isNode() ? el.renderedPosition() : el.renderedMidpoint();
        return { x: Math.round(box.left + p.x), y: Math.round(box.top + p.y) };
      };
      // A point on the canvas clear of every element AND of the chrome floating
      // over it: the detail panel (360px, right), the legend (bottom-left) and
      // the toolbar. A hardcoded point on the right-hand side looks empty until
      // the panel opens over it, and then every "click the background" silently
      // clicks the panel instead.
      window.emptyPoint = () => {
        const box = document.getElementById('cy').getBoundingClientRect();
        const boxes = __cy.elements().map((e) => e.renderedBoundingBox());
        const clear = (x, y) => boxes.every((b) =>
          x < b.x1 - 30 || x > b.x2 + 30 || y < b.y1 - 30 || y > b.y2 + 30);
        for (let y = 20; y < box.height - 220; y += 15)
          for (let x = 30; x < box.width - 400; x += 15)
            if (clear(x, y)) return { x: Math.round(box.left + x), y: Math.round(box.top + y) };
        return null;
      };
      true;
    `),

    async mouse(type, x, y) {
      await cdp.send('Input.dispatchMouseEvent', {
        type, x, y,
        button: type === 'mouseMoved' ? 'none' : 'left',
        buttons: type === 'mousePressed' ? 1 : 0,
        clickCount: type === 'mouseMoved' ? 0 : 1,
      });
    },

    async hoverAt(x, y) { await page.mouse('mouseMoved', x, y); await sleep(SETTLE); },
    async clickAt(x, y) {
      await page.mouse('mouseMoved', x, y);
      await page.mouse('mousePressed', x, y);
      await page.mouse('mouseReleased', x, y);
      await sleep(DBLTAP_GUARD);
    },

    async hover(id) { const p = await cdp.json(`at(${JSON.stringify(id)})`); await page.hoverAt(p.x, p.y); },
    async click(id) { const p = await cdp.json(`at(${JSON.stringify(id)})`); await page.clickAt(p.x, p.y); },

    async emptyPoint() {
      const p = await cdp.json('emptyPoint()');
      if (!p) throw new Error('no empty canvas point could be found');
      return p;
    },
    async clickEmpty() { const p = await page.emptyPoint(); await page.clickAt(p.x, p.y); },
    // Hover is a focus input, so "is the diagram grey again?" cannot be answered
    // honestly while the cursor is still parked on top of something.
    async park() { const p = await page.emptyPoint(); await page.hoverAt(p.x, p.y); },

    // Drives selection directly, for cases where the geometry makes a real
    // pointer unreliable (overlapping collapsed groups, off-screen nodes).
    // `void` because a Cytoscape collection cannot be serialised back.
    async select(selector) { await cdp.evaluate(`void __cy.$(${JSON.stringify(selector)}).select()`); await sleep(SETTLE); },
    async unselectAll() { await cdp.evaluate('void __cy.elements().unselect()'); await sleep(SETTLE); },
    async lit() { return cdp.json('lit()'); },

    // ---- DOM widgets (the editor view) ----

    // A real pointer click at the element's centre rather than el.click(), so a
    // control that is hidden, or covered by something else, fails the test the
    // way it would fail a person. Scrolled into view first, since the editor's
    // forms are longer than the window.
    async clickEl(selector) {
      const p = await cdp.json(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return null;
        el.scrollIntoView({ block: 'center' });
        const r = el.getBoundingClientRect();
        const x = r.left + r.width / 2, y = r.top + r.height / 2;
        const hit = document.elementFromPoint(x, y);
        return { x: Math.round(x), y: Math.round(y), hits: !!hit && (hit === el || el.contains(hit) || (el.control && el.control === hit)) };
      })()`);
      if (!p) throw new Error(`no element matches ${selector}`);
      if (!p.hits) throw new Error(`${selector} is not the topmost element at its own centre (hidden or covered)`);
      await page.mouse('mouseMoved', p.x, p.y);
      await page.mouse('mousePressed', p.x, p.y);
      await page.mouse('mouseReleased', p.x, p.y);
      await sleep(80);
    },

    // Sets a field the way typing then leaving it would: `input`, then `change`,
    // which is when the editor commits.
    async fill(selector, value) {
      const ok = await cdp.evaluate(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return false;
        el.value = ${JSON.stringify(String(value))};
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      })()`);
      if (!ok) throw new Error(`no element matches ${selector}`);
      await sleep(40);
    },

    // The default answer to a confirm() for the rest of the page's life. A real
    // dialog would block the protocol until something dismissed it.
    stubConfirm: (answer = true) => cdp.evaluate(`window.confirm = () => ${answer ? 'true' : 'false'}; true`),

    // Swaps the clipboard for a stash so tests can read what was copied; the
    // real one needs a permission grant and a focused window. Returns the
    // dataset object out of the last copied `dataflow({...});` file.
    captureClipboard: () => cdp.evaluate(`
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
        writeText: (t) => { window.__copied = t; return Promise.resolve(); }
      } });
      window.copiedData = () => JSON.parse(String(window.__copied).replace(/^dataflow\\(/, '').replace(/\\);\\s*$/, ''));
      true;
    `),
    async copyData() {
      await cdp.evaluate(`window.__copied = null; document.getElementById('copy-data').click()`);
      await sleep(120);
      return cdp.json('copiedData()');
    },

    // A missing data file is an expected, tested condition, so those 404s are
    // not failures. Anything else in the error log is.
    errors: () => logs
      .filter((e) => e.level === 'error' && !/Failed to load resource/.test(e.text))
      .map((e) => e.text),

    async screenshot(path) {
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
      const { writeFile } = await import('node:fs/promises');
      await writeFile(path, Buffer.from(data, 'base64'));
    },
  };

  return page;
}

export function createRecorder() {
  const failures = [];
  let passed = 0;
  let current = '';

  return {
    section(name) { current = name; console.log(`\n  ${name}`); },
    ok(name, condition, detail) {
      if (condition) { passed++; console.log(`    ok   ${name}`); return true; }
      failures.push({ section: current, name, detail });
      console.log(`    FAIL ${name}${detail !== undefined ? `\n         ${JSON.stringify(detail)}` : ''}`);
      return false;
    },
    eq(name, actual, expected) {
      return this.ok(name, JSON.stringify(actual) === JSON.stringify(expected), { actual, expected });
    },
    get passed() { return passed; },
    get failures() { return failures; },
  };
}
