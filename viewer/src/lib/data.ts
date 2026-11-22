// The designs embedded in the page by the designlapse CLI, and the step tree built from them.

export type Frame = 'phone' | 'tablet' | 'browser' | 'none'

export interface Step {
  id?: string | number
  parent?: string | number | null
  file?: string
  html: string
  frame?: Frame
  width?: number
  height?: number
  url?: string
}

export interface Design {
  slug: string
  title?: string
  prompt?: string
  frame?: Frame
  url?: string
  source?: string
  steps: Step[]
}

export interface StepNode extends Omit<Step, 'id' | 'parent'> {
  id: string
  parent: string | null
  kids: StepNode[]
  depth: number
  lane: number
}

export interface Tree {
  design: Design
  nodes: StepNode[]
  byId: Record<string, StepNode>
  roots: StepNode[]
}

export function readData(): { designs: Design[]; current?: string } {
  const text = document.getElementById('flow-data')?.textContent ?? ''
  try {
    const raw = JSON.parse(text)
    const list: Design[] = raw.designs ?? [{ slug: 'design', ...raw }]
    return {
      designs: list.map(d => ({ ...d, steps: (d.steps ?? []).filter(s => s && s.html) })),
      current: raw.current,
    }
  } catch {
    return { designs: [] }
  }
}

/** Each step iterates from its parent (default: the step listed before it). Branches get their own lane. */
export function buildTree(design: Design): Tree {
  const nodes: StepNode[] = design.steps.map((s, i) => ({ ...s, id: String(s.id ?? i + 1), parent: null, kids: [], depth: 0, lane: 0 }))
  const byId: Record<string, StepNode> = Object.fromEntries(nodes.map(n => [n.id, n]))
  nodes.forEach((n, i) => {
    const raw = design.steps[i].parent
    let p = raw === undefined ? (i ? nodes[i - 1].id : null) : raw === null ? null : String(raw)
    if (p && !byId[p]) p = null
    n.parent = p
  })
  nodes.forEach(n => { if (n.parent) byId[n.parent].kids.push(n) })
  const roots = nodes.filter(n => !n.parent)
  let lanes = 0
  const place = (n: StepNode, depth: number, lane: number) => {
    n.depth = depth
    n.lane = lane
    n.kids.forEach((k, j) => place(k, depth + 1, j === 0 ? lane : ++lanes))
  }
  roots.forEach((r, j) => place(r, 0, j === 0 ? 0 : ++lanes))
  return { design, nodes, byId, roots }
}

export const isBranch = (t: Tree, n: StepNode) => !!n.parent && t.byId[n.parent].kids[0] !== n

/** A step's ancestors, the step, then onward along each step's first iteration. */
export function pathThrough(t: Tree, n: StepNode): StepNode[] {
  const p: StepNode[] = []
  for (let c: StepNode | undefined = n; c; c = c.parent ? t.byId[c.parent] : undefined) p.unshift(c)
  for (let c = n; c.kids.length; ) { c = c.kids[0]; p.push(c) }
  return p
}

export const finalStep = (t: Tree) => (t.roots.length ? pathThrough(t, t.roots[0]).at(-1)! : undefined)

export interface Dims { f: Frame; w: number; h: number; W: number; H: number; radius: number }

/** Device viewport (w×h) and outer frame size (W×H) for a step. */
export function dims(s: StepNode | Step, d: Design): Dims {
  const f = s.frame ?? d.frame ?? 'phone'
  if (f === 'phone') { const w = s.width ?? 390, h = s.height ?? 844; return { f, w, h, W: w + 26, H: h + 26, radius: 62 } }
  if (f === 'tablet') { const w = s.width ?? 820, h = s.height ?? 1180; return { f, w, h, W: w + 36, H: h + 36, radius: 42 } }
  if (f === 'browser') { const w = s.width ?? 1280, h = s.height ?? 800; return { f, w, h, W: w, H: h + 45, radius: 14 } }
  const w = s.width ?? 1200, h = s.height ?? 800
  return { f: 'none', w, h, W: w, H: h, radius: 6 }
}

const CSS_OFF = '[data-lapse="removed"]{display:none!important}'
const CSS_ON = '[data-lapse="new"]{outline:3px solid #2f6fde!important;outline-offset:2px}[data-lapse="removed"]{outline:3px dashed #e5484d!important;outline-offset:2px;opacity:.5}'

/** The step's HTML with the "show changes" styles added. */
export function srcdoc(html: string, showChanges: boolean): string {
  const css = `<style data-designlapse>${showChanges ? CSS_ON : CSS_OFF}</style>`
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, css + '</head>')
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, m => m + '<head>' + css + '</head>')
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${css}</head><body style="margin:0">${html}</body></html>`
}

export function parseHash(): { slug?: string; id: string } | null {
  const m = location.hash.match(/^#(?:([\w-]+)\/)?(?:step-?|v)([\w.-]+)$/)
  return m ? { slug: m[1], id: m[2] } : null
}
