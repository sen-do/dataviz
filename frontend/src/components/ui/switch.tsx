import { cn } from "@/lib/utils";

interface SwitchProps {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  className?: string;
}

export function Switch({ checked = false, onCheckedChange, className }: SwitchProps) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange?.(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-zinc-700 transition-colors duration-200 focus-visible:outline-none",
        checked ? "bg-white" : "bg-zinc-800",
        className
      )}
    >
      <span
        className={cn(
          "pointer-events-none block h-3.5 w-3.5 rounded-full shadow-sm transition-transform duration-200",
          checked ? "translate-x-[18px] bg-zinc-950" : "translate-x-[2px] bg-zinc-500"
        )}
      />
    </button>
  );
}
