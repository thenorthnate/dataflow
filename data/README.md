# Dataset reference

A dataset describes one diagram: which services exist, how data flows between
them, and what each of those things means. The tool renders it; it contains no
knowledge of your services itself.

## Where datasets live

| File | Tracked in git? | Purpose |
|---|---|---|
| `data/example.js` | yes | The demo. Also the template you copy. |
| `data/local.js` | **no — gitignored** | Your real data. Survives every `git pull`. |

`index.html` looks for `data/local.js` first. If it isn't there, the example
loads instead, so a fresh clone shows a working diagram.

If `data/local.js` exists but registers nothing (usually a syntax error), the
page shows an error rather than quietly falling back to the example — otherwise
a typo would look like your data had vanished.

To start:

```sh
cp data/example.js data/local.js
```

## File shape

A data file is JavaScript, not JSON, so that it can be loaded from a `file://`
page without a web server. In practice it is one `dataflow({ ... })` call
wrapping what is otherwise plain JSON:

```js
dataflow({
  id: "work",
  label: "Work — Microservices",
  schema: 1,

  nodeTypes: { ... },
  edgeTypes: { ... },
  tags: [ ... ],
  nodes: [ ... ],
  edges: [ ... ]
});
```

Being `.js` rather than `.json` has two practical upsides in a file this size:
**comments are allowed**, and **trailing commas are allowed**.

Call `dataflow(...)` more than once in the same file to define several
diagrams. A dataset picker appears in the toolbar when there is more than one,
and `?dataset=<id>` in the URL selects one directly.

## Top-level fields

| Field | Required | Meaning |
|---|---|---|
| `id` | no | Stable slug used by `?dataset=`. Defaults to `dataset-1`, `dataset-2`, … |
| `label` | no | Human name, shown in the toolbar and picker. Defaults to `id`. |
| `schema` | no | Data format version. Currently `1`. |
| `nodeTypes` | yes | Dictionary of service type → appearance. |
| `edgeTypes` | yes | Dictionary of flow type → appearance. |
| `tags` | no | The full, ordered list of tags that exist. Populates the Tags dropdown. |
| `nodes` | yes | The services, databases, queues, external systems. |
| `edges` | yes | The flows between them. |

### `nodeTypes` / `edgeTypes`

These drive all styling. Adding a new kind of service or flow is a dictionary
entry, never a code change.

```js
nodeTypes: {
  service:  { color: "#4C82F7" },
  database: { color: "#F79B4C" }
},
edgeTypes: {
  rest:     { color: "#4C82F7", lineStyle: "solid",  width: 2, arrow: "triangle" },
  rabbitmq: { color: "#E0A800", lineStyle: "dashed", width: 2, arrow: "triangle" },
  "file-io":{ color: "#4CAF50", lineStyle: "dashed", width: 1.5, arrow: "none"    }
}
```

`lineStyle` is `solid`, `dashed`, or `dotted`. `arrow` is `triangle` or `none`.
Both dictionaries also generate the legend and its visibility checkboxes.

`color` and `width` describe the **lit** state. The diagram rests in grey and an
element takes its configured colour and width when you hover or select it, or
something one hop away from it — so `width` is how thick a flow gets once it
lights up, not how thick it always is. `lineStyle` and `arrow` apply in both
states, so a dashed flow stays recognisably dashed while it's greyed out.
An element whose `type` isn't in these dictionaries still renders and still
lights, in a neutral grey, and reports a warning.

### `nodes`

```js
{
  id: "orders-service",              // required, unique
  label: "Orders Service",           // defaults to id
  type: "service",                   // key in nodeTypes
  parent: "grp-commerce",            // optional: id of the group node
  position: { x: 440, y: 60 },       // see Layout below
  tags: ["checkout", "fulfillment"], // optional
  details: {                         // free-form, rendered as-is in the panel
    description: "Owns order lifecycle.",
    repo: "github.com/org/orders-service",
    owner: "Commerce"
  }
}
```

**Groups** are just nodes that other nodes point at with `parent`. They need
no `type` and no `position`, and they can be collapsed by double-clicking.

**`details`** has no fixed schema. Every key you add appears in the side panel
with its name title-cased, so `slack_channel`, `runbook`, `oncall` all work
with no code change.

### `edges`

```js
{
  id: "e-orders-bus",         // required, unique
  source: "orders-service",   // must match a node id
  target: "message-bus",      // must match a node id
  type: "rabbitmq",           // key in edgeTypes
  label: "order.created",     // shown on the line
  tags: ["fulfillment"],
  details: { payload: "OrderCreatedEvent { orderId, userId, total }" }
}
```

### `type` vs `tags`

Two independent axes, and it's worth keeping them straight:

- **`type`** drives appearance — colour, shape, line style — via the
  `nodeTypes` / `edgeTypes` dictionaries. Every element has exactly one.
- **`tags`** drive nothing visually. They exist only to filter the diagram
  down to one workflow ("show me everything involved in checkout"). An element
  can have none, one, or many.

Selecting several tags **broadens** the view (OR, not AND). With no tags
selected the filter is off and everything shows. Once any tag is selected,
untagged elements drop out too.

## Layout

Positions are authored data, not computed, so the diagram is stable and
intentional instead of rearranging itself on every reload.

- If **every** ungrouped node has a `position`, those positions are used
  exactly.
- If **any** node is missing one, the whole diagram is auto-arranged and a
  toast says so. Paste in a service list with no coordinates and you get
  something sensible rather than a pile at the origin.

To save a layout after dragging things around, use one of the two toolbar
buttons:

| Button | Copies | Use when |
|---|---|---|
| **Copy layout** | Just the `id` + `position` pairs | You want to update positions by hand and keep your comments and formatting. |
| **Copy data file** | The entire file, positions updated | You want to overwrite `data/local.js` wholesale. |

**"Copy data file" regenerates the file from memory, so any comments you wrote
are lost.** That is exactly why "Copy layout" still exists — use it if your
file is annotated.

One caveat for both: expand any collapsed groups before copying. Children of a
collapsed group aren't on the canvas, so they keep their previously saved
positions rather than picking up new ones.

## When something is wrong

Mistakes are reported in a banner under the toolbar rather than breaking the
render — a bad reference costs you one flow, not the whole diagram:

- an edge pointing at a service id that doesn't exist (the most common typo)
- duplicate node or edge ids
- a `parent` naming a group that isn't defined
- a `type` missing from `nodeTypes` / `edgeTypes` (renders grey)

A syntax error in the file itself can't be reported that way, since the file
never runs. You'll get the setup screen instead; open the browser console
(⌥⌘J in Chrome, ⌥⌘K in Firefox) for the offending line. Browsers hide error
details for local files, so the console is the only place the line number
appears.
