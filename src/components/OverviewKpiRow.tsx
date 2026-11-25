import type { OverviewKpiItem } from '../utils/overviewKpis';

interface OverviewKpiRowProps {
  items: OverviewKpiItem[];
}

/**
 * Five static, compact near-square operational KPI summaries for Overview (Stage 04):
 * - Centered concise English title, tabular value, and supporting text.
 * - Purely static output: no link semantics, no hover actions, no pointer cursor, no tab stops.
 */
export function OverviewKpiRow({ items }: OverviewKpiRowProps) {
  return (
    <section
      aria-label="Operational summary"
      data-testid="overview-kpi-row"
      className="mt-7"
    >
      <div className="mx-auto grid w-full max-w-[920px] grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {items.map((item, idx) => (
          <div
            key={item.id}
            data-testid={`overview-kpi-${item.id}`}
            className={`flex min-h-[144px] cursor-default flex-col items-center justify-center rounded-xl border border-[#D9DEE2] bg-white px-4 py-5 text-center sm:aspect-[1.08/1] ${
              idx === items.length - 1 ? 'col-span-2 sm:col-span-1' : ''
            }`}
          >
            <div className="text-[13px] leading-[18px] font-medium text-[#4F5C67]">
              {item.title}
            </div>
            <div
              data-testid={`overview-kpi-value-${item.id}`}
              className="mt-2 text-[28px] leading-[34px] font-bold tracking-tight text-[#1B2A4A] tabular-nums"
            >
              {item.value}
            </div>
            <div
              data-testid={`overview-kpi-support-${item.id}`}
              className="mt-1.5 text-[12px] leading-[16px] text-[#4F5C67] tabular-nums"
            >
              {item.supportingText}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
