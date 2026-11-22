// A Designlapse project is a folder (default: ./designs) holding one JSON file per design plus its step files.
//   designs/<name>.json        { title, prompt, frame, url?, created, steps: [{ id, parent?, file }] }
//   designs/<name>/NN.html     one standalone HTML file per step
//   designs/designlapse.html   the page with every design, built by build()
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitSteps } from './html.js';

export const FRAMES = ['phone', 'tablet', 'browser', 'none'];
const TEMPLATE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'template', 'page.html');
const PAGE = 'designlapse.html';

export const slugify = s => String(s || '').toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'design';
const pad = n => String(n).padStart(2, '0');
const rel = p => path.relative(process.cwd(), p) || '.';

function readDesign(dir, name) {
  const file = path.join(dir, `${name}.json`);
  if (!fs.existsSync(file)) throw new Error(`No design named "${name}" in ${rel(dir)} (looked for ${rel(file)}). Run \`designlapse list\` to see the names.`);
  return { file, data: JSON.parse(fs.readFileSync(file, 'utf8')) };
}
const writeJSON = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');

/**
 * Add a design from its finished HTML. Pieces tagged data-step="1", "2", … become the build-up steps;
 * the last step is the finished design.
 */
export function add(finalFile, { dir = 'designs', name, title, prompt, frame = 'phone', url, force = false } = {}) {
  if (!FRAMES.includes(frame)) throw new Error(`Unknown frame "${frame}" — use one of: ${FRAMES.join(', ')}`);
  const html = fs.readFileSync(finalFile, 'utf8');
  const slug = slugify(name || title || path.basename(finalFile, path.extname(finalFile)));
  fs.mkdirSync(dir, { recursive: true });
  const jsonFile = path.join(dir, `${slug}.json`);
  const stepDir = path.join(dir, slug);
  if (fs.existsSync(jsonFile) && !force) throw new Error(`A design named "${slug}" already exists. Use \`designlapse iterate ${slug} …\` to add to it, or --force to replace it.`);
  fs.rmSync(stepDir, { recursive: true, force: true });
  fs.mkdirSync(stepDir, { recursive: true });
  const steps = splitSteps(html).map((h, i) => {
    const file = `${slug}/${pad(i + 1)}.html`;
    fs.writeFileSync(path.join(dir, file), h);
    return { id: String(i + 1), file };
  });
  const data = { title: title || slug, ...(prompt ? { prompt } : {}), frame, ...(url ? { url } : {}), created: new Date().toISOString(), steps };
  writeJSON(jsonFile, data);
  return { name: slug, json: jsonFile, steps: steps.length };
}

/** Add a new step to a design, iterating from step `from` (a branch when `from` isn't the latest step). */
export function iterate(name, file, { dir = 'designs', from } = {}) {
  const { file: jsonFile, data } = readDesign(dir, name);
  const steps = data.steps || [];
  const ids = steps.map((s, i) => String(s.id ?? i + 1));
  const parent = from == null ? ids[ids.length - 1] : String(from);
  if (parent && !ids.includes(parent)) throw new Error(`Design "${name}" has no step ${parent}. Steps: ${ids.join(', ')}`);
  const id = String(Math.max(0, ...ids.map(Number).filter(Number.isFinite)) + 1);
  const stepFile = `${name}/${pad(id)}.html`;
  fs.mkdirSync(path.join(dir, name), { recursive: true });
  fs.writeFileSync(path.join(dir, stepFile), fs.readFileSync(file, 'utf8'));
  steps.forEach((s, i) => { s.id = ids[i]; });
  steps.push({ id, ...(parent ? { parent } : {}), file: stepFile });
  data.steps = steps;
  writeJSON(jsonFile, data);
  const branch = parent && parent !== ids[ids.length - 1];
  return { name, id, parent, branch, file: path.join(dir, stepFile) };
}

/** Every design in the folder, oldest first. */
export function list({ dir = 'designs' } = {}) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => {
    const name = f.slice(0, -5);
    let data;
    try { data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { return null; }
    if (!Array.isArray(data.steps)) return null;
    const created = data.created ? Date.parse(data.created) : fs.statSync(path.join(dir, f)).mtimeMs;
    return { name, data, created };
  }).filter(Boolean).sort((a, b) => a.created - b.created);
}

/** Build designs/designlapse.html with every design; it opens on `current` (default: the newest design). */
export function build({ dir = 'designs', current } = {}) {
  const warnings = [];
  const designs = list({ dir }).map(({ name, data }) => {
    const steps = [];
    const ids = [];
    (data.steps || []).forEach((s, i) => {
      const id = String(s.id ?? i + 1);
      const p = s.file ? path.join(dir, s.file) : null;
      let html = s.html;
      if (p) {
        if (!fs.existsSync(p)) { warnings.push(`${name} step ${id}: missing file ${rel(p)}`); return; }
        html = fs.readFileSync(p, 'utf8');
      }
      if (!html || !html.trim()) { warnings.push(`${name} step ${id}: no html`); return; }
      if (s.parent != null && !ids.includes(String(s.parent))) warnings.push(`${name} step ${id}: parent ${s.parent} must be an earlier step`);
      ids.push(id);
      steps.push({ ...s, id, html, ...(p ? { file: rel(p) } : {}) });
    });
    if (data.frame && !FRAMES.includes(data.frame)) warnings.push(`${name}: unknown frame "${data.frame}"`);
    return { ...data, slug: name, source: rel(path.join(dir, `${name}.json`)), steps };
  });
  if (!designs.length) throw new Error(`No designs in ${rel(dir)} yet. Add one with \`designlapse add final.html --title "…"\`.`);
  const open = designs.find(d => d.slug === current) ? current : designs[designs.length - 1].slug;
  const payload = JSON.stringify({ designs, current: open }).replace(/<\//g, '<\\/');
  const SLOT = '<script id="flow-data" type="application/json">__FLOW_DATA__</script>';
  const template = fs.readFileSync(TEMPLATE, 'utf8');
  if (!template.includes(SLOT)) throw new Error('The page template is missing its data slot. Rebuild it with `npm run build`.');
  const page = template.replace('<title>__FLOW_TITLE__</title>', '<title>Designlapse</title>').replace(SLOT, () => SLOT.replace('__FLOW_DATA__', payload));
  const out = path.join(dir, PAGE);
  fs.writeFileSync(out, page);
  return { file: out, designs: designs.map(d => ({ name: d.slug, steps: d.steps.length })), current: open, warnings };
}
