// The Medallion — a circular audio player. His voice deserves better than a
// SoundCloud bar: a gold progress ring fills like a halo, and a soft radial
// glow breathes only while playing, like a zikr. One per entry, above the text.
//
// CONCEPT: 'use client' marks this as a browser component. It needs the live
// HTMLAudioElement API (play/pause, timeupdate events), which only exists in the
// browser — server components can't hold that interactive state.
'use client'

import { useRef, useState } from 'react'

const R = 54 // ring radius in the 120×120 viewBox
const CIRC = 2 * Math.PI * R

export function Medallion({ src, title }: { src: string; title: string }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0) // 0..1
  const [time, setTime] = useState(0)

  function toggle() {
    const a = audioRef.current
    if (!a) return
    if (a.paused) void a.play()
    else a.pause()
  }

  const mm = Math.floor(time / 60)
  const ss = String(Math.floor(time % 60)).padStart(2, '0')

  return (
    <figure className="flex flex-col items-center gap-4">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => {
          const a = e.currentTarget
          setTime(a.currentTime)
          if (a.duration) setProgress(a.currentTime / a.duration)
        }}
      />
      <button
        onClick={toggle}
        aria-pressed={playing}
        aria-label={playing ? `Pause ${title}` : `Play ${title}`}
        className="relative grid h-32 w-32 place-items-center rounded-full"
        style={{
          transition: 'box-shadow 900ms ease-out',
          boxShadow: playing
            ? '0 0 40px 4px color-mix(in srgb, var(--gold) 28%, transparent)'
            : '0 0 0 0 transparent',
        }}
      >
        <span className={playing ? 'absolute inset-0 rounded-full animate-breathe' : 'hidden'} />
        <svg viewBox="0 0 120 120" className="absolute inset-0 -rotate-90 text-gold">
          <circle cx="60" cy="60" r={R} fill="none" stroke="currentColor" strokeOpacity="0.22" strokeWidth="1.5" />
          <circle
            cx="60"
            cy="60"
            r={R}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={CIRC * (1 - progress)}
            style={{ transition: 'stroke-dashoffset 200ms linear' }}
          />
        </svg>
        <span className="text-gold" style={{ fontSize: '1.75rem', lineHeight: 1 }} aria-hidden="true">
          {playing ? '❚❚' : '▶'}
        </span>
      </button>
      <figcaption className="eyebrow" style={{ opacity: 0.6, fontVariantNumeric: 'tabular-nums' }}>
        {mm}:{ss}
      </figcaption>
    </figure>
  )
}
