import { useCallback, useEffect, useRef } from 'react';
import { mergeProps } from './mergeProps.js';
import { defaultGetItemId, type GetItemId, type PropOverrides } from './types.js';

/**
 * Modal media viewer.
 *
 * A lightbox is where headless libraries earn their keep, because almost none
 * of the work is visual. This hook owns:
 *
 *   - focus management: focus moves in on open, is trapped while open (Tab and
 *     Shift+Tab cycle within the dialog), and is restored to the element that
 *     opened it on close. Without restore, closing a lightbox dumps keyboard
 *     users back at the top of the page.
 *   - Escape to close, Left/Right to navigate, Home/End to jump
 *   - background scroll lock, restoring the previous `overflow` value rather
 *     than blindly setting `''` (which would break an app that locks scroll
 *     for its own reasons)
 *   - `aria-modal` dialog semantics and a labelled close button
 *   - click-outside-to-close that does not fire when a drag started inside
 *
 * It owns no styles: the consumer decides what an overlay looks like.
 *
 * Controlled by design — the open index lives in the app, so deep links and
 * back-button behaviour stay possible.
 */

export interface UseLightboxOptions<TItem> {
  items: readonly TItem[];
  /** Currently open index, or `null` when closed. */
  index: number | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  getItemId?: GetItemId<TItem>;
  /** Wrap around at the ends. Default false. */
  loop?: boolean;
  /** Called whenever a new item becomes the active one, including on open. */
  onItemView?: (item: TItem, index: number) => void;
  label?: string;
}

export interface UseLightboxResult<TItem> {
  isOpen: boolean;
  activeItem: TItem | null;
  activeIndex: number | null;
  hasNext: boolean;
  hasPrevious: boolean;
  next: () => void;
  previous: () => void;
  close: () => void;
  getOverlayProps: <P extends PropOverrides>(overrides?: P) => P & Record<string, unknown>;
  getContentProps: <P extends PropOverrides>(overrides?: P) => P & Record<string, unknown>;
  getCloseButtonProps: <P extends PropOverrides>(overrides?: P) => P & Record<string, unknown>;
  getNextButtonProps: <P extends PropOverrides>(overrides?: P) => P & Record<string, unknown>;
  getPreviousButtonProps: <P extends PropOverrides>(overrides?: P) => P & Record<string, unknown>;
  getTitleProps: <P extends PropOverrides>(overrides?: P) => P & Record<string, unknown>;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

export function useLightbox<TItem>({
  items,
  index,
  onIndexChange,
  onClose,
  getItemId = defaultGetItemId,
  loop = false,
  onItemView,
  label = 'Media viewer',
}: UseLightboxOptions<TItem>): UseLightboxResult<TItem> {
  const isOpen = index !== null && index >= 0 && index < items.length;
  const activeItem = isOpen ? (items[index] ?? null) : null;

  const contentRef = useRef<HTMLElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const pointerDownInsideRef = useRef(false);

  const hasNext = isOpen && (loop || index < items.length - 1);
  const hasPrevious = isOpen && (loop || index > 0);

  const next = useCallback(() => {
    if (index === null) return;
    const candidate = index + 1;
    if (candidate < items.length) onIndexChange(candidate);
    else if (loop && items.length > 0) onIndexChange(0);
  }, [index, items.length, loop, onIndexChange]);

  const previous = useCallback(() => {
    if (index === null) return;
    const candidate = index - 1;
    if (candidate >= 0) onIndexChange(candidate);
    else if (loop && items.length > 0) onIndexChange(items.length - 1);
  }, [index, items.length, loop, onIndexChange]);

  /* ---------------------------------------------------------------------- */
  /* View reporting                                                         */
  /* ---------------------------------------------------------------------- */

  const viewRef = useRef(onItemView);
  viewRef.current = onItemView;
  const lastViewedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isOpen || index === null || !activeItem) {
      lastViewedRef.current = null;
      return;
    }
    const id = getItemId(activeItem, index);
    if (lastViewedRef.current === id) return;
    lastViewedRef.current = id;
    viewRef.current?.(activeItem, index);
  }, [isOpen, index, activeItem, getItemId]);

  /* ---------------------------------------------------------------------- */
  /* Focus: move in, trap, restore                                          */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    if (!isOpen) return;

    restoreFocusRef.current = (document.activeElement as HTMLElement | null) ?? null;

    // rAF, not a bare call: the dialog element does not exist until after paint
    // on the render that opens it.
    const frame = requestAnimationFrame(() => {
      const content = contentRef.current;
      if (!content) return;
      const focusable = content.querySelector<HTMLElement>(FOCUSABLE);
      (focusable ?? content).focus();
    });

    return () => {
      cancelAnimationFrame(frame);
      // Only restore if focus is still inside the dialog; otherwise the user
      // has deliberately moved on and yanking focus back would be hostile.
      const active = document.activeElement;
      if (!contentRef.current || contentRef.current.contains(active)) {
        restoreFocusRef.current?.focus?.();
      }
    };
  }, [isOpen]);

  /* ---------------------------------------------------------------------- */
  /* Scroll lock                                                            */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  /* ---------------------------------------------------------------------- */
  /* Keyboard                                                               */
  /* ---------------------------------------------------------------------- */

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      switch (event.key) {
        case 'Escape':
          event.preventDefault();
          onClose();
          break;
        case 'ArrowRight':
          event.preventDefault();
          next();
          break;
        case 'ArrowLeft':
          event.preventDefault();
          previous();
          break;
        case 'Home':
          event.preventDefault();
          onIndexChange(0);
          break;
        case 'End':
          event.preventDefault();
          onIndexChange(items.length - 1);
          break;
        case 'Tab': {
          // Focus trap. Without it, Tab walks into the page behind the overlay,
          // which screen-reader users cannot see is still there.
          const content = contentRef.current;
          if (!content) return;
          const focusable = [...content.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
            (element) => element.offsetParent !== null,
          );
          if (focusable.length === 0) {
            event.preventDefault();
            return;
          }
          const first = focusable[0]!;
          const last = focusable[focusable.length - 1]!;
          const active = document.activeElement;

          if (event.shiftKey && (active === first || active === content)) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && active === last) {
            event.preventDefault();
            first.focus();
          }
          break;
        }
        default:
          break;
      }
    },
    [next, previous, onClose, onIndexChange, items.length],
  );

  /* ---------------------------------------------------------------------- */
  /* Prop getters                                                           */
  /* ---------------------------------------------------------------------- */

  const titleId = 'media-lightbox-title';

  const getOverlayProps = useCallback(
    <P extends PropOverrides>(overrides?: P) =>
      mergeProps(
        {
          'data-state': isOpen ? 'open' : 'closed',
          // Tracks where the gesture STARTED. Selecting text inside the dialog
          // and releasing on the backdrop should not close it.
          onPointerDown: (event: React.PointerEvent) => {
            pointerDownInsideRef.current = Boolean(
              contentRef.current?.contains(event.target as Node),
            );
          },
          onClick: (event: React.MouseEvent) => {
            if (pointerDownInsideRef.current) return;
            if (event.target === event.currentTarget) onClose();
          },
        },
        overrides,
      ),
    [isOpen, onClose],
  );

  const getContentProps = useCallback(
    <P extends PropOverrides>(overrides?: P) =>
      mergeProps(
        {
          role: 'dialog' as const,
          'aria-modal': true,
          'aria-labelledby': titleId,
          'aria-label': label,
          tabIndex: -1,
          ref: (element: HTMLElement | null) => {
            contentRef.current = element;
          },
          onKeyDown: onKeyDown as (event: unknown) => void,
        },
        overrides,
      ),
    [label, onKeyDown],
  );

  const getTitleProps = useCallback(
    <P extends PropOverrides>(overrides?: P) => mergeProps({ id: titleId }, overrides),
    [],
  );

  const getCloseButtonProps = useCallback(
    <P extends PropOverrides>(overrides?: P) =>
      mergeProps({ type: 'button' as const, 'aria-label': 'Close viewer', onClick: onClose }, overrides),
    [onClose],
  );

  const getNextButtonProps = useCallback(
    <P extends PropOverrides>(overrides?: P) =>
      mergeProps(
        { type: 'button' as const, 'aria-label': 'Next item', disabled: !hasNext, onClick: next },
        overrides,
      ),
    [hasNext, next],
  );

  const getPreviousButtonProps = useCallback(
    <P extends PropOverrides>(overrides?: P) =>
      mergeProps(
        { type: 'button' as const, 'aria-label': 'Previous item', disabled: !hasPrevious, onClick: previous },
        overrides,
      ),
    [hasPrevious, previous],
  );

  return {
    isOpen,
    activeItem,
    activeIndex: isOpen ? index : null,
    hasNext,
    hasPrevious,
    next,
    previous,
    close: onClose,
    getOverlayProps,
    getContentProps,
    getCloseButtonProps,
    getNextButtonProps,
    getPreviousButtonProps,
    getTitleProps,
  };
}
