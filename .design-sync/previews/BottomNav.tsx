import { BottomNav } from "spendchat";

// Two things fight a desktop-width capture here, and the frame below handles
// both. The bar is `fixed inset-x-0 bottom-0`, so it escapes to the page unless
// an ancestor establishes a containing block — `translateZ(0)` does that. And
// it is `md:hidden`, so at the 1200px capture width it collapses to nothing;
// the scoped rule re-shows it. Neither touches the component: the card is a
// phone frame, and the mobile layout is the only one this bar has.
//
// The frame attribute is card-specific (`data-ds-bottomnav-frame`, vs
// `data-ds-topbar-frame` in AppTopbar.tsx) because a <style> element's rules
// are document-global: on a sheet rendering both cards, one shared attribute
// would apply each card's `display:flex!important` inside the other's frame.
export function Mobile() {
  return (
    <div className="relative h-44 w-full max-w-sm overflow-hidden rounded-lg border [transform:translateZ(0)]">
      <style>{`@media (min-width:48rem){[data-ds-bottomnav-frame] nav{display:flex!important}}`}</style>
      <div className="p-3 text-sm text-muted-foreground">Tracker</div>
      <div data-ds-bottomnav-frame>
        <BottomNav />
      </div>
    </div>
  );
}
