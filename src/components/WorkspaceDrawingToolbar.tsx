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
  Ruler,
  Shapes,
  SlidersHorizontal,
  Square,
  Trash2,
  X,
} from 'lucide-react';
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
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'pencil', label: 'Pencil', hint: 'Fine crisp line', icon: Pencil },
  { id: 'marker', label: 'Marker', hint: 'Broad translucent highlight', icon: Highlighter },
  { id: 'brush', label: 'Brush', hint: 'Solid freehand stroke', icon: Brush },
];

const RULER_TOOLS: ReadonlyArray<{
  id: DrawingToolType;
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'ruler_straight', label: 'Straight ruler', hint: '2-point distance on surface', icon: Ruler },
  { id: 'ruler_right_angle', label: 'Right-angle ruler', hint: 'L-shape 90° legs', icon: CornerDownRight },
  { id: 'ruler_angle', label: 'Angle ruler', hint: 'Vertex + two rays (°)', icon: Compass },
];

const SHAPE_TOOLS: ReadonlyArray<{
  id: DrawingToolType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'line', label: 'Line', icon: Minus },
  { id: 'arrow', label: 'Arrow', icon: ArrowUpRight },
  { id: 'circle', label: 'Circle', icon: Circle },
  { id: 'ellipse', label: 'Ellipse', icon: Circle },
  { id: 'square', label: 'Square', icon: Square },
  { id: 'rectangle', label: 'Rectangle', icon: RectangleHorizontal },
];

const LINE_STYLE_OPTIONS: ReadonlyArray<{ id: DrawingLineStyle; label: string; preview: string }> = [
  { id: 'solid', label: 'Solid', preview: 'border-solid' },
  { id: 'dashed', label: 'Dashed', preview: 'border-dashed' },
  { id: 'dotted', label: 'Dotted', preview: 'border-dotted' },
];

function toolLabel(tool: DrawingToolType, deleteMode: boolean): string {
  if (deleteMode || tool === 'eraser') return 'Eraser';
  switch (tool) {
    case 'cursor':
    case 'pan':
      return 'Cursor';
    case 'pencil':
      return 'Pencil';
    case 'marker':
      return 'Marker';
    case 'brush':
      return 'Brush';
    case 'ruler_straight':
      return 'Straight ruler';
    case 'ruler_right_angle':
      return 'Right-angle ruler';
    case 'ruler_angle':
      return 'Angle ruler';
    case 'line':
      return 'Line';
    case 'arrow':
      return 'Arrow';
    case 'circle':
      return 'Circle';
    case 'ellipse':
      return 'Ellipse';
    case 'square':
      return 'Square';
    case 'rectangle':
      return 'Rectangle';
    case 'wall_fill':
      return 'Wall fill';
    default:
      return 'Cursor';
  }
}

/**
 * Compact vertical grouped Workspace tools rail (Doc 05).
 * Positioned beside the project rail inside the viewport.
 * - Groups: Cursor (with explicit red Stop drawing action — no old Pan label), Freehand,
 *   Rulers, Shapes, Edit (Eraser + private wall Fill + Clear own), Stroke (numeric 1–32 +
 *   presets + Solid/Dashed/Dotted), and Color (shared ColorPickerControl).
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
}: WorkspaceDrawingToolbarProps) {
  const [openGroup, setOpenGroup] = useState<ToolGroupId | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const railRef = useRef<HTMLDivElement | null>(null);

  const effectiveWidthPx = strokeWidthPx ?? strokeWidthKeyToPx(strokeWidth);
  const isDrawingActive = !isCursorModeTool(activeTool) || deleteMode;

  const stopDrawing = () => {
    if (deleteMode) onToggleDeleteMode();
    onSelectTool('cursor');
    setOpenGroup(null);
  };

  // Escape cancels active drawing tool or closes open group popover
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

  const groupButtons: ReadonlyArray<{
    id: ToolGroupId;
    label: string;
    active: boolean;
    icon: React.ReactNode;
  }> = [
    {
      id: 'cursor',
      label: 'Cursor',
      active: !isDrawingActive,
      icon: <MousePointer2 className="h-4 w-4" aria-hidden="true" />,
    },
    {
      id: 'freehand',
      label: 'Freehand',
      active: isFreehandActive,
      icon: <Pencil className="h-4 w-4" aria-hidden="true" />,
    },
    {
      id: 'rulers',
      label: 'Rulers',
      active: isRulerActive,
      icon: <Ruler className="h-4 w-4" aria-hidden="true" />,
    },
    {
      id: 'shapes',
      label: 'Shapes',
      active: isShapeActive,
      icon: <Shapes className="h-4 w-4" aria-hidden="true" />,
    },
    {
      id: 'edit',
      label: 'Edit',
      active: isEditActive,
      icon: <Eraser className="h-4 w-4" aria-hidden="true" />,
    },
    {
      id: 'stroke',
      label: `Stroke (${effectiveWidthPx}px)`,
      active: openGroup === 'stroke',
      icon: <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />,
    },
    {
      id: 'color',
      label: 'Color',
      active: openGroup === 'color',
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
      {/* Compact Vertical Grouped Rail */}
      <div className="flex flex-col items-center gap-1 rounded-xl border border-[#D9DEE2] bg-white/95 p-1.5 shadow-sm backdrop-blur">
        {/* Explicit red prohibition Stop drawing button when drawing is active, or Cursor quick exit */}
        {isDrawingActive && (
          <button
            type="button"
            data-testid="drawing-stop-btn"
            onClick={stopDrawing}
            title="Stop drawing and return to Cursor (Esc)"
            aria-label="Stop drawing"
            className="mb-0.5 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#B42318]/40 bg-[#FEF3F2] text-[#B42318] transition-colors hover:bg-[#FEE4E2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE]"
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
              aria-expanded={isOpen}
              aria-pressed={grp.active}
              title={grp.label}
              aria-label={grp.label}
              onClick={() => setOpenGroup((prev) => (prev === grp.id ? null : grp.id))}
              className={`inline-flex h-10 w-10 items-center justify-center rounded-lg text-[12px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE] ${
                grp.active
                  ? 'bg-[#1B2A4A] text-white'
                  : isOpen
                  ? 'bg-[#FFF3EB] text-[#A64011]'
                  : 'text-[#1B2A4A] hover:bg-[#F4F3EF]'
              }`}
            >
              {grp.icon}
            </button>
          );
        })}

        <div className="my-0.5 h-px w-6 bg-[#D9DEE2]" aria-hidden="true" />

        {/* Show / Hide local marks toggle */}
        <button
          type="button"
          data-testid="drawing-hide-toggle"
          aria-pressed={hideLocalDrawings}
          onClick={onToggleHideLocalDrawings}
          title={hideLocalDrawings ? 'Show my local marks' : 'Hide my local marks'}
          aria-label={hideLocalDrawings ? 'Show local marks' : 'Hide local marks'}
          className={`inline-flex h-9 w-10 items-center justify-center rounded-lg transition-colors ${
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

        {/* Active numeric width & count badge */}
        <div
          className="px-1 text-center text-[10px] font-semibold tabular-nums text-[#4F5C67]"
          title={`${effectiveWidthPx} px · ${lineStyle} · ${annotationCount} local marks`}
        >
          {effectiveWidthPx}px
        </div>
      </div>

      {/* Side status & group popover column */}
      <div className="flex flex-col items-start gap-2">
        {/* Active tool pill with explicit Stop drawing action */}
        {isDrawingActive && (
          <div
            data-testid="active-drawing-indicator"
            className="flex items-center gap-2 rounded-xl border border-[#D9DEE2] bg-white/95 px-3 py-1.5 text-[12px] shadow-sm backdrop-blur"
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: colorHex }}
              aria-hidden="true"
            />
            <span className="font-semibold text-[#1B2A4A]">
              {toolLabel(activeTool, deleteMode)}
            </span>
            <span className="text-[#4F5C67] tabular-nums">
              {effectiveWidthPx}px · {lineStyle}
            </span>
            <button
              type="button"
              data-testid="drawing-stop-inline-btn"
              onClick={stopDrawing}
              className="ml-1 inline-flex items-center gap-1 rounded-md border border-[#B42318]/40 bg-[#FEF3F2] px-2 py-0.5 text-[11px] font-semibold text-[#B42318] hover:bg-[#FEE4E2]"
            >
              <Ban className="h-3 w-3" aria-hidden="true" />
              Stop drawing
            </button>
          </div>
        )}

        {/* Group Popover Panel */}
        {openGroup && (
          <div
            data-testid={`drawing-popover-${openGroup}`}
            role="dialog"
            aria-label={`${openGroup} tools`}
            className="max-h-[calc(100dvh-180px)] w-[min(290px,calc(100vw-88px))] overflow-y-auto rounded-xl border border-[#D9DEE2] bg-white p-3 shadow-lg"
          >
            <div className="mb-2 flex items-center justify-between border-b border-[#D9DEE2] pb-2">
              <span className="text-[12px] font-semibold uppercase tracking-wide text-[#4F5C67]">
                {openGroup === 'cursor'
                  ? 'Cursor & navigation'
                  : openGroup === 'freehand'
                  ? 'Freehand tools'
                  : openGroup === 'rulers'
                  ? 'Surface rulers'
                  : openGroup === 'shapes'
                  ? 'Surface shapes'
                  : openGroup === 'edit'
                  ? 'Edit & private fill'
                  : openGroup === 'stroke'
                  ? 'Stroke width & style'
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
                  className={`flex min-h-[38px] w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-[13px] font-medium ${
                    !isDrawingActive
                      ? 'border-[#1B2A4A] bg-[#1B2A4A] text-white'
                      : 'border-[#D9DEE2] bg-white text-[#1B2A4A] hover:bg-[#F4F3EF]'
                  }`}
                >
                  <MousePointer2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <div>
                    <div>Cursor (Orbit & inspect)</div>
                    <div
                      className={`text-[11px] ${
                        !isDrawingActive ? 'text-white/80' : 'text-[#4F5C67]'
                      }`}
                    >
                      Orbit 3D view, select Pins and elements
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  data-testid="drawing-stop-popover-btn"
                  onClick={stopDrawing}
                  className="flex min-h-[38px] w-full items-center gap-2 rounded-lg border border-[#B42318]/40 bg-[#FEF3F2] px-3 py-2 text-left text-[13px] font-semibold text-[#B42318] hover:bg-[#FEE4E2]"
                >
                  <Ban className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <div>
                    <div>Stop drawing</div>
                    <div className="text-[11px] font-normal text-[#B42318]/85">
                      Exit any drawing or measurement tool (Esc)
                    </div>
                  </div>
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
                      className={`flex min-h-[38px] w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-[13px] font-medium transition-colors ${
                        active
                          ? 'border-[#1B2A4A] bg-[#1B2A4A] text-white'
                          : 'border-[#D9DEE2] bg-white text-[#1B2A4A] hover:bg-[#F4F3EF]'
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <div>
                        <div>{item.label}</div>
                        <div
                          className={`text-[11px] ${active ? 'text-white/80' : 'text-[#4F5C67]'}`}
                        >
                          {item.hint}
                        </div>
                      </div>
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
                        className={`flex min-h-[38px] w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-[13px] font-medium transition-colors ${
                          active
                            ? 'border-[#1B2A4A] bg-[#1B2A4A] text-white'
                            : 'border-[#D9DEE2] bg-white text-[#1B2A4A] hover:bg-[#F4F3EF]'
                        }`}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <div>
                          <div>{item.label}</div>
                          <div
                            className={`text-[11px] ${active ? 'text-white/80' : 'text-[#4F5C67]'}`}
                          >
                            {item.hint}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 4. SHAPES GROUP */}
            {openGroup === 'shapes' && (
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
                  className={`flex min-h-[38px] w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-[13px] font-medium ${
                    deleteMode || activeTool === 'eraser'
                      ? 'border-[#B42318] bg-[#B42318] text-white'
                      : 'border-[#D9DEE2] bg-white text-[#1B2A4A] hover:bg-[#F4F3EF]'
                  }`}
                >
                  <Eraser className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <div>
                    <div>Eraser</div>
                    <div
                      className={`text-[11px] ${
                        deleteMode || activeTool === 'eraser' ? 'text-white/80' : 'text-[#4F5C67]'
                      }`}
                    >
                      Click any of your local marks or wall fills to delete
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  data-testid="drawing-tool-wall_fill"
                  aria-pressed={activeTool === 'wall_fill' && !deleteMode}
                  onClick={() => handleChooseTool('wall_fill')}
                  className={`flex min-h-[38px] w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-[13px] font-medium ${
                    activeTool === 'wall_fill' && !deleteMode
                      ? 'border-[#1B2A4A] bg-[#1B2A4A] text-white'
                      : 'border-[#D9DEE2] bg-white text-[#1B2A4A] hover:bg-[#F4F3EF]'
                  }`}
                >
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
