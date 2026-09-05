import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AlbumWorkspaceTab {
  key: string;
  label: string;
  complete?: boolean;
  inProgress?: boolean;
  title?: string;
}

export function AlbumWorkspaceTabs({
  tabs,
  activeKey,
  onSelect,
  testId = "album-workspace-tabs",
}: {
  tabs: AlbumWorkspaceTab[];
  activeKey: string;
  onSelect: (key: string, element: HTMLButtonElement) => void;
  testId?: string;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [canPrevious, setCanPrevious] = useState(false);
  const [canNext, setCanNext] = useState(false);

  function updateOverflow() {
    const node = scrollerRef.current;
    if (!node) return;
    setCanPrevious(node.scrollLeft > 1);
    setCanNext(node.scrollLeft + node.clientWidth < node.scrollWidth - 1);
  }

  useEffect(() => {
    updateOverflow();
    const node = scrollerRef.current;
    if (!node) return;
    node.addEventListener("scroll", updateOverflow, { passive: true });
    const observer = new ResizeObserver(updateOverflow);
    observer.observe(node);
    return () => {
      node.removeEventListener("scroll", updateOverflow);
      observer.disconnect();
    };
  }, [tabs.length]);

  useEffect(() => {
    const activeIndex = tabs.findIndex((tab) => tab.key === activeKey);
    const activeTab = activeIndex >= 0 ? tabRefs.current[activeIndex] : null;
    activeTab?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }, [activeKey, tabs.length]);

  function move(direction: -1 | 1) {
    scrollerRef.current?.scrollBy({
      left: direction * Math.max(160, (scrollerRef.current.clientWidth || 320) * 0.65),
      behavior: "smooth",
    });
  }

  function selectAt(index: number) {
    const target = tabRefs.current[index];
    const tab = tabs[index];
    if (!target || !tab) return;
    target.focus();
    target.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
    onSelect(tab.key, target);
  }

  return (
    <div className="flex min-w-0 items-stretch" data-testid={testId}>
      <button
        type="button"
        onClick={() => move(-1)}
        disabled={!canPrevious}
        aria-label="Show previous album tabs"
        className="mr-1 inline-flex h-9 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--apple-subink)] hover:bg-[var(--apple-track)] disabled:pointer-events-none disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--apple-blue)]"
        data-testid="button-album-tabs-previous"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </button>
      <div
        ref={scrollerRef}
        role="tablist"
        aria-label="Album workspace sections"
        className="scrollbar-hide min-w-0 flex-1 overflow-x-auto overscroll-x-contain"
      >
        <div className="flex min-w-max items-center gap-5">
          {tabs.map((tab, index) => {
            const active = tab.key === activeKey;
            return (
              <button
                key={tab.key}
                ref={(node) => {
                  tabRefs.current[index] = node;
                }}
                type="button"
                role="tab"
                aria-selected={active}
                tabIndex={active ? 0 : -1}
                onClick={(event) => onSelect(tab.key, event.currentTarget)}
                onKeyDown={(event) => {
                  let nextIndex: number | null = null;
                  if (event.key === "ArrowLeft") {
                    nextIndex = (index - 1 + tabs.length) % tabs.length;
                  } else if (event.key === "ArrowRight") {
                    nextIndex = (index + 1) % tabs.length;
                  } else if (event.key === "Home") {
                    nextIndex = 0;
                  } else if (event.key === "End") {
                    nextIndex = tabs.length - 1;
                  }
                  if (nextIndex === null) return;
                  event.preventDefault();
                  selectAt(nextIndex);
                }}
                title={tab.title}
                className={cn(
                  "relative inline-flex shrink-0 items-center gap-1.5 pb-2.5 pt-1 text-sm font-semibold whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--apple-blue)] focus-visible:ring-offset-2",
                  active
                    ? "text-[var(--apple-ink)]"
                    : tab.complete
                      ? "text-[var(--apple-subink)] hover:text-[var(--apple-ink)]"
                      : tab.inProgress
                        ? "text-[var(--apple-subink)] hover:text-[var(--apple-ink)]"
                        : "text-[var(--apple-faint)] hover:text-[var(--apple-subink)]",
                )}
                data-testid={`tab-${tab.key}`}
              >
                {tab.label}
                {active && (
                  <span
                    className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-[var(--apple-blue)]"
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
      <button
        type="button"
        onClick={() => move(1)}
        disabled={!canNext}
        aria-label="Show next album tabs"
        className="ml-1 inline-flex h-9 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--apple-subink)] hover:bg-[var(--apple-track)] disabled:pointer-events-none disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--apple-blue)]"
        data-testid="button-album-tabs-next"
      >
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}