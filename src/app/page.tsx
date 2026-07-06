// page.tsx — the site root. In Phase 1 there is no landing page yet: the journey
// (the seven valleys) IS the experience, so '/' simply forwards there.
//
// CONCEPT: redirect() from next/navigation, called during a server render, sends
// the browser straight to another route before any HTML for this page is shown.
// Phase 2 will replace this with the real "Night Journey" entry/gate page.
import { redirect } from 'next/navigation'

export default function Home() {
  redirect('/journey')
}
