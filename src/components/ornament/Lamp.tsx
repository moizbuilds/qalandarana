// A station lamp on the silsila thread. Lit = a filled gold node with a slow
// breathing halo (the family watches father light these over time). Unlit = a
// faint gold ring, a lamp not yet kindled. On the Fana (light) ground the lit
// lamp reads as a dark node — the inversion in miniature.
export function Lamp({
  lit,
  size = 14,
  className,
}: {
  lit: boolean
  size?: number
  className?: string
}) {
  return (
    <span
      className={`inline-block rounded-full ${lit ? 'animate-breathe' : ''} ${className ?? ''}`}
      style={{
        width: size,
        height: size,
        backgroundColor: lit ? 'var(--gold)' : 'transparent',
        border: lit ? 'none' : '1px solid color-mix(in srgb, var(--gold) 40%, transparent)',
      }}
      aria-hidden="true"
    />
  )
}
