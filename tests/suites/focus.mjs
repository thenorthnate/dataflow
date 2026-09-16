// The dim-by-default focus lighting (DESIGN.md §7).

export const name = 'focus lighting';
export const app = 'example';

// Palette from index.html. Duplicated deliberately: a test that read the
// constants out of the page would pass no matter what they were changed to.
const DIM_NODE = '#d3d7de';
const DIM_LINE = '#ced3db';
const DIM_LABEL = '#a0a6b1';
const LIT_LABEL = '#222222';
const FALLBACK = '#6b7280';

export async function run(page, t) {
  t.section('opens entirely grey');
  t.eq('nothing is lit on load', await page.lit(), []);
  t.eq('every leaf node is the dim fill',
    await page.json(`[...new Set(__cy.nodes(':childless').map((n) => hex(n.style('background-color'))))]`), [DIM_NODE]);
  t.eq('every node label is dimmed',
    await page.json(`[...new Set(__cy.nodes(':childless').map((n) => hex(n.style('color'))))]`), [DIM_LABEL]);
  t.eq('every edge line is dim',
    await page.json(`[...new Set(__cy.edges().map((e) => hex(e.style('line-color'))))]`), [DIM_LINE]);
  t.eq('every arrowhead is dim',
    await page.json(`[...new Set(__cy.edges().map((e) => hex(e.style('target-arrow-color'))))]`), [DIM_LINE]);
  t.eq('every edge is thin',
    await page.json(`[...new Set(__cy.edges().map((e) => e.numericStyle('width')))]`), [1]);
  t.eq('no edge label is shown',
    await page.json(`[...new Set(__cy.edges().map((e) => e.numericStyle('text-opacity')))]`), [0]);
  t.eq('no edge label background is shown',
    await page.json(`[...new Set(__cy.edges().map((e) => e.numericStyle('text-background-opacity')))]`), [0]);

  t.section('a dim edge keeps its identity');
  t.eq('dashed stays dashed', await page.eval(`st('e-orders-bus', 'line-style')`), 'dashed');
  t.eq('dotted stays dotted', await page.eval(`st('e-gw-ws', 'line-style')`), 'dotted');
  t.eq('solid stays solid', await page.eval(`st('e-web-gw', 'line-style')`), 'solid');
  const noArrow = await page.eval(`__cy.edges('[type = "file-io"]').id()`);
  t.ok('the example has an arrow: "none" flow', !!noArrow, noArrow);
  t.eq('...which has no arrowhead while dim',
    await page.eval(`st(${JSON.stringify(noArrow)}, 'target-arrow-shape')`), 'none');

  t.section('clicking a node lights its 1-hop neighbourhood');
  await page.click('orders-service');
  t.eq('the node, its flows, and the far end of each', await page.lit(), [
    'api-gateway', 'e-gw-orders', 'e-orders-bus', 'e-orders-db', 'e-orders-invoice',
    'file-storage', 'message-bus', 'orders-db', 'orders-service',
  ]);
  t.eq('the node takes its type colour', await page.eval(`hex(st('orders-service', 'background-color'))`), '#4c82f7');
  t.eq('a far-end database takes its colour', await page.eval(`hex(st('orders-db', 'background-color'))`), '#f79b4c');
  t.eq('a far-end broker takes its colour', await page.eval(`hex(st('message-bus', 'background-color'))`), '#e0a800');
  t.eq('a far-end gateway takes its colour', await page.eval(`hex(st('api-gateway', 'background-color'))`), '#2f5fd9');
  t.eq('the label un-dims', await page.eval(`hex(st('orders-service', 'color'))`), LIT_LABEL);
  t.eq('a lit flow takes its type colour', await page.eval(`hex(st('e-orders-bus', 'line-color'))`), '#e0a800');
  t.eq('its arrowhead matches', await page.eval(`hex(st('e-orders-bus', 'target-arrow-color'))`), '#e0a800');
  t.eq('and it is still dashed', await page.eval(`st('e-orders-bus', 'line-style')`), 'dashed');
  t.eq('a lit flow regains its configured width', await page.eval(`num('e-orders-bus', 'width')`), 2);
  t.eq('...including a narrower one', await page.eval(`num('e-orders-db', 'width')`), 1.5);
  t.eq('a lit flow shows its label', await page.eval(`num('e-orders-bus', 'text-opacity')`), 1);
  t.eq('...on its background chip', await page.eval(`num('e-orders-bus', 'text-background-opacity')`), 0.85);
  t.eq('an unrelated node stays dim', await page.eval(`hex(st('web-app', 'background-color'))`), DIM_NODE);
  t.eq('an unrelated flow stays thin', await page.eval(`num('e-web-gw', 'width')`), 1);
  t.eq('the containing group stays dim', await page.eval(`hex(st('grp-commerce', 'background-color'))`), '#eef1f8');
  t.eq('the detail panel opened', await page.eval(`document.getElementById('detail-panel').classList.contains('open')`), true);

  t.section('clicking a flow lights only its two ends');
  await page.click('e-orders-bus');
  t.eq('the flow and both endpoints', await page.lit(), ['e-orders-bus', 'message-bus', 'orders-service']);
  t.eq("the endpoints' other flows stay dim", await page.eval(`__cy.getElementById('e-orders-db').hasClass('lit')`), false);
  t.eq('a selected flow gets the emphasis floor', await page.eval(`num('e-orders-bus', 'width')`), 4);

  t.section('the diagram returns to grey');
  await page.clickEmpty();
  t.eq('clicking the background clears the lighting', await page.lit(), []);
  t.eq('...and closes the panel', await page.eval(`document.getElementById('detail-panel').classList.contains('open')`), false);
  await page.click('orders-service');
  await page.park();
  t.ok('selection alone survives the cursor moving away', (await page.lit()).length > 1);
  await page.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
  await page.sleep(300);
  t.eq('Escape clears it', await page.lit(), []);

  t.section('hover behaves like selection, without selecting');
  await page.hover('payments-service');
  t.eq('hovering a node lights its neighbourhood', await page.lit(), [
    'api-gateway', 'e-gw-pay', 'e-pay-stripe', 'e-payments-db',
    'payment-processor', 'payments-db', 'payments-service',
  ]);
  t.eq('nothing became selected', await page.eval(`__cy.$(':selected').length`), 0);
  t.eq('the panel stayed closed', await page.eval(`document.getElementById('detail-panel').classList.contains('open')`), false);
  t.eq('a grey-coloured node type still reads as lit',
    await page.eval(`hex(st('payment-processor', 'background-color'))`), '#9aa0a6');
  await page.park();
  t.eq('moving to empty canvas clears it', await page.lit(), []);
  await page.hover('e-gw-ws');
  t.eq('hovering a flow lights it and both ends', await page.lit(), ['api-gateway', 'e-gw-ws', 'websocket-gateway']);

  t.section('hover and selection do not fight');
  await page.park();
  await page.click('redis-cache');
  await page.park();
  const selected = await page.lit();
  await page.hover('web-app');
  const both = await page.lit();
  t.ok('the selection stays lit while hovering elsewhere', selected.every((id) => both.includes(id)), { selected, both });
  t.ok('and the hovered element lights too', both.includes('web-app'), both);
  await page.park();
  t.eq('mousing away leaves just the selection', await page.lit(), selected);
  await page.hover('web-app');
  await page.eval(`document.getElementById('cy').dispatchEvent(new MouseEvent('mouseleave'))`);
  await page.sleep(300);
  t.eq('leaving the canvas entirely clears the hover', await page.lit(), selected);
  await page.clickEmpty();

  t.section('an element the type dictionary does not cover');
  await page.eval(`void __cy.add({ group: 'nodes', data: { id: '__probe', label: 'probe', type: 'no-such-type' }, position: { x: 0, y: 0 } })`);
  await page.eval(`void __cy.add({ group: 'edges', data: { id: '__probeEdge', source: '__probe', target: 'orders-service' } })`);
  await page.sleep(200);
  t.eq('an unknown type starts dim', await page.eval(`hex(st('__probe', 'background-color'))`), DIM_NODE);
  t.eq('a type-less flow starts dim', await page.eval(`hex(st('__probeEdge', 'line-color'))`), DIM_LINE);
  await page.select('#__probe');
  t.eq('it can still light, via the fallback', await page.eval(`hex(st('__probe', 'background-color'))`), FALLBACK);
  t.eq('so can the type-less flow', await page.eval(`hex(st('__probeEdge', 'line-color'))`), FALLBACK);
  t.eq('which regains width and label', await page.eval(`num('__probeEdge', 'width') + '/' + num('__probeEdge', 'text-opacity')`), '2/1');
  await page.unselectAll();
  await page.eval(`void __cy.remove('#__probeEdge, #__probe')`);
}
