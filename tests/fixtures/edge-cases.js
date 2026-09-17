// Fixture: deliberately awkward data, served to the page as data/local.js.
//
// Everything in here exists to exercise a path the example dataset cannot:
//   - "bad"       edge pointing at a node that does not exist
//   - "n3"        node whose type is not in nodeTypes
//   - "untyped"   edge with no type at all
//   - "fat"       edge type configured thicker than the selection floor (4)
//   - "odd"       node type asking for a shape the tool does not know
//   - "grp"       a group node that also carries a type, which must not make
//                 the container take that type's shape
//   - a second dataflow() call, for the dataset picker
//
// Not under data/, on purpose: .gitignore fails closed on data/*.js, and a
// fixture that cannot be committed is a fixture that rots.

dataflow({
  "id": "edge-cases",
  "label": "Edge cases",
  "nodeTypes": {
    "svc": { "color": "#4C82F7" },
    "boxy": { "color": "#4C82F7", "shape": "round-rectangle" },
    "odd":  { "color": "#4C82F7", "shape": "trapezoid" }
  },
  "edgeTypes": {
    "rest": { "color": "#4C82F7", "lineStyle": "solid", "width": 3, "arrow": "triangle" },
    "fat":  { "color": "#AA3377", "lineStyle": "solid", "width": 6, "arrow": "none" }
  },
  "nodes": [
    { "id": "n1", "label": "One",  "type": "svc",               "position": { "x": 0,   "y": 0 } },
    { "id": "n2", "label": "Two",  "type": "svc",               "position": { "x": 220, "y": 0 } },
    { "id": "n3", "label": "Typo", "type": "nonexistent-type",  "position": { "x": 440, "y": 0 } },
    { "id": "n4", "label": "Odd",  "type": "odd",               "position": { "x": 660, "y": 0 } },
    // A group that carries a type, which a container must ignore.
    { "id": "grp", "label": "Grouped", "type": "boxy" },
    { "id": "n5", "label": "Inside", "type": "svc", "parent": "grp", "position": { "x": 220, "y": 200 } }
  ],
  "edges": [
    { "id": "ok",      "source": "n1", "target": "n2",         "type": "rest", "label": "fine" },
    { "id": "bad",     "source": "n1", "target": "ghost-node", "type": "rest", "label": "dangling" },
    { "id": "untyped", "source": "n2", "target": "n3",                         "label": "no type" },
    { "id": "thick",   "source": "n1", "target": "n3",         "type": "fat",  "label": "very thick" }
  ]
});

dataflow({
  "id": "second",
  "label": "Second dataset",
  "nodeTypes": { "svc": { "color": "#E0A800" } },
  "edgeTypes": { "q": { "color": "#E0A800", "lineStyle": "dashed", "width": 2, "arrow": "triangle" } },
  "nodes": [
    { "id": "m1", "label": "Alpha", "type": "svc", "position": { "x": 0,   "y": 0 } },
    { "id": "m2", "label": "Beta",  "type": "svc", "position": { "x": 200, "y": 0 } }
  ],
  "edges": [
    { "id": "q1", "source": "m1", "target": "m2", "type": "q", "label": "queue" }
  ]
});
