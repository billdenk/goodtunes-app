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
      className="px-2.5 py-1.5 rounded-md text-[11.5px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
      data-testid={testId}
    >
      <Icon className="w-3 h-3" />
      {label}
    </button>
  );
}
