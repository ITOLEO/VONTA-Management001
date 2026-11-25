import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Ban,
  Brush,
  Circle,
  Compass,
  CornerDownRight,
  Eraser,
  Eye,
  EyeOff,
  Highlighter,
  Minus,
  MousePointer2,
  PaintBucket,
  Palette,
  Pencil,
  RectangleHorizontal,
  Redo2,
  Ruler,
  Shapes,
  SlidersHorizontal,
  Square,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { formatAnnotationDisplaySummary } from '../domain/privateAnnotationHistory';
import {
  clampStrokeWidthPx,
  MAX_STROKE_WIDTH_PX,
  MIN_STROKE_WIDTH_PX,
  STROKE_WIDTH_PRESETS,
  type DrawingLineStyle,
} from '../domain/workspaceMath';
import {
  isCursorModeTool,
  pxToStrokeWidthKey,
  strokeWidthKeyToPx,
  type DrawingStorageMode,
  type DrawingStrokeWidthKey,
  type DrawingToolType,
  type PrivateSurfaceAnnotation,
} from '../utils/privateDrawingStore';
import { ColorPickerControl } from './ColorPickerControl';

interface WorkspaceDrawingToolbarProps {
  canDraw: boolean;
  activeTool: DrawingToolType;
  onSelectTool: (tool: DrawingToolType) => void;
  colorHex: string;
  onSelectColor: (hex: string) => void;
  strokeWidth: DrawingStrokeWidthKey;
  onSelectStrokeWidth: (w: DrawingStrokeWidthKey) => void;
  strokeWidthPx?: number;
  onSelectStrokeWidthPx?: (px: number) => void;
  lineStyle?: DrawingLineStyle;
  onSelectLineStyle?: (style: DrawingLineStyle) => void;
  deleteMode: boolean;
  onToggleDeleteMode: () => void;
  annotationCount: number;
  onClearAllOwn: () => void;
  hideLocalDrawings: boolean;
  onToggleHideLocalDrawings: () => void;
  storageMode: DrawingStorageMode;
  storageWarning: string | null;
  rejectedNotice: string | null;
  isModelCalibrated?: boolean;
  selectedAnnotation?: PrivateSurfaceAnnotation | null;
  onDeleteSelectedAnnotation?: () => void;
  onDeselectAnnotation?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  undoCount?: number;
  redoCount?: number;
  onUndo?: () => void;
  onRedo?: () => void;
}

type ToolGroupId =
  | 'cursor'
  | 'freehand'
  | 'rulers'
  | 'shapes'
  | 'edit'
  | 'stroke'
  | 'color';

const FREEHAND_TOOLS: ReadonlyArray<{
  id: DrawingToolType;
  label: string;
  shortcut: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'pencil', label: 'Pencil', shortcut: 'P', hint: 'Fine crisp line', icon: Pencil },
  {
    id: 'marker',
    label: 'Marker',
    shortcut: 'M',
    hint: 'Broad translucent highlight',
    icon: Highlighter,
  },
  { id: 'brush', label: 'Brush', shortcut: 'B', hint: 'Solid freehand stroke', icon: Brush },
];

const RULER_TOOLS: ReadonlyArray<{
  id: DrawingToolType;
  label: string;
  shortcut: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: 'ruler_straight',
    label: 'Straight ruler',
    shortcut: 'R',
    hint: '2-point distance on surface',
    icon: Ruler,
  },
  {
    id: 'ruler_right_angle',
    label: 'Right-angle ruler',
    shortcut: 'R',
    hint: 'L-shape 90° legs',
    icon: CornerDownRight,
  },
  {
    id: 'ruler_angle',
    label: 'Angle ruler',
    shortcut: 'R',
    hint: 'Vertex + two rays (°)',
    icon: Compass,
  },
];

const SHAPE_TOOLS: ReadonlyArray<{
  id: DrawingToolType;
  label: string;
  shortcut: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'line', label: 'Line', shortcut: 'U', icon: Minus },
  { id: 'arrow', label: 'Arrow', shortcut: 'U', icon: ArrowUpRight },
  { id: 'circle', label: 'Circle', shortcut: 'U', icon: Circle },
  { id: 'ellipse', label: 'Ellipse', shortcut: 'U', icon: Circle },
  { id: 'square', label: 'Square', shortcut: 'U', icon: Square },
  { id: 'rectangle', label: 'Rectangle', shortcut: 'U', icon: RectangleHorizontal },
];

const LINE_STYLE_OPTIONS: ReadonlyArray<{ id: DrawingLineStyle; label: string; preview: string }> = [
  { id: 'solid', label: 'Solid', preview: 'border-solid' },
  { id: 'dashed', label: 'Dashed', preview: 'border-dashed' },
  { id: 'dotted', label: 'Dotted', preview: 'border-dotted' },
];

function toolMeta(
  tool: DrawingToolType,
  deleteMode: boolean
): { label: string; shortcut: string } {
  if (deleteMode || tool === 'eraser') return { label: 'Eraser', shortcut: 'E' };
  switch (tool) {
    case 'cursor':
    case 'pan':
      return { label: 'Cursor', shortcut: 'V' };
    case 'pencil':
      return { label: 'Pencil', shortcut: 'P' };
    case 'marker':
      return { label: 'Marker', shortcut: 'M' };
    case 'brush':
      return { label: 'Brush', shortcut: 'B' };
    case 'ruler_straight':
      return { label: 'Straight ruler', shortcut: 'R' };
    case 'ruler_right_angle':
      return { label: 'Right-angle ruler', shortcut: 'R' };
    case 'ruler_angle':
      return { label: 'Angle ruler', shortcut: 'R' };
    case 'line':
      return { label: 'Line', shortcut: 'U' };
    case 'arrow':
      return { label: 'Arrow', shortcut: 'U' };
    case 'circle':
      return { label: 'Circle', shortcut: 'U' };
    case 'ellipse':
      return { label: 'Ellipse', shortcut: 'U' };
    case 'square':
      return { label: 'Square', shortcut: 'U' };
    case 'rectangle':
      return { label: 'Rectangle', shortcut: 'U' };
    case 'wall_fill':
      return { label: 'Wall fill', shortcut: 'G' };
    default:
      return { label: 'Cursor', shortcut: 'V' };
  }
}

/**
 * Compact Photoshop-style vertical tool rail for private field annotations.
 * - Initial tool is Cursor (V).
 * - Grouped flyouts for Freehand (Pencil/Marker/Brush), Rulers (Straight/Right-angle/Angle),
 *   Shapes (Line/Arrow/Circle/Ellipse/Square/Rectangle), Edit (Eraser/Wall fill/Clear own),
 *   Stroke settings (numeric 1–32, presets, Solid/Dashed/Dotted), and Color (hex, wheel, eyedropper).
 * - Includes Undo (Ctrl+Z), Redo (Ctrl+Shift+Z), active tool + shortcut badge, and
 *   selected-mark Delete bar (Delete/Backspace).
 * - Hidden completely when user lacks private local drawing authority.
 */
export function WorkspaceDrawingToolbar({
  canDraw,
  activeTool,
  onSelectTool,
  colorHex,
  onSelectColor,
  strokeWidth,
  onSelectStrokeWidth,
  strokeWidthPx,
  onSelectStrokeWidthPx,
  lineStyle = 'solid',
  onSelectLineStyle,
  deleteMode,
  onToggleDeleteMode,
  annotationCount,
  onClearAllOwn,
  hideLocalDrawings,
  onToggleHideLocalDrawings,
  storageMode,
  storageWarning,
  rejectedNotice,
  isModelCalibrated = true,
  selectedAnnotation = null,
  onDeleteSelectedAnnotation,
  onDeselectAnnotation,
  canUndo = false,
  canRedo = false,
  undoCount = 0,
  redoCount = 0,
  onUndo,
  onRedo,
}: WorkspaceDrawingToolbarProps) {
  const [openGroup, setOpenGroup] = useState<ToolGroupId | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const railRef = useRef<HTMLDivElement | null>(null);

  const effectiveWidthPx = strokeWidthPx ?? strokeWidthKeyToPx(strokeWidth);
  const isDrawingActive = !isCursorModeTool(activeTool) || deleteMode;
  const activeMeta = toolMeta(activeTool, deleteMode);

  const stopDrawing = () => {
    if (deleteMode) onToggleDeleteMode();
    onSelectTool('cursor');
    setOpenGroup(null);
  };

  // Escape cancels active drawing tool or closes open flyout popover
  useEffect(() => {
    if (!canDraw) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (openGroup) {
          setOpenGroup(null);
        } else if (isDrawingActive) {
          stopDrawing();
        }
      }
    };
    const onPointerDown = (e: MouseEvent) => {
      if (railRef.current && !railRef.current.contains(e.target as Node)) {
        setOpenGroup(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousedown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousedown', onPointerDown);
    };
  }, [canDraw, openGroup, isDrawingActive]);

  if (!canDraw) {
    return null;
  }

  const handleChooseTool = (tool: DrawingToolType) => {
    if (deleteMode && tool !== 'eraser') {
      onToggleDeleteMode();
    }
    onSelectTool(tool);
    setOpenGroup(null);
  };

  const handleWidthChange = (nextPx: number) => {
    const clamped = clampStrokeWidthPx(nextPx);
    onSelectStrokeWidthPx?.(clamped);
    onSelectStrokeWidth(pxToStrokeWidthKey(clamped));
  };

  const isFreehandActive =
    activeTool === 'pencil' || activeTool === 'marker' || activeTool === 'brush';
  const isRulerActive =
    activeTool === 'ruler_straight' ||
    activeTool === 'ruler_right_angle' ||
    activeTool === 'ruler_angle';
  const isShapeActive =
    activeTool === 'line' ||
    activeTool === 'arrow' ||
    activeTool === 'circle' ||
    activeTool === 'ellipse' ||
    activeTool === 'square' ||
    activeTool === 'rectangle';
  const isEditActive = deleteMode || activeTool === 'eraser' || activeTool === 'wall_fill';

  // Resolve active sub-tool icon for each grouped Photoshop-style rail slot
  const ActiveFreehandIcon =
    FREEHAND_TOOLS.find((t) => t.id === activeTool)?.icon ?? Pencil;
  const ActiveRulerIcon =
    RULER_TOOLS.find((t) => t.id === activeTool)?.icon ?? Ruler;
  const ActiveShapeIcon =
    SHAPE_TOOLS.find((t) => t.id === activeTool)?.icon ?? Shapes;
  const ActiveEditIcon =
    activeTool === 'wall_fill' && !deleteMode ? PaintBucket : Eraser;

  const groupButtons: ReadonlyArray<{
    id: ToolGroupId;
    label: string;
    shortcutHint?: string;
    active: boolean;
    hasFlyout: boolean;
    icon: React.ReactNode;
  }> = [
    {
      id: 'cursor',
      label: 'Cursor (V)',
      shortcutHint: 'V',
      active: !isDrawingActive,
      hasFlyout: false,
      icon: <MousePointer2 className="h-4 w-4" aria-hidden="true" />,
    },
    {
      id: 'freehand',
      label: 'Freehand — Pencil (P), Marker (M), Brush (B)',
      shortcutHint: 'P/M/B',
      active: isFreehandActive,
      hasFlyout: true,
      icon: <ActiveFreehandIcon className="h-4 w-4" aria-hidden="true" />,
    },
    {
      id: 'rulers',
      label: 'Rulers — Straight, Right-angle, Angle (R)',
      shortcutHint: 'R',
      active: isRulerActive,
      hasFlyout: true,
      icon: <ActiveRulerIcon className="h-4 w-4" aria-hidden="true" />,
    },
    {
      id: 'shapes',
      label: 'Shapes — Line, Arrow, Circle, Ellipse, Square, Rectangle (U)',
      shortcutHint: 'U',
      active: isShapeActive,
      hasFlyout: true,
      icon: <ActiveShapeIcon className="h-4 w-4" aria-hidden="true" />,
    },
    {
      id: 'edit',
      label: 'Edit — Eraser (E), Wall fill (G), Clear',
      shortcutHint: 'E/G',
      active: isEditActive,
      hasFlyout: true,
      icon: <ActiveEditIcon className="h-4 w-4" aria-hidden="true" />,
    },
    {
      id: 'stroke',
      label: `Line settings (${effectiveWidthPx}px · ${lineStyle})`,
      active: openGroup === 'stroke',
      hasFlyout: true,
      icon: <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />,
    },
    {
      id: 'color',
      label: `Color (${colorHex})`,
      active: openGroup === 'color',
      hasFlyout: true,
      icon: (
        <span className="relative inline-flex items-center justify-center">
          <Palette className="h-4 w-4" aria-hidden="true" />
          <span
            className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-white"
            style={{ backgroundColor: colorHex }}
            aria-hidden="true"
          />
        </span>
      ),
    },
  ];

  return (
    <div
      ref={railRef}
      data-testid="workspace-drawing-toolbar"
      role="toolbar"
      aria-label="Private local 3D drawing tools"
      aria-orientation="vertical"
      className="pointer-events-auto relative flex items-start gap-2"
    >
      {/* Compact Photoshop-Style Vertical Tool Rail */}
      <div className="flex flex-col items-center gap-1 rounded-xl border border-[#D9DEE2] bg-white/95 p-1.5 shadow-sm backdrop-blur">
        {/* Explicit red prohibition Stop drawing button when drawing is active */}
        {isDrawingActive && (
          <button
            type="button"
            data-testid="drawing-stop-btn"
            onClick={stopDrawing}
            title="Stop drawing and return to Cursor (Esc)"
            aria-label="Stop drawing"
            className="mb-0.5 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#B42318]/40 bg-[#FEF3F2] text-[#B42318] transition-colors hover:bg-[#FEE4E2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE]"
          >
            <Ban className="h-4 w-4" aria-hidden="true" />
          </button>
        )}

        {groupButtons.map((grp) => {
          const isOpen = openGroup === grp.id;
          return (
            <button
              key={grp.id}
              type="button"
              data-testid={`drawing-group-${grp.id}`}
              aria-expanded={grp.hasFlyout ? isOpen : undefined}
              aria-pressed={grp.active}
              title={grp.label}
              aria-label={grp.label}
              onClick={() => {
                if (grp.id === 'cursor') {
                  if (isDrawingActive) {
                    stopDrawing();
                  } else {
                    setOpenGroup((prev) => (prev === 'cursor' ? null : 'cursor'));
                  }
                  return;
                }
                setOpenGroup((prev) => (prev === grp.id ? null : grp.id));
              }}
              className={`relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-[12px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE] ${
                grp.active
                  ? 'bg-[#1B2A4A] text-white'
                  : isOpen
                  ? 'bg-[#FFF3EB] text-[#A64011]'
                  : 'text-[#1B2A4A] hover:bg-[#F4F3EF]'
              }`}
            >
              {grp.icon}
              {grp.hasFlyout && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute bottom-1 right-1 h-0 w-0 border-b-[4px] border-l-[4px] border-b-current border-l-transparent opacity-65"
                />
              )}
            </button>
          );
        })}

        <div className="my-0.5 h-px w-6 bg-[#D9DEE2]" aria-hidden="true" />

        {/* Local Edit Undo / Redo */}
        <button
          type="button"
          data-testid="drawing-undo-btn"
          disabled={!canUndo}
          onClick={() => onUndo?.()}
          title={canUndo ? `Undo local edit (${undoCount}) · Ctrl+Z` : 'Nothing to undo (Ctrl+Z)'}
          aria-label="Undo local edit"
          className={`inline-flex h-8 w-9 items-center justify-center rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE] ${
            canUndo
              ? 'text-[#1B2A4A] hover:bg-[#F4F3EF]'
              : 'cursor-not-allowed text-[#4F5C67]/40'
          }`}
        >
          <Undo2 className="h-4 w-4" aria-hidden="true" />
        </button>

        <button
          type="button"
          data-testid="drawing-redo-btn"
          disabled={!canRedo}
          onClick={() => onRedo?.()}
          title={
            canRedo ? `Redo local edit (${redoCount}) · Ctrl+Shift+Z` : 'Nothing to redo (Ctrl+Shift+Z)'
          }
          aria-label="Redo local edit"
          className={`inline-flex h-8 w-9 items-center justify-center rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE] ${
            canRedo
              ? 'text-[#1B2A4A] hover:bg-[#F4F3EF]'
              : 'cursor-not-allowed text-[#4F5C67]/40'
          }`}
        >
          <Redo2 className="h-4 w-4" aria-hidden="true" />
        </button>

        <div className="my-0.5 h-px w-6 bg-[#D9DEE2]" aria-hidden="true" />

        {/* Show / Hide local marks toggle */}
        <button
          type="button"
          data-testid="drawing-hide-toggle"
          aria-pressed={hideLocalDrawings}
          onClick={onToggleHideLocalDrawings}
          title={hideLocalDrawings ? 'Show my local marks' : 'Hide my local marks'}
          aria-label={hideLocalDrawings ? 'Show local marks' : 'Hide local marks'}
          className={`inline-flex h-8 w-9 items-center justify-center rounded-lg transition-colors ${
            hideLocalDrawings
              ? 'bg-[#F4F3EF] text-[#A64011]'
              : 'text-[#4F5C67] hover:bg-[#F4F3EF] hover:text-[#1B2A4A]'
          }`}
        >
          {hideLocalDrawings ? (
            <EyeOff className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Eye className="h-4 w-4" aria-hidden="true" />
          )}
        </button>

        {/* Active numeric width badge */}
        <div
          className="px-1 text-center text-[10px] font-semibold tabular-nums text-[#4F5C67]"
          title={`${effectiveWidthPx} px · ${lineStyle} · ${annotationCount} local marks`}
        >
          {effectiveWidthPx}px
        </div>
      </div>

      {/* Side status, selected-mark delete bar & flyout column */}
      <div className="flex flex-col items-start gap-2">
        {/* Compact Active Tool & Keyboard Shortcut Indicator */}
        <div
          data-testid="active-drawing-indicator"
          className="flex items-center gap-2 rounded-xl border border-[#D9DEE2] bg-white/95 px-2.5 py-1.5 text-[12px] shadow-sm backdrop-blur"
        >
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: isDrawingActive ? colorHex : '#1B2A4A' }}
            aria-hidden="true"
          />
          <span data-testid="active-tool-name" className="font-semibold text-[#1B2A4A]">
            {activeMeta.label}
          </span>
          <kbd
            data-testid="active-tool-shortcut"
            className="rounded border border-[#D9DEE2] bg-[#F4F3EF] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#1B2A4A]"
          >
            {activeMeta.shortcut}
          </kbd>
          {isDrawingActive && (
            <>
              <span className="text-[#4F5C67] tabular-nums">
                {effectiveWidthPx}px · {lineStyle}
              </span>
              <button
                type="button"
                data-testid="drawing-stop-inline-btn"
                onClick={stopDrawing}
                className="ml-0.5 inline-flex items-center gap-1 rounded-md border border-[#B42318]/40 bg-[#FEF3F2] px-2 py-0.5 text-[11px] font-semibold text-[#B42318] hover:bg-[#FEE4E2]"
              >
                <Ban className="h-3 w-3" aria-hidden="true" />
                Stop drawing
              </button>
            </>
          )}
        </div>

        {/* Visible Selected Annotation Bar with Delete action */}
        {selectedAnnotation && !isDrawingActive && (
          <div
            data-testid="selected-annotation-bar"
            role="status"
            className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-600/40 bg-zinc-950 px-3 py-1.5 text-[12px] text-white shadow-md"
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-emerald-400"
              style={{ backgroundColor: selectedAnnotation.colorHex }}
              aria-hidden="true"
            />
            <span className="font-medium text-emerald-300">Selected:</span>
            <span data-testid="selected-annotation-summary" className="font-semibold text-white">
              {formatAnnotationDisplaySummary(selectedAnnotation)}
            </span>
            <button
              type="button"
              data-testid="drawing-delete-selected-btn"
              onClick={() => onDeleteSelectedAnnotation?.()}
              className="ml-1 inline-flex items-center gap-1 rounded-lg bg-[#B42318] px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-[#912018] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
            >
              <Trash2 className="h-3 w-3" aria-hidden="true" />
              Delete
              <kbd className="ml-0.5 rounded bg-white/15 px-1 font-mono text-[10px]">Del</kbd>
            </button>
            <button
              type="button"
              data-testid="drawing-deselect-btn"
              onClick={() => onDeselectAnnotation?.()}
              aria-label="Deselect mark"
              title="Deselect mark (Esc)"
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-white"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        )}

        {/* Group Flyout Popover Panel */}
        {openGroup && (
          <div
            data-testid={`drawing-popover-${openGroup}`}
            role="dialog"
            aria-label={`${openGroup} tools`}
            className="max-h-[calc(100dvh-190px)] w-[min(290px,calc(100vw-88px))] overflow-y-auto rounded-xl border border-[#D9DEE2] bg-white p-3 shadow-lg"
          >
            <div className="mb-2 flex items-center justify-between border-b border-[#D9DEE2] pb-2">
              <span className="text-[12px] font-semibold uppercase tracking-wide text-[#4F5C67]">
                {openGroup === 'cursor'
                  ? 'Cursor & selection'
                  : openGroup === 'freehand'
                  ? 'Freehand tools'
                  : openGroup === 'rulers'
                  ? 'Surface rulers'
                  : openGroup === 'shapes'
                  ? 'Surface shapes'
                  : openGroup === 'edit'
                  ? 'Edit & private fill'
                  : openGroup === 'stroke'
                  ? 'Line width & style'
                  : 'Drawing color'}
              </span>
              <button
                type="button"
                onClick={() => setOpenGroup(null)}
                aria-label="Close tool panel"
                className="inline-flex h-6 w-6 items-center justify-center rounded text-[#4F5C67] hover:bg-[#F4F3EF]"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>

            {/* 1. CURSOR GROUP */}
            {openGroup === 'cursor' && (
              <div className="space-y-2">
                <button
                  type="button"
                  data-testid="drawing-tool-cursor"
                  aria-pressed={!isDrawingActive}
                  onClick={stopDrawing}
                  className={`flex min-h-[38px] w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-[13px] font-medium ${
                    !isDrawingActive
                      ? 'border-[#1B2A4A] bg-[#1B2A4A] text-white'
                      : 'border-[#D9DEE2] bg-white text-[#1B2A4A] hover:bg-[#F4F3EF]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <MousePointer2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <div>
                      <div>Cursor (Orbit & select)</div>
                      <div
                        className={`text-[11px] ${
                          !isDrawingActive ? 'text-white/80' : 'text-[#4F5C67]'
                        }`}
                      >
                        Drag to orbit · Click own marks, Pins, or walls
                      </div>
                    </div>
                  </div>
                  <kbd
                    className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                      !isDrawingActive ? 'bg-white/15 text-white' : 'bg-[#F4F3EF] text-[#1B2A4A]'
                    }`}
                  >
                    V
                  </kbd>
                </button>

                <button
                  type="button"
                  data-testid="drawing-stop-popover-btn"
                  onClick={stopDrawing}
                  className="flex min-h-[38px] w-full items-center justify-between gap-2 rounded-lg border border-[#B42318]/40 bg-[#FEF3F2] px-3 py-2 text-left text-[13px] font-semibold text-[#B42318] hover:bg-[#FEE4E2]"
                >
                  <div className="flex items-center gap-2">
                    <Ban className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <div>
                      <div>Stop drawing</div>
                      <div className="text-[11px] font-normal text-[#B42318]/85">
                        Exit any drawing or measurement tool
                      </div>
                    </div>
                  </div>
                  <kbd className="rounded bg-[#B42318]/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#B42318]">
                    Esc
                  </kbd>
                </button>
              </div>
            )}

            {/* 2. FREEHAND GROUP */}
            {openGroup === 'freehand' && (
              <div className="space-y-1.5">
                {FREEHAND_TOOLS.map((item) => {
                  const Icon = item.icon;
                  const active = activeTool === item.id && !deleteMode;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      data-testid={`drawing-tool-${item.id}`}
                      aria-pressed={active}
                      onClick={() => handleChooseTool(item.id)}
                      className={`flex min-h-[38px] w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-[13px] font-medium transition-colors ${
                        active
                          ? 'border-[#1B2A4A] bg-[#1B2A4A] text-white'
                          : 'border-[#D9DEE2] bg-white text-[#1B2A4A] hover:bg-[#F4F3EF]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon className="h-4 w-4 shrink-0" />
                        <div>
                          <div>{item.label}</div>
                          <div
                            className={`text-[11px] ${active ? 'text-white/80' : 'text-[#4F5C67]'}`}
                          >
                            {item.hint}
                          </div>
                        </div>
                      </div>
                      <kbd
                        className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                          active ? 'bg-white/15 text-white' : 'bg-[#F4F3EF] text-[#1B2A4A]'
                        }`}
                      >
                        {item.shortcut}
                      </kbd>
                    </button>
                  );
                })}
              </div>
            )}

            {/* 3. RULERS GROUP */}
            {openGroup === 'rulers' && (
              <div className="space-y-2">
                {!isModelCalibrated && (
                  <div
                    role="status"
                    data-testid="ruler-uncalibrated-warning"
                    className="flex items-start gap-2 rounded-lg border border-[#D4652F]/40 bg-[#FFF3EB] p-2 text-[11px] text-[#A64011]"
                  >
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>
                      <strong>Scale not verified.</strong> Linear ruler readouts will report “Scale
                      not verified” until blueprint calibration is confirmed.
                    </span>
                  </div>
                )}

                <div className="space-y-1.5">
                  {RULER_TOOLS.map((item) => {
                    const Icon = item.icon;
                    const active = activeTool === item.id && !deleteMode;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        data-testid={`drawing-tool-${item.id}`}
                        aria-pressed={active}
                        onClick={() => handleChooseTool(item.id)}
                        className={`flex min-h-[38px] w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-[13px] font-medium transition-colors ${
                          active
                            ? 'border-[#1B2A4A] bg-[#1B2A4A] text-white'
                            : 'border-[#D9DEE2] bg-white text-[#1B2A4A] hover:bg-[#F4F3EF]'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <Icon className="h-4 w-4 shrink-0" />
                          <div>
                            <div>{item.label}</div>
                            <div
                              className={`text-[11px] ${
                                active ? 'text-white/80' : 'text-[#4F5C67]'
                              }`}
                            >
                              {item.hint}
                            </div>
                          </div>
                        </div>
                        <kbd
                          className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                            active ? 'bg-white/15 text-white' : 'bg-[#F4F3EF] text-[#1B2A4A]'
                          }`}
                        >
                          {item.shortcut}
                        </kbd>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 4. SHAPES GROUP */}
            {openGroup === 'shapes' && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-1.5">
                  {SHAPE_TOOLS.map((item) => {
                    const Icon = item.icon;
                    const active = activeTool === item.id && !deleteMode;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        data-testid={`drawing-tool-${item.id}`}
                        aria-pressed={active}
                        onClick={() => handleChooseTool(item.id)}
                        className={`flex min-h-[38px] items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-[13px] font-medium transition-colors ${
                          active
                            ? 'border-[#1B2A4A] bg-[#1B2A4A] text-white'
                            : 'border-[#D9DEE2] bg-white text-[#1B2A4A] hover:bg-[#F4F3EF]'
                        }`}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between text-[11px] text-[#4F5C67]">
                  <span>Cycle shapes shortcut</span>
                  <kbd className="rounded bg-[#F4F3EF] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#1B2A4A]">
                    U
                  </kbd>
                </div>
              </div>
            )}

            {/* 5. EDIT GROUP (Eraser, Private Wall Fill, Clear Own) */}
            {openGroup === 'edit' && (
              <div className="space-y-2">
                <button
                  type="button"
                  data-testid="drawing-delete-mode-btn"
                  aria-pressed={deleteMode || activeTool === 'eraser'}
                  onClick={() => {
                    if (!deleteMode) {
                      onToggleDeleteMode();
                    }
                    onSelectTool('eraser');
                    setOpenGroup(null);
                  }}
                  className={`flex min-h-[38px] w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-[13px] font-medium ${
                    deleteMode || activeTool === 'eraser'
                      ? 'border-[#B42318] bg-[#B42318] text-white'
                      : 'border-[#D9DEE2] bg-white text-[#1B2A4A] hover:bg-[#F4F3EF]'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Eraser className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <div>
                      <div>Eraser</div>
                      <div
                        className={`text-[11px] ${
                          deleteMode || activeTool === 'eraser'
                            ? 'text-white/80'
                            : 'text-[#4F5C67]'
                        }`}
                      >
                        Click an own mark to remove · Misses protect walls & Pins
                      </div>
                    </div>
                  </div>
                  <kbd
                    className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                      deleteMode || activeTool === 'eraser'
                        ? 'bg-white/15 text-white'
                        : 'bg-[#F4F3EF] text-[#1B2A4A]'
                    }`}
                  >
                    E
                  </kbd>
                </button>

                <button
                  type="button"
                  data-testid="drawing-tool-wall_fill"
                  aria-pressed={activeTool === 'wall_fill' && !deleteMode}
                  onClick={() => handleChooseTool('wall_fill')}
                  className={`flex min-h-[38px] w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-[13px] font-medium ${
                    activeTool === 'wall_fill' && !deleteMode
                      ? 'border-[#1B2A4A] bg-[#1B2A4A] text-white'
                      : 'border-[#D9DEE2] bg-white text-[#1B2A4A] hover:bg-[#F4F3EF]'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <PaintBucket className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <div>
                      <div>Fill wall (private)</div>
                      <div
                        className={`text-[11px] ${
                          activeTool === 'wall_fill' && !deleteMode
                            ? 'text-white/80'
                            : 'text-[#4F5C67]'
                        }`}
                      >
                        Tint one selected wall locally without changing shared materials
                      </div>
                    </div>
                  </div>
                  <kbd
                    className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                      activeTool === 'wall_fill' && !deleteMode
                        ? 'bg-white/15 text-white'
                        : 'bg-[#F4F3EF] text-[#1B2A4A]'
                    }`}
                  >
                    G
                  </kbd>
                </button>

                <div className="border-t border-[#D9DEE2] pt-2">
                  {annotationCount > 0 ? (
                    confirmClear ? (
                      <div className="flex items-center justify-between gap-2 rounded-lg border border-[#B42318]/35 bg-[#FEF3F2] px-2.5 py-2 text-[12px]">
                        <span className="font-medium text-[#B42318]">
                          Clear {annotationCount} local marks?
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            data-testid="drawing-clear-confirm-btn"
                            onClick={() => {
                              onClearAllOwn();
                              setConfirmClear(false);
                              setOpenGroup(null);
                            }}
                            className="rounded bg-[#B42318] px-2 py-1 font-semibold text-white"
                          >
                            Clear
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmClear(false)}
                            className="rounded border border-[#D9DEE2] bg-white px-2 py-1 text-[#1B2A4A]"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        data-testid="drawing-clear-all-btn"
                        onClick={() => setConfirmClear(true)}
                        className="flex min-h-[36px] w-full items-center justify-center gap-1.5 rounded-lg border border-[#B42318]/35 bg-white px-3 text-[12px] font-medium text-[#B42318] hover:bg-[#FEF3F2]"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        Clear own marks ({annotationCount})
                      </button>
                    )
                  ) : (
                    <p className="text-center text-[11px] text-[#4F5C67]">
                      No local marks saved on this area yet.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* 6. STROKE GROUP (Numeric 1..32 + Presets + Line Style) */}
            {openGroup === 'stroke' && (
              <div className="space-y-3">
                <div>
                  <label
                    htmlFor="drawing-stroke-width-input"
                    className="block text-[11px] font-semibold uppercase tracking-wide text-[#4F5C67]"
                  >
                    Stroke width ({MIN_STROKE_WIDTH_PX}–{MAX_STROKE_WIDTH_PX} px)
                  </label>
                  <div className="mt-1.5 flex items-center gap-2">
                    <input
                      id="drawing-stroke-width-input"
                      data-testid="drawing-stroke-width-numeric"
                      type="number"
                      min={MIN_STROKE_WIDTH_PX}
                      max={MAX_STROKE_WIDTH_PX}
                      value={effectiveWidthPx}
                      onChange={(e) => handleWidthChange(Number(e.target.value))}
                      className="h-9 w-20 rounded-lg border border-[#D9DEE2] bg-white px-2.5 text-[13px] font-semibold tabular-nums text-[#1B2A4A]"
                    />
                    <select
                      aria-label="Stroke width preset"
                      data-testid="drawing-stroke-width-preset"
                      value={
                        STROKE_WIDTH_PRESETS.includes(
                          effectiveWidthPx as (typeof STROKE_WIDTH_PRESETS)[number]
                        )
                          ? String(effectiveWidthPx)
                          : ''
                      }
                      onChange={(e) => {
                        if (e.target.value) handleWidthChange(Number(e.target.value));
                      }}
                      className="h-9 flex-1 rounded-lg border border-[#D9DEE2] bg-white px-2 text-[13px] text-[#1B2A4A]"
                    >
                      <option value="">Custom ({effectiveWidthPx} px)</option>
                      {STROKE_WIDTH_PRESETS.map((presetPx) => (
                        <option key={presetPx} value={presetPx}>
                          {presetPx} px
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-[#4F5C67]">
                    Line style
                  </span>
                  <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                    {LINE_STYLE_OPTIONS.map((opt) => {
                      const active = lineStyle === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          data-testid={`drawing-line-style-${opt.id}`}
                          aria-pressed={active}
                          onClick={() => onSelectLineStyle?.(opt.id)}
                          className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-[12px] font-medium transition-colors ${
                            active
                              ? 'border-[#1B2A4A] bg-[#1B2A4A] text-white'
                              : 'border-[#D9DEE2] bg-white text-[#1B2A4A] hover:bg-[#F4F3EF]'
                          }`}
                        >
                          <span
                            className={`w-full border-t-2 ${opt.preview} ${
                              active ? 'border-white' : 'border-[#1B2A4A]'
                            }`}
                          />
                          <span>{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* 7. COLOR GROUP */}
            {openGroup === 'color' && (
              <ColorPickerControl
                value={colorHex}
                onChange={onSelectColor}
                label="Local drawing color"
                compact
                testIdPrefix="drawing-color-picker"
              />
            )}

            <p className="mt-3 border-t border-[#D9DEE2] pt-2 text-[11px] leading-[15px] text-[#4F5C67]">
              Private on this device · Excluded from clean PNG downloads and shared views.
            </p>
          </div>
        )}

        {/* Storage fallback warning ("Temporary on this device.") */}
        {storageWarning && (
          <div
            role="status"
            data-testid="drawing-storage-warning"
            className="flex max-w-[300px] items-start gap-2 rounded-lg border border-[#D4652F]/40 bg-white px-3 py-2 text-[12px] text-[#A64011] shadow-sm"
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              {storageMode === 'memory-fallback' ? storageWarning : storageWarning}
            </span>
          </div>
        )}

        {/* Rejected off-surface drawing feedback */}
        {rejectedNotice && (
          <div
            role="status"
            data-testid="drawing-rejected-notice"
            className="max-w-[300px] rounded-lg border border-[#D4652F]/40 bg-white px-3 py-2 text-[12px] font-medium text-[#1B2A4A] shadow-sm"
          >
            {rejectedNotice}
          </div>
        )}
      </div>
    </div>
  );
}
