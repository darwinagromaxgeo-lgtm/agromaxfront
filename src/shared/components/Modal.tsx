import React from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'default' | 'lg' | 'xl' | '2xl';
  description?: React.ReactNode;
  footer?: React.ReactNode;
  closeDisabled?: boolean;
}

export function Modal({ isOpen, onClose, title, children, size = 'default', description, footer, closeDisabled = false }: ModalProps) {
  const titleId = React.useId();
  if (!isOpen) return null;
  const sizeClass = size === '2xl' ? 'max-w-6xl' : size === 'xl' ? 'max-w-4xl' : size === 'lg' ? 'max-w-2xl' : 'max-w-lg';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => { if (!closeDisabled) onClose(); }} />
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className={`relative bg-white rounded-2xl shadow-card-hover w-full ${sizeClass} mx-4 max-h-[90vh] flex flex-col overflow-hidden`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="min-w-0"><h2 id={titleId} className="text-lg font-semibold text-gray-800">{title}</h2>{description}</div>
          <button
            type="button"
            aria-label="Cerrar"
            disabled={closeDisabled}
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-1.5 rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-4 overflow-y-auto flex-1">{children}</div>
        {footer && <div className="px-6 py-4 border-t border-gray-100 flex-shrink-0 bg-white">{footer}</div>}
      </div>
    </div>
  );
}
