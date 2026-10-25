import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { IconX } from './icons.jsx';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function DialogShell({
  open,
  onClose,
  labelledBy,
  describedBy,
  children,
  className = '',
  dismissible = true,
}) {
  const dialogRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const frame = window.requestAnimationFrame(() => {
      const node = dialogRef.current;
      if (!node) return;
      const target = node.querySelector('[data-autofocus]') || node.querySelector(FOCUSABLE) || node;
      target.focus({ preventScroll: true });
    });

    const onKeyDown = event => {
      if (event.key === 'Escape' && dismissible) {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const node = dialogRef.current;
      if (!node) return;
      const focusable = [...node.querySelectorAll(FOCUSABLE)].filter(element => element.offsetParent !== null || element === document.activeElement);
      if (!focusable.length) {
        event.preventDefault();
        node.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === node)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousFocus && typeof previousFocus.focus === 'function') {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, [open, dismissible]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6"
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget && dismissible) closeRef.current();
      }}
    >
      <div className="absolute inset-0 animate-fade-in bg-ink-900/45 backdrop-blur-[3px]" aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        tabIndex={-1}
        className={`relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-[24px] border border-line bg-paper-50 shadow-lift animate-scale-in sm:max-h-[88vh] sm:rounded-[24px] ${className}`}
        onMouseDown={event => event.stopPropagation()}
      >
        {children}
        {dismissible && (
          <button
            type="button"
            onClick={() => closeRef.current()}
            className="absolute right-4 top-4 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full border border-line/80 bg-paper-50/90 text-ink-muted transition hover:bg-paper-200 hover:text-ink sm:right-5 sm:top-5"
            aria-label="Tutup dialog"
          >
            <IconX size={17} />
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
