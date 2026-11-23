import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import type { SpatialPin } from '../domain/types';

interface MaterialsSectionProps {
  pin: SpatialPin;
  onAddMaterial: (input: { name: string; unit: string; requiredQty: number }) => { ok: true } | { ok: false; error: string };
  compact?: boolean;
}

export function MaterialsSection({ pin, onAddMaterial, compact = false }: MaterialsSectionProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('pcs');
  const [qty, setQty] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numericQty = Number(qty);
    const result = onAddMaterial({
      name,
      unit,
      requiredQty: numericQty,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setName('');
    setUnit('pcs');
    setQty('');
    setFormOpen(false);
  };

  return (
    <section aria-labelledby={`materials-heading-${pin.id}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3
            id={`materials-heading-${pin.id}`}
            className={
              compact
                ? 'text-[15px] leading-[22px] font-semibold text-[#1B2A4A]'
                : 'text-[18px] leading-[24px] font-semibold text-[#1B2A4A]'
            }
          >
            Materials
          </h3>
          <p className="text-[13px] leading-[18px] text-[#4F5C67]">
            Required and issued quantities are tracked separately. Adding a requirement does not issue stock.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setFormOpen((v) => !v);
            setError(null);
          }}
          className="inline-flex min-h-[38px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#D9DEE2] bg-white px-3 py-1.5 text-[14px] leading-[20px] font-medium text-[#1B2A4A] transition-colors hover:bg-[#F4F3EF]"
        >
          <Plus className="h-4 w-4 text-[#A64011]" aria-hidden="true" />
          Add material
        </button>
      </div>

      {formOpen && (
        <form
          onSubmit={handleSubmit}
          noValidate
          className="mt-3 rounded-xl border border-[#D9DEE2] bg-[#F4F3EF]/60 p-4"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
            <div className="sm:col-span-3">
              <label
                htmlFor={`mat-name-${pin.id}`}
                className="block text-[13px] leading-[18px] font-medium text-[#1B2A4A]"
              >
                Material name
              </label>
              <input
                id={`mat-name-${pin.id}`}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Alkali wall primer"
                className="mt-1 h-10 w-full rounded-lg border border-[#D9DEE2] bg-white px-3 text-[14px] text-[#1B2A4A] placeholder:text-[#4F5C67]/70"
              />
            </div>

            <div className="sm:col-span-1">
              <label
                htmlFor={`mat-unit-${pin.id}`}
                className="block text-[13px] leading-[18px] font-medium text-[#1B2A4A]"
              >
                Unit
              </label>
              <input
                id={`mat-unit-${pin.id}`}
                type="text"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="pcs"
                className="mt-1 h-10 w-full rounded-lg border border-[#D9DEE2] bg-white px-3 text-[14px] text-[#1B2A4A]"
              />
            </div>

            <div className="sm:col-span-2">
              <label
                htmlFor={`mat-qty-${pin.id}`}
                className="block text-[13px] leading-[18px] font-medium text-[#1B2A4A]"
              >
                Required qty
              </label>
              <input
                id={`mat-qty-${pin.id}`}
                type="number"
                min="0.01"
                step="any"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder="e.g. 4"
                className="mt-1 h-10 w-full rounded-lg border border-[#D9DEE2] bg-white px-3 text-[14px] text-[#1B2A4A] tabular-nums"
              />
            </div>
          </div>

          {error && (
            <p role="alert" className="mt-2.5 text-[13px] leading-[18px] font-medium text-[#B42318]">
              {error}
            </p>
          )}

          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setFormOpen(false);
                setError(null);
              }}
              className="min-h-[38px] rounded-lg border border-[#D9DEE2] bg-white px-3 py-1.5 text-[14px] font-medium text-[#4F5C67] hover:bg-[#F4F3EF]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="min-h-[38px] rounded-lg bg-[#A64011] px-4 py-1.5 text-[14px] font-medium text-white transition-colors hover:bg-[#8C350E]"
            >
              Save requirement
            </button>
          </div>
        </form>
      )}

      {pin.materials.length === 0 ? (
        <div className="mt-3 rounded-xl border border-dashed border-[#D9DEE2] bg-[#F4F3EF]/40 px-4 py-5 text-[14px] leading-[20px] text-[#4F5C67]">
          No material requirements listed for this Pin yet.
        </div>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-xl border border-[#D9DEE2] bg-white">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-[#D9DEE2] bg-[#F4F3EF]/60 text-[13px] leading-[18px] font-medium text-[#4F5C67]">
                <th scope="col" className="px-3.5 py-2.5">
                  Item
                </th>
                <th scope="col" className="px-3 py-2.5 text-right whitespace-nowrap">
                  Required
                </th>
                <th scope="col" className="px-3.5 py-2.5 text-right whitespace-nowrap">
                  Issued
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D9DEE2] text-[14px] leading-[20px]">
              {pin.materials.map((item) => (
                <tr key={item.id} className="hover:bg-[#F4F3EF]/40">
                  <td className="px-3.5 py-2.5 text-[#1B2A4A]">
                    <div className="font-medium">{item.name}</div>
                    {item.isDemoSample && (
                      <div className="text-[12px] leading-[16px] text-[#4F5C67]">Demo sample</div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right font-medium text-[#1B2A4A] tabular-nums whitespace-nowrap">
                    {item.requiredQty} {item.unit}
                  </td>
                  <td className="px-3.5 py-2.5 text-right text-[#4F5C67] tabular-nums whitespace-nowrap">
                    {item.issuedQty} {item.unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
