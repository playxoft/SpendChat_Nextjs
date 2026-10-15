"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Maximize2, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/** The paper's layout width: an A4 sheet at 96 dpi. Everything inside is laid out at this size, then scaled. */
const PAPER_WIDTH = 794;
/** How far past "fit page" the visitor can zoom. */
const MAX_ZOOM = 5;

const DESKTOP = "(min-width: 1024px)";

function subscribeDesktop(onChange: () => void) {
  const mq = window.matchMedia(DESKTOP);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/** The box and the sheet, as last measured. `fit` is the scale at which the whole sheet shows. */
type Geometry = { fit: number; sheet: number; width: number; height: number };
/** `zoom` is relative to fit; `x`/`y` are only honoured once the visitor has zoomed or dragged (`free`). */
type View = { zoom: number; x: number; y: number; free: boolean };

const FITTED: View = { zoom: 1, x: 0, y: 0, free: false };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Where the sheet actually sits. A sheet smaller than the box is centred on
 * that axis; a larger one can be moved, but never so far that its edge comes
 * away from the box's edge — so it can't be dragged off into empty space.
 */
function place(geo: Geometry, view: View) {
  const scale = geo.fit * view.zoom;
  const w = PAPER_WIDTH * scale;
  const h = geo.sheet * scale;
  const x = w <= geo.width ? (geo.width - w) / 2 : clamp(view.free ? view.x : (geo.width - w) / 2, geo.width - w, 0);
  const y = h <= geo.height ? (geo.height - h) / 2 : clamp(view.free ? view.y : 0, geo.height - h, 0);
  return { scale, x, y };
}

/** Zoom by `factor`, keeping the point under (`cx`, `cy`) where it is. */
function zoomAt(geo: Geometry, view: View, factor: number, cx: number, cy: number): View {
  const now = place(geo, view);
  const zoom = clamp(view.zoom * factor, 1, MAX_ZOOM);
  if (zoom === 1) return FITTED;
  const ratio = (geo.fit * zoom) / now.scale;
  return { zoom, x: cx - (cx - now.x) * ratio, y: cy - (cy - now.y) * ratio, free: true };
}

/**
 * The document preview, scaled to fit the box it sits in — "fit page", like a
 * PDF viewer — so the whole sheet, header to footer, is on screen while the
 * editor beside it scrolls.
 *
 * Fitting a whole A4 page makes the text small, so the preview zooms and pans
 * like a map: scroll (or pinch a trackpad) to zoom at the cursor, drag to move,
 * double-click to jump between 2× and the whole page, or use the − / + / fit
 * control. The sheet is laid out at a real A4 width and transformed, so zoom is
 * crisp and a longer invoice just fits a little smaller.
 *
 * Desktop only: on a phone the preview keeps its natural width and scrolls
 * with the page (and pinch-zoom is the browser's). Print is unaffected — the
 * print stylesheet resets every ancestor's size, position and transform.
 */
export function FitPaper({ children }: { children: ReactNode }) {
  const desktop = useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia(DESKTOP).matches,
    () => false,
  );
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<{ geo: Geometry | null; view: View }>({ geo: null, view: FITTED });
  const drag = useRef<{ id: number; startX: number; startY: number; x: number; y: number } | null>(null);
  // The wheel listener is attached once; it reads the current view from here.
  const latest = useRef(state);
  useEffect(() => {
    latest.current = state;
  });
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!desktop) return;
    const box = outer.current;
    const sheet = inner.current;
    if (!box || !sheet) return;

    const measure = () => {
      const height = sheet.offsetHeight; // untouched by the transform
      if (!box.clientWidth || !box.clientHeight || !height) return;
      const geo: Geometry = {
        fit: Math.min(1, box.clientWidth / PAPER_WIDTH, box.clientHeight / height),
        sheet: height,
        width: box.clientWidth,
        height: box.clientHeight,
      };
      setState((s) =>
        s.geo &&
        Math.abs(s.geo.fit - geo.fit) < 0.0005 &&
        s.geo.sheet === geo.sheet &&
        s.geo.width === geo.width &&
        s.geo.height === geo.height
          ? s
          : { ...s, geo },
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    observer.observe(sheet);

    // Wheel zoom needs a non-passive listener to stop the page scrolling — but
    // only when the wheel actually zooms. Scrolling down on the whole-page view
    // (or past the zoom limits) is left to the page, so the preview never traps
    // the scroll of the form beside it.
    const onWheel = (e: WheelEvent) => {
      const now = latest.current;
      if (!now.geo) return;
      const rect = box.getBoundingClientRect();
      // A trackpad pinch arrives as a ctrl+wheel with small deltas.
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      if (zoomAt(now.geo, now.view, factor, cx, cy).zoom === now.view.zoom) return;
      e.preventDefault();
      setState((s) => (s.geo ? { ...s, view: zoomAt(s.geo, s.view, factor, cx, cy) } : s));
    };
    box.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      observer.disconnect();
      box.removeEventListener("wheel", onWheel);
    };
  }, [desktop]);

  if (!desktop) return <div className="@container">{children}</div>;

  const { geo, view } = state;
  const at = geo ? place(geo, view) : { scale: 1, x: 0, y: 0 };
  const zoomed = view.zoom > 1;

  const zoomBy = (factor: number) =>
    setState((s) => (s.geo ? { ...s, view: zoomAt(s.geo, s.view, factor, s.geo.width / 2, s.geo.height / 2) } : s));

  return (
    <div
      ref={outer}
      className={cn(
        "relative h-full min-h-0 w-full overflow-hidden select-none",
        // Touch scrolls the page as usual until the sheet is zoomed; then a drag pans it.
        zoomed ? cn("touch-none", dragging ? "cursor-grabbing" : "cursor-grab") : "cursor-zoom-in",
      )}
      onPointerDown={(e) => {
        if (e.button !== 0 || !zoomed || (e.target as HTMLElement).closest("button")) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { id: e.pointerId, startX: e.clientX, startY: e.clientY, x: at.x, y: at.y };
        setDragging(true);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d || d.id !== e.pointerId) return;
        const x = d.x + e.clientX - d.startX;
        const y = d.y + e.clientY - d.startY;
        setState((s) => ({ ...s, view: { ...s.view, x, y, free: true } }));
      }}
      onPointerUp={() => {
        drag.current = null;
        setDragging(false);
      }}
      onPointerCancel={() => {
        drag.current = null;
        setDragging(false);
      }}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest("button")) return;
        const rect = e.currentTarget.getBoundingClientRect();
        setState((s) =>
          s.geo
            ? {
                ...s,
                view: s.view.zoom > 1 ? FITTED : zoomAt(s.geo, s.view, 2, e.clientX - rect.left, e.clientY - rect.top),
              }
            : s,
        );
      }}
    >
      <div
        ref={inner}
        className={cn("@container absolute top-0 left-0 origin-top-left", !geo && "invisible")}
        style={{ width: PAPER_WIDTH, transform: `translate(${at.x}px, ${at.y}px) scale(${at.scale})` }}
      >
        {children}
      </div>

      <div className="absolute right-3 bottom-3 flex items-center gap-0.5 rounded-full border bg-background/90 p-1 text-xs shadow-sm backdrop-blur">
        <button
          type="button"
          onClick={() => zoomBy(1 / 1.25)}
          disabled={!zoomed}
          aria-label="Zoom out"
          className="inline-flex size-7 items-center justify-center rounded-full hover:bg-muted disabled:opacity-40"
        >
          <Minus className="size-3.5" />
        </button>
        <span className="w-11 text-center tabular-nums text-muted-foreground" title="Scroll to zoom, drag to move, double-click to jump">
          {Math.round(view.zoom * 100)}%
        </span>
        <button
          type="button"
          onClick={() => zoomBy(1.25)}
          disabled={view.zoom >= MAX_ZOOM}
          aria-label="Zoom in"
          className="inline-flex size-7 items-center justify-center rounded-full hover:bg-muted disabled:opacity-40"
        >
          <Plus className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setState((s) => ({ ...s, view: FITTED }))}
          disabled={!zoomed}
          aria-label="Fit the whole page"
          title="Fit the whole page"
          className="inline-flex size-7 items-center justify-center rounded-full hover:bg-muted disabled:opacity-40"
        >
          <Maximize2 className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
