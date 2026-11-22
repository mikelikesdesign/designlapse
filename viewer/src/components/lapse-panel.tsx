import { useEffect, useRef, useState } from 'react'
import { ChevronLeftIcon, ChevronRightIcon, Maximize2Icon, Minimize2Icon, PauseIcon, PlayIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { DeviceFrame } from '@/components/device-frame'
import { dims, isBranch, type StepNode, type Tree } from '@/lib/data'
import { cn } from '@/lib/utils'

interface Props {
  tree: Tree
  path: StepNode[]
  current: StepNode
  onStep: (id: string) => void
  showChanges: boolean
  onShowChanges: (on: boolean) => void
  full: boolean
  onFull: (on: boolean) => void
  onClose: () => void
  playing: boolean
  onPlay: () => void
  onCopy: (note: string) => void
}

function IconButton({ label, children, ...props }: React.ComponentProps<typeof Button> & { label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<Button size="icon-sm" aria-label={label} {...props} />}>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

export function LapsePanel({ tree, path, current, onStep, showChanges, onShowChanges, full, onFull, onClose, playing, onPlay, onCopy }: Props) {
  const body = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [note, setNote] = useState('')

  useEffect(() => {
    const el = body.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const i = path.indexOf(current)
  const d = dims(current, tree.design)
  const scale = size.w > 0 ? Math.min((size.w - 40) / d.W, (size.h - 40) / d.H, 1.25) : 0
  const at = (j: number) => path[Math.max(0, Math.min(path.length - 1, j))]

  return (
    <aside
      aria-label="Design lapse"
      className={cn(
        'z-[8] flex min-h-0 flex-none flex-col border-l bg-background',
        full ? 'fixed inset-0 z-[60] border-0' : 'w-[clamp(400px,42vw,720px)] max-md:fixed max-md:inset-0 max-md:z-[60] max-md:w-auto max-md:border-0',
      )}
    >
      <div className="flex h-[52px] flex-none items-center gap-1.5 border-b pr-2.5 pl-4">
        <div className="min-w-0 flex-1 text-[15px] font-semibold tracking-tight">
          Step {current.id}
          {isBranch(tree, current) && <span className="ml-1.5 text-[13px] font-normal text-muted-foreground">from step {current.parent}</span>}
        </div>
        <Label className="mr-1.5 cursor-pointer gap-2">
          <Switch checked={showChanges} onCheckedChange={onShowChanges} />
          Show changes
        </Label>
        <span className="max-md:hidden">
          <IconButton variant="ghost" label={full ? 'Exit full screen (Esc)' : 'Full screen (F)'} onClick={() => onFull(!full)}>
            {full ? <Minimize2Icon /> : <Maximize2Icon />}
          </IconButton>
        </span>
        <IconButton variant="ghost" label="Close (L)" onClick={onClose}>
          <XIcon />
        </IconButton>
      </div>

      <div ref={body} className="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-muted p-5">
        {scale > 0 && <DeviceFrame key={`${tree.design.slug}/${current.id}`} step={current} design={tree.design} scale={scale} interactive showChanges={showChanges} className="animate-in fade-in-25 duration-300" />}
      </div>

      <div className="flex-none border-t px-4 pt-3 pb-1">
        <div className="flex items-center gap-1.5">
          <IconButton variant="outline" label="Previous step (←)" disabled={i <= 0} onClick={() => onStep(at(i - 1).id)}>
            <ChevronLeftIcon />
          </IconButton>
          <IconButton variant="outline" label={playing ? 'Pause (Space)' : 'Play from here (Space)'} onClick={onPlay}>
            {playing ? <PauseIcon /> : <PlayIcon />}
          </IconButton>
          <IconButton variant="outline" label="Next step (→)" disabled={i >= path.length - 1} onClick={() => onStep(at(i + 1).id)}>
            <ChevronRightIcon />
          </IconButton>
          <span className="ml-auto text-[13px] text-muted-foreground tabular-nums">{i + 1} / {path.length}</span>
        </div>
        <div className="relative py-3">
          <Slider
            aria-label="Step"
            min={0}
            max={Math.max(1, path.length - 1)}
            step={1}
            value={[Math.max(0, i)]}
            disabled={path.length < 2}
            onValueChange={v => { const j = Array.isArray(v) ? v[0] : v; if (typeof j === 'number' && j !== i) onStep(at(j).id) }}
          />
          <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2">
            {path.slice(1, -1).map((n, j) => (
              <span
                key={n.id}
                className={cn('absolute top-0 h-1 w-0.5 -translate-x-1/2', j + 1 <= i ? 'bg-primary-foreground/50' : 'bg-muted-foreground/40')}
                style={{ left: `calc(6px + (100% - 12px) * ${(j + 1) / (path.length - 1)})` }}
              />
            ))}
          </div>
        </div>
      </div>

      <form
        className="flex flex-none items-end gap-2 px-4 pt-2 pb-4"
        onSubmit={e => { e.preventDefault(); onCopy(note.trim()) }}
      >
        <Textarea
          rows={1}
          value={note}
          onChange={e => setNote(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onCopy(note.trim()) } }}
          placeholder="What should change from this step? (optional)"
          className="max-h-[120px] min-h-9 resize-y"
        />
        <Tooltip>
          <TooltipTrigger render={<Button type="submit" />}>Copy</TooltipTrigger>
          <TooltipContent>Copy a reference to this step, plus your note, to paste into any chat</TooltipContent>
        </Tooltip>
      </form>
    </aside>
  )
}
