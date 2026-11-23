import { useCallback, useEffect, useRef, useState } from 'react';

export interface ScrollSpySectionMetric {
  id: string;
  top: number;
  height: number;
}

/**
 * Pure deterministic scrollspy resolver.
 * - Selects the last section whose top has crossed the sticky-header reading line.
 * - When scrolled to (or within 24 px of) the bottom of the scroll container, selects the
 *   final section so short terminal sections (such as Delete account / Danger zone) always
 *   receive the active highlight.
 */
export function computeActiveSectionId(
  sections: ReadonlyArray<ScrollSpySectionMetric>,
  options: {
    scrollTop: number;
    viewportHeight: number;
    scrollHeight: number;
    readingLineOffsetPx?: number;
  }
): string | null {
  if (sections.length === 0) return null;

  const readingLineOffset = options.readingLineOffsetPx ?? 116;
  const maxScrollTop = Math.max(0, options.scrollHeight - options.viewportHeight);
  const atBottom = maxScrollTop > 0 && options.scrollTop >= maxScrollTop - 24;

  if (atBottom) {
    return sections[sections.length - 1].id;
  }

  const probeY = options.scrollTop + readingLineOffset;
  let activeId = sections[0].id;

  for (const section of sections) {
    if (section.top <= probeY) {
      activeId = section.id;
    } else {
      break;
    }
  }

  return activeId;
}

export interface SectionDescriptor<T extends string> {
  id: T;
  anchor: string;
}

/**
 * Tracks the visible section inside a page during user scroll without writing extra
 * browser history entries or causing jump loops after clicking a section link.
 */
export function useSectionScrollSpy<T extends string>(
  sections: ReadonlyArray<SectionDescriptor<T>>,
  initialSection: T,
  options?: {
    readingLineOffsetPx?: number;
    /** Optional scrollable container ref; defaults to window/documentElement */
    containerRef?: React.RefObject<HTMLElement | null>;
  }
) {
  const [activeSection, setActiveSection] = useState<T>(initialSection);
  const lockUntilRef = useRef<number>(0);
  const readingLineOffsetPx = options?.readingLineOffsetPx ?? 116;
  const containerRef = options?.containerRef;

  const measureAndSync = useCallback(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (Date.now() < lockUntilRef.current) return;

    const container = containerRef?.current ?? null;
    const scrollTop = container
      ? container.scrollTop
      : window.scrollY || document.documentElement.scrollTop || 0;
    const viewportHeight = container ? container.clientHeight : window.innerHeight;
    const scrollHeight = container
      ? container.scrollHeight
      : document.documentElement.scrollHeight;
    const containerTop = container ? container.getBoundingClientRect().top : 0;

    const metrics: ScrollSpySectionMetric[] = [];
    for (const sec of sections) {
      const el = document.getElementById(sec.anchor);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      const top = container
        ? rect.top - containerTop + scrollTop
        : rect.top + scrollTop;
      metrics.push({ id: sec.id, top, height: rect.height });
    }

    const next = computeActiveSectionId(metrics, {
      scrollTop,
      viewportHeight,
      scrollHeight,
      readingLineOffsetPx,
    }) as T | null;

    if (next) {
      setActiveSection((prev) => (prev === next ? prev : next));
    }
  }, [sections, readingLineOffsetPx, containerRef]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const target: EventTarget = containerRef?.current ?? window;
    let rafId = 0;

    const schedule = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        measureAndSync();
      });
    };

    target.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    // Sync once after initial layout paint
    schedule();

    return () => {
      target.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [measureAndSync, containerRef]);

  const jumpToSection = useCallback(
    (sectionId: T) => {
      setActiveSection(sectionId);
      // Pause scrollspy updates briefly during smooth scroll so intermediate sections do not flicker
      lockUntilRef.current = Date.now() + 450;
      const meta = sections.find((s) => s.id === sectionId);
      if (meta && typeof document !== 'undefined') {
        const prefersReduced =
          typeof window !== 'undefined' &&
          window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        document.getElementById(meta.anchor)?.scrollIntoView({
          behavior: prefersReduced ? 'auto' : 'smooth',
          block: 'start',
        });
      }
    },
    [sections]
  );

  return {
    activeSection,
    setActiveSection,
    jumpToSection,
  };
}
