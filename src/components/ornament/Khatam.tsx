// The khatam — an eight-pointed star (two squares overlaid at 45°), the
// Qalandarana mark. Stroke only, no fill; gold by default but inherits
// currentColor so it can turn to ink on the Fana (light) ground.
export function Khatam({
  size = 24,
  className,
  strokeWidth = 1,
}: {
  size?: number
  className?: string
  strokeWidth?: number
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      className={className}
      aria-hidden="true"
    >
      {/* two squares, one axis-aligned and one rotated 45°, form the 8 points */}
      <rect x="20" y="20" width="60" height="60" />
      <rect x="20" y="20" width="60" height="60" transform="rotate(45 50 50)" />
    </svg>
  )
}
