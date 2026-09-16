# Tests

A browser test suite for `index.html`. It drives a real headless Chrome over the
DevTools Protocol, clicks and hovers the actual canvas with synthetic mouse
events, and reads back computed Cytoscape styles.

```sh
node tests/run.mjs                      # everything
node tests/run.mjs --filter focus       # one suite
node tests/run.mjs --headed             # watch it happen
node tests/run.mjs --screenshots ./shots
```

**Requirements: Node 22+ and a local Chrome. Nothing to install.** Node 22 ships
a global `WebSocket`, which is the only reason talking to Chrome directly is
~40 lines instead of a `puppeteer` dependency. That matters here: the tool's
whole premise is a file you double-click with nothing to install, and a test
suite that needed `npm install` would be the first crack in it. Set `CHROME=`
if Chrome lives somewhere unusual.

The runner starts its own servers and browser and cleans both up, so there is
nothing to start first and nothing left running afterwards.

## Layout

| Path | What it is |
|---|---|
| `run.mjs` | Entry point: starts servers and Chrome, runs the suites, reports. |
| `lib/cdp.mjs` | Minimal DevTools Protocol client. |
| `lib/browser.mjs` | Finds, launches and disposes of Chrome. |
| `lib/server.mjs` | Static server with an explicit route table. |
| `lib/harness.mjs` | Page helpers (`click`, `hover`, `lit`, …) and the assertion recorder. |
| `suites/focus.mjs` | Dim-by-default focus lighting (`DESIGN.md` §7). |
| `suites/widgets.mjs` | Every widget, and how each composes with the lighting. |
| `suites/resilience.mjs` | Failure paths, the loader, the dataset picker, `file://`. |
| `fixtures/edge-cases.js` | Deliberately awkward data the example dataset can't reach. |

## Your data is never loaded

The server has an **explicit route table** rather than serving the repo
directory, and `data/local.js` is not in it. On a real machine that file is your
private diagram; tests that ran against it would assert things about whatever
infrastructure you happen to have mapped, differently on every machine, and
would mean reading data that isn't theirs to read. Each suite names exactly
which files exist and everything else 404s — which is itself a tested path,
since a missing data file is how the setup screen is reached.

The one exception is the last section of `resilience`, which opens the repo over
`file://` — the way the tool is actually meant to be opened, and the only way to
test that the script-tag loading model works. If you have a `data/local.js` the
loader will prefer it, so those assertions are deliberately shape-based ("it
renders, it opens dim, a node lights") and never name an element.

## Adding a suite

A suite is a module exporting `name`, `app` (a key of `APPS` in `run.mjs`), and
`run(page, t, ctx)`. Assert with `t.eq(name, actual, expected)` and
`t.ok(name, condition, detail)`; `page` is documented by `lib/harness.mjs`.

Three things that will otherwise cost you an afternoon, all encoded in the
harness already:

- **Space consecutive clicks.** Cytoscape reads two taps within ~250ms as a
  double-tap, which the app binds to collapse/expand. `page.click()` already
  waits out that window; two raw clicks in a row will silently collapse a group
  instead of selecting two things.
- **Park the cursor before asserting the diagram is grey.** Hover is a focus
  input, so a test that clicks something and then asks "is everything dim
  again?" is answered by its own cursor. `page.park()` moves it somewhere empty.
- **Don't hardcode an "empty" point.** The detail panel is 360px wide on the
  right and the legend sits bottom-left; a point that looks empty becomes a
  panel click the moment the panel opens. `page.emptyPoint()` scans for one.

Style values come back as `rgb(r, g, b)` — the page-side `hex()` helper
normalises them so a failure message is readable. Colours are written out
literally in the suites rather than read from the page, so that changing a
constant in `index.html` is something the tests notice rather than follow.

Anything returning a Cytoscape collection must be prefixed with `void`:
collections are cyclic and the protocol's serialiser fails on them with an
opaque "Object reference chain is too long".

## What this does not cover

Firefox and Safari. The loading model depends on script-tag behaviour, so both
are still worth a 30-second open from `file://` before shipping a loader change
(`DESIGN.md` §13).
