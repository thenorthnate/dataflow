// Every widget, exercised (CLAUDE.md: each widget must interact and display),
// with an eye on how each one composes with the focus lighting.

export const name = 'widgets';
export const app = 'example';

const DIM_LINE = '#ced3db';
const FALLBACK = '#6b7280';

const setCheckbox = (selector, checked) =>
  `(() => { const cb = document.querySelector(${JSON.stringify(selector)});
            cb.checked = ${checked}; cb.dispatchEvent(new Event('change', { bubbles: true })); })()`;

export async function run(page, t) {
  const search = async (q) => {
    await page.eval(`(() => { const b = document.getElementById('search-box');
      b.value = ${JSON.stringify(q)}; b.dispatchEvent(new Event('input')); })()`);
    await page.sleep(450);
  };

  t.section('search');
  await search('orders');
  const hits = await page.lit();
  t.ok('matches light up', hits.includes('orders-service') && hits.includes('orders-db'), hits);
  t.ok('so do their flows', hits.includes('e-orders-db'), hits);
  t.eq('a non-match is not lit', await page.eval(`__cy.getElementById('web-app').hasClass('lit')`), false);
  t.eq('a non-match is faded', await page.eval(`__cy.getElementById('web-app').hasClass('faded')`), true);
  t.eq('nothing is lit and faded at once', await page.eval(`__cy.$('.lit.faded').length`), 0);
  await search('zzzznope');
  t.eq('a no-match search lights nothing', await page.lit(), []);
  t.eq('...and fades nothing', await page.eval(`__cy.$('.faded').length`), 0);
  await search('');
  t.eq('clearing returns to grey', await page.lit(), []);
  t.eq('...with no fading left', await page.eval(`__cy.$('.faded').length`), 0);
  t.eq('...and no highlight left', await page.eval(`__cy.$('.highlighted').length`), 0);

  t.section('legend type filter');
  const dbEdge = (await page.json(`__cy.edges('[type = "db"]').map((e) => e.id())`))[0];
  await page.eval(setCheckbox('#legend input[data-kind="edge"][data-type="db"]', false));
  await page.sleep(300);
  t.eq('unchecking hides that flow type', await page.eval(`__cy.edges('[type = "db"]').every((e) => e.hasClass('hidden'))`), true);
  await page.click('orders-service');
  const lit = await page.lit();
  t.eq('the hidden flow does not light', lit.includes(dbEdge), false);
  t.eq('nor the node reachable only across it', lit.includes('orders-db'), false);
  t.ok('visible neighbours still light', lit.includes('message-bus') && lit.includes('api-gateway'), lit);
  t.eq('nothing hidden is ever lit', await page.eval(`__cy.$('.hidden.lit').length`), 0);
  await page.eval(setCheckbox('#legend input[data-kind="edge"][data-type="db"]', true));
  await page.sleep(300);
  t.ok('re-checking restores it and re-lights the neighbour', (await page.lit()).includes('orders-db'));
  t.eq('legend swatches stay in full colour',
    await page.eval(`document.querySelector('#legend input[data-kind="node"][data-type="service"]').parentElement.querySelector('.swatch').style.background`),
    'rgb(76, 130, 247)');
  await page.clickEmpty();

  t.section('tag filter');
  await page.eval(`document.getElementById('tag-filter-btn').click()`);
  await page.sleep(200);
  t.eq('the menu opens', await page.eval(`!document.getElementById('tag-filter-menu').hidden`), true);
  const tag = await page.eval(`document.querySelector('#tag-filter-menu input[data-tag]').dataset.tag`);
  await page.eval(setCheckbox('#tag-filter-menu input[data-tag]', true));
  await page.sleep(300);
  t.ok(`checking "${tag}" narrows the diagram`, (await page.eval(`__cy.$('.hidden').length`)) > 0);
  t.eq('and still nothing hidden is lit', await page.eval(`__cy.$('.hidden.lit').length`), 0);
  await page.eval(setCheckbox('#tag-filter-menu input[data-tag]', false));
  await page.sleep(300);
  t.eq('unchecking restores everything', await page.eval(`__cy.$('.hidden').length`), 0);
  await page.eval(`document.getElementById('tag-filter-btn').click()`);
  await page.sleep(150);

  t.section('collapse and expand groups');
  await page.hover('orders-service');
  await page.eval(`document.getElementById('collapse-all').click()`);
  await page.sleep(900);
  t.eq('collapsing out from under the cursor leaves nothing stuck lit', await page.lit(), []);
  t.eq('the groups collapsed', await page.eval(`__cy.nodes('.cy-expand-collapse-collapsed-node').length`), 4);
  t.ok('cross-group flows survive', (await page.eval(`__cy.edges('.cy-expand-collapse-meta-edge').length`)) > 0);
  t.eq('and start dim and thin',
    await page.eval(`__cy.edges('.cy-expand-collapse-meta-edge').every((e) => e.numericStyle('width') === 1 && hex(e.style('line-color')) === '${DIM_LINE}')`), true);
  // Collapsed geometry overlaps heavily, so these drive selection directly;
  // real-pointer hit-testing on a 1px edge is covered in the focus suite.
  await page.select('#e-gw-orders');
  t.eq('a surviving flow lights in its own type colour', await page.eval(`hex(st('e-gw-orders', 'line-color'))`), '#4c82f7');
  t.eq('...and lights both collapsed groups', (await page.lit()).length, 3);
  await page.unselectAll();
  await page.select('#grp-commerce');
  t.ok('a collapsed group lights its own flows', (await page.lit()).length > 1);
  // A collapsed group stops matching :parent — it is a type-less ellipse — so
  // the fallback colour is exactly what should light it.
  t.eq('a collapsed group lights via the fallback', await page.eval(`hex(st('grp-commerce', 'background-color'))`), FALLBACK);
  await page.unselectAll();
  await page.eval(`document.getElementById('expand-all').click()`);
  await page.sleep(900);
  await page.park();
  t.eq('expanding restores the whole graph', await page.eval(`__cy.nodes().length + '/' + __cy.edges().length`), '19/16');
  t.eq('with nothing left lit', await page.lit(), []);
  t.eq('and every flow thin and grey again',
    await page.eval(`__cy.edges().every((e) => e.numericStyle('width') === 1 && hex(e.style('line-color')) === '${DIM_LINE}')`), true);

  t.section('an expanded group box lights as chrome');
  // Applied directly rather than clicked: node:selected paints its own dark
  // border last, which would mask the border this rule is responsible for.
  await page.eval(`void __cy.getElementById('grp-commerce').addClass('lit')`);
  await page.sleep(200);
  t.eq('it keeps its pale fill', await page.eval(`hex(st('grp-commerce', 'background-color'))`), '#eef1f8');
  t.eq('it is not flooded with the fallback', await page.eval(`hex(st('grp-commerce', 'background-color')) !== '${FALLBACK}'`), true);
  t.eq('its outline firms up instead', await page.eval(`hex(st('grp-commerce', 'border-color'))`), '#9aa2b5');
  await page.eval(`void __cy.getElementById('grp-commerce').removeClass('lit')`);

  t.section('detail panel navigation');
  await page.click('orders-service');
  await page.park();
  t.eq('the node panel lists its flows', await page.eval(`document.querySelectorAll('#panel-content .flow-list li').length`), 4);
  await page.eval(`document.querySelector('#panel-content .flow-list li').click()`);
  await page.sleep(300);
  t.eq('node -> flow re-lights for the flow', (await page.lit()).length, 3);
  t.eq('and the panel followed', await page.eval(`!!document.querySelector('#panel-content .endpoint-link')`), true);
  await page.eval(`document.querySelector('#panel-content .endpoint-link').click()`);
  await page.sleep(300);
  t.ok('flow -> endpoint re-lights for that node', (await page.lit()).length > 3);
  await page.eval(`document.getElementById('close-panel').click()`);
  await page.sleep(300);
  await page.park();
  t.eq('closing the panel returns to grey', await page.lit(), []);

  t.section('zoom, fit, copy');
  // Fit first: the search above zoomed to a single node, which can leave the
  // canvas pinned at maxZoom where zoom-in has nothing left to do.
  await page.eval(`document.getElementById('fit').click()`);
  await page.sleep(500);
  const zoom0 = await page.eval('__cy.zoom()');
  t.ok('zoom starts below the maximum', zoom0 < 4, zoom0);
  await page.eval(`document.getElementById('zoom-in').click()`);
  await page.sleep(250);
  t.ok('zoom in', (await page.eval('__cy.zoom()')) > zoom0);
  await page.eval(`document.getElementById('zoom-out').click()`);
  await page.sleep(250);
  t.ok('zoom out', Math.abs((await page.eval('__cy.zoom()')) - zoom0) < 0.001);
  await page.eval(`document.getElementById('fit').click()`);
  await page.sleep(500);
  t.ok('fit', (await page.eval('__cy.zoom()')) > 0);
  const copied = `document.getElementById('toast').classList.contains('show') || !!document.getElementById('layout-fallback')`;
  await page.eval(`document.getElementById('copy-layout').click()`);
  await page.sleep(400);
  t.ok('copy layout produces output', await page.eval(copied));
  await page.eval(`document.getElementById('copy-data').click()`);
  await page.sleep(400);
  t.ok('copy data file produces output', await page.eval(copied));
  await page.eval(`document.getElementById('close-panel').click()`);
}
