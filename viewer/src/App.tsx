import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CheckIcon, ChevronDownIcon, PanelRightIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Toaster } from '@/components/ui/sonner'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { LapsePanel } from '@/components/lapse-panel'
import { StepCanvas, type StepCanvasHandle } from '@/components/step-canvas'
import { buildTree, finalStep, parseHash, pathThrough, readData } from '@/lib/data'
import { cn } from '@/lib/utils'

const DATA = readData()
const CHANGES_KEY = 'designlapse.changes'

function storedChanges() {
  try { return localStorage.getItem(CHANGES_KEY) === '1' } catch { return false }
}

async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true } catch { /* fall back below */ }
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  let ok = false
  try { ok = document.execCommand('copy') } catch { /* nothing else to try */ }
  ta.remove()
  return ok
}

export default function App() {
  const designs = DATA.designs
  const initial = useMemo(() => {
    const h = parseHash()
    const slug = designs.find(d => d.slug === h?.slug)?.slug ?? designs.find(d => d.slug === DATA.current)?.slug ?? designs.at(-1)?.slug
    return { slug, id: h?.id }
  }, [designs])

  const [slug, setSlug] = useState(initial.slug)
  const design = designs.find(d => d.slug === slug)
  const tree = useMemo(() => (design ? buildTree(design) : null), [design])

  // The current step, and the step whose path the scrubber follows.
  const [sel, setSel] = useState<{ cur?: string; anchor?: string }>({ cur: initial.id, anchor: initial.id })
  const current = tree ? (sel.cur && tree.byId[sel.cur]) || finalStep(tree) : undefined
  const anchor = tree ? (sel.anchor && tree.byId[sel.anchor]) || current : undefined
  const path = useMemo(() => (tree && anchor ? pathThrough(tree, anchor) : []), [tree, anchor])

  const [open, setOpen] = useState(() => window.innerWidth > 720)
  const [full, setFull] = useState(false)
  const [showChanges, setShowChanges] = useState(storedChanges)
  const [playing, setPlaying] = useState(false)
  const canvas = useRef<StepCanvasHandle>(null)

  const select = useCallback((id: string, from?: 'canvas' | 'play') => {
    if (!tree?.byId[id]) return
    if (from !== 'play') setPlaying(false)
    setSel(s => ({ cur: id, anchor: path.some(n => n.id === id) ? s.anchor ?? id : id }))
    if (from === 'canvas') setOpen(true)
    else requestAnimationFrame(() => canvas.current?.reveal(id))
  }, [tree, path])

  const loadDesign = useCallback((next: string, id?: string) => {
    setPlaying(false)
    setSlug(next)
    setSel({ cur: id, anchor: id })
  }, [])

  // Keep the address in sync so #<design>/step-<id> opens the same step.
  useEffect(() => {
    if (design && current) try { history.replaceState(null, '', `#${design.slug}/step-${current.id}`) } catch { /* file:// in some browsers */ }
  }, [design, current])

  useEffect(() => {
    const onHash = () => {
      const h = parseHash()
      if (!h) return
      if (h.slug && h.slug !== slug) loadDesign(h.slug, h.id)
      else select(h.id)
    }
    addEventListener('hashchange', onHash)
    return () => removeEventListener('hashchange', onHash)
  }, [slug, loadDesign, select])

  useEffect(() => { try { localStorage.setItem(CHANGES_KEY, showChanges ? '1' : '0') } catch { /* private mode */ } }, [showChanges])
  useEffect(() => { if (document.title !== `${design?.title ?? 'Designlapse'} — Designlapse`) document.title = design?.title ? `${design.title} — Designlapse` : 'Designlapse' }, [design])

  // Play along the path.
  useEffect(() => {
    if (!playing || !current) return
    const i = path.indexOf(current)
    if (i >= path.length - 1) { setPlaying(false); return }
    const t = setTimeout(() => select(path[i + 1].id, 'play'), 1500)
    return () => clearTimeout(t)
  }, [playing, current, path, select])

  const togglePlay = useCallback(() => {
    if (playing) return setPlaying(false)
    if (current && path.indexOf(current) >= path.length - 1) select(path[0].id, 'play')
    setOpen(true)
    setPlaying(true)
  }, [playing, current, path, select])

  const copy = useCallback(async (note: string) => {
    if (!design || !current) return
    const ref = `Designlapse “${design.title ?? design.slug}”${design.source ? ` (${design.source})` : ''} — step ${current.id}${current.file ? ` (${current.file})` : ''}`
    const ok = await copyText(note ? `${ref}\nIterate from this step: ${note}` : ref)
    if (ok) toast.success('Copied — paste it into your chat')
    else toast.error('Couldn’t copy — select the text and copy it yourself')
  }, [design, current])

  // Keyboard: ← → step, Space play, F full screen, C show changes, L lapse, Esc leave full screen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return
      const el = document.activeElement as HTMLElement | null
      if (el && (/^(TEXTAREA|INPUT|SELECT)$/.test(el.tagName) || el.isContentEditable || el.closest('[role=menu],[role=slider]'))) {
        if (e.key === 'Escape' && el.tagName === 'TEXTAREA') el.blur()
        return
      }
      if (!current) return
      const i = path.indexOf(current)
      if (e.key === 'ArrowRight' && i < path.length - 1) { e.preventDefault(); select(path[i + 1].id) }
      else if (e.key === 'ArrowLeft' && i > 0) { e.preventDefault(); select(path[i - 1].id) }
      else if (e.key === ' ') { e.preventDefault(); togglePlay() }
      else if (e.key === 'Escape' && full) setFull(false)
      else if ((e.key === 'f' || e.key === 'F') && open && window.innerWidth > 720) setFull(f => !f)
      else if (e.key === 'c' || e.key === 'C') setShowChanges(s => !s)
      else if (e.key === 'l' || e.key === 'L') { setOpen(o => !o); setFull(false) }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [current, path, select, togglePlay, full, open])

  return (
    <TooltipProvider>
      <div className="flex h-dvh flex-col bg-background text-foreground antialiased">
        <header className="relative z-20 grid h-14 flex-none grid-cols-[1fr_minmax(0,auto)_1fr] items-center gap-3 border-b bg-background px-4">
          <div className="justify-self-start text-[15px] font-bold tracking-tight whitespace-nowrap">Designlapse</div>
          <div className="min-w-0 justify-self-center">
            {designs.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="outline" className="w-[220px] max-w-full justify-between font-medium max-md:w-auto" />}>
                  <span className="truncate">{design?.title ?? design?.slug}</span>
                  <ChevronDownIcon className="opacity-50" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center" className="w-[min(360px,calc(100vw-24px))]">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>Designs</DropdownMenuLabel>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    {designs.slice().reverse().map(d => (
                      <DropdownMenuItem key={d.slug} className="items-start" onClick={() => d.slug !== slug && loadDesign(d.slug)}>
                        <CheckIcon className={cn('mt-0.5', d.slug !== slug && 'invisible')} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{d.title ?? d.slug}</span>
                          {d.prompt && <span className="block truncate text-xs text-muted-foreground">“{d.prompt}”</span>}
                        </span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          <div className="justify-self-end">
            <Tooltip>
              <TooltipTrigger render={<Button variant={open ? 'secondary' : 'outline'} onClick={() => { setOpen(o => !o); setFull(false) }} />}>
                <PanelRightIcon />
                <span className="max-md:hidden">Lapse</span>
              </TooltipTrigger>
              <TooltipContent>Show or hide the lapse (L)</TooltipContent>
            </Tooltip>
          </div>
        </header>

        <main className="relative flex min-h-0 flex-1">
          <div className="relative min-w-0 flex-1 overflow-hidden">
            {tree && current ? (
              <StepCanvas ref={canvas} tree={tree} path={path} current={current} showChanges={showChanges} onSelect={id => select(id, 'canvas')} />
            ) : (
              <div className="grid h-full place-items-center p-6 text-center text-sm text-muted-foreground">
                No designs yet. Add one with <code className="mx-1 rounded bg-muted px-1.5 py-0.5">designlapse add final.html --title "…"</code>
              </div>
            )}
          </div>
          {open && tree && current && (
            <LapsePanel
              tree={tree}
              path={path}
              current={current}
              onStep={id => select(id)}
              showChanges={showChanges}
              onShowChanges={setShowChanges}
              full={full}
              onFull={setFull}
              onClose={() => { setOpen(false); setFull(false) }}
              playing={playing}
              onPlay={togglePlay}
              onCopy={copy}
            />
          )}
        </main>
        <Toaster position="bottom-right" />
      </div>
    </TooltipProvider>
  )
}
