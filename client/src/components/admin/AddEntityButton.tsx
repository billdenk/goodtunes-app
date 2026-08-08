import { Plus, type LucideIcon } from "lucide-react";

interface AddEntityButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  testId: string;
  icon?: LucideIcon;
  iconClassName?: string;
}

export function AddEntityButton({ label, onClick, disabled, testId, icon: Icon = Plus, iconClassName = "w-3 h-3" }: AddEntityButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      // Apple canon: the ONE filled blue primary pill per index screen
      // (docs/apple-canon.md button weight rule). Everything else in the
      // toolbar stays a quiet ghost control.
      className="h-9 px-4 rounded-full text-[13px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 bg-[var(--apple-blue)] text-white hover:brightness-105 active:brightness-95 transition-[filter] disabled:opacity-50 disabled:cursor-not-allowed"
      data-testid={testId}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}
