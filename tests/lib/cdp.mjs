// A minimal Chrome DevTools Protocol client.
//
// No dependencies: Node 18+ ships a global fetch and Node 22 a global
// WebSocket, which is the whole reason this file is 40 lines instead of a
// puppeteer install. The tool itself has no dependencies; neither do its tests.

export async function connect(port) {
  const target = await waitForPage(port);
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error('could not open a DevTools websocket'));
  });

  let nextId = 0;
  const pending = new Map();
  const listeners = [];

  ws.onmessage = (raw) => {
    const msg = JSON.parse(raw.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    } else if (msg.method) {
      for (const fn of listeners) fn(msg);
    }
  };

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });

  // Every evaluate() returns by value, so anything handed back has to be JSON.
  // Cytoscape collections are cyclic and blow up the serialiser with an opaque
  // "Object reference chain is too long" — hence `void` in front of calls like
  // select() that return a collection you don't want.
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) {
      const e = r.exceptionDetails;
      throw new Error(e.exception?.description || e.text || 'evaluate failed');
    }
    return r.result.value;
  };

  return {
    send,
    evaluate,
    json: async (expression) => JSON.parse(await evaluate(`JSON.stringify(${expression})`)),
    on: (fn) => listeners.push(fn),
    close: () => ws.close(),
  };
}

async function waitForPage(port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch { /* browser still coming up */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('timed out waiting for a Chrome page target');
}
