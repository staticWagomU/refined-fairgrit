type RecordValue = Record<string, unknown>;
type VueInstance = { $parent?: VueInstance; $props?: RecordValue };

const marker = 'data-refined-fairgrit-summary';
const headings = new Set([
  '発生日', '金額', '金額（片道分）', '金額（往復分）', '請求先', '支払先',
  '目的', '費用科目', '出発駅と到着駅', '経路', '立替精算',
  'インボイス制度 登録番号', '備考',
]);
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const record = (value: unknown): value is RecordValue => value !== null && typeof value === 'object';

export function messageFields(message: unknown): Map<string, string> {
  const source = text(message);
  const matches = [...source.matchAll(/^【([^】\r\n]+)】[ \t]*\r?$/gm)]
    .filter(match => headings.has(match[1]));
  return new Map(matches.map((match, index) => [
    match[1], source.slice(match.index! + match[0].length, matches[index + 1]?.index).trim(),
  ]));
}

export function summary(item: RecordValue): string | undefined {
  if (item.system_usage_name !== 'expense' && item.system_usage_name !== 'travel_cost') return;
  const fields = messageFields(item.message);
  const amount = typeof item.cost === 'number' && Number.isFinite(item.cost) && item.cost >= 0
    ? `${item.cost.toLocaleString('ja-JP')}円`
    : fields.get('金額') || fields.get('金額（往復分）') || fields.get('金額（片道分）');
  const entry = (label: string, value: string | undefined) => `${label}：${value || '—'}`;
  if (item.system_usage_name === 'expense') {
    return [
      entry('費用科目', fields.get('費用科目')),
      entry('支払先', text(item.where_use) || fields.get('支払先')),
      entry('摘要', text(item.reason) || fields.get('目的')),
      entry('金額', amount),
    ].join('\n');
  }
  const from = text(item.route_from), to = text(item.route_to);
  const way = fields.has('金額（往復分）') ? '往復' : fields.has('金額（片道分）') ? '片道' : undefined;
  return [
    entry('区間', from && to ? `${from} ～ ${to}` : fields.get('出発駅と到着駅')),
    entry('路線', text(item.route) || fields.get('経路')),
    entry('片道・往復', way),
    entry('金額', amount),
  ].join('\n');
}

export function applicationId(header: Element): number | undefined {
  const matches = [...(header.textContent || '').matchAll(/申請番号\s*[:：]\s*(\d+)/g)];
  if (matches.length !== 1) return;
  const id = Number(matches[0][1]);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

export function application(header: Element, id: number): RecordValue | undefined {
  const visited = new Set<VueInstance>();
  for (let element: Element | null = header; element; element = element.parentElement) {
    let vue = (element as Element & { __vue__?: VueInstance }).__vue__;
    while (vue && !visited.has(vue)) {
      visited.add(vue);
      // Read props by their data shape, without relying on component names or DOM depth.
      for (const value of Object.values(vue.$props || {})) {
        if (!Array.isArray(value)) continue;
        const matches = value.filter(item => record(item) && item.wf_id === id);
        if (matches.length > 1) return;
        if (matches.length === 1) return matches[0];
      }
      vue = vue.$parent;
    }
  }
}

export function startSummaries(): () => void {
  const rendered = new Map<Element, HTMLElement>();
  let frame: number | undefined;
  let nextId = 0;

  const remove = (header: Element, node: HTMLElement) => {
    const description = (header.getAttribute('aria-describedby') || '').split(/\s+/)
      .filter(id => id && id !== node.id).join(' ');
    if (description) header.setAttribute('aria-describedby', description);
    else header.removeAttribute('aria-describedby');
    node.remove();
    rendered.delete(header);
  };

  const refresh = () => {
    frame = undefined;
    const active = new Set<Element>();
    if (/^\/workflow\/?$/.test(location.pathname)) {
      for (const header of document.querySelectorAll('button, [role="button"]')) {
        const id = applicationId(header);
        if (!id || !header.parentElement) continue;
        const item = application(header, id);
        const value = item && summary(item);
        if (!value) continue;
        active.add(header);
        let node = rendered.get(header);
        if (!node) {
          node = document.createElement('div');
          node.setAttribute(marker, '');
          node.id = `refined-fairgrit-summary-${++nextId}`;
          node.style.cssText = 'margin:0 24px 12px;white-space:pre-wrap;overflow-wrap:anywhere;font-size:14px;line-height:1.7;text-align:left;color:inherit;';
          rendered.set(header, node);
        }
        if (node.textContent !== value) node.textContent = value;
        if (header.nextSibling !== node) header.after(node);
        const description = (header.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
        if (!description.includes(node.id)) header.setAttribute('aria-describedby', [...description, node.id].join(' '));
      }
    }
    for (const [header, node] of rendered) {
      if (!active.has(header)) remove(header, node);
    }
  };
  const schedule = () => { frame ??= requestAnimationFrame(refresh); };
  const ownNode = (node: Node) => (node instanceof Element ? node : node.parentElement)?.closest(`[${marker}]`);
  const observer = new MutationObserver(mutations => {
    if (mutations.some(mutation => !ownNode(mutation.target) && (
      mutation.type !== 'childList' || [...mutation.addedNodes, ...mutation.removedNodes]
        .some(node => !ownNode(node) || !node.isConnected)
    ))) schedule();
  });
  observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['role'] });
  window.addEventListener('popstate', schedule);
  window.addEventListener('pageshow', schedule);
  // Bounded startup retries cover Vue attaching props after the first DOM render.
  const retries = [100, 500, 1500, 3000].map(delay => window.setTimeout(schedule, delay));
  refresh();

  return () => {
    observer.disconnect();
    if (frame !== undefined) cancelAnimationFrame(frame);
    retries.forEach(clearTimeout);
    window.removeEventListener('popstate', schedule);
    window.removeEventListener('pageshow', schedule);
    for (const [header, node] of rendered) remove(header, node);
  };
}
