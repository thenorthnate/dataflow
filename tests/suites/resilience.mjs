// The failure paths (DESIGN.md §9) and the loader (§4), plus the type-dictionary
// edge cases that the example dataset is too well-formed to reach.

export const name = 'resilience and loading';
export const app = 'edge-cases';

const DIM_NODE = '#d3d7de';
const DIM_LINE = '#ced3db';
const FALLBACK = '#6b7280';

export async function run(page, t, ctx) {
  // ?dataset= is explicit because the picker remembers the last choice in
  // localStorage, which otherwise leaks between runs and loads the wrong graph.
  await page.goto(`${ctx.origin}/index.html?dataset=edge-cases`);

  t.section('a bad reference costs one flow, not the diagram');
  t.eq('the diagram still rendered', await page.eval('!!window.__cy'), true);
  t.eq('the dangling flow was dropped', await page.eval(`__cy.getElementById('bad').length > 0`), false);
  t.eq('the good flows survived', await page.eval('__cy.edges().length'), 3);
  t.eq('the warning banner is shown', await page.eval(`!document.getElementById('warning-banner').hidden`), true);
  t.ok('and names the bad reference',
    /ghost-node|unknown/i.test(await page.eval(`document.getElementById('warning-banner').textContent`)));

  t.section('types the dictionary does not cover');
  t.eq('an unknown node type starts dim', await page.eval(`hex(st('n3', 'background-color'))`), DIM_NODE);
  t.eq('a type-less flow starts dim and thin',
    await page.eval(`hex(st('untyped', 'line-color')) + '/' + num('untyped', 'width')`), `${DIM_LINE}/1`);
  await page.select('#n3');
  t.eq('the unknown type lights via the fallback', await page.eval(`hex(st('n3', 'background-color'))`), FALLBACK);
  t.eq('so does the type-less flow', await page.eval(`hex(st('untyped', 'line-color'))`), FALLBACK);
  t.eq('which regains width and label', await page.eval(`num('untyped', 'width') + '/' + num('untyped', 'text-opacity')`), '2/1');
  await page.unselectAll();

  t.section('selection emphasis is a floor, not a fixed width');
  t.eq('a thick flow type is still thin while dim', await page.eval(`num('thick', 'width')`), 1);
  await page.select('#n3');
  t.eq('and lights at its configured 6', await page.eval(`num('thick', 'width')`), 6);
  await page.unselectAll();
  await page.select('#thick');
  t.eq('selecting it does not shrink it to 4', await page.eval(`num('thick', 'width')`), 6);
  await page.unselectAll();
  await page.select('#ok');
  t.eq('a thinner type does get raised to the floor', await page.eval(`num('ok', 'width')`), 4);
  await page.unselectAll();

  t.section('dataset picker');
  t.eq('the picker is shown for two datasets', await page.eval(`!document.getElementById('dataset-picker').hidden`), true);
  t.eq('both datasets are listed', await page.eval(`document.getElementById('dataset-picker').options.length`), 2);
  await page.eval(`(() => { const p = document.getElementById('dataset-picker');
    p.value = 'second'; p.dispatchEvent(new Event('change')); })()`);
  await page.waitForDiagram();
  await page.installHelpers();
  t.eq('switching loads the other graph', await page.eval('__cy.nodes().length'), 2);
  t.eq('which also opens dim', await page.lit(), []);
  t.eq('its nodes start dim', await page.eval(`hex(st('m1', 'background-color'))`), DIM_NODE);
  await page.select('#q1');
  t.eq('its flow lights in its own colour', await page.eval(`hex(st('q1', 'line-color'))`), '#e0a800');
  t.eq('keeping its dashed identity', await page.eval(`st('q1', 'line-style')`), 'dashed');
  t.eq('and lighting both endpoints', (await page.lit()).length, 3);

  t.section('no data file at all');
  await page.goto(`${ctx.origins.noData}/index.html`, { expectDiagram: false });
  t.eq('the setup screen is shown', await page.eval(`!document.getElementById('setup-screen').hidden`), true);
  t.eq('and no diagram was built', await page.eval('!!window.__cy'), false);

  t.section('opened straight from file://');
  // The one check that reads the repo as it actually sits on disk, because the
  // whole loading model rests on script-tag behaviour and file:// is how this
  // tool is meant to be opened. If this machine has a private data/local.js the
  // loader will prefer it, so the assertions here stay shape-based rather than
  // naming elements that only exist in the bundled example.
  await page.goto(`file://${ctx.repoRoot}/index.html`);
  t.ok('it renders', (await page.eval('__cy.nodes().length')) > 0);
  t.eq('it opens dim', await page.lit(), []);
  t.eq('with every flow thin and grey',
    await page.eval(`__cy.edges().every((e) => e.numericStyle('width') === 1 && hex(e.style('line-color')) === '${DIM_LINE}')`), true);
  const first = await page.eval(`__cy.nodes(':childless').first().id()`);
  await page.select(`#${first}`);
  t.ok(`selecting "${first}" lights it`, await page.eval(`__cy.getElementById(${JSON.stringify(first)}).hasClass('lit')`));
  t.eq('...and it is no longer the dim fill',
    await page.eval(`hex(st(${JSON.stringify(first)}, 'background-color')) !== '${DIM_NODE}'`), true);
  if (ctx.hasLocalData) console.log('       (this machine has data/local.js, so file:// ran against it)');
}
