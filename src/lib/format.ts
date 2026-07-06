// format.ts — tiny presentation helpers shared by the public pages.
//
// Keeping formatting logic here (not inline in a page) means the rule lives in
// ONE place and can be unit-tested on its own, without spinning up a page or a
// database. Pages import it; the test imports it; they can never disagree.

// Turn a whole number of seconds into a clock-style 'm:ss' label (e.g. 65 → '1:05').
// Minutes have no leading zero; seconds are always two digits so '1:5' can't happen.
// We floor both parts so a stray fractional second can't leak a decimal into the UI.
export function formatDuration(sec: number): string {
  const minutes = Math.floor(sec / 60)
  const seconds = Math.floor(sec % 60)
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}
