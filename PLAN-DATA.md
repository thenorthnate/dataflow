# Plan — Move the graph data out of `index.html`

## Goal

Split the repo into two things that version and travel independently:

- **The tool** — `index.html` plus its docs. Generic, shareable, safe to make
  public, and the only thing that changes when a feature is added.
- **The data** — one or more datasets describing *somebody's* services and
  flows. Private by default, never touched by a `git pull`.

The target workflow:

```
personal laptop:  edit index.html → commit → push
work laptop:      git pull        → tool updates land, work data untouched
```

And for anyone else who clones the repo: open it, see a working demo, copy one
file, replace its contents with their own services, done. No build step, no
server, no npm.

This plan does not change any diagram behavior. Everything in `PLAN.md`
(Cytoscape, the type/tag filtering model, the detail panel, expand/collapse)
stays exactly as-is — only *where the data lives* changes.

---

## The one constraint that decides the whole design

`PLAN.md` chose an inline `<script type="application/json">` block for a
specific reason (lines 68–72): a page opened with `file://` generally cannot
`fetch()` a sibling file, because the local filesystem origin is opaque and
the request fails CORS. That reasoning is correct, and it rules out the
obvious answer of "just make it `data.json` and fetch it."

But it only rules out `fetch`. A **classic `<script src="...">` tag is not
subject to CORS** and loads fine from `file://`. That is the loophole the
whole design hangs on, so I verified it rather than assuming it — a probe page
run in headless Chrome directly off `file://`:

| Probe | Result |
|---|---|
| Dynamically injected `<script src="./missing.js">` | `onerror` fires — a missing data file is **detectable** |
| Dynamically injected `<script src="./present.js">` | `onload` fires, and the global it set is readable |
| `fetch('./present.js')` from the same page | **rejected** — `Failed to fetch` |

So: script tags work, `fetch` does not, and a missing file is detectable
rather than silent. That last one is what makes a clean fallback chain and a
helpful "no data yet" screen possible.

Worth knowing about the neighbours of this approach, because each looks like
it should work and doesn't:

- **`<script type="application/json" src="data.json">`** — inert. The browser
  never fetches `src` on a non-JS script type. This is the intuitive fix and
  it silently does nothing.
- **ES modules** (`<script type="module">`, `import ... with { type: 'json' }`)
  — blocked on `file://`. Module scripts are *always* fetched with CORS
  semantics, unlike classic scripts. So the modern syntax is the one option
  that doesn't work here.
- **`XMLHttpRequest`** — blocked the same way `fetch` is.

Chrome is verified above; Firefox and Safari follow the same spec behavior
(the HTML spec mandates the `error` event on script fetch failure, and no
browser allows `file://` XHR/fetch across files). Still worth a 30-second
manual open in Firefox and Safari during the build.

---

## Options considered

| # | Approach | Verdict |
|---|---|---|
| A | **Status quo** — JSON inline in `index.html` | Every pull that touches the tool touches the data. This is the problem. |
| B | **`data.json` + `fetch()`** | Cleanest format (real JSON, editor validation), but requires running a local web server to view the file at all. Kills "double-click index.html". **Rejected as the default**, but the loader should still work if served over `http://`, and it will. |
| C | **`data/*.js` assigning to a global** | Works on `file://` *and* `http://`, no server, no build. Costs one line of wrapper boilerplate around otherwise-unchanged JSON. **Recommended.** |
| D | **Keep it inline, use git plumbing** — `git update-index --skip-worktree index.html`, or a custom merge driver | Fails on its own terms: the file you want to keep local changes to is the exact file you want to pull updates for. Also invisible, per-clone, and breaks in confusing ways. Rejected. |
| E | **Data in `localStorage`, import/export via the UI** | No git involvement at all, but the data stops being a file — not versionable, per-browser, lost on a profile reset. Bad as the primary store; fine as an optional extra later. |
| F | **`data/` as a git submodule pointing at a private repo** | Solves private-data versioning properly but adds submodule ceremony to every clone. There's a simpler way to get the same result (see *Versioning the private data*), so: rejected as a default, unnecessary as an upgrade. |

**Recommendation: C**, with the git story from the *Git workflow* section
doing the personal/work separation.

### Why a `.js` file beats a `.json` file here, beyond the CORS point

The wrapper turns out to be a net win, not just a tax:

- **Comments are allowed.** JSON forbids them; a JS object literal doesn't. On
  a hand-maintained file describing sixty services, being able to write
  `// deprecated, migrating to orders-v2 in Q3` next to a node is genuinely
  useful, and today it's impossible.
- **Trailing commas are allowed.** The single most common hand-editing error
  in a large JSON block stops being an error.
- **The inner content is otherwise identical to today's JSON**, so migrating
  is copy-paste plus one wrapper line.

The cost is real and should be stated: a syntax error in a `.js` file means
the script never executes and the global is never set, whereas `JSON.parse`
would throw a message with a line number. The *Failure modes* section handles
this so it surfaces as a readable banner rather than a blank page.

---

## Recommended design

### Repo layout

```
index.html              the tool — the only file that changes on a pull
README.md               new: 60-second setup for a fresh clone
PLAN.md                 unchanged
PLAN-DATA.md            this file
.gitignore              new
data/
  example.js            committed — today's demo dataset, the template
  README.md             committed — the schema reference
  local.js              GITIGNORED — your real data. Never committed here.
```

`.gitignore`:

```gitignore
# Datasets are private by default. Only the example ships with the repo.
data/*.js
!data/example.js
```

Ignoring `data/*.js` wholesale and then un-ignoring the example means the
**safe thing is the default**: any file you drop into `data/` is private
unless you deliberately make it otherwise. For a file that will eventually
contain your employer's internal service topology, the default has to fail
closed, not open.

### The data file format

`data/local.js` is one call per dataset:

```js
dataflow({
  id: "work",
  label: "Work — Microservices",

  // everything from here down is exactly the JSON that used to live
  // inside index.html, unchanged
  nodeTypes: { ... },
  edgeTypes: { ... },
  tags: [ ... ],
  nodes: [ ... ],
  edges: [ ... ]
});
```

Two new fields, both optional-with-defaults:

- **`id`** — stable slug, used by the `?dataset=` URL param. Defaults to the
  filename-ish fallback `dataset-1`, `dataset-2`, … if omitted.
- **`label`** — human name, shown in the toolbar heading and the dataset
  picker. Defaults to `id`.

A file may call `dataflow(...)` more than once. One call → no picker appears,
the tool looks exactly like it does today. Two or more → a dataset picker
shows up in the toolbar. That's the "multiple use cases from one repo" axis:
at work you might keep `Payments Platform` and `Data Platform` as separate
diagrams in the same `local.js` rather than one 200-node hairball.

### Loader contract

Six lines inline in `<head>`, before anything else:

```js
window.__dataflowDatasets = [];
window.dataflow = function (ds) { window.__dataflowDatasets.push(ds); };
```

Then resolution order, using dynamic script injection so `onerror` gives us
the fallback:

1. Try `data/local.js`. If it loads **and registered at least one dataset**,
   use those and stop.
2. Otherwise try `data/example.js` — the committed demo, so a fresh clone
   renders something immediately instead of a blank canvas.
3. If neither registered anything, render the **setup screen** (below).

Local data *replaces* the example rather than adding to it. On the work
laptop you don't want a toy e-commerce demo sitting in your dataset picker
next to the real thing.

### Choosing and switching datasets

- `?dataset=work` in the URL wins (query strings work fine on `file://`, and
  it makes a specific diagram bookmarkable).
- Otherwise the last choice, remembered in `localStorage`.
- Otherwise the first one registered.

**Switching datasets should do a full `location.reload()` with the new
`?dataset=`, not an in-place swap.** The current script binds listeners to the
legend, tag menu, toolbar buttons, and document at startup (index.html
:661–766); tearing that down correctly on every switch is exactly the kind of
double-binding bug that isn't worth owning. A reload is one line, always
correct, and on a local file it's instant.

---

## Git workflow

### Personal → work

Once per machine, at clone time:

```sh
cp data/example.js data/local.js     # then replace the contents
```

After that, `git pull` only ever touches `index.html` and the docs.
`data/local.js` is untracked, so git has no opinion about it and no
opportunity to conflict. Nothing to copy back in, ever.

### Anyone else cloning it

Same two steps: clone, open `index.html` — they get the working demo
immediately. When they want their own, copy `data/example.js` to
`data/local.js` and edit. The tool never needs to be touched.

### Versioning the private data

`data/local.js` being untracked *here* doesn't mean it can't be versioned at
all — it just can't be versioned in **this** repo. The simplest option, and
the reason submodules aren't needed:

```sh
cd data/
git init
git remote add origin <your-private-repo>
```

A nested git repo inside a directory the parent ignores works cleanly — the
outer repo never sees the inner `.git` because `data/*.js` is ignored
anyway. Work data gets full history against a private remote, the public repo
stays public, and neither knows about the other. No submodule commands in the
normal path.

The alternative — making the work laptop's clone a private fork with an edited
`.gitignore` — works too, but then every upstream change to `.gitignore` is a
conflict. Prefer the nested repo.

### The risk worth naming explicitly

Work service topology is usually internal information, and this repo is
public. The `.gitignore` is the safety net, but before the **first** commit
after this refactor, run `git status` and confirm nothing under `data/` other
than `example.js` and `README.md` is staged. Worth doing once, deliberately.

---

## Changes to `index.html`

Concrete, against the current file. The net effect is roughly −120 lines of
data, +60 lines of loader and validation.

1. **Delete the data block** — the explanatory comment at :300–325 and the
   entire `<script type="application/json" id="graph-data">` at :326–443. The
   comment's content moves to `data/README.md`, where it's easier to read than
   inside an HTML comment.

2. **Add the bootstrap** in `<head>`: the two-line `window.dataflow` shim
   above, plus the `window.onerror` capture described under *Failure modes*.

3. **Wrap the existing IIFE in a function that takes the data.** Today
   :449–453 is `(function () { var graph = JSON.parse(...); ...`. It becomes
   `function initDiagram(graph) { ...`, called by the loader once a dataset is
   resolved. Line 453 is the only line that changes; the ~360 lines below it
   are untouched. This is the part worth emphasizing — the refactor is
   deliberately shallow.

4. **Add the loader and setup screen** after the Cytoscape `<script>` tags at
   :445–446 (they must load first, since `initDiagram` uses `cytoscape`
   immediately).

5. **Add a validation pass** between parsing and `cytoscape({...})` at :569.
   See *Failure modes* — this is the most important new code, and the thing
   that will most affect day-to-day use once real hand-written data is in play.

6. **Make the layout fall back gracefully** at :573. `layout: { name: 'preset' }`
   silently stacks every position-less node at the origin. New rule: if all
   childless nodes have a `position`, use `preset` exactly as today; if any
   don't, run an automatic layout over everything and flash a toast — *"No
   saved layout — auto-arranged. Drag things, then use Copy layout."* This
   matters because the first thing anyone does with their own data is paste in
   a service list with no coordinates, and right now that produces a single
   dot.

7. **Show which dataset is loaded.** `<h1>Dataflow Diagram</h1>` at :271
   becomes the dataset's `label`, and `document.title` matches. With a work
   diagram and a personal one open in two tabs, they should be
   distinguishable at a glance.

8. **Add the dataset picker** to the toolbar, rendered only when more than one
   dataset is registered.

9. **Upgrade "Copy layout JSON"** (:794–806). Keep it exactly as-is, and add a
   second button, **"Copy data file"**, that emits the complete, ready-to-paste
   `dataflow({ ... });` file with positions updated from the current canvas.
   Keep both, because they have different failure modes: the full-file copy
   regenerates from the in-memory object and will **silently destroy any
   comments** you wrote in your data file, while the positions-only copy is
   surgical and comment-safe. Given that comment support is one of the reasons
   for choosing `.js`, the old button has to stay.

---

## New files

- **`data/example.js`** — today's demo data (index.html:327–442) wrapped in a
  `dataflow({ id: "example", label: "Example — E-commerce", ... })` call. Its
  job is to be a working template, so it should keep using every feature:
  compound groups, all the node/edge types, tags, free-form `details`.

- **`data/README.md`** — the schema reference. Absorbs the HTML comment at
  :300–325 and the *JSON schema* section of `PLAN.md` (lines 74–144), since
  that content is about authoring data, not about building the tool. Should
  cover: the field list, `type` vs `tags`, how `parent` grouping works, and
  the drag → *Copy layout* → paste loop.

- **`README.md`** (root) — currently missing. What this is, a screenshot, and
  the three-line setup: clone, `cp data/example.js data/local.js`, open
  `index.html`. Plus the "your data is gitignored, here's how to version it
  privately" note.

- **`.gitignore`** — as above.

---

## Failure modes to handle

The current file assumes well-formed data because the data was written
alongside it. Hand-authored datasets break that assumption, and every failure
below currently produces the *same* symptom — a blank white canvas with
nothing on screen explaining why. That's the single biggest usability risk in
this change, and the reason for the validation pass in step 5.

| Failure | Today | Should be |
|---|---|---|
| `data/local.js` missing | blank page | **Setup screen**: "No dataset found — copy `data/example.js` to `data/local.js` to get started", with a button to load the example anyway |
| Syntax error in the data file | blank page, error only in console | Banner with the browser's error text, filename and line number, captured via `window.onerror` |
| Edge references a node id that doesn't exist | **Cytoscape throws, entire diagram fails to render** | Drop the bad edges, render everything else, banner: "3 flows skipped — unknown service id: `oders-service`" |
| Duplicate node or edge `id` | Cytoscape throws, nothing renders | Keep first, skip duplicates, report in banner |
| `parent` points at a missing node | throws | Treat as ungrouped, report |
| Node/edge `type` not in `nodeTypes`/`edgeTypes` | silent grey fallback | Keep the grey fallback, but report it — it's almost always a typo |
| No `position` on any node | everything stacks at (0,0) | Auto-layout + toast (step 6) |
| Dataset has zero nodes | blank page | "This dataset is empty" |

The unifying principle: **a hand-editing mistake should cost you one flow, not
the whole diagram, and it should tell you which one.** A typo'd node id in an
edge is the single most likely error when transcribing a real architecture,
and today it is fatal to the entire render.

One reusable piece of UI covers all of these: a dismissible warning banner
under the toolbar showing a count and the details on click. The setup screen
can be the same component in a full-canvas variant.

---

## Edge cases and decisions

- **Losing single-file portability.** Today `index.html` can be emailed or
  AirDropped and it just works. After the split it can't, which is a real
  regression. Worth adding an **"Export standalone HTML"** button that inlines
  the current dataset back into a copy of the page — a one-file snapshot to
  hand to someone, generated on demand rather than being the thing you
  maintain. Not required for v1, but the reason to keep the data shape
  trivially serializable.

- **Schema drift.** The pull-updates workflow means the tool will routinely be
  *newer* than the data file. Two rules keep that safe: every new field must be
  optional with a sensible default, and datasets carry an optional
  `schema: 1`. If the tool ever needs a field it can't default, it warns
  ("this dataset was written for an older version") rather than breaking.
  Cheap to add now, impossible to retrofit once there are datasets in the
  wild on two laptops.

- **Duplicate dataset `id`s** across registrations — last wins, warn in the
  banner.

- **Serving over `http://`** — everything above works identically; script tags
  don't care. Only new wrinkle is normal browser caching of `data/local.js`,
  so an edit may need a hard refresh. Non-issue on `file://`.

- **No live reload.** Editing the data file doesn't update an open page. A
  small **"Reload data"** button (just `location.reload()`) saves the trip to
  the browser chrome during a long editing session.

- **`data/` can't be directory-listed from `file://`**, which is why the
  loader looks for one fixed entry point (`local.js`) rather than discovering
  datasets. If splitting across physical files ever matters, the fix is a tiny
  `dataflow.include('data/work.js', 'data/personal.js')` helper doing
  sequential script injection — same mechanism, ~10 lines. Don't build it
  until the single-file version actually feels cramped.

- **Auto-layout and compound nodes.** The `cose` layout bundled with Cytoscape
  handles compound parents adequately but not beautifully. If step 6's
  auto-layout looks bad with real grouped data, `cytoscape-cose-bilkent` is
  the compound-aware drop-in, loaded from CDN the same way the existing
  extensions are. Only worth adding if the built-in result is actually poor.

---

## Build steps

1. Create `.gitignore` first, **before** any data file exists, so there's no
   window in which real data could be accidentally staged.
2. Move the JSON from `index.html` into `data/example.js` with the wrapper.
   Open the page — it should still render identically once step 3 is done.
3. Add the bootstrap shim, the loader chain, and `initDiagram(graph)`. This is
   the migration proper; stop here and confirm the diagram is byte-for-byte
   the same experience as today.
4. Add the setup screen and the missing-file path. Test by renaming
   `data/example.js` temporarily.
5. Add the validation pass and warning banner. Test each row of the failure
   table deliberately — especially the bad-edge-reference case, since that's
   the one that currently kills the whole render.
6. Add the layout fallback and its toast.
7. Add the dataset label in the toolbar, then the picker + `?dataset=` +
   `localStorage`. Test with two datasets registered in one file.
8. Add "Copy data file" alongside the existing "Copy layout JSON".
9. Write `data/README.md` and the root `README.md`; trim the now-duplicated
   schema section out of `PLAN.md`.
10. Verify on `file://` in Firefox and Safari as well as Chrome.
11. On the work laptop: pull, `cp data/example.js data/local.js`, paste in the
    real services, and confirm a subsequent `git pull` leaves it alone.

---

## Deliberately not doing

- **A build step or bundler** — the whole appeal is that this is a file you
  double-click.
- **Anything server-side** — no save endpoint, no API. Drag-and-copy-back
  stays the layout persistence story.
- **`localStorage` as the primary data store** — data belongs in files that
  git can see.
- **Submodules** — the nested-repo trick covers the same need with less
  machinery.
