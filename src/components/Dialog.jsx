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

export function DialogShell({ open, onClose, labelledBy, describedBy, children, className = '', dismissible = true }) {
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
      if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus({ preventScroll: true });
    };
  }, [open, dismissible]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget && dismissible) closeRef.current();
      }}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        tabIndex={-1}
        className={`relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-xl border border-slate-800 bg-slate-900 shadow-2xl shadow-black/60 animate-scale-in sm:max-h-[86vh] sm:rounded-xl ${className}`}
        onMouseDown={event => event.stopPropagation()}
      >
        {children}
        {dismissible && (
          <button
            type="button"
            onClick={() => closeRef.current()}
            className="absolute right-2.5 top-2.5 z-10 inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-800 bg-slate-900 text-slate-400 transition hover:border-slate-700 hover:text-slate-100"
            aria-label="Close dialog"
          >
            <IconX size={14} />
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
