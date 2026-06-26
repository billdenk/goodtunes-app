import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

const fanBase =
  "w-full bg-[color:var(--fan-surface-strong)] border border-[color:var(--fan-field-border)] text-white placeholder:text-white/30 focus:outline-none focus:border-[color:var(--brand-blue)] transition-colors";

export interface FanInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  compact?: boolean;
}

export const FanInput = forwardRef<HTMLInputElement, FanInputProps>(
  ({ compact, className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        fanBase,
        compact ? "rounded-xl px-3 py-2.5 text-sm" : "rounded-2xl px-4 py-3 text-base",
        className
      )}
      {...props}
    />
  )
);
FanInput.displayName = "FanInput";

export interface FanSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  compact?: boolean;
}

export const FanSelect = forwardRef<HTMLSelectElement, FanSelectProps>(
  ({ compact, className, children, ...props }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          fanBase,
          "appearance-none cursor-pointer",
          compact
            ? "rounded-xl px-3 py-2.5 text-sm pr-9"
            : "rounded-2xl px-4 py-3 text-base pr-10",
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        size={16}
        className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-white/50"
      />
    </div>
  )
);
FanSelect.displayName = "FanSelect";
