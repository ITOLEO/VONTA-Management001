import { GoogleGenAI, Type } from '@google/genai';
import type {
  BlueprintCalibration,
  BlueprintGeometryProposal,
  PlanRegionNormalized,
} from '../domain/accountTypes';
import { validateGeometryProposal } from '../domain/blueprintGeometry';

export const BLUEPRINT_AI_MODEL = 'gemini-4-hydrogen';

export class AiProviderUnavailableError extends Error {
  code: string;
  provider: string;

  constructor(code: string, message: string, provider = 'google-genai') {
    super(message);
    this.code = code;
    this.provider = provider;
  }
}

export interface BlueprintAiExtractionInput {
  fileName: string;
  mimeType: 'application/pdf' | 'image/png' | 'image/jpeg';
  base64Data: string;
  planPage: number;
  planRegion: PlanRegionNormalized;
  calibration: BlueprintCalibration;
  areaName: string;
  sheetCode: string;
}

export interface BlueprintAiExtractionResult {
  provider: string;
  model: string;
  proposal: BlueprintGeometryProposal;
}

export interface BlueprintAiExtractor {
  isConfigured(): boolean;
  extractGeometry(input: BlueprintAiExtractionInput): Promise<BlueprintAiExtractionResult>;
}

/**
 * Real server-side Gemini Vision/PDF extraction using @google/genai.
 * Never simulates, fabricates, or falls back to hardcoded demo geometry when GEMINI_API_KEY
 * is missing or the upstream request fails.
 */
export class GeminiBlueprintExtractor implements BlueprintAiExtractor {
  private getApiKey(): string {
    return (process.env.GEMINI_API_KEY || '').trim();
  }

  isConfigured(): boolean {
    return Boolean(this.getApiKey());
  }

  async extractGeometry(input: BlueprintAiExtractionInput): Promise<BlueprintAiExtractionResult> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new AiProviderUnavailableError(
        'AI_PROVIDER_UNCONFIGURED',
        'GEMINI_API_KEY is not configured on the server. Your blueprint source and draft remain saved—retry once the AI provider is configured, or draft calibrated walls manually in Review.'
      );
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const promptText = [
      'You are an architectural floor-plan geometry extractor for VONTA Management.',
      'Analyze the attached single-floor dimensioned architectural drawing.',
      `Area: ${input.areaName} | Sheet: ${input.sheetCode} | Plan page: ${input.planPage}`,
      `Normalized plan region: x=${input.planRegion.x}, y=${input.planRegion.y}, width=${input.planRegion.width}, height=${input.planRegion.height}`,
      `Calibration reference: points A(${input.calibration.pointA.x.toFixed(3)}, ${input.calibration.pointA.y.toFixed(3)}) to B(${input.calibration.pointB.x.toFixed(3)}, ${input.calibration.pointB.y.toFixed(3)}) = ${input.calibration.knownLengthMm} mm (${input.calibration.mmPerPixel} mm/px).`,
      `Confirmed wall height: ${input.calibration.wallHeightMm} mm. Exterior wall thickness: ${input.calibration.exteriorWallMm} mm. Interior wall thickness: ${input.calibration.interiorWallMm} mm.`,
      'Return ONLY structured JSON matching the schema with millimeter coordinates (X = East+, Z = South+, origin 0,0 at top-left exterior corner).',
      'Include exterior walls, interior partitions, doors/windows with exact wallId references, and closed room polygons (>= 4 vertices for rectangular rooms).',
      'Do NOT invent rooms or copy unrelated template drawings. Base every coordinate strictly on the attached blueprint.',
    ].join('\n');

    let rawText = '';
    try {
      const response = await ai.models.generateContent({
        model: BLUEPRINT_AI_MODEL,
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: input.mimeType,
                data: input.base64Data,
              },
            },
            { text: promptText },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              footprintLabel: { type: Type.STRING },
              sourceNotes: { type: Type.STRING },
              walls: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    label: { type: Type.STRING },
                    category: { type: Type.STRING },
                    startXMm: { type: Type.NUMBER },
                    startZMm: { type: Type.NUMBER },
                    endXMm: { type: Type.NUMBER },
                    endZMm: { type: Type.NUMBER },
                    thicknessMm: { type: Type.NUMBER },
                    heightMm: { type: Type.NUMBER },
                  },
                },
              },
              openings: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    wallId: { type: Type.STRING },
                    code: { type: Type.STRING },
                    kind: { type: Type.STRING },
                    offsetMm: { type: Type.NUMBER },
                    widthMm: { type: Type.NUMBER },
                    sillMm: { type: Type.NUMBER },
                    topMm: { type: Type.NUMBER },
                  },
                },
              },
              rooms: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    name: { type: Type.STRING },
                    polygonMm: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          xMm: { type: Type.NUMBER },
                          zMm: { type: Type.NUMBER },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });
      rawText = (response.text ?? '').trim();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upstream AI provider request failed.';
      throw new AiProviderUnavailableError(
        'AI_PROVIDER_ERROR',
        `AI extraction failed (${msg}). Your blueprint source and draft remain saved for retry or manual review.`
      );
    }

    if (!rawText) {
      throw new AiProviderUnavailableError(
        'AI_EMPTY_RESPONSE',
        'AI provider returned an empty response. Retry extraction or enter calibrated wall geometry manually.'
      );
    }

    let parsed: BlueprintGeometryProposal;
    try {
      const raw = JSON.parse(rawText) as Record<string, unknown>;
      const walls = Array.isArray(raw.walls)
        ? raw.walls.map((w: Record<string, unknown>, idx: number) => ({
            id: typeof w.id === 'string' && w.id.trim() ? w.id.trim() : `W-${idx + 1}`,
            label: typeof w.label === 'string' && w.label.trim() ? w.label.trim() : `Wall ${idx + 1}`,
            category:
              w.category === 'interior_partition'
                ? ('interior_partition' as const)
                : ('exterior_wall' as const),
            startXMm: Number(w.startXMm),
            startZMm: Number(w.startZMm),
            endXMm: Number(w.endXMm),
            endZMm: Number(w.endZMm),
            thicknessMm:
              Number.isFinite(Number(w.thicknessMm)) && Number(w.thicknessMm) > 0
                ? Number(w.thicknessMm)
                : w.category === 'interior_partition'
                  ? input.calibration.interiorWallMm
                  : input.calibration.exteriorWallMm,
            heightMm:
              Number.isFinite(Number(w.heightMm)) && Number(w.heightMm) > 0
                ? Number(w.heightMm)
                : input.calibration.wallHeightMm,
          }))
        : [];

      const openings = Array.isArray(raw.openings)
        ? raw.openings.map((o: Record<string, unknown>, idx: number) => ({
            id: typeof o.id === 'string' && o.id.trim() ? o.id.trim() : `OP-${idx + 1}`,
            wallId: String(o.wallId ?? ''),
            code: typeof o.code === 'string' && o.code.trim() ? o.code.trim() : `O${idx + 1}`,
            kind: o.kind === 'door' ? ('door' as const) : ('window' as const),
            offsetMm: Number(o.offsetMm),
            widthMm: Number(o.widthMm),
            sillMm: Number(o.sillMm),
            topMm: Number(o.topMm),
          }))
        : [];

      const rooms = Array.isArray(raw.rooms)
        ? raw.rooms.map((r: Record<string, unknown>, idx: number) => ({
            id: typeof r.id === 'string' && r.id.trim() ? r.id.trim() : `room-${idx + 1}`,
            name: typeof r.name === 'string' && r.name.trim() ? r.name.trim() : `Room ${idx + 1}`,
            polygonMm: Array.isArray(r.polygonMm)
              ? r.polygonMm.map((pt: Record<string, unknown>) => ({
                  xMm: Number(pt.xMm),
                  zMm: Number(pt.zMm),
                }))
              : [],
            verified: false,
          }))
        : [];

      parsed = {
        footprintLabel:
          typeof raw.footprintLabel === 'string' && raw.footprintLabel.trim()
            ? raw.footprintLabel.trim()
            : `${input.areaName} (${input.sheetCode})`,
        sourceNotes:
          typeof raw.sourceNotes === 'string' && raw.sourceNotes.trim()
            ? raw.sourceNotes.trim()
            : `Proposed by ${BLUEPRINT_AI_MODEL}; awaiting Contractor verification.`,
        walls,
        openings,
        rooms,
      };
    } catch {
      throw new AiProviderUnavailableError(
        'AI_INVALID_JSON',
        'AI provider returned malformed JSON that could not be validated. Retry or edit geometry manually.'
      );
    }

    const validation = validateGeometryProposal(parsed);
    if (!validation.valid) {
      throw new AiProviderUnavailableError(
        'AI_PROPOSAL_INVALID',
        `AI proposal failed deterministic validation: ${validation.errors[0]}`
      );
    }

    return {
      provider: 'google-genai',
      model: BLUEPRINT_AI_MODEL,
      proposal: parsed,
    };
  }
}
