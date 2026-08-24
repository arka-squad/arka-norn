import type { ReactNode } from "react";

export function MetricStrip({ items }: { readonly items: readonly { readonly label: string; readonly value: ReactNode; readonly tone?: "neutral" | "good" | "warn" | "bad" }[] }) {
  return <dl className="metric-strip">{items.map((item) => <div key={item.label}><dt>{item.label}</dt><dd className={item.tone === undefined ? "" : `tone-${item.tone}`}>{item.value}</dd></div>)}</dl>;
}
