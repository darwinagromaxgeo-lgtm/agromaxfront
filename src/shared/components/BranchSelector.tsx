import { useEffect, useId, useRef, useState } from 'react';
import { Building2, Check, ChevronDown } from 'lucide-react';
import type { Branch } from '../types';

interface BranchSelectorProps {
  branches: Branch[];
  selectedBranch: Branch | null;
  onSelect: (branchId: string) => void;
}

export function BranchSelector({ branches, selectedBranch, onSelect }: BranchSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const listId = useId();

  useEffect(() => {
    if (!isOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) optionRefs.current[focusedIndex]?.focus({ preventScroll: true });
  }, [isOpen, focusedIndex]);

  if (branches.length === 0) return null;

  const open = () => {
    const selectedIndex = branches.findIndex((branch) => branch.id === selectedBranch?.id);
    setFocusedIndex(Math.max(0, selectedIndex));
    setIsOpen(true);
  };

  const close = () => {
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div
      ref={containerRef}
      className="relative min-w-0 max-w-[calc(100vw-6rem)] sm:max-w-xs"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsOpen(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Sucursal activa: ${selectedBranch ? `${selectedBranch.code} · ${selectedBranch.name}` : 'Elegir sucursal'}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listId : undefined}
        onClick={() => isOpen ? close() : open()}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            open();
          }
        }}
        className={`flex h-12 w-full items-center gap-2.5 rounded-xl border px-2.5 text-left text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-primary-600 ${isOpen ? 'border-white/30 bg-white/20' : 'border-white/15 bg-white/10 hover:bg-white/20'}`}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
          <Building2 size={18} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[9px] font-medium uppercase tracking-wider text-white/75">
            Sucursal{selectedBranch ? ` · ${selectedBranch.code}` : ' activa'}
          </span>
          <span className="block truncate text-sm font-semibold leading-5">
            {selectedBranch?.name || 'Elegir sucursal'}
          </span>
        </span>
        <ChevronDown size={15} aria-hidden="true" className={`ml-1 shrink-0 text-white/80 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute -right-12 top-full z-50 mt-3 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-xl shadow-gray-900/10 sm:right-0">
          <div className="border-b border-gray-100 px-4 py-3">
            <p id={`${listId}-label`} className="text-sm font-semibold text-gray-800">Cambiar sucursal</p>
            <p className="mt-0.5 text-xs text-gray-400">
              {branches.length} {branches.length === 1 ? 'sucursal disponible' : 'sucursales disponibles'}
            </p>
          </div>
          <div
            id={listId}
            role="listbox"
            aria-labelledby={`${listId}-label`}
            className="max-h-[min(20rem,calc(100dvh-10rem))] overflow-y-auto p-2"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                close();
              } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
                event.preventDefault();
                const next = event.key === 'Home' ? 0
                  : event.key === 'End' ? branches.length - 1
                  : (focusedIndex + (event.key === 'ArrowDown' ? 1 : -1) + branches.length) % branches.length;
                setFocusedIndex(next);
                optionRefs.current[next]?.scrollIntoView({ block: 'nearest' });
              }
            }}
          >
            {branches.map((branch, index) => {
              const isSelected = branch.id === selectedBranch?.id;
              return (
                <button
                  key={branch.id}
                  ref={(element) => { optionRefs.current[index] = element; }}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  tabIndex={-1}
                  onFocus={() => setFocusedIndex(index)}
                  onClick={() => {
                    close();
                    if (!isSelected) onSelect(branch.id);
                  }}
                  className={`flex w-full items-center gap-3 rounded-xl p-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-300 ${isSelected ? 'bg-primary-50 text-primary-800' : 'text-gray-700 hover:bg-gray-50 focus:bg-gray-50'}`}
                >
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${isSelected ? 'bg-primary-100 text-primary-600' : 'bg-gray-100 text-gray-400'}`}>
                    <Building2 size={19} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-sm font-semibold leading-5">{branch.name}</span>
                    <span className={`mt-0.5 block break-words text-xs ${isSelected ? 'text-primary-600' : 'text-gray-400'}`}>
                      {branch.code}{isSelected ? ' · Activa' : ''}
                    </span>
                  </span>
                  {isSelected && <Check size={18} aria-hidden="true" className="shrink-0 text-primary-600" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
