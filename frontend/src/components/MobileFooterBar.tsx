import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { NavLink, useLocation } from "react-router-dom";
import { navLinkNeedsEndFlag, resolveActiveNavPath } from "../lib/navActive";

const LONG_PRESS_MS = 550;

export type MobileShellTab = { to: string; label: string; icon: ReactNode };

export interface MobileFooterBarProps {
  allTabPathsForNav: readonly string[];
  orderedTabs: MobileShellTab[];
  onReorderPaths: (paths: string[]) => void;
  reorderHint: string;
  doneLabel: string;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

function reorderPaths(paths: string[], from: number, to: number): string[] {
  if (from === to || from < 0 || to < 0 || from >= paths.length || to >= paths.length) return [...paths];
  const c = [...paths];
  const [item] = c.splice(from, 1);
  c.splice(to, 0, item);
  return c;
}

function dropIndexFromClientX(clientX: number, slotEls: (HTMLElement | null)[]): number {
  const n = slotEls.length;
  if (n === 0) return 0;
  for (let i = 0; i < n; i++) {
    const el = slotEls[i];
    if (!el) continue;
    const r = el.getBoundingClientRect();
    if (clientX < r.left + r.width / 2) return i;
  }
  return n - 1;
}

function cx(...parts: (string | false | undefined | null)[]): string {
  return parts.filter(Boolean).join(" ");
}

export function MobileFooterBar({
  allTabPathsForNav,
  orderedTabs,
  onReorderPaths,
  reorderHint,
  doneLabel,
  t,
}: MobileFooterBarProps) {
  const location = useLocation();
  const activeNavPath = resolveActiveNavPath(location.pathname, allTabPathsForNav);
  const [reorderMode, setReorderMode] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  const slotRefs = useRef<(HTMLDivElement | null)[]>([]);
  const dragFromRef = useRef<number | null>(null);
  const dragPointerIdRef = useRef<number | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dropHoverIndex, setDropHoverIndex] = useState<number | null>(null);

  const clearLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const startLongPress = useCallback(() => {
    longPressFired.current = false;
    clearLongPress();
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      setReorderMode(true);
    }, LONG_PRESS_MS);
  }, [clearLongPress]);

  const endLongPress = useCallback(() => {
    clearLongPress();
  }, [clearLongPress]);

  const endPointerDrag = useCallback(() => {
    dragFromRef.current = null;
    dragPointerIdRef.current = null;
    setDraggingIndex(null);
    setDropHoverIndex(null);
  }, []);

  const commitReorder = useCallback(
    (from: number, clientX: number) => {
      const paths = orderedTabs.map((x) => x.to);
      const to = dropIndexFromClientX(clientX, slotRefs.current);
      if (from !== to) {
        onReorderPaths(reorderPaths(paths, from, to));
      }
    },
    [onReorderPaths, orderedTabs],
  );

  const onReorderPointerDown = useCallback(
    (index: number) => (e: PointerEvent) => {
      if (!reorderMode) return;
      e.preventDefault();
      e.stopPropagation();
      dragFromRef.current = index;
      dragPointerIdRef.current = e.pointerId;
      setDraggingIndex(index);
      setDropHoverIndex(dropIndexFromClientX(e.clientX, slotRefs.current));
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [reorderMode],
  );

  const onReorderPointerMove = useCallback((e: PointerEvent) => {
    if (dragFromRef.current === null || e.pointerId !== dragPointerIdRef.current) return;
    setDropHoverIndex(dropIndexFromClientX(e.clientX, slotRefs.current));
  }, []);

  const onReorderPointerUp = useCallback(
    (e: PointerEvent) => {
      if (dragFromRef.current === null || e.pointerId !== dragPointerIdRef.current) return;
      const from = dragFromRef.current;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
      commitReorder(from, e.clientX);
      endPointerDrag();
    },
    [commitReorder, endPointerDrag],
  );

  const onReorderPointerCancel = useCallback(
    (e: PointerEvent) => {
      if (dragFromRef.current === null || e.pointerId !== dragPointerIdRef.current) return;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      endPointerDrag();
    },
    [endPointerDrag],
  );

  useEffect(() => {
    if (!reorderMode) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [reorderMode]);

  useEffect(() => {
    if (!reorderMode) endPointerDrag();
  }, [reorderMode, endPointerDrag]);

  return (
    <>
      {reorderMode &&
        createPortal(
          <div
            className="mobile-footer-reorder-backdrop"
            aria-hidden="true"
            onClick={(e) => e.preventDefault()}
            onPointerDown={(e) => e.stopPropagation()}
          />,
          document.body,
        )}
      {reorderMode && (
        <div className="mobile-footer-reorder-hint" role="status">
          <span>{reorderHint}</span>
          <button
            type="button"
            className="btn mobile-footer-reorder-hint__done"
            onClick={() => setReorderMode(false)}
          >
            {doneLabel}
          </button>
        </div>
      )}
      <nav className={cx("tab-bar", reorderMode && "tab-bar--reorder")}>
        {orderedTabs.map((tab, i) => {
          const isActive = activeNavPath === tab.to;
          return (
            <div
              key={tab.to}
              ref={(el) => {
                slotRefs.current[i] = el;
              }}
              className={cx("tab-bar__slot", reorderMode && dropHoverIndex === i && "tab-bar__slot--drop-hover")}
            >
              {reorderMode ? (
                <div
                  className={cx(
                    "tab-item",
                    "tab-item--reorder",
                    isActive && "active",
                    draggingIndex === i && "tab-item--reorder-dragging",
                  )}
                  onPointerDown={onReorderPointerDown(i)}
                  onPointerMove={onReorderPointerMove}
                  onPointerUp={onReorderPointerUp}
                  onPointerCancel={onReorderPointerCancel}
                >
                  <span className="tab-item__reorder-icon-wrap">{tab.icon}</span>
                  <span className="tab-item__label">{t(tab.label)}</span>
                </div>
              ) : (
                <NavLink
                  to={tab.to}
                  end={navLinkNeedsEndFlag(tab.to, allTabPathsForNav)}
                  className={({ isActive: na }) => cx("tab-item", na && "active")}
                  onPointerDown={() => startLongPress()}
                  onPointerUp={() => endLongPress()}
                  onPointerLeave={() => endLongPress()}
                  onClick={(e) => {
                    if (longPressFired.current) {
                      e.preventDefault();
                      longPressFired.current = false;
                    }
                  }}
                >
                  <span style={{ position: "relative", display: "inline-flex" }}>{tab.icon}</span>
                  <span className="tab-item__label">{t(tab.label)}</span>
                </NavLink>
              )}
            </div>
          );
        })}
      </nav>
    </>
  );
}
