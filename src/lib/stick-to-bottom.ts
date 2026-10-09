/**
 * The tracker's "stay on the newest message" rule, as arithmetic and a small
 * state machine with no DOM in it — `useStickToBottom` feeds it the window's
 * scroll events, layout changes and the reader's input, and does the
 * scrolling it asks for.
 *
 * Two questions decide every step:
 *
 *  - **Pinned**: is the reader at the newest message? While they are, a change
 *    in layout (a draft list opening in the composer, a late row, the balance
 *    streaming into the header) keeps them there, so the newest message stays
 *    against the composer's top edge instead of being covered or left behind.
 *    Once they scroll away it's their position, and nothing moves it. The
 *    viewport itself changing counts too — a shorter window, the phone's
 *    browser bars sliding in — or the newest messages slip under the
 *    composer; except mid-touch, when those bars are reacting to the very
 *    gesture that's scrolling, and following them would fight the finger.
 *
 *  - **Settling**: has the page just opened? From mount until the reader first
 *    touches the page (or layout goes quiet), *any* scroll that leaves the
 *    bottom is somebody else's: the App Router's scroll-to-top on navigation,
 *    which runs after the feed has already scrolled down, or the browser
 *    restoring an old offset. Those are undone. After that, a scroll is taken
 *    at face value — find-in-page, a scrollbar drag, a screen reader.
 */

/** The window scroller at one moment. */
export type ScrollGeometry = {
  /** `window.scrollY`. */
  scrollTop: number;
  /** The visible height (`window.innerHeight`). */
  viewportHeight: number;
  /** The document's full height (`documentElement.scrollHeight`). */
  scrollHeight: number;
};

/**
 * How far above the very end still counts as "at the newest message". Enough
 * to absorb fractional scroll offsets on a zoomed screen and a stray nudge of
 * the wheel, small enough that someone who scrolled up to read is never
 * yanked back.
 */
export const BOTTOM_SLACK_PX = 24;

/** Pixels between the bottom of the viewport and the end of the document. */
export function distanceFromBottom({ scrollTop, viewportHeight, scrollHeight }: ScrollGeometry): number {
  return Math.max(0, scrollHeight - viewportHeight - scrollTop);
}

/** At (or within `slack` of) the end — and a page too short to scroll always is. */
export function isAtBottom(geometry: ScrollGeometry, slack: number = BOTTOM_SLACK_PX): boolean {
  return distanceFromBottom(geometry) <= slack;
}

export type StickState = {
  /** The reader is at the newest message, so layout changes keep them there. */
  pinned: boolean;
  /** The page has just opened: a scroll the reader didn't make is undone. */
  settling: boolean;
  /** A finger is on the screen. */
  touching: boolean;
};

/** A freshly opened feed: at the newest message, and guarding it. */
export const OPENING_STATE: StickState = { pinned: true, settling: true, touching: false };

export type StickEvent =
  /** The window scrolled; `atBottom` is measured after the move. */
  | { type: "scroll"; atBottom: boolean }
  /**
   * Something changed size: the page's own `layout` (content, composer,
   * header) or the `viewport` (the window, the visual viewport behind a
   * phone's browser bars).
   */
  | { type: "resize"; source: "layout" | "viewport" }
  /** The reader took over: wheel, key or pointer. */
  | { type: "input" }
  /** A touch began (`down`) or the last finger lifted — input too, on the way down. */
  | { type: "touch"; down: boolean }
  /** The opening window closed without them doing so. */
  | { type: "settled" };

export type StickStep = {
  state: StickState;
  /** Scroll to the end now. */
  stick: boolean;
};

export function stepStick(state: StickState, event: StickEvent): StickStep {
  switch (event.type) {
    case "scroll":
      // Opening: nobody has touched the page yet, so a move off the end came
      // from the router or the browser — put it back. Settling implies pinned.
      if (state.settling) return { state, stick: !event.atBottom };
      // Afterwards the position is the reader's: wherever it lands decides.
      return {
        state: state.pinned === event.atBottom ? state : { ...state, pinned: event.atBottom },
        stick: false,
      };
    case "resize":
      return {
        state,
        stick: state.pinned && !(event.source === "viewport" && state.touching),
      };
    case "touch": {
      const settling = event.down ? false : state.settling;
      return {
        state:
          state.touching === event.down && state.settling === settling
            ? state
            : { ...state, touching: event.down, settling },
        stick: false,
      };
    }
    case "input":
    case "settled":
      return { state: state.settling ? { ...state, settling: false } : state, stick: false };
  }
}
