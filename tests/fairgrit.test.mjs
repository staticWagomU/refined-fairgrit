import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { messageFields, startSummaries, summary } from '../utils/fairgrit.ts';

test('申請番号で追従し、DOM変更・再描画・欠落・SPA遷移で誤った要約を残さない', async () => {
  const { window, document } = parseHTML('<html><body><section><article><div><button aria-describedby="existing"><b>申請番号：</b><span>101</span></button></div></article></section></body></html>');
  const path = { pathname: '/workflow' };
  const keys = ['window', 'document', 'Element', 'MutationObserver', 'location', 'requestAnimationFrame', 'cancelAnimationFrame'];
  const saved = keys.map(key => [key, globalThis[key]]);
  Object.assign(globalThis, {
    window, document, Element: window.Element, MutationObserver: window.MutationObserver, location: path,
    requestAnimationFrame: callback => setTimeout(callback, 0), cancelAnimationFrame: clearTimeout,
  });
  let stop;
  const tick = () => new Promise(resolve => setTimeout(resolve, 20));
  try {
    const expense = { wf_id: 101, system_usage_name: 'expense', cost: 1200, where_use: '<script>店</script>', reason: '複数行\n本文中の【記号】', message: '【費用科目】\r\n研修費\r\n\r\n【備考】\r\nメモ' };
    const travel = { wf_id: 202, system_usage_name: 'travel_cost', cost: 1060, route_from: '出発', route_to: '到着', route: '路線', message: '【金額（往復分）】\n1,060円\n\n【備考】\n往復' };
    const owner = { $props: { renamedList: [travel, expense] } };
    document.querySelector('section').__vue__ = { $parent: owner };
    assert.equal(messageFields('【目的】\n本文【記号】\n【独自表記】\n続き\n\n【金額】\n0円').get('目的'), '本文【記号】\n【独自表記】\n続き');
    assert.match(summary(travel), /片道・往復：往復\n金額：1,060円$/);
    assert.match(summary({ ...travel, cost: NaN }), /金額：1,060円$/);
    assert.match(summary({ ...expense, cost: 0 }), /金額：0円$/);
    assert.equal(summary({ system_usage_name: 'holiday' }), undefined);
    stop = startSummaries();
    const notes = () => [...document.querySelectorAll('[data-refined-fairgrit-summary]')];
    const header = document.querySelector('button');
    assert.equal(notes().length, 1);
    assert.match(notes()[0].textContent, /費用科目：研修費/);
    assert.equal(notes()[0].querySelector('script'), null);
    assert.match(header.getAttribute('aria-describedby'), /^existing refined-fairgrit-summary-/);
    notes()[0].remove(); // A page rerender may remove only the injected sibling.
    await tick();
    assert.equal(notes().length, 1);

    // Same button, different application; array order and DOM depth are unrelated to identity.
    header.querySelector('span').textContent = '202';
    await tick();
    assert.equal(notes().length, 1);
    assert.match(notes()[0].textContent, /区間：出発 ～ 到着/);
    assert.doesNotMatch(notes()[0].textContent, /研修費/);

    // Replace the card and use an ARIA button, with no Vuetify classes or component names.
    document.querySelector('article').innerHTML = '<main role="button"><aside><div role="button">申請番号: 101</div></aside></main>';
    await tick();
    assert.equal(notes().length, 1);
    assert.match(notes()[0].textContent, /研修費/);
    owner.$props.renamedList = [travel];
    document.querySelector('aside [role="button"]').append(' 更新');
    await tick();
    assert.equal(notes().length, 0);
    owner.$props.renamedList = [expense, expense];
    document.querySelector('aside [role="button"]').append(' 更新');
    await tick();
    assert.equal(notes().length, 0); // Ambiguous identity must not render.
    owner.$props.renamedList = [expense];
    document.querySelector('aside [role="button"]').append(' 更新');
    await tick();
    assert.equal(notes().length, 1);
    path.pathname = '/weekly';
    window.dispatchEvent(new window.Event('popstate'));
    await tick();
    assert.equal(notes().length, 0);
    path.pathname = '/workflow/';
    window.dispatchEvent(new window.Event('popstate'));
    await tick();
    assert.equal(notes().length, 1);
    stop();
    assert.equal(notes().length, 0);
    assert.equal(document.querySelector('aside [role="button"]').hasAttribute('aria-describedby'), false);
    await tick();
    assert.equal(notes().length, 0);
  } finally {
    stop?.();
    for (const [key, value] of saved) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
});
