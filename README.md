# Dataflow Diagram

An interactive map of how services pass data around — REST calls, queue
messages, websockets, database reads, file writes — rendered as a pan/zoom
graph you can click into.

It is a single HTML file plus a data file. No build step, no server, no
dependencies to install: open `index.html` in a browser.

## Quick start

```sh
git clone <this repo>
cd dataflow
open index.html          # shows the bundled example diagram
```

To map your own systems:

```sh
cp data/example.js data/local.js
```

Edit `data/local.js`, reload the page. See
[`data/README.md`](data/README.md) for the field reference.

## Your data stays yours

`data/local.js` is **gitignored**. That matters for the main workflow this is
built around: keep the tool in one repo, and use it with different data on
different machines.

```
laptop A:  edit index.html → commit → push
laptop B:  git pull        → tool updates arrive, your data is untouched
```

Because the data file is never tracked here, a pull can't conflict with it and
you never have to paste your services back in after updating.

The `.gitignore` rule is `data/*.js` with an exception for `example.js`, so
anything you drop into `data/` is private by default. Before your first commit
after cloning, `git status` is worth a glance to confirm nothing from `data/`
is staged.

## Keeping your data in git

Untracked *here* doesn't mean unversioned. The simplest option is to make
`data/` its own repository pointing at a private remote:

```sh
cd data/
git init
git remote add origin <your-private-repo>
```

A nested repo works cleanly because the outer repo ignores `data/` already —
the two never see each other, and no submodule machinery is involved.

## Features

- **Pan, zoom, search** across the diagram.
- **Quiet by default** — the whole diagram rests in light grey, and a service or
  flow takes its colour only when you hover or click it, along with everything
  one hop away. Big diagrams stay readable instead of turning into confetti.
- **Click any service or flow** for a detail panel. Fields are free-form: add
  `owner`, `runbook`, `slack`, whatever, purely in the data file.
- **Group services** into collapsible clusters by team or bounded context.
- **Filter by type** from the legend — hide every file write while you study
  the REST call graph.
- **Filter by tag** to isolate one workflow across every transport at once.
- **Multiple datasets** in one file, with a toolbar picker and `?dataset=<id>`
  URLs.
- **Drag to rearrange**, then copy the layout back into your data file.

## Files

| Path | What it is |
|---|---|
| `index.html` | The whole tool. The only file that changes when a feature is added. |
| `data/example.js` | Demo dataset, and the template you copy. |
| `data/local.js` | Your data. Gitignored; created by you. |
| `data/README.md` | Dataset field reference. |
| `DESIGN.md` | How the tool is built and why — the design reference. |
| `tests/` | Browser test suite: `node tests/run.mjs`. Needs Node 22+ and Chrome, nothing installed. |
