import React, { useEffect, useRef } from 'react';
import { ChevronUp, Layers, X } from 'lucide-react';
import type { LayerKey } from '../domain/types';
import {
  countActiveGeometryLayers,
  type GeometryLayerKey,
  type WorkspaceLayerDescriptor,
} from '../domain/workspaceControls';

interface WorkspaceLayersPickerProps {
  catalog: WorkspaceLayerDescriptor[];
  layers: Record<LayerKey, boolean>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onToggleLayer: (key: GeometryLayerKey) => void;
}

/**
 * Upward "3D layers" popover matching RoomsPicker & Pin filters behavior.
 * Controls actual 3D model geometry layers (Civil, Electrical, Plumbing) independently
 * without changing active Pin filters, room scope, or Pin marker visibility.
 */
export const WorkspaceLayersPicker: React.FC<WorkspaceLayersPickerProps> = ({
  catalog,
  layers,
  open,
  onOpenChange,
  onToggleLayer,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const firstSwitchRef = useRef<HTMLButtonElement | null>(null);
  const prevOpenRef = useRef(false);

  const activeCount = countActiveGeometryLayers(layers);

  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = open;
    if (open && !wasOpen) {
      const raf = window.requestAnimationFrame(() => {
        firstSwitchRef.current?.focus({ preventScroll: true });
      });
      return () => window.cancelAnimationFrame(raf);
    }
    if (!open && wasOpen) {
      triggerRef.current?.focus({ preventScroll: true });
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onOpenChange(false);
      }
    };

    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (containerRef.current && target && !containerRef.current.contains(target)) {
        onOpenChange(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [open, onOpenChange]);

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-testid="layers-trigger-button"
        className={`inline-flex min-h-[44px] items-center gap-1.5 whitespace-nowrap rounded-lg px-2 text-[13px] leading-[18px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE] md:min-h-[36px] ${
          open
            ? 'bg-[#1B2A4A] text-white'
            : 'text-[#1B2A4A] hover:bg-[#F4F3EF]'
        }`}
      >
        <Layers
          className={`h-3.5 w-3.5 shrink-0 ${open ? 'text-white' : 'text-[#4F5C67]'}`}
          aria-hidden="true"
        />
        <span>3D layers</span>
        <span
          data-testid="layers-active-count"
          className={`rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
            open ? 'bg-white/20 text-white' : 'bg-[#F4F3EF] text-[#4F5C67]'
          }`}
        >
          {activeCount}/{catalog.length}
        </span>
        <ChevronUp
          className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="3D model layers"
          data-testid="layers-popover"
          className="absolute bottom-full right-0 z-40 mb-2 w-[min(320px,calc(100vw-24px))] overflow-hidden rounded-xl border border-[#D9DEE2] bg-white shadow-xl sm:left-0 sm:right-auto"
        >
          <div className="flex items-center justify-between border-b border-[#D9DEE2] px-3.5 py-2.5">
            <div>
              <div className="text-[13px] font-semibold text-[#1B2A4A]">3D layers</div>
              <div className="text-[11px] text-[#4F5C67]">
                Controls model geometry · keeps Pin filters
              </div>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="Close 3D layers picker"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#4F5C67] hover:bg-[#F4F3EF] hover:text-[#1B2A4A]"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="divide-y divide-[#ECEAE4] p-2">
            {catalog.map((item, idx) => {
              const active = Boolean(layers[item.key]);
              return (
                <button
                  key={item.key}
                  ref={idx === 0 ? firstSwitchRef : undefined}
                  type="button"
                  role="switch"
                  aria-checked={active}
                  data-testid={`layer-toggle-${item.key}`}
                  data-available={item.available ? 'true' : 'false'}
                  onClick={() => onToggleLayer(item.key)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors hover:bg-[#F4F3EF] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#0B63CE]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-[#1B2A4A]">
                        {item.label}
                      </span>
                      {!item.available && (
                        <span className="text-[11px] font-medium text-[#7A5901]">
                          No geometry source
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[11px] leading-[15px] text-[#4F5C67]">
                      {item.statusText}
                    </p>
                  </div>
                  <span
                    aria-hidden="true"
                    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                      active ? 'bg-[#1B2A4A]' : 'bg-[#D9DEE2]'
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
                        active ? 'translate-x-[18px]' : 'translate-x-[3px]'
                      }`}
                    />
                  </span>
                </button>
              );
            })}
          </div>

          <div className="border-t border-[#D9DEE2] bg-[#FAF9F6] px-3.5 py-2 text-[11px] leading-[15px] text-[#4F5C67]">
            Independent geometry toggles. Adding project departments does not generate 3D layers.
          </div>
        </div>
      )}
    </div>
  );
};
