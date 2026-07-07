// A manuscript margin rule: a 1px gold hairline with a small khatam at its
// center — the divider between kalam and explanation on the folio.
import { Khatam } from './Khatam'

export function GoldRule({ className }: { className?: string }) {
  return (
    <div className={`flex items-center gap-4 text-gold ${className ?? ''}`} aria-hidden="true">
      <span className="h-px flex-1" style={{ backgroundColor: 'currentColor', opacity: 0.4 }} />
      <Khatam size={16} />
      <span className="h-px flex-1" style={{ backgroundColor: 'currentColor', opacity: 0.4 }} />
    </div>
  )
}
