import { Segmented } from "@/components/ui";

const TABS = [
  { value: "cars", label: "Cars", href: "/cars" },
  { value: "finder", label: "Finder", href: "/cars/finder" },
  { value: "setups", label: "Setups", href: "/setups" },
] as const;

/** The Cars section's tabs: the ranking, the car finder (2026-10-10) and the setups library. */
export default function CarsTabs({ value }: { value: (typeof TABS)[number]["value"] }) {
  return <Segmented options={TABS.map(({ value, label }) => ({ value, label }))} value={value} href={(v) => TABS.find((t) => t.value === v)!.href} />;
}
