import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Check, ChevronUp, DoorOpen, Plus, Search, X } from 'lucide-react';
import type { RoomDefinition, RoomId, SpatialPin } from '../domain/types';
import { filterRoomsByQuery } from '../domain/demoStore';

interface RoomsPickerProps {
  rooms: RoomDefinition[];
  pins: SpatialPin[];
  activeRoomId: RoomId | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectRoom: (roomId: RoomId | null) => void;
  canAddRoom?: boolean;
  onAddRoomClick?: () => void;
}

/**
 * Bottom-dock upward Rooms picker.
 * Button shows the active room name or "Rooms".
 * Supports search, scrolling, selected state, keyboard navigation, "All rooms", and "Add room".
 * Opening and dismissing without selecting preserves the active Pin and camera.
 */
export function RoomsPicker({
  rooms,
  pins,
  activeRoomId,
  open,
  onOpenChange,
  onSelectRoom,
  canAddRoom = true,
  onAddRoomClick,
}: RoomsPickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [showAddRoomNotice, setShowAddRoomNotice] = useState(false);

  const filteredRooms = useMemo(() => filterRoomsByQuery(rooms, query), [rooms, query]);

  // Options list: index 0 is "All rooms" when query is empty, followed by filtered rooms
  const options = useMemo<Array<{ id: RoomId | null; room: RoomDefinition | null }>>(() => {
    const list: Array<{ id: RoomId | null; room: RoomDefinition | null }> = [];
    if (!query.trim()) {
      list.push({ id: null, room: null });
    }
    for (const room of filteredRooms) {
      list.push({ id: room.id, room });
    }
    return list;
  }, [filteredRooms, query]);

  const activeRoom = useMemo(
    () => rooms.find((r) => r.id === activeRoomId) ?? null,
    [rooms, activeRoomId]
  );

  const closeAndRestoreFocus = () => {
    onOpenChange(false);
    setShowAddRoomNotice(false);
    window.requestAnimationFrame(() => {
      triggerRef.current?.focus();
    });
  };

  useEffect(() => {
    if (!open) return;
    setHighlightedIndex(0);
    window.requestAnimationFrame(() => {
      searchRef.current?.focus();
    });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onOpenChange(false);
        setShowAddRoomNotice(false);
        window.requestAnimationFrame(() => {
          triggerRef.current?.focus();
        });
      }
    };

    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onOpenChange(false);
        setShowAddRoomNotice(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousedown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousedown', onPointerDown);
    };
  }, [open, onOpenChange]);

  const handleKeyDownInside = (e: React.KeyboardEvent) => {
    if (options.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = (highlightedIndex + 1) % options.length;
      setHighlightedIndex(next);
      optionRefs.current[next]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = (highlightedIndex - 1 + options.length) % options.length;
      setHighlightedIndex(prev);
      optionRefs.current[prev]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      setHighlightedIndex(0);
      optionRefs.current[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      const last = options.length - 1;
      setHighlightedIndex(last);
      optionRefs.current[last]?.focus();
    }
  };

  const handleSelectOption = (roomId: RoomId | null) => {
    onSelectRoom(roomId);
    onOpenChange(false);
    setQuery('');
    setShowAddRoomNotice(false);
    window.requestAnimationFrame(() => {
      triggerRef.current?.focus();
    });
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Upward Rooms Popover */}
      {open && (
        <div
          id="workspace-rooms-popover"
          role="dialog"
          aria-label="Room selector"
          data-testid="rooms-popover"
          onKeyDown={handleKeyDownInside}
          className="absolute bottom-full left-1/2 z-40 mb-2 w-[min(320px,calc(100vw-24px))] -translate-x-1/2 overflow-hidden rounded-xl border border-[#D9DEE2] bg-white shadow-lg"
        >
          <div className="border-b border-[#D9DEE2] p-3">
            <div className="flex items-center justify-between gap-2 pb-2">
              <span className="text-[14px] leading-[20px] font-semibold text-[#1B2A4A]">
                Rooms ({rooms.length})
              </span>
              <button
                type="button"
                onClick={closeAndRestoreFocus}
                aria-label="Close Rooms"
                className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-[#4F5C67] hover:bg-[#F4F3EF] md:h-8 md:w-8"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4F5C67]"
                aria-hidden="true"
              />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setHighlightedIndex(0);
                }}
                placeholder="Search rooms..."
                aria-label="Search rooms"
                className="h-10 w-full rounded-lg border border-[#D9DEE2] bg-[#F4F3EF]/50 pl-9 pr-8 text-[14px] leading-[20px] text-[#1B2A4A] placeholder:text-[#4F5C67]/75"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    searchRef.current?.focus();
                  }}
                  aria-label="Clear room search"
                  className="absolute right-1.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-[#4F5C67] hover:bg-[#F4F3EF]"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>

          <div role="listbox" aria-label="Available rooms" className="max-h-[240px] overflow-y-auto p-2">
            {options.length === 0 ? (
              <div className="px-3 py-6 text-center">
                <p className="text-[14px] leading-[20px] font-medium text-[#1B2A4A]">
                  No matching results
                </p>
                <p className="mt-1 text-[13px] leading-[18px] text-[#4F5C67]">
                  No rooms matched “{query}”.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    searchRef.current?.focus();
                  }}
                  className="mt-3 inline-flex min-h-[36px] items-center rounded-lg border border-[#D9DEE2] bg-white px-3 py-1.5 text-[13px] font-medium text-[#1B2A4A] hover:bg-[#F4F3EF]"
                >
                  Clear filter
                </button>
              </div>
            ) : (
              <div className="space-y-1">
                {options.map((opt, idx) => {
                  if (opt.room === null) {
                    const isSelected = activeRoomId === null;
                    return (
                      <button
                        key="__all_rooms__"
                        ref={(el) => {
                          optionRefs.current[idx] = el;
                        }}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => handleSelectOption(null)}
                        className={`flex min-h-[44px] w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left transition-colors ${
                          isSelected
                            ? 'bg-[#D4652F]/10 font-semibold text-[#1B2A4A]'
                            : 'text-[#1B2A4A] hover:bg-[#F4F3EF]'
                        }`}
                      >
                        <div>
                          <div className="text-[14px] leading-[20px]">All rooms</div>
                          <div className="text-[13px] leading-[18px] text-[#4F5C67] tabular-nums">
                            {pins.length} {pins.length === 1 ? 'Pin' : 'Pins'} across model
                          </div>
                        </div>
                        {isSelected && (
                          <Check className="h-4 w-4 shrink-0 text-[#D4652F]" aria-hidden="true" />
                        )}
                      </button>
                    );
                  }

                  const room = opt.room;
                  const isSelected = activeRoomId === room.id;
                  const roomPinCount = pins.filter((p) => p.roomId === room.id).length;

                  return (
                    <button
                      key={room.id}
                      ref={(el) => {
                        optionRefs.current[idx] = el;
                      }}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => handleSelectOption(room.id)}
                      className={`flex min-h-[44px] w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left transition-colors ${
                        isSelected
                          ? 'bg-[#D4652F]/10 text-[#1B2A4A]'
                          : 'text-[#1B2A4A] hover:bg-[#F4F3EF]'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-[16px] leading-[22px] font-semibold">
                            {room.name}
                          </span>
                          {room.verificationStatus !== 'verified' && (
                            <span className="rounded bg-[#F4F3EF] px-1.5 py-0.5 text-[11px] font-medium text-[#A64011]">
                              {room.verificationStatus}
                            </span>
                          )}
                        </div>
                        <div className="text-[13px] leading-[18px] text-[#4F5C67] tabular-nums">
                          {room.areaLabel} · {roomPinCount}{' '}
                          {roomPinCount === 1 ? 'Pin' : 'Pins'}
                        </div>
                      </div>
                      {isSelected && (
                        <Check className="h-4 w-4 shrink-0 text-[#D4652F]" aria-hidden="true" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {!onAddRoomClick && showAddRoomNotice && (
              <div
                role="status"
                className="mt-2 rounded-lg border border-[#D4652F]/40 bg-[#F4F3EF]/70 p-3 text-[13px] leading-[18px] text-[#1B2A4A]"
              >
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#A64011]" aria-hidden="true" />
                  <div>
                    <div className="font-semibold">Add room is unavailable in Stage A</div>
                    <p className="mt-0.5 text-[#4F5C67]">
                      Marking closed room boundaries on calibrated plans is scheduled for Stage C.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {canAddRoom && (
            <div className="border-t border-[#D9DEE2] p-2.5">
              <button
                type="button"
                data-testid="rooms-add-room-btn"
                onClick={() => {
                  if (onAddRoomClick) {
                    onOpenChange(false);
                    onAddRoomClick();
                  } else {
                    setShowAddRoomNotice(true);
                  }
                }}
                className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-lg border border-[#D9DEE2] bg-white px-3 py-1.5 text-[14px] leading-[20px] font-medium text-[#1B2A4A] transition-colors hover:bg-[#F4F3EF] md:min-h-[40px]"
              >
                <Plus className="h-4 w-4 text-[#A64011]" aria-hidden="true" />
                Add room
              </button>
            </div>
          )}
        </div>
      )}

      {/* Single Rooms Trigger Button in Bottom Dock */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls="workspace-rooms-popover"
        data-testid="rooms-trigger-button"
        className={`inline-flex min-h-[44px] items-center gap-1.5 whitespace-nowrap rounded-lg border px-2 text-[13px] leading-[18px] font-medium transition-colors md:min-h-[36px] ${
          open || activeRoom
            ? 'border-[#D4652F] bg-[#D4652F]/10 text-[#1B2A4A]'
            : 'border-[#D9DEE2] bg-white text-[#1B2A4A] hover:bg-[#F4F3EF]'
        }`}
      >
        <DoorOpen className="h-4 w-4 shrink-0 text-[#D4652F]" aria-hidden="true" />
        <span>{activeRoom ? activeRoom.name : 'Rooms'}</span>
        <ChevronUp
          className={`h-3.5 w-3.5 text-[#4F5C67] transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>
    </div>
  );
}
