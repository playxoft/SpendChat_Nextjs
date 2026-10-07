/**
 * The `@panel` slot beside the sidebar is empty everywhere but Ask (see
 * `@panel/ask/page.tsx`). Next 16 requires a default for every named slot;
 * this one renders nothing on a full load of any other route.
 */
export default function PanelDefault() {
  return null;
}
