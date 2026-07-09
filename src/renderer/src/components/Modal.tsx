import { useEffect, type ReactNode } from 'react';
import clsx from 'clsx';
import { XIcon } from './icons';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  footer?: ReactNode;
}

export function Modal({ title, onClose, children, wide, footer }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <div
        className={clsx(
          'panel bg-surface w-full flex flex-col max-h-[85vh] shadow-neon-lg',
          wide ? 'max-w-3xl' : 'max-w-xl'
        )}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold tracking-wide text-content">{title}</h2>
          <button className="btn-ghost !p-1.5" onClick={onClose} aria-label="Close">
            <XIcon />
          </button>
        </header>
        <div className="overflow-y-auto p-5">{children}</div>
        {footer && (
          <footer className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
