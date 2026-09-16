# Dataflow Diagram — Design

This document describes how the project is built and why — the single place to
look for "how does this thing work, and why is it like that."

**Keeping it current:** substantial new work starts as its own plan document,
but once that work ships, its decisions get folded in here and the plan is
discarded. Nothing about the design should live anywhere else.

Two companion docs cover narrower ground and stay authoritative for it:

- [`data/README.md`](data/README.md) — the dataset field reference, written for
  whoever is authoring a diagram. This document explains *why* the schema is
  shaped that way; that one explains how to fill it in.
- [`README.md`](README.md) — the 60-second setup for a fresh clone.

---

## 1. What it is

An interactive map of how services pass data around — REST calls, queue
messages, websockets, database reads, file writes — rendered as circles
(services) connected by styled, directional edges (flows). Clicking a node or
edge opens a detail panel. The canvas pans and zooms and stays usable as the
diagram grows.

Three properties drive nearly every decision below:

1. **No build step, no server, no install.** You double-click `index.html` and
   it works, from `file://`. This constraint is load-bearing — see §4.
2. **Content is data, never markup.** Adding a service, a flow, or a whole new
   kind of flow is an edit to a data file. It never requires touching HTML,
   CSS, or JS.
3. **The tool and the data version independently.** The tool is public and
   shareable; the data usually describes somebody's internal infrastructure and
   must not be committed here by accident.

---

## 2. Architecture at a glance

```
index.html         The entire tool: styles, markup, loader, diagram. ~1070 lines.
                   The only file that changes when a feature is added.
data/example.js    Committed demo dataset. Also the template you copy.
data/local.js      Your real data. GITIGNORED. Created by you, never committed.
data/README.md     Dataset field reference.
README.md          Setup and workflow.
DESIGN.md          This file.
.gitignore         Fails closed on data/ — see §10.
```

The split is the point: `git pull` only ever touches the tool. `data/local.js`
is untracked, so git has no opinion about it and no opportunity to conflict.

```
laptop A:  edit index.html → commit → push
laptop B:  git pull        → tool updates arrive, work data untouched
```

For anyone else cloning it: open `index.html`, get a working demo immediately;
copy one file and replace its contents to get their own.

---

## 3. Rendering library: Cytoscape.js

[Cytoscape.js](https://js.cytoscape.org/) 3.34.2, MIT-licensed, dependency-free,
loaded from jsDelivr via a plain `<script>` tag. Plus
`cytoscape-expand-collapse` 4.1.1 for collapsible groups. **Both versions are
pinned exactly** — no `@latest` — so the page keeps working identically if it
sits untouched for a year.

Why it wins here:

- **Its data model is the ask.** A Cytoscape graph is
  `{ nodes: [{data, position}], edges: [{data}] }` — the same shape you'd
  hand-write anyway.
- **Its stylesheet is itself data.** Styling is an array of
  `{ selector, style }` rules, so `edge[type = "rest"]` rules can be *generated
  at load time* from the `edgeTypes` dictionary in the dataset (§6). This is
  what makes "add a new flow type" a dictionary entry rather than a code change.
- **Pan, zoom, click, hover, and compound (parent) nodes are built in.** No
  second library for the core interaction.
- Actively maintained, large install base, good docs.

Alternatives, and why not:

| Library | Verdict |
|---|---|
| **vis-network** | Legitimate fallback — similar JSON model, built-in pan/zoom. But styling is per-element JS objects rather than a selector-based stylesheet, so per-type styling has to be applied manually. Loses the generated-stylesheet trick. |
| **D3.js** | Maximum flexibility, but zoom/pan, hit-testing and styling-from-data are all hand-built. Cytoscape already ships that plumbing. |
| **Sigma.js** (+ graphology) | WebGL, built for 10k–100k nodes. Overkill for tens-to-low-hundreds of services, and a more code-first API. Revisit only past ~3,000–5,000 elements (§11). |
| **GoJS / JointJS+Rappid** | Capable, but commercial-licensed. |
| **React Flow** | Good library, but pulls in React and a build step — fatal to property 1. |

---

## 4. How data loads (the `file://` problem)

This is the most subtle part of the design, and everything in §2 hangs on it.

A page opened with `file://` **cannot `fetch()` a sibling file** — the local
filesystem origin is opaque and the request fails CORS. That rules out the
obvious `data.json` + `fetch` approach, which is why the original build kept
its data inline in `index.html`.

But it only rules out `fetch`. **A classic `<script src="...">` tag is not
subject to CORS** and loads fine from `file://`. That was verified rather than
assumed, with a probe page in headless Chrome run directly off `file://`:

| Probe | Result |
|---|---|
| Injected `<script src="./missing.js">` | `onerror` fires — a missing data file is **detectable** |
| Injected `<script src="./present.js">` | `onload` fires, and the global it set is readable |
| `fetch('./present.js')` from the same page | **rejected** — `Failed to fetch` |

Detectability is what makes a clean fallback chain and a helpful "no data yet"
screen possible, rather than a blank page.

Near-misses worth knowing about, because each looks like it should work:

- **`<script type="application/json" src="data.json">`** — inert. The browser
  never fetches `src` on a non-JS script type. The intuitive fix silently does
  nothing.
- **ES modules** (`type="module"`, `import ... with { type: 'json' }`) — blocked
  on `file://`. Module scripts are *always* fetched with CORS semantics. The
  modern syntax is the one option that doesn't work.
- **`XMLHttpRequest`** — blocked exactly as `fetch` is.

Served over `http://` everything behaves identically; the only wrinkle is normal
browser caching of `data/local.js`, so an edit may need a hard refresh.

### Why the data file is `.js` and not `.json`

CORS forces the script tag, and the script tag turns out to be a net win:

- **Comments are allowed.** In a hand-maintained file describing sixty services,
  `// deprecated, migrating to orders-v2 in Q3` next to a node is genuinely
  useful. JSON forbids it.
- **Trailing commas are allowed.** The most common hand-editing error in a large
  JSON block stops being an error.
- The inner content is otherwise identical to plain JSON.

The real cost: a syntax error means the script never executes and the global is
never set, with no line number the way `JSON.parse` would give one. §9 handles
that so it surfaces as a readable screen rather than a blank page.

### The loader contract

A shim in `<head>`, before anything else can run, gives data files something to
call:

```js
window.__dataflowDatasets = [];
window.dataflow = function (ds) { window.__dataflowDatasets.push(ds); };
```

Alongside it, a `window.onerror` capture records syntax errors from data files
for later display.

Resolution order (`boot()`), using dynamic script injection so `onerror` gives
the fallback:

1. Try `data/local.js`. If it registers at least one dataset, use those and stop.
2. If the file **loaded or errored but registered nothing**, show the setup
   screen in its "broken file" variant. It deliberately does **not** fall
   through to the example — silently showing a demo would look like your edits
   had vanished.
3. If `data/local.js` is simply absent, try `data/example.js`, so a fresh clone
   renders something immediately.
4. If neither registered anything, show the setup screen.

Local data **replaces** the example rather than adding to it: on a work laptop
you don't want a toy e-commerce demo sitting in the picker next to the real
thing.

### Multiple datasets

A data file may call `dataflow(...)` more than once. One call → no picker, the
tool looks exactly as it would with a single dataset. Two or more → a `<select>`
appears in the toolbar. That's the "several diagrams from one repo" axis: keep
`Payments Platform` and `Data Platform` as separate diagrams rather than one
200-node hairball.

Which one loads:

1. `?dataset=<id>` in the URL wins (query strings work fine on `file://`, and it
   makes a specific diagram bookmarkable).
2. Otherwise the last choice, remembered in `localStorage` under
   `dataflow.dataset`.
3. Otherwise the first one registered.

**Switching datasets does a full `location.reload()` with the new `?dataset=`,
not an in-place swap.** Startup binds listeners to the legend, tag menu, toolbar
and document; tearing that down correctly on every switch is exactly the kind of
double-binding bug not worth owning. A reload is one line, always correct, and
on a local file it's instant.

---

## 5. The data model

`data/README.md` is the authoring reference. What follows is the reasoning
behind the shape.

```js
dataflow({
  id: "work",                    // stable slug for ?dataset=; defaults to dataset-N
  label: "Work — Microservices", // shown in toolbar + picker; defaults to id
  schema: 1,                     // data format version

  nodeTypes: { service: { color: "#4C82F7" }, database: { color: "#F79B4C" } },
  edgeTypes: { rest: { color: "#4C82F7", lineStyle: "solid", width: 2, arrow: "triangle" } },
  tags: ["checkout", "fulfillment"],
  nodes: [ … ],
  edges: [ … ]
});
```

**`type` is the only thing that drives appearance**, via a lookup into
`nodeTypes` / `edgeTypes`. Adding a brand-new flow kind (`grpc`, `file-write`)
is one dictionary entry; the stylesheet, the legend, and its filter checkbox all
follow automatically.

**`details` is a free-form object** on every node and edge. The panel renders it
generically — iterate the keys, title-case them, print label/value pairs — so
`owner`, `slack_channel`, `runbook`, `oncall` all work with zero code change.

**`position` is authored data, not computed.** An architecture diagram wants a
stable, intentional layout, not a force-directed graph that jitters on every
reload. §8 covers how positions stay editable.

**Groups are just nodes that other nodes name as `parent`.** They need no `type`
and no `position`; Cytoscape sizes them around their children. Because the
legend filters on `node[type]` and groups have no `type`, groups are never
hidden by a type filter — which is what you want, since hiding a container would
take its visible children with it.

**`tags` are orthogonal to `type`.** `type` answers "what kind of thing is
this?" and drives colour and line style. `tags` answer "which workflow does this
belong to?" and drive nothing visually — they exist purely for filtering (§7).
An element can have none, one, or many, freely mixed with any `type`. The
top-level `tags` array is the authoritative, ordered list: it populates the
dropdown, so a tag can be declared before anything uses it, and its order
controls the order shown.

**Schema drift.** The pull-updates workflow means the tool will routinely be
*newer* than a data file. Two rules keep that safe: every new field is optional
with a sensible default, and datasets carry `schema: <n>`. `index.html` holds a
`TOOL_SCHEMA` constant (currently `1`); a dataset declaring a higher number gets
a warning — "written for a newer version of the tool, pull the latest
index.html" — rather than a mysterious failure. Bump `TOOL_SCHEMA` only when the
tool starts relying on a field it cannot default.

---

## 6. `index.html` structure

One file, four regions, top to bottom:

1. **`<style>`** — visual chrome only: toolbar, canvas sizing, detail panel,
   legend, banner, setup screen, toast. No data.
2. **The `<head>` bootstrap** — the `window.dataflow` shim and `window.onerror`
   capture (§4). These must exist before any data file loads, which is why they
   sit here rather than with the main script.
3. **Markup** — `#toolbar`, `#warning-banner`, `#cy` (the canvas),
   `#setup-screen`, `#legend`, `#detail-panel`, `#toast`.
4. **The interface script** — pinned Cytoscape `<script>` tags (they must load
   first, since `initDiagram` uses `cytoscape` immediately), then one IIFE
   containing validation, the loader, and `initDiagram(graph)`.

The script is organised as:

| Piece | Responsibility |
|---|---|
| `buildElements(graph)` | Validate a dataset into Cytoscape elements, collecting warnings. Returns `{ elements, usePreset }`. |
| `renderWarnings()` | Render the collected warnings as a dismissible banner. |
| `showSetup(broken)` | Full-canvas screen for "no dataset" or "your file has a syntax error." |
| `loadScript(src, cb)` | Script-tag injection; reports found/errored separately. |
| `pickDataset` / `buildDatasetPicker` | URL param → localStorage → first registered. |
| `boot()` / `start()` | The resolution chain, then title, picker, `initDiagram`, banner. |
| `initDiagram(graph)` | Everything below: stylesheet, Cytoscape init, panel, filters, search, copy-out. |

`initDiagram` taking the dataset as an argument is the whole shape of the
tool/data refactor — the ~360 lines inside it were left untouched when the data
moved out of the file.

### Stylesheet generation

`buildStylesheet()` starts from a fixed base — node size and label placement,
`node:parent` styling for groups, bezier edges with a label background, plus
`.hidden` (`display: none`), `.faded` (`opacity: 0.12`), `.highlighted`, and
`:selected` rules — then appends one generated rule per dictionary entry:

```js
node[type = "service"]   → { background-color }
edge[type = "rabbitmq"]  → { line-color, target-arrow-color, line-style, width, target-arrow-shape }
```

An element whose `type` isn't in the dictionary keeps the grey base style and
gets a warning, since that is almost always a typo.

Canvas config: `wheelSensitivity: 0.25`, `minZoom: 0.1`, `maxZoom: 4`.

---

## 7. Interaction design

### Detail panel

Clicking a node or edge selects it and slides in the right-hand panel; clicking
the background, the × button, or pressing Escape closes it.

- **Node panel:** label, a type chip with its colour swatch, group name, tag
  chips, the generic `details` rows, then **connected flows** — every incident
  edge with a direction arrow and the other endpoint's label. Each row is
  clickable and navigates the panel to that edge.
- **Edge panel:** label (or `source → target` if unlabelled), type chip, both
  endpoints as clickable links, tag chips, generic `details` rows.

Cross-navigation in both directions — node → its flows, edge → its endpoints —
is what makes the panel a way to *walk* the graph rather than just a tooltip.

### Two independent filters, one visibility computation

The legend answers "what kinds of things exist here?" Tags answer "what matters
for this workflow?" Both apply at once, and they must not stomp on each other's
class toggles. So `recomputeVisibility()` computes both flags and applies the
`.hidden` class once, in a single `cy.batch`:

```
node.hidden = typeHidden || tagHidden
edge.hidden = typeHidden || tagHidden || sourceHidden || targetHidden
```

The endpoint term is why edges are computed after nodes in the same pass: an
edge whose own tags match should still disappear if either end is hidden,
otherwise you get a line dangling in space.

### Type filtering (legend)

The legend is generated from `edgeTypes` and `nodeTypes` — a coloured swatch,
a title-cased name, and a checked checkbox per entry — so it needs no
maintenance as types are added. Unchecking hides that type. This is the main
answer to visual clutter: turn off file writes while you study the REST call
graph.

### Tag filtering (dropdown)

**A checkbox popover, not a native `<select multiple>`.** A native multi-select
needs ctrl/cmd-click to pick more than one option, which most users don't know,
and it doesn't show what's selected at a glance. Instead: a "Tags ▾" button with
a count badge once something is selected, opening a popover with one checkbox
per tag in declaration order. Closes on outside click or Escape. This scales to
40 tags without a permanent row of checkboxes eating the canvas.

Semantics:

- **OR across selected tags.** Checking more tags *broadens* the view —
  "everything involved in checkout OR returns" — matching what people expect
  from a tag filter and the use case of isolating one workflow at a time.
- **No tags selected = filter off, everything shown.** The default/cleared
  state; you don't have to check all boxes to see the whole diagram.
- **Once any tag is selected, untagged elements hide too.** Selecting a tag is
  an explicit request to narrow to a workflow, so an element with no tags
  doesn't match and drops out with the rest. (If that ever proves surprising,
  the alternative is a one-line change to the predicate.)
- The whole control hides itself when a dataset declares no `tags`.

**Implementation note worth preserving:** the toolbar is a fixed 52px tall, clips
its overflow so buttons don't spill on narrow windows, and has a `z-index` that
makes it a stacking context. A dropdown parented inside it would be both clipped
at 52px and painted *under* the detail panel. So at startup the menu element is
moved to `<body>` and positioned from the button's bounding rect, clamped to the
viewport on both axes and repositioned on resize.

### Search

Typing in the search box matches node labels (case-insensitive substring),
fades everything else to 12% opacity, keeps matches' connected edges and
ancestor groups visible, and animates a fit to the matches. Clearing the box
restores everything. It's a highlight-and-jump, not a filter — it doesn't touch
`.hidden`, so it composes with the two filters instead of fighting them.

### Zoom, fit, and groups

`+` / `−` zoom about the canvas centre, `Fit` animates to fit all elements with
padding. Explicit buttons exist for discoverability: wheel-zoom and drag-pan
work, but not everyone knows to try.

Groups collapse and expand by double-tapping a node, or wholesale via the
`Expand groups` / `Collapse groups` buttons. Collapsing is the highest-leverage
feature for a large diagram — it turns 80 nodes into 8 clusters.

---

## 8. Saving layout changes

Positions are authored data, so dragging a node changes it only in memory. Two
toolbar buttons copy it back out, and **both exist on purpose** because they have
different failure modes:

| Button | Copies | Use when |
|---|---|---|
| **Copy layout** | Just `{id, position}` pairs for childless nodes | Your data file has comments or formatting you want to keep. Surgical, paste over the positions by hand. |
| **Copy data file** | The entire `dataflow({ … });` file, positions updated | You're happy to overwrite `data/local.js` wholesale. |

**"Copy data file" regenerates the file from the in-memory object, so it
silently destroys any comments in your data file.** Since comment support is one
of the reasons for choosing `.js` over `.json` (§4), the surgical
positions-only button has to stay.

One shared caveat: expand collapsed groups before copying. Children of a
collapsed group aren't on the canvas, so `currentDataFile()` deliberately keeps
their previously authored position rather than overwriting it with a stale one.

Clipboard writes fall back to a selectable `<textarea>` in the detail panel when
`navigator.clipboard` is unavailable or blocked — which it often is on
`file://`.

### Layout fallback

`layout: { name: 'preset' }` silently stacks every position-less node at the
origin, and the first thing anyone does with their own data is paste in a
service list with no coordinates. So: if **every** childless node has a
`position`, use `preset` exactly. If **any** is missing one, run `cose` over the
whole graph and flash a toast — *"No saved layout — arranged automatically. Drag
things, then use Copy data file."* Partial position sets get auto-layout rather
than a half-stacked mess.

---

## 9. Resilience: a mistake costs you one flow, not the diagram

Hand-authored data breaks the assumption that the data was written alongside the
code. Every failure below used to produce the same symptom — a blank white
canvas with nothing on screen explaining why — which was the single biggest
usability risk in moving data out of the tool.

`buildElements()` therefore validates rather than throws, collecting messages
into a `warnings` array that renders as a dismissible banner under the toolbar
(a count, expandable to the details).

| Failure | Behaviour |
|---|---|
| `data/local.js` missing | Setup screen: "No dataset found", with the `cp data/example.js data/local.js` instruction |
| Syntax error in the data file | Setup screen, "broken file" variant, with the captured `window.onerror` text and a pointer to the console for the line number |
| Node with no `id` | Skipped, reported by position |
| Duplicate node or edge `id` | First kept, rest skipped, reported |
| Edge referencing an unknown node id | **That edge dropped, everything else renders**, reported by name — this is the most likely transcription typo and used to kill the entire render |
| `parent` naming a missing node | Treated as ungrouped, reported |
| `type` missing from its dictionary | Grey fallback kept, reported once per type — almost always a typo |
| No positions | Auto-layout + toast (§8) |
| Zero nodes | "This dataset has no services in it yet" |
| Duplicate dataset `id` | Last wins, reported |
| `schema` newer than `TOOL_SCHEMA` | Reported as "pull the latest index.html" |

The setup screen is the same idea in a full-canvas variant. All user-supplied
strings pass through `escapeHtml` before reaching `innerHTML`.

Browsers hide error details for local files, so the syntax-error screen tells
you to open the console (⌥⌘J Chrome, ⌥⌘K Firefox) — the only place the line
number appears.

---

## 10. Privacy and the git workflow

Work service topology is usually internal information, and this repo is public.

```gitignore
data/*.js
!data/example.js
```

Ignoring `data/*.js` wholesale and then un-ignoring the example means **the safe
thing is the default**: anything dropped into `data/` is private unless
deliberately made otherwise. For a directory that will hold an employer's
service map, the default has to fail closed.

Per machine, once: `cp data/example.js data/local.js`, then replace the
contents. After that, `git pull` only touches the tool. Before the first commit
from a new clone, `git status` is worth one deliberate glance.

**Versioning private data.** Untracked *here* doesn't mean unversioned — just
not in this repo. Make `data/` its own repository against a private remote:

```sh
cd data/ && git init && git remote add origin <your-private-repo>
```

A nested repo works cleanly because the outer repo ignores `data/*.js` anyway;
neither knows about the other. This is why submodules aren't used — same result,
no ceremony on every clone. A private fork with an edited `.gitignore` also
works, but then every upstream `.gitignore` change is a conflict.

---

## 11. Scaling

Cytoscape renders to `<canvas>`, smooth to roughly 1,000–3,000 elements and
visibly laggy well past that (~5,000+). A microservices map is unlikely to get
there, but *readability* degrades long before performance does. What's in place:

- **Collapsible compound groups** — the highest-leverage feature for a big
  diagram (§7).
- **Type filtering from the legend** and **tag filtering** — clutter control
  independent of element count.
- **Search with fade + fit** — jump to a service by name instead of hunting.

If the diagram ever genuinely passes a few thousand elements, that's the point
to revisit Sigma.js — not before.

---

## 12. Considered and not built

Recorded so they don't get re-litigated from scratch. None are blocked; none
have been needed yet.

- **Minimap** (`cytoscape-navigator`) — useful once panning a zoomed-in large
  graph makes you lose your place. Same CDN pattern as the existing extensions.
- **Zoom-dependent label visibility** — hide edge labels below a zoom threshold
  so a zoomed-out overview isn't a wall of overlapping text.
- **`cytoscape-cose-bilkent`** — the bundled `cose` layout handles compound
  parents adequately but not beautifully. Drop-in replacement if the auto-layout
  fallback ever looks bad with real grouped data.
- **"Export standalone HTML"** — a real regression from the split is that
  `index.html` can no longer be emailed as a working file. A button that inlines
  the current dataset into a copy of the page would restore that as an on-demand
  snapshot rather than the thing you maintain. Keeping the data shape trivially
  serializable is what leaves this door open.
- **"Reload data" button** — editing the data file doesn't update an open page;
  a `location.reload()` button saves the trip to the browser chrome during a
  long editing session.
- **Multiple physical data files** — `data/` can't be directory-listed from
  `file://`, which is why the loader looks for one fixed entry point rather than
  discovering datasets. If splitting ever matters, a
  `dataflow.include('data/work.js', …)` helper doing sequential script injection
  is ~10 lines on the same mechanism. Not until the single file feels cramped.

Deliberately out of scope, permanently:

- **A build step or bundler** — the whole appeal is a file you double-click.
- **Anything server-side** — no save endpoint, no API. Drag-and-copy-back is the
  layout persistence story.
- **`localStorage` as the primary data store** — per-browser, lost on a profile
  reset, invisible to git. Data belongs in files. (It holds only the last
  dataset choice.)
- **Git plumbing to keep data inline** (`--skip-worktree`, a merge driver) — it
  fails on its own terms: the file you want to keep local changes to is the
  exact file you want to pull updates for.
- **Submodules** — see §10.

---

## 13. Verifying a change

There is no test suite; the check is manual and short.

1. Open `index.html` from `file://` and confirm the example renders.
2. Exercise every widget: search, zoom in/out, Fit, expand/collapse groups,
   legend checkboxes, the tag dropdown, both copy buttons, the dataset picker
   (with two `dataflow(...)` calls in one file), and the detail panel in both
   directions (node → flow, edge → endpoint).
3. Test the failure paths deliberately — especially a bad edge reference, since
   that's the one that used to kill the whole render. Rename `data/example.js`
   temporarily to see the setup screen.
4. Chrome is the primary target; Firefox and Safari are worth a 30-second open
   on `file://`, since the whole loading model depends on script-tag behaviour.
