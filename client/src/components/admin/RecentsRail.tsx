import { Plus } from "lucide-react";
import type { RecentPerson } from "@/hooks/usePersonCreditRecents";

type Props = {
  recents: RecentPerson[];
  onPick: (p: RecentPerson) => void;
  testIdPrefix?: string;
};

export function RecentsRail({ recents, onPick, testIdPrefix = "recent-person" }: Props) {
  if (recents.length === 0) return null;
  return (
    <div data-testid="recents-rail">
      <div className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
        Recents
      </div>
      <div className="-mx-1 px-1 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {recents.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onPick(p)}
            className="group/pill relative flex-shrink-0 inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 min-h-[44px] rounded-full bg-slate-100 hover:bg-[var(--brand-blue)]/10 text-[12.5px] text-slate-700 transition-colors"
            data-testid={`${testIdPrefix}-${p.id}`}
            aria-label={`Credit ${p.name} again`}
          >
            <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-slate-200 text-[11px] font-semibold text-slate-600 flex-shrink-0">
              {p.photoUrl ? (
                <img
                  src={p.photoUrl}
                  alt={p.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                p.name.charAt(0).toUpperCase()
              )}
            </span>
            <span className="whitespace-nowrap">{p.name}</span>
            <span
              className="ml-0.5 inline-flex items-center justify-center h-5 w-5 rounded-full bg-white text-[var(--brand-blue)] shadow-sm opacity-100 md:opacity-0 md:group-hover/pill:opacity-100 transition-opacity"
              aria-hidden
            >
              <Plus className="h-3 w-3" strokeWidth={2.5} />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
