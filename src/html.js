// Splits a finished HTML design into build-up steps using data-step="N" attributes.
// No dependencies: a small tolerant tokenizer that tracks element nesting.

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title']);
const TAG = /<!--[\s\S]*?-->|<![^>]*>|<\/?([a-zA-Z][\w:-]*)((?:\s+[^\s"'>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/g;
const STEP_ATTR = /\s+data-step\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i;

export function tokenize(html) {
  const tokens = [];
  let last = 0;
  TAG.lastIndex = 0;
  let m;
  while ((m = TAG.exec(html))) {
    if (m.index > last) tokens.push({ type: 'text', raw: html.slice(last, m.index) });
    const raw = m[0];
    if (!m[1]) {
      tokens.push({ type: 'other', raw });
    } else if (raw[1] === '/') {
      tokens.push({ type: 'close', raw, name: m[1].toLowerCase() });
    } else {
      const name = m[1].toLowerCase();
      tokens.push({ type: 'open', raw, name, attrs: m[2] || '', selfClosing: !!m[3] || VOID.has(name) });
      if (RAW_TEXT.has(name)) {
        // everything up to the matching close tag is text (CSS, scripts, …)
        const end = html.toLowerCase().indexOf(`</${name}`, TAG.lastIndex);
        const stop = end < 0 ? html.length : end;
        if (stop > TAG.lastIndex) tokens.push({ type: 'text', raw: html.slice(TAG.lastIndex, stop) });
        TAG.lastIndex = stop;
      }
    }
    last = TAG.lastIndex;
  }
  if (last < html.length) tokens.push({ type: 'text', raw: html.slice(last) });
  return tokens;
}

function stepOf(attrs) {
  const m = STEP_ATTR.exec(attrs || '');
  if (!m) return null;
  const n = Number(m[1] ?? m[2] ?? m[3]);
  return Number.isFinite(n) ? n : null;
}

/** The distinct data-step values in a design, ascending. Empty if the design isn't tagged. */
export function stepValues(html) {
  const seen = new Set();
  for (const t of tokenize(html)) if (t.type === 'open') { const s = stepOf(t.attrs); if (s !== null) seen.add(s); }
  return [...seen].sort((a, b) => a - b);
}

/**
 * The design as it looks at step `k`: elements tagged with a later step are removed (with their content),
 * elements tagged exactly `k` get data-lapse="new", and data-step attributes are stripped.
 */
export function renderStep(html, k) {
  const out = [];
  const stack = [];
  let skipAt = -1;
  for (const t of tokenize(html)) {
    if (t.type === 'open') {
      const step = stepOf(t.attrs);
      if (skipAt < 0 && step !== null && step > k) {
        if (!t.selfClosing) { skipAt = stack.length; stack.push(t.name); }
        continue;
      }
      if (!t.selfClosing) stack.push(t.name);
      if (skipAt >= 0) continue;
      let raw = t.raw.replace(STEP_ATTR, '');
      if (step !== null && step === k) raw = raw.replace(/^<([a-zA-Z][\w:-]*)/, '<$1 data-lapse="new"');
      out.push(raw);
    } else if (t.type === 'close') {
      const i = stack.lastIndexOf(t.name);
      if (i >= 0) stack.length = i;
      if (skipAt >= 0) { if (stack.length <= skipAt) skipAt = -1; continue; }
      out.push(t.raw);
    } else if (skipAt < 0) {
      out.push(t.raw);
    }
  }
  return out.join('');
}

/** The final design with data-step attributes removed. */
export function stripSteps(html) {
  return tokenize(html).map(t => (t.type === 'open' ? t.raw.replace(STEP_ATTR, '') : t.raw)).join('');
}

/** Every build-up step of a tagged design, in order. An untagged design is a single step. */
export function splitSteps(html) {
  const values = stepValues(html);
  if (!values.length) return [stripSteps(html)];
  return values.map(k => renderStep(html, k));
}
