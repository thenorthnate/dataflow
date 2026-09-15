# Dataflow Diagram — Build Plan

## Goal

A single self-contained `index.html` you open directly in a browser (no build
step, no server) that renders microservices as circles and data flows
(REST, RabbitMQ, websocket, file writes, etc.) as styled, directional edges
between them. All content (which services exist, how they connect, what each
connection/service means) lives in one clearly delimited JSON block inside
the file, so adding a service or a new flow type is a data edit, never a
markup/JS edit. Clicking a node or edge opens a detail panel. The canvas
supports pan/zoom and stays usable as the diagram grows large.

> **Superseded in one respect.** The data no longer lives in a JSON block
> inside `index.html`; it lives in `data/local.js` (gitignored) so the tool and
> the data can be pulled and versioned separately. The schema below is still
> accurate, but [`data/README.md`](data/README.md) is the authoritative
> reference now, and [`PLAN-DATA.md`](PLAN-DATA.md) explains the split.
> Everything else here — the library choice, filtering model, and interaction
> design — is unchanged.

## Recommended library: Cytoscape.js

https://js.cytoscape.org/ — MIT-licensed, dependency-free, loads from a CDN
via a single `<script>` tag.

Why it beats the alternatives for this use case:

- **Data model matches the ask exactly.** A Cytoscape graph is just
  `{ nodes: [{data, position}], edges: [{data}] }` — the same shape you'd
  hand-write in JSON anyway.
- **Styling is itself JSON-shaped.** Cytoscape's "stylesheet" is an array of
  `{ selector, style }` rules (`selector: 'edge[type = "rest"]'`). You can
  generate that array at load time from a small `edgeTypes` dictionary in
  your data block — so adding a new flow type is "add an entry to a
  dictionary," not "write a new CSS/JS rule."
- **Pan/zoom, click events, and hover are built in** (`cy.on('tap', 'node',
  ...)`, `cy.on('tap', 'edge', ...)`, mouse-wheel zoom, drag-to-pan) — no
  extra library needed for the core interaction.
- **Extensions cover the "big diagram" problem** without switching libraries
  (see Scaling section below): compound-node grouping/collapsing, a minimap,
  nicer on-screen zoom controls, popover tooltips.
- Actively maintained, large install base (bioinformatics/network-analysis
  community), good docs.

**Alternatives considered:**

| Library | Verdict |
|---|---|
| **vis-network** (vis.js) | Also a legitimate choice — similarly easy JSON node/edge model, physics-based auto-layout, built-in pan/zoom. Styling is plain JS objects per-element rather than a selector-based stylesheet, so per-type styling has to be applied more manually. Fine fallback if Cytoscape's API feels like too much for the actual need. |
| **D3.js** | Maximum flexibility, but you'd hand-build zoom/pan, hit-testing, and styling-from-data plumbing yourself. Not worth it — Cytoscape already gives you that plumbing. |
| **Sigma.js** (+ graphology) | WebGL renderer built for 10k–100k+ node graphs. Overkill for a microservices map (realistically tens to low hundreds of nodes), and its styling/interaction API is more code-first. Keep in your back pocket only if the diagram ever grows past ~3,000–5,000 elements, where canvas renderers (Cytoscape/vis-network) start to lag. |
| **GoJS / JointJS+Rappid** | Very capable diagramming toolkits, but GoJS is commercial-licensed and Rappid is a paid product. Not worth it for this. |
| **React Flow** | Great library, but pulls in React and a build step — conflicts with the "single flat HTML file" requirement. |

## File structure (single `index.html`)

Keep four clearly separated regions in the one file, top to bottom:

1. **`<style>`** — visual chrome only: canvas container sizing, detail-panel
   layout, legend layout. No data here.
2. **`<div id="cy">`** (the graph canvas) + **`<div id="detail-panel">`**
   (hidden by default, populated on click) + **`<div id="legend">`**
   (auto-generated from the style dictionaries, see below).
3. **The data block** — a `<script type="application/json" id="graph-data">`
   tag containing everything editable: nodes, edges, node-type styles,
   edge-type styles. JSON inside a `type="application/json"` tag is never
   executed and is trivially parsed with `JSON.parse(...)`, which makes it
   obvious to a future editor "this part is safe to hand-edit, nothing below
   here is code."
4. **The interface script** — a `<script>` that loads Cytoscape from a CDN,
   parses the data block, builds the Cytoscape stylesheet from the style
   dictionaries, wires up click handlers, the detail panel, and the legend.
   This part should never need to change when someone just wants to add a
   service or a flow type.

This gives you the "one file, but data and interface are structurally
separate" property without needing an external `.json` file — which matters
because `file://` pages often can't `fetch()` a sibling file due to
browser CORS restrictions on the local filesystem.

## JSON schema (the editable data block)

```json
{
  "nodeTypes": {
    "service":  { "color": "#4C82F7", "shape": "ellipse" },
    "database": { "color": "#F79B4C", "shape": "ellipse" },
    "external": { "color": "#999999", "shape": "ellipse" }
  },
  "edgeTypes": {
    "rest":     { "color": "#4C82F7", "style": "solid",  "width": 2, "arrow": "triangle" },
    "rabbitmq": { "color": "#F7C948", "style": "dashed", "width": 2, "arrow": "triangle" },
    "websocket":{ "color": "#8E5CF7", "style": "dotted", "width": 2, "arrow": "triangle" },
    "file-io":  { "color": "#4CAF50", "style": "dashed", "width": 1, "arrow": "none" }
  },
  "tags": ["checkout-flow", "returns-flow", "admin-only"],
  "nodes": [
    {
      "id": "orders-service",
      "label": "Orders Service",
      "type": "service",
      "position": { "x": 100, "y": 200 },
      "tags": ["checkout-flow", "returns-flow"],
      "details": {
        "description": "Owns order lifecycle, publishes order events.",
        "team": "Commerce",
        "repo": "github.com/org/orders-service"
      }
    }
  ],
  "edges": [
    {
      "id": "orders-to-rabbit",
      "source": "orders-service",
      "target": "message-bus",
      "type": "rabbitmq",
      "label": "order.created",
      "tags": ["checkout-flow"],
      "details": {
        "payload": "OrderCreatedEvent { orderId, userId, total }",
        "notes": "Fire-and-forget, at-least-once delivery."
      }
    }
  ]
}
```

Key design choices baked into this schema:

- **`type` on nodes/edges is the only thing that drives color/shape/line
  style**, via a lookup into `nodeTypes`/`edgeTypes`. To add a brand-new flow
  kind (e.g. "grpc" or "file-write"), add one entry to `edgeTypes` and start
  tagging edges with it — zero JS/HTML changes.
- **`details` is a free-form object** on every node and edge. The detail
  panel should render it generically (iterate `Object.entries(details)` and
  print label/value pairs) rather than hard-coding field names, so you can
  add "owner", "slack channel", "sample payload", "runbook link", whatever,
  purely in JSON.
- **`position` is explicit per node.** For an architecture diagram you want
  a stable, intentional layout (not a force-directed graph that jitters
  every reload), so positions are authored data, not computed. See "Saving
  layout changes" below for how this stays editable as you drag nodes.
- **`tags` is a separate, orthogonal axis from `type`.** `type` drives visual
  style (color/shape/line) via `nodeTypes`/`edgeTypes`; `tags` drives nothing
  visually and exists purely for filtering (see "Tag-based filtering"
  below). A node or edge can have zero, one, or many tags, freely mixed with
  any `type`. The top-level `tags` array is the authoritative, ordered list
  of every tag that exists — it's what populates the filter dropdown, so a
  tag can be declared there before anything uses it yet, and its order
  controls the order it appears in the dropdown. Per-element `tags` arrays
  just reference names from that list.

## Wiring it up (interface script responsibilities)

- Parse the JSON block; build a Cytoscape stylesheet array by mapping each
  `nodeTypes`/`edgeTypes` entry to a selector rule
  (`node[type = "service"]` → `background-color`, `shape`; `edge[type =
  "rabbitmq"]` → `line-color`, `line-style`, `width`, `target-arrow-shape`).
  Also map `label` fields to `content`/`label` display.
- `cy.on('tap', 'node', evt => showDetailPanel(evt.target.data()))` and same
  for `'edge'` — panel just renders `label` + the `details` object generically,
  plus (for edges) the resolved source/target labels.
- Clicking the background (`cy.on('tap', evt => { if (evt.target === cy)
  hideDetailPanel() })`) closes the panel.
- Zoom/pan: Cytoscape gives you this for free (wheel = zoom, drag = pan,
  pinch on trackpad/touch). Optionally add explicit `+`/`-`/"fit to screen"
  buttons that call `cy.zoom()`/`cy.fit()` for discoverability, since some
  users don't know to scroll to zoom.
- **Legend + type filtering:** auto-build a legend from `edgeTypes` (and
  optionally `nodeTypes`) with a colored swatch + label per type, and a
  checkbox per entry that toggles `cy.edges('[type = "..."]').toggleClass('hidden')`
  (with `.hidden { display: none; }` in the stylesheet). This is what makes
  a busy diagram usable — turn off "file-io" edges while you study the
  REST call graph, etc. Free to build once, and needs no changes as new
  types are added since it's generated from the same dictionary.
- **Tag filter dropdown:** built alongside the legend, generated from the
  top-level `tags` array (see "Tag-based filtering" below for the full
  behavior). Two independent filters — type toggles and tag selection — both
  end up as an element visibility computation, so it's cleanest to give
  each element two boolean flags (`typeHidden`, `tagHidden`) and apply the
  actual `.hidden` class as `typeHidden || tagHidden`, recomputed whenever
  either filter changes, rather than letting the two filters stomp on each
  other's class toggles independently.

## Tag-based filtering (dropdown)

The type-based legend answers "what kinds of things exist in this diagram?"
Tags answer a different question: "which services and flows matter for a
particular action/workflow?" — e.g. show only what's involved in checkout,
regardless of whether it's a REST call, a queue message, or a database. The
two filters are independent and both apply at once.

- **UI: a checkbox-list dropdown, not native `<select multiple>`.** A native
  multi-select listbox needs ctrl/cmd-click to pick more than one option,
  which most users don't know and which doesn't show what's already
  selected at a glance. Instead build a small custom widget: a button
  (e.g. "Filter by tags ▾", with a count badge like "Tags (2)" once
  something's selected) that toggles a popover panel containing one checkbox
  per tag, sourced from the top-level `tags` array in declaration order.
  Close the popover on an outside click or Escape, same pattern as the
  detail panel. This scales fine whether there end up being 4 tags or 40,
  without cluttering the canvas the way a full row of checkboxes/radios
  would — which is the reason for a dropdown over repeating the legend's
  checkbox-row style.
- **Selection semantics: OR across selected tags.** Checking multiple tags
  broadens the view (union), not narrows it — "show me everything involved
  in checkout OR returns," not "show me only things tagged with both."
  This matches the stated use case of isolating one workflow at a time, and
  is what most people expect from a "filter by tag" control. An element
  matches if it has *any* tag in the selected set:
  `element.tags.some(t => selectedTags.has(t))`.
- **No tags selected = filter inactive, everything shown.** This is the
  dropdown's default/cleared state — don't require "select all tags" to see
  the full diagram.
- **Once at least one tag is selected, untagged elements are hidden too.**
  Selecting tags is an explicit request to narrow to a workflow, so a node
  or edge with no `tags` at all doesn't match any selection and drops out
  along with the non-matching tagged ones. (If this turns out to be
  surprising in practice, the alternative — always show untagged elements —
  is a one-line change to the predicate above; call it out during review of
  the first real dataset.)
- **Edges depend on their own tags AND their endpoints' visibility.** An
  edge whose tags match the filter should still hide if the type-legend (or
  the tag filter itself) has hidden one of its endpoint nodes — otherwise
  you get a dangling edge floating with no visible source/target. Recompute
  edge visibility as `edgeTagHidden || sourceNode.hidden() || targetNode.hidden()`
  in the same pass that applies the combined `.hidden` class from the point
  above.
- **Combines with type filtering via AND, same as any two independent
  filters:** an element must pass both the type-legend check and the tag
  check to stay visible. Concretely, keep computing `typeHidden` exactly as
  today, add a parallel `tagHidden` computation from the dropdown's current
  selection, and apply `.hidden` whenever either is true.
- Tags need no color/shape of their own — they're a filtering concern only,
  so nothing in `nodeTypes`/`edgeTypes` changes and existing visual styling
  is untouched by this feature.

## Scaling for a big diagram

Cytoscape (and vis-network) render to `<canvas>`, which stays smooth up to
roughly 1,000–3,000 elements and starts to visibly lag well beyond that
(~5,000+). For a microservices architecture map you're very unlikely to
exceed that, but to keep a large diagram *readable* (not just performant),
plan on these from the start rather than bolting them on later:

- **`cytoscape-expand-collapse` extension** — group related services into
  compound (parent) nodes (e.g. by team or bounded context) using a `parent`
  field on nodes, and let the user collapse a whole group into a single
  node with one click. This is the single highest-leverage feature for a
  "lot of items" diagram — it turns 80 nodes into "8 collapsible clusters."
- **`cytoscape-navigator` extension** — a small minimap overlay, useful once
  panning around a zoomed-in large graph makes it easy to lose your place.
- **Zoom-dependent label visibility** — hide edge labels (and maybe node
  labels) below a zoom threshold via a `cy.on('zoom', ...)` listener toggling
  a class, so a fully-zoomed-out overview isn't a wall of overlapping text.
- **A text search box** that filters/highlights nodes by label and calls
  `cy.animate({fit: {eles: matches}})` to jump to a service by name instead
  of hunting visually.
- The legend-based edge/node-type filtering described above also directly
  addresses visual clutter, independent of raw element count.

If the diagram ever genuinely grows past a few thousand elements, revisit
Sigma.js at that point — but don't design for that up front.

## Saving layout changes

Since positions are authored JSON, dragging a node in the browser only
changes it in memory. Add one small affordance: a "Copy layout as JSON"
button that calls `cy.nodes().map(n => ({id: n.id(), position: n.position()}))`
and writes it to the clipboard (or just `console.log`s it), so after
rearranging nodes you can paste the updated positions back into the data
block by hand. This avoids needing any server-side save endpoint while still
letting layout adjustments persist.

## Libraries/CDN references for the build phase

- Cytoscape.js core: `https://cdn.jsdelivr.net/npm/cytoscape@<version>/dist/cytoscape.min.js`
- `cytoscape-expand-collapse`: `https://cdn.jsdelivr.net/npm/cytoscape-expand-collapse@<version>/`
- `cytoscape-navigator` (minimap, optional): via jsdelivr/unpkg, same pattern
- Pin exact versions (don't use an unpinned `@latest`) so the file keeps
  working identically if you revisit it in a year.
- Fully-offline note: if you ever need this to work with zero network access,
  download the pinned library file(s) once and paste their contents directly
  into an inline `<script>` in the HTML — still one file, just heavier.

## Build steps (for the next session)

1. Scaffold `index.html` with the four regions above and a small placeholder
   dataset (3–4 services, a couple of edge types) to validate the pipeline
   end-to-end.
2. Wire stylesheet generation from `nodeTypes`/`edgeTypes` dictionaries.
3. Wire click → detail panel for nodes and edges (generic `details` renderer).
4. Add legend with type-toggle checkboxes.
5. Add the tag-filter dropdown (checkbox popover sourced from the top-level
   `tags` array) and wire its selection into the combined `typeHidden ||
   tagHidden` visibility computation described in "Tag-based filtering."
6. Add zoom controls + fit-to-screen button.
7. Add the search box.
8. Add `cytoscape-expand-collapse` + a `parent` grouping in the sample data
   to prove out clustering before filling in the real microservice list.
9. Add the "copy layout as JSON" button.
10. Backfill the real dataset (your actual services/flows, including
    meaningful `tags` per workflow) into the data block.
