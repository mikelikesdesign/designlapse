import { memo, useMemo } from 'react'
import { dims, srcdoc, type Design, type StepNode } from '@/lib/data'
import { cn } from '@/lib/utils'

interface Props {
  step: StepNode
  design: Design
  scale: number
  interactive?: boolean
  showChanges: boolean
  className?: string
}

/** A step rendered at its real size inside a phone, tablet or browser frame, then scaled. */
export const DeviceFrame = memo(function DeviceFrame({ step, design, scale, interactive = false, showChanges, className }: Props) {
  const d = dims(step, design)
  const doc = useMemo(() => srcdoc(step.html, showChanges), [step.html, showChanges])
  const iframe = (
    <iframe
      sandbox=""
      srcDoc={doc}
      width={d.w}
      height={d.h}
      title={`Step ${step.id}`}
      className="block border-0 bg-white"
      {...(interactive ? {} : { scrolling: 'no', tabIndex: -1, loading: 'lazy' as const, style: { pointerEvents: 'none' as const } })}
    />
  )
  let chrome
  if (d.f === 'phone') {
    chrome = (
      <div className="relative rounded-[62px] bg-[#111] p-[13px] shadow-[inset_0_0_0_1.5px_#2a2a2a,0_20px_50px_rgba(0,0,0,.18)]">
        <div className="relative overflow-hidden rounded-[50px] bg-white" style={{ width: d.w, height: d.h }}>
          {iframe}
          <div className="pointer-events-none absolute top-[11px] left-1/2 z-[2] h-9 w-[124px] -translate-x-1/2 rounded-[20px] bg-black" />
          <div className="pointer-events-none absolute bottom-2 left-1/2 z-[2] h-[5px] w-[140px] -translate-x-1/2 rounded-full bg-black/75" />
        </div>
      </div>
    )
  } else if (d.f === 'tablet') {
    chrome = (
      <div className="rounded-[42px] bg-[#111] p-[18px] shadow-[0_20px_50px_rgba(0,0,0,.18)]">
        <div className="overflow-hidden rounded-[26px] bg-white" style={{ width: d.w, height: d.h }}>{iframe}</div>
      </div>
    )
  } else if (d.f === 'browser') {
    chrome = (
      <div className="overflow-hidden rounded-[14px] bg-white shadow-[0_0_0_1px_rgba(0,0,0,.12),0_20px_50px_rgba(0,0,0,.14)]" style={{ width: d.w }}>
        <div className="flex h-11 items-center gap-2 border-b border-[#e2e0da] bg-[#f1f0ed] px-4">
          <i className="size-3 rounded-full bg-[#ff5f57]" />
          <i className="size-3 rounded-full bg-[#febc2e]" />
          <i className="size-3 rounded-full bg-[#28c840]" />
          <span className="ml-[18px] flex h-7 max-w-[520px] flex-1 items-center overflow-hidden rounded-lg border border-[#e2e0da] bg-white px-3 text-[13px] whitespace-nowrap text-[#7a776f]">
            {step.url ?? design.url ?? ''}
          </span>
        </div>
        {iframe}
      </div>
    )
  } else {
    chrome = (
      <div className="overflow-hidden rounded-md bg-white shadow-[0_0_0_1px_rgba(0,0,0,.1),0_12px_32px_rgba(0,0,0,.1)]" style={{ width: d.w }}>{iframe}</div>
    )
  }
  return (
    <div className={cn('relative flex-none transition-[box-shadow,opacity,transform] duration-200', className)} style={{ width: d.W * scale, height: d.H * scale, borderRadius: d.radius * scale }}>
      <div className="absolute top-0 left-0 origin-top-left" style={{ width: d.W, height: d.H, transform: `scale(${scale})` }}>
        {chrome}
      </div>
    </div>
  )
})
