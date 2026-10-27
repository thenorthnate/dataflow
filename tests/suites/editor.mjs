// The data editor: the Edit view, every section of it, and how its edits reach
// the diagram (rebuilt in place) and Copy data file.
//
// Most assertions check both ends of an edit — what Cytoscape draws after
// switching back, and what Copy data file would hand you — since those are
// the two ways an edit can be lost.

export const name = 'data editor';
export const app = 'example';

const shown = (sel) => `(() => { const el = document.querySelector(${JSON.stringify(sel)}); return !!el && getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0; })()`;

export async function run(page, t, ctx) {
  const edit = () => page.clickEl('#view-edit');
  const back = async () => { await page.clickEl('#view-diagram'); await page.sleep(250); };
  const tab = (s) => page.clickEl(`.ed-tab[data-section="${s}"]`);
  const pick = (kind, id) => page.clickEl(`#ed-${kind}-list .ed-row[data-id="${id}"]`);
  const val = (sel) => page.eval(`document.querySelector(${JSON.stringify(sel)}).value`);
  const data = (id, key) => page.json(`__cy.getElementById(${JSON.stringify(id)}).data(${JSON.stringify(key)}) ?? null`);
  const exists = (id) => page.eval(`__cy.getElementById(${JSON.stringify(id)}).length > 0`);
  const nodeOf = (file, id) => file.nodes.find((n) => n.id === id);
  const edgeOf = (file, id) => file.edges.find((e) => e.id === id);

  await page.captureClipboard();
  await page.stubConfirm(true);

  t.section('switching views');
  t.ok('the view toggle is shown', await page.eval(shown('#view-toggle')));
  t.eq('the diagram view starts selected', await page.eval(`document.getElementById('view-diagram').getAttribute('aria-pressed')`), 'true');
  t.eq('the editor starts hidden', await page.eval(shown('#editor-view')), false);
  const before = await page.copyData();
  await edit();
  t.ok('Edit opens the editor', await page.eval(shown('#editor-view')));
  t.eq('the Edit button is marked pressed', await page.eval(`document.getElementById('view-edit').getAttribute('aria-pressed')`), 'true');
  for (const sel of ['#search-box', '#zoom-in', '#zoom-out', '#fit', '#expand-all', '#collapse-all', '#copy-layout', '#tag-filter', '#legend']) {
    t.eq(`${sel} is hidden while editing`, await page.eval(shown(sel)), false);
  }
  t.ok('Copy data file stays available', await page.eval(shown('#copy-data')));
  t.eq('the nav lists every section',
    await page.json(`[...document.querySelectorAll('.ed-tab')].map((b) => b.dataset.section)`),
    ['dataset', 'nodeTypes', 'edgeTypes', 'tags', 'nodes', 'edges']);
  t.ok('the example reports no problems', /No problems/.test(await page.eval(`document.getElementById('ed-problems').textContent`)));
  t.eq('opening the editor changes nothing that is copied', await page.copyData(), before);
  t.eq('and does not mark the data as edited', await page.eval(`document.getElementById('view-edit').classList.contains('dirty')`), false);
  await back();
  t.eq('Diagram closes the editor', await page.eval(shown('#editor-view')), false);
  t.ok('and brings the canvas controls back', await page.eval(shown('#search-box')) && await page.eval(shown('#legend')));

  t.section('dragged positions carry into the editor');
  await page.eval(`void __cy.getElementById('web-app').position({ x: 111, y: 222 })`);
  await edit();
  await tab('nodes');
  await pick('node', 'web-app');
  t.eq('the form shows the dragged position', [await val('#ed-node-x'), await val('#ed-node-y')], ['111', '222']);
  t.eq('and Copy data file from the editor agrees', nodeOf(await page.copyData(), 'web-app').position, { x: 111, y: 222 });

  t.section('dataset');
  await tab('dataset');
  await page.fill('#ed-dataset-label', 'Renamed diagram');
  t.eq('the toolbar title follows the label', await page.eval(`document.getElementById('diagram-title').textContent`), 'Renamed diagram');
  t.eq('so does the window title', await page.eval('document.title'), 'Renamed diagram — Dataflow');
  t.eq('an edit marks the data as edited', await page.eval(`document.getElementById('view-edit').classList.contains('dirty')`), true);
  await page.fill('#ed-dataset-schema', '1.5');
  t.eq('a schema that is not a whole number is refused', (await page.copyData()).schema, 1);
  await page.fill('#ed-dataset-schema', '1');
  t.eq('the label is in the copied file', (await page.copyData()).label, 'Renamed diagram');
  t.eq('copying clears the edited marker', await page.eval(`document.getElementById('view-edit').classList.contains('dirty')`), false);

  t.section('node types');
  await tab('nodeTypes');
  t.eq('one row per node type', await page.eval(`document.querySelectorAll('#ed-node-types tbody tr').length`), 7);
  await page.fill('tr[data-type="service"] .ed-colour-text', '#ff0000');
  t.eq('a typed colour moves the picker', await val('tr[data-type="service"] .ed-colour'), '#ff0000');
  t.eq('the preview swatch follows', await page.eval(`hex(getComputedStyle(document.querySelector('tr[data-type="service"] .ed-preview .swatch')).backgroundColor)`), '#ff0000');
  await page.fill('tr[data-type="service"] select', 'hexagon');
  await page.fill('tr[data-type="cache"] .ed-key', 'kv-cache');
  await page.fill('tr[data-type="gateway"] .ed-key', 'service');
  t.ok('renaming onto an existing type is refused',
    await page.eval(`document.querySelector('tr[data-type="gateway"] .ed-key').classList.contains('invalid')`));
  await page.fill('tr[data-type="gateway"] .ed-key', 'gateway');
  t.eq('and clears once put back', await page.eval(`document.querySelector('tr[data-type="gateway"] .ed-key').classList.contains('invalid')`), false);
  await page.clickEl('#ed-add-node-type');
  t.ok('Add creates a row', await page.eval(`!!document.querySelector('tr[data-type="new-type"]')`));
  await page.clickEl('tr[data-type="external"] [data-action="remove-type"]');
  t.eq('Remove deletes the row', await page.eval(`!!document.querySelector('tr[data-type="external"]')`), false);
  await back();
  await page.select('#web-app');
  t.eq('the new colour lights the canvas', await page.eval(`hex(st('web-app', 'background-color'))`), '#ff0000');
  t.eq('the new shape is drawn', await page.eval(`st('web-app', 'shape')`), 'hexagon');
  await page.unselectAll();
  t.eq('a renamed type is carried onto its nodes', await data('redis-cache', 'type'), 'kv-cache');
  t.eq('the legend shows the renamed type', await page.eval(`!!document.querySelector('#legend input[data-type="kv-cache"]')`), true);
  t.eq('and the added one', await page.eval(`!!document.querySelector('#legend input[data-type="new-type"]')`), true);
  t.eq('and drops the removed one', await page.eval(`!!document.querySelector('#legend input[data-type="external"]')`), false);
  t.eq('nodes of a removed type are left untyped', await data('payment-processor', 'type'), null);
  t.eq('none of that is reported as a problem', await page.eval(`document.getElementById('warning-banner').hidden`), true);

  t.section('edge types');
  await edit();
  await tab('edgeTypes');
  await page.fill('tr[data-type="rest"] .ed-colour-text', '#00aa00');
  await page.fill('tr[data-type="rest"] select[aria-label="Line style"]', 'dotted');
  await page.fill('tr[data-type="rest"] input[aria-label="Width"]', '5');
  await page.fill('tr[data-type="rest"] select[aria-label="Arrow"]', 'none');
  t.eq('the preview drops its arrowhead', await page.eval(`document.querySelectorAll('tr[data-type="rest"] .ed-preview polygon').length`), 0);
  t.eq('and draws dotted', await page.eval(`document.querySelector('tr[data-type="rest"] .ed-preview line').getAttribute('stroke-linecap')`), 'round');
  await page.fill('tr[data-type="rest"] input[aria-label="Width"]', '-3');
  t.ok('a non-positive width is refused',
    await page.eval(`document.querySelector('tr[data-type="rest"] input[aria-label="Width"]').classList.contains('invalid')`));
  await page.fill('tr[data-type="rest"] input[aria-label="Width"]', '5');
  await back();
  await page.select('#e-gw-orders');
  t.eq('the lit colour follows', await page.eval(`hex(st('e-gw-orders', 'line-color'))`), '#00aa00');
  t.eq('the line style follows', await page.eval(`st('e-gw-orders', 'line-style')`), 'dotted');
  t.eq('the arrowhead follows', await page.eval(`st('e-gw-orders', 'target-arrow-shape')`), 'none');
  t.eq('the width follows (selected, so above the floor of 4)', await page.eval(`num('e-gw-orders', 'width')`), 5);
  await page.unselectAll();
  t.eq('the copied type has every field', (await page.copyData()).edgeTypes.rest,
    { color: '#00aa00', lineStyle: 'dotted', width: 5, arrow: 'none' });

  t.section('tags');
  await edit();
  await tab('tags');
  await page.fill('#ed-new-tag', 'returns');
  await page.clickEl('#ed-add-tag');
  t.ok('Add tag creates a row', await page.eval(`!!document.querySelector('tr[data-tag="returns"]')`));
  await page.fill('#ed-new-tag', 'returns');
  await page.clickEl('#ed-add-tag');
  t.eq('a duplicate tag is refused', await page.eval(`document.querySelectorAll('tr[data-tag="returns"]').length`), 1);
  await page.fill('#ed-new-tag', '');
  await page.fill('tr[data-tag="checkout"] .ed-key', 'purchase');
  await page.clickEl('tr[data-tag="checkout"] [data-action="down"]');
  await page.clickEl('tr[data-tag="notifications"] [data-action="remove-tag"]');
  await back();
  t.eq('the dropdown shows the edited list in order',
    await page.json(`[...document.querySelectorAll('#tag-filter-menu input')].map((i) => i.dataset.tag)`),
    ['fulfillment', 'purchase', 'returns']);
  t.ok('a renamed tag is carried onto its elements', (await data('web-app', 'tags')).includes('purchase'));
  let file = await page.copyData();
  t.eq('a removed tag is gone from every element',
    file.nodes.concat(file.edges).some((el) => (el.tags || []).includes('notifications')), false);
  t.eq('and an element left with no tags loses the key', 'tags' in nodeOf(file, 'notifications-service'), false);
  await page.clickEl('#tag-filter-btn');
  await page.clickEl('#tag-filter-menu input[data-tag="purchase"]');
  t.eq('filtering by the renamed tag works',
    await page.json(`[__cy.getElementById('web-app').hasClass('hidden'), __cy.getElementById('inventory-db').hasClass('hidden')]`),
    [false, true]);
  await page.clickEl('#tag-filter-menu input[data-tag="purchase"]');
  await page.park();
  await page.clickEmpty();

  await edit();
  await tab('tags');
  for (const tag of ['fulfillment', 'purchase', 'returns']) await page.clickEl(`tr[data-tag="${tag}"] [data-action="remove-tag"]`);
  await back();
  t.eq('with no tags left the Tags control hides', await page.eval(shown('#tag-filter')), false);
  t.eq('and the copied file has no tags key', 'tags' in await page.copyData(), false);
  await edit();
  await tab('tags');
  await page.fill('#ed-new-tag', 'ops');
  await page.clickEl('#ed-add-tag');
  await back();
  t.ok('adding a first tag brings the control back', await page.eval(shown('#tag-filter')));

  t.section('nodes');
  await edit();
  await tab('nodes');
  t.eq('members are listed under their group',
    await page.json(`[...document.querySelectorAll('#ed-node-list .ed-row')].slice(0, 4).map((r) => r.dataset.id)`),
    ['grp-frontend', 'web-app', 'mobile-app', 'api-gateway']);
  await page.fill('#ed-node-filter', 'stripe');
  t.eq('the filter narrows the list', await page.json(`[...document.querySelectorAll('#ed-node-list .ed-row')].map((r) => r.dataset.id)`), ['payment-processor']);
  await page.fill('#ed-node-filter', '');
  await page.clickEl('#ed-add-node');
  t.eq('Add node selects the new node', await val('#ed-node-id'), 'new-service');
  t.ok('and gives it a position', (await val('#ed-node-x')) !== '');
  await page.fill('#ed-node-label', 'Search Service');
  await page.fill('#ed-node-parent', 'grp-commerce');
  t.ok('the list shows the new label', /Search Service/.test(await page.eval(`document.getElementById('ed-node-list').textContent`)));
  await page.fill('#ed-node-x', '500');
  await page.fill('#ed-node-y', '');
  t.ok('half a position is refused', await page.eval(`document.getElementById('ed-node-y').classList.contains('invalid')`));
  await page.fill('#ed-node-y', '600');

  await pick('node', 'grp-commerce');
  t.eq('a group has no position fields', await page.eval(`!!document.getElementById('ed-node-x')`), false);
  t.eq('the group picker leaves out the node and its own members',
    await page.json(`['grp-commerce', 'orders-service', 'new-service'].filter((v) => [...document.querySelectorAll('#ed-node-parent option')].some((o) => o.value === v))`),
    []);

  await pick('node', 'inventory-service');
  await page.fill('#ed-node-id', 'api-gateway');
  t.ok('a duplicate id is refused', await page.eval(`document.getElementById('ed-node-id').classList.contains('invalid')`));
  t.ok('with a reason', (await page.eval(`document.querySelector('#ed-node-form .ed-error').textContent`)).length > 0);
  await page.fill('#ed-node-id', '');
  t.ok('so is an empty one', await page.eval(`document.getElementById('ed-node-id').classList.contains('invalid')`));
  await page.fill('#ed-node-id', 'inventory-service');

  await pick('node', 'web-app');
  await page.fill('#ed-node-id', 'web-frontend');
  await page.clickEl('#ed-node-form [data-action="add-detail"]');
  await page.fill('#ed-node-form .ed-detail-row[data-key="field"] .ed-detail-key', 'oncall');
  await page.fill('#ed-node-form .ed-detail-row[data-key="field"] textarea', 'alice');
  await page.clickEl('#ed-node-form .ed-detail-row[data-key="repo"] [data-action="remove-detail"]');
  await page.clickEl('#ed-node-form .ed-chip input[data-tag="ops"]');

  await pick('node', 'redis-cache');
  await page.clickEl('#ed-node-duplicate');
  t.eq('Duplicate selects the copy', await val('#ed-node-id'), 'redis-cache-copy');

  await pick('node', 'orders-service');
  await page.clickEl('#ed-node-delete');
  t.eq('Delete removes it from the list', await page.eval(`!!document.querySelector('#ed-node-list .ed-row[data-id="orders-service"]')`), false);

  await back();
  await page.sleep(500);
  t.eq('no auto-layout was triggered', /No saved layout/.test(await page.eval(`document.getElementById('toast').textContent`)) &&
    await page.eval(`document.getElementById('toast').classList.contains('show')`), false);
  t.eq('existing nodes kept their positions', await page.json(`__cy.getElementById('web-frontend').position()`), { x: 111, y: 222 });
  t.ok('the added node is drawn', await exists('new-service'));
  t.eq('at its edited position', await page.json(`__cy.getElementById('new-service').position()`), { x: 500, y: 600 });
  t.eq('with its label', await data('new-service', 'label'), 'Search Service');
  t.eq('inside its group', await page.eval(`__cy.getElementById('new-service').parent().id()`), 'grp-commerce');
  t.eq('a renamed node keeps its flows', await page.json(`__cy.getElementById('e-web-gw').data('source')`), 'web-frontend');
  t.ok('the duplicate is drawn', await exists('redis-cache-copy'));
  t.eq('a deleted node is gone', await exists('orders-service'), false);
  t.eq('and its edges with it', await page.json(`['e-gw-orders', 'e-orders-db', 'e-orders-bus', 'e-orders-invoice'].filter((id) => __cy.getElementById(id).length)`), []);
  await page.click('web-frontend');
  const panel = await page.eval(`document.getElementById('panel-content').textContent`);
  t.ok('the detail panel shows an added field', /Oncall/.test(panel) && /alice/.test(panel));
  t.eq('and not a removed one', /Repo/.test(panel), false);
  await page.clickEmpty();
  file = await page.copyData();
  t.eq('the copied node has the edits', nodeOf(file, 'web-frontend'), {
    id: 'web-frontend', label: 'Web App', type: 'service', parent: 'grp-frontend', position: { x: 111, y: 222 },
    tags: ['ops'], details: { description: 'Customer-facing React SPA.', owner: 'Frontend Guild', oncall: 'alice' },
  });
  t.eq('the copied edges follow the rename', edgeOf(file, 'e-web-gw').source, 'web-frontend');
  t.eq('the copied new node has keys in the documented order', Object.keys(nodeOf(file, 'new-service')),
    ['id', 'label', 'type', 'parent', 'position']);

  t.section('edges');
  await edit();
  await tab('edges');
  await page.clickEl('#ed-add-edge');
  t.ok('Add edge selects the new edge', (await val('#ed-edge-id')).startsWith('e-'));
  await page.fill('#ed-edge-id', 'e-new');
  await page.fill('#ed-edge-source', 'mobile-app');
  await page.fill('#ed-edge-target', 'redis-cache');
  await page.fill('#ed-edge-label', 'lookup');
  await page.fill('#ed-edge-type', 'websocket');
  await page.fill('#ed-edge-id', 'e-web-gw');
  t.ok('a duplicate edge id is refused', await page.eval(`document.getElementById('ed-edge-id').classList.contains('invalid')`));
  await page.fill('#ed-edge-id', 'e-new');
  t.ok('the list shows the new edge', /Mobile App → Redis Cache/.test(await page.eval(`document.getElementById('ed-edge-list').textContent`)));
  await back();
  t.eq('the new edge is drawn between the chosen nodes',
    await page.json(`[__cy.getElementById('e-new').data('source'), __cy.getElementById('e-new').data('target')]`), ['mobile-app', 'redis-cache']);
  await page.select('#e-new');
  t.eq('in its type’s style', await page.eval(`st('e-new', 'line-style')`), 'dotted');
  await page.unselectAll();
  await edit();
  await pick('edge', 'e-new');
  await page.clickEl('#ed-edge-swap');
  t.eq('swap reverses the form', [await val('#ed-edge-source'), await val('#ed-edge-target')], ['redis-cache', 'mobile-app']);
  await back();
  t.eq('and the drawn direction', await page.json(`__cy.getElementById('e-new').data('source')`), 'redis-cache');
  await edit();
  await pick('edge', 'e-new');
  await page.clickEl('#ed-edge-delete');
  await back();
  t.eq('Delete removes the edge', await exists('e-new'), false);

  t.section('show in diagram');
  await edit();
  await tab('nodes');
  await pick('node', 'payments-service');
  await page.clickEl('#ed-node-show');
  await page.sleep(300);
  t.eq('it switches back to the diagram', await page.eval(shown('#editor-view')), false);
  t.eq('and selects the node', await page.json(`__cy.$(':selected').map((e) => e.id())`), ['payments-service']);
  t.ok('with its panel open', await page.eval(`document.getElementById('detail-panel').classList.contains('open')`));
  await page.clickEmpty();

  t.section('filter state survives an edit');
  await page.clickEl('#legend input[data-type="db"]');
  t.ok('a legend-hidden type hides its edges', await page.eval(`__cy.getElementById('e-inventory-db').hasClass('hidden')`));
  await edit();
  await tab('edgeTypes');
  await page.fill('tr[data-type="db"] .ed-key', 'sql');
  await back();
  t.eq('renamed, its checkbox stays unchecked', await page.eval(`document.querySelector('#legend input[data-type="sql"]').checked`), false);
  t.ok('and its edges stay hidden', await page.eval(`__cy.getElementById('e-inventory-db').hasClass('hidden')`));
  await page.clickEl('#legend input[data-type="sql"]');
  t.eq('the checkbox still works after a rebuild', await page.eval(`__cy.getElementById('e-inventory-db').hasClass('hidden')`), false);
  await page.clickEl('#legend input[data-type="sql"]');
  await edit();
  await tab('edgeTypes');
  await page.clickEl('tr[data-type="sql"] [data-action="remove-type"]');
  await back();
  t.eq('removed, nothing stays hidden on its account', await page.eval(`__cy.getElementById('e-inventory-db').hasClass('hidden')`), false);
  // A listener bound inside a render half would fire once per rebuild; one
  // click toggling the filter twice would leave the edge where it started.
  await page.clickEl('#legend input[data-type="rabbitmq"]');
  t.ok('after several rebuilds one legend click still toggles once', await page.eval(`__cy.getElementById('e-bus-inventory').hasClass('hidden')`));
  await page.clickEl('#legend input[data-type="rabbitmq"]');
  t.eq('and back', await page.eval(`__cy.getElementById('e-bus-inventory').hasClass('hidden')`), false);

  t.section('collapsed groups');
  await page.clickEl('#collapse-all');
  await page.sleep(700);
  t.eq('a member of a collapsed group is off the canvas', await exists('payments-service'), false);
  await edit();
  await tab('nodes');
  await pick('node', 'payments-service');
  await page.fill('#ed-node-label', 'Payments API');
  await back();
  t.eq('editing it brings it back expanded, with the edit', await data('payments-service', 'label'), 'Payments API');
  t.ok('still in its group', await page.eval(`__cy.getElementById('payments-service').parent().id() === 'grp-payments'`));

  t.section('user text stays text');
  const evil = '<img src=x onerror="window.__xss=1">';
  await edit();
  await pick('node', 'payments-service');
  await page.fill('#ed-node-label', evil);
  await page.fill('#ed-node-form .ed-detail-row[data-key="owner"] textarea', evil);
  t.ok('the list shows it as text', (await page.eval(`document.getElementById('ed-node-list').textContent`)).includes(evil));
  t.eq('without creating an element', await page.eval(`document.querySelectorAll('#editor-view img').length`), 0);
  await back();
  await page.click('payments-service');
  t.eq('the detail panel shows it as text too', await page.eval(`document.querySelectorAll('#panel-content img').length`), 0);
  t.eq('nothing ran', await page.eval('window.__xss === undefined'), true);
  await page.clickEmpty();

  t.section('problems');
  await page.copyData();
  await page.goto(`${ctx.origins.edgeCases}/index.html?dataset=edge-cases`);
  await page.captureClipboard();
  await page.stubConfirm(true);
  const bannerCount = () => page.eval(`document.querySelectorAll('#warning-banner li').length`);
  const editorCount = () => page.eval(`document.querySelectorAll('#ed-problems li').length`);
  const banner0 = await bannerCount();
  await edit();
  t.eq('the editor lists the same problems as the banner', await editorCount(), banner0);
  await tab('edges');
  await pick('edge', 'bad');
  t.ok('a dangling endpoint is flagged in its picker', /not defined/.test(await page.eval(`document.getElementById('ed-edge-target').selectedOptions[0].textContent`)));
  await page.fill('#ed-edge-target', 'n2');
  t.eq('fixing it drops the problem at once', await editorCount(), banner0 - 1);
  await back();
  t.eq('and from the banner after switching back', await bannerCount(), banner0 - 1);
  t.ok('the fixed edge is drawn', await exists('bad'));

  t.section('unsaved edits');
  const leaving = `(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; })()`;
  t.eq('leaving with edits not yet copied asks first', await page.eval(leaving), true);
  t.ok('and the Edit button shows the marker', await page.eval(`document.getElementById('view-edit').classList.contains('dirty')`));
  await page.copyData();
  t.eq('once copied, leaving does not ask', await page.eval(leaving), false);
}
