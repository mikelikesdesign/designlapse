import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { MinusIcon, PlusIcon, ScanIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { DeviceFrame } from '@/components/device-frame'
import { dims, isBranch, type StepNode, type Tree } from '@/lib/data'
import { cn } from '@/lib/utils'

const H0 = 560, GAP = 150, LANE = H0 + 190
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

interface Box { x: number; y: number; w: number }
interface Layout { box: Record<string, Box>; bounds: { x: number; y: number; w: number; h: number } }

function layoutTree(t: Tree): Layout {
  const colW: number[] = []
  const w: Record<string, number> = {}
  let lanes = 0
  for (const n of t.nodes) {
    const d = dims(n, t.design)
    w[n.id] = (d.W * H0) / d.H
    colW[n.depth] = Math.max(colW[n.depth] ?? 0, w[n.id])
    lanes = Math.max(lanes, n.lane)
  }
  const colX: number[] = []
  let x = 0
  colW.forEach((cw, i) => { colX[i] = x; x += cw + GAP })
  const box: Record<string, Box> = {}
  for (const n of t.nodes) box[n.id] = { x: colX[n.depth] + (colW[n.depth] - w[n.id]) / 2, y: n.lane * LANE, w: w[n.id] }
  return { box, bounds: { x: -40, y: -80, w: Math.max(1, x - GAP + 80), h: (lanes + 1) * LANE - (LANE - H0) + 120 } }
}

export interface StepCanvasHandle {
  /** Bring a step into view if it isn't already. */
  reveal: (id: string, animate?: boolean) => void
  /** Centre a step. */
  focus: (id: string, animate?: boolean) => void
}

interface Props {
  tree: Tree
  path: StepNode[]
  current: StepNode
  showChanges: boolean
  onSelect: (id: string) => void
}

const Artboard = memo(function Artboard({ node, tree, box, on, inPath, showChanges }: { node: StepNode; tree: Tree; box: Box; on: boolean; inPath: boolean; showChanges: boolean }) {
  const d = dims(node, tree.design)
  return (
    <div className="group absolute cursor-pointer" data-id={node.id} style={{ left: box.x, top: box.y, width: box.w }}>
      <div className="absolute right-0 bottom-full left-0 mb-3.5 flex items-center gap-2 overflow-hidden whitespace-nowrap">
        <span className={cn('truncate text-[15px] font-medium', on ? 'text-foreground' : 'text-muted-foreground')}>Step {node.id}</span>
        {isBranch(tree, node) && <Badge variant="secondary">from {node.parent}</Badge>}
      </div>
      <DeviceFrame
        step={node}
        design={tree.design}
        scale={H0 / d.H}
        showChanges={showChanges}
        className={cn(
          on ? 'shadow-[0_0_0_6px_var(--background),0_0_0_9px_var(--primary)]' : 'group-hover:shadow-[0_0_0_6px_var(--background),0_0_0_9px_var(--ring)]',
          !inPath && 'opacity-55 group-hover:opacity-100',
        )}
      />
    </div>
  )
})

export const StepCanvas = forwardRef<StepCanvasHandle, Props>(function StepCanvas({ tree, path, current, showChanges, onSelect }, ref) {
  const wrap = useRef<HTMLDivElement>(null)
  const [cam, setCam] = useState({ x: 40, y: 80, k: 0.5 })
  const [anim, setAnim] = useState(false)
  const camRef = useRef(cam)
  camRef.current = cam
  const layout = useMemo(() => layoutTree(tree), [tree])

  const move = useCallback((next: { x: number; y: number; k: number }, animate: boolean) => { setAnim(animate); setCam(next) }, [])
  const rect = () => wrap.current?.getBoundingClientRect()

  const focus = useCallback((id: string, animate = true) => {
    const r = rect(), b = layout.box[id]
    if (!r || !b || r.width < 50) return
    const k = clamp(Math.min((r.height - 140) / (H0 + 70), (r.width - 96) / b.w), 0.05, 1)
    move({ k, x: r.width / 2 - (b.x + b.w / 2) * k, y: r.height / 2 - (b.y + H0 / 2 - 25) * k }, animate)
  }, [layout, move])

  const inView = useCallback((id: string) => {
    const r = rect(), b = layout.box[id], c = camRef.current
    if (!r || !b) return true
    const sx = c.x + b.x * c.k, sy = c.y + b.y * c.k
    return sx >= 0 && sx + b.w * c.k <= r.width && sy >= 0 && sy + H0 * c.k <= r.height
  }, [layout])

  useImperativeHandle(ref, () => ({ focus, reveal: (id, animate = true) => { if (!inView(id)) focus(id, animate) } }), [focus, inView])

  // Start each design centred on the current step.
  useEffect(() => { requestAnimationFrame(() => focus(current.id, false)) }, [tree]) // eslint-disable-line react-hooks/exhaustive-deps

  const zoomAt = useCallback((cx: number, cy: number, f: number) => {
    const r = rect(), c = camRef.current
    if (!r) return
    const px = cx - r.left, py = cy - r.top
    const k = clamp(c.k * f, 0.05, 2)
    const g = k / c.k
    move({ k, x: px - (px - c.x) * g, y: py - (py - c.y) * g }, false)
  }, [move])

  const fitAll = () => {
    const r = rect(), b = layout.bounds
    if (!r) return
    const pad = 48
    const k = clamp(Math.min((r.width - 2 * pad) / b.w, (r.height - 2 * pad) / b.h, 1), 0.05, 2)
    move({ k, x: (r.width - b.w * k) / 2 - b.x * k, y: (r.height - b.h * k) / 2 - b.y * k }, true)
  }

  // Wheel: scroll to pan, pinch / ⌘-scroll to zoom. Needs a non-passive listener to stop page scroll.
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.01))
      else { const c = camRef.current; move({ ...c, x: c.x - (e.deltaX || (e.shiftKey ? e.deltaY : 0)), y: c.y - (e.shiftKey ? 0 : e.deltaY) }, false) }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAt, move])

  const drag = useRef<{ x: number; y: number; cx: number; cy: number; moved: boolean } | null>(null)
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('[data-slot=button-group]')) return
    drag.current = { x: e.clientX, y: e.clientY, cx: camRef.current.x, cy: camRef.current.y, moved: false }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.x, dy = e.clientY - d.y
    if (!d.moved && Math.hypot(dx, dy) < 4) return
    d.moved = true
    move({ ...camRef.current, x: d.cx + dx, y: d.cy + dy }, false)
  }
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current
    drag.current = null
    if (!d || d.moved) return
    const hit = document.elementsFromPoint(e.clientX, e.clientY).find(el => (el as HTMLElement).dataset?.id) as HTMLElement | undefined
    if (hit?.dataset.id) onSelect(hit.dataset.id)
  }

  const onPath = useMemo(() => new Set(path.map(n => n.id)), [path])
  const done = useMemo(() => new Set(path.slice(0, path.indexOf(current) + 1).map(n => n.id)), [path, current])
  const mid = () => { const r = rect()!; return [r.left + r.width / 2, r.top + r.height / 2] as const }

  return (
    <div
      ref={wrap}
      className={cn('absolute inset-0 touch-none overflow-hidden select-none', drag.current?.moved ? 'cursor-grabbing' : 'cursor-grab')}
      style={{ backgroundImage: 'radial-gradient(var(--dot) 1px, transparent 1.2px)', backgroundSize: '20px 20px' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { drag.current = null }}
    >
      <div
        className={cn('absolute top-0 left-0 origin-top-left will-change-transform', anim && 'transition-transform duration-[600ms] ease-[cubic-bezier(.2,.75,.2,1)]')}
        style={{ transform: `translate(${cam.x}px,${cam.y}px) scale(${cam.k})` }}
      >
        <svg className="pointer-events-none absolute top-0 left-0 overflow-visible" width={layout.bounds.w} height={layout.bounds.h}>
          {tree.nodes.filter(n => n.parent).map(n => {
            const a = layout.box[n.parent!], b = layout.box[n.id]
            const x1 = a.x + a.w + 18, y1 = a.y + H0 / 2, x2 = b.x - 22, y2 = b.y + H0 / 2
            const lit = done.has(n.id) && done.has(n.parent!)
            const d = y1 === y2 ? `M${x1},${y1} L${x2},${y2}` : `M${x1},${y1} C${x1 + 70},${y1} ${x2 - 90},${y2} ${x2},${y2}`
            return (
              <g key={n.id} className={lit ? 'fill-foreground stroke-foreground' : 'fill-[var(--edge)] stroke-[var(--edge)]'}>
                <path d={d} fill="none" strokeWidth={2} />
                <path d={`M${x2 - 1},${y2 - 7} L${x2 + 11},${y2} L${x2 - 1},${y2 + 7} Z`} stroke="none" />
              </g>
            )
          })}
        </svg>
        {tree.nodes.map(n => (
          <Artboard key={n.id} node={n} tree={tree} box={layout.box[n.id]} on={n === current} inPath={onPath.has(n.id)} showChanges={showChanges} />
        ))}
      </div>

      <div data-slot="button-group" className="absolute bottom-4 left-4 z-[4] flex flex-col overflow-hidden rounded-lg border bg-background shadow-xs max-md:top-3.5 max-md:right-4 max-md:bottom-auto max-md:left-auto">
        {[
          { label: 'Zoom in', icon: <PlusIcon />, run: () => zoomAt(...mid(), 1.25) },
          { label: 'Zoom out', icon: <MinusIcon />, run: () => zoomAt(...mid(), 0.8) },
          { label: 'Fit all', icon: <ScanIcon />, run: fitAll },
        ].map((b, i) => (
          <Tooltip key={b.label}>
            <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label={b.label} className={cn('rounded-none', i > 0 && 'border-t')} onClick={b.run} />}>
              {b.icon}
            </TooltipTrigger>
            <TooltipContent side="right">{b.label}</TooltipContent>
          </Tooltip>
        ))}
      </div>
    </div>
  )
})
