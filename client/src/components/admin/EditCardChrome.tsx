// Shared pencil-to-edit card chrome for admin pricing surfaces.
//
// Lifted out of AdminPlatformPricing so the press Catalog editor
// (AdminManufacturer) renders the exact same read-only-by-default,
// pencil-to-edit, discard-confirm, quiet-SaveLink pattern. One source
// of truth keeps the two pricing surfaces visually identical.
import type { ReactNode } from "react";
import { Pencil } from "lucide-react";

// Quiet ghost Save — at rest dimmed slate; brand-blue + soft pill once
// the card is dirty. Mirrors the `SaveLink` primitive on SellPanel.
export function SaveLink({
  dirty,
  onClick,
  testId,
  busy,
}: {
  dirty: boolean;
  onClick: () => void;
  testId: string;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!dirty || !!busy}
      className={
        "h-8 px-3.5 rounded-full text-xs font-semibold transition-colors " +
        (dirty
          ? "bg-[color:var(--brand-blue)] text-white hover:opacity-90"
          : "bg-slate-100 text-slate-300 cursor-default")
      }
      data-testid={testId}
    >
      {busy ? "Saving…" : "Save"}
    </button>
  );
}

// Plain pencil affordance — admin chrome ghost button, IconButton-style
// dimensions (h-8 w-8) without the fan-dark IconButton primitive (which
// is glass-scrim only and would vanish on white admin cards).
export function EditPencil({
  active,
  onClick,
  testId,
  label = "Edit",
}: {
  active: boolean;
  onClick: () => void;
  testId: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={
        "h-8 w-8 inline-flex items-center justify-center rounded-full transition-colors " +
        (active
          ? "text-[color:var(--brand-blue)] bg-[color:var(--brand-blue-soft)]"
          : // Hover convention: tint the surface only — the glyph color
            // never changes on hover.
            "text-slate-400 hover:bg-slate-100")
      }
      data-testid={testId}
    >
      <Pencil className="w-4 h-4" />
      <span className="sr-only">{label}</span>
    </button>
  );
}

export function CardHeader({
  title,
  subtitle,
  icon,
  editing,
  dirty,
  onEnterEdit,
  onCancelEdit,
  testId,
  rightSlot,
  titleClassName = "text-base font-semibold text-slate-900",
}: {
  title: ReactNode;
  subtitle?: string;
  icon?: React.ReactNode;
  editing: boolean;
  // When `editing && dirty`, clicking the pencil prompts to discard
  // local draft state before flipping back to read-only.
  dirty?: boolean;
  onEnterEdit: () => void;
  onCancelEdit: () => void;
  testId: string;
  rightSlot?: React.ReactNode;
  titleClassName?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className={titleClassName}>{title}</h2>
        </div>
        {subtitle && (
          <p className="text-sm text-slate-500 mt-1">{subtitle}</p>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {rightSlot}
        <EditPencil
          active={editing}
          onClick={() => {
            if (editing) {
              if (dirty && !window.confirm("Discard unsaved changes?")) return;
              onCancelEdit();
            } else {
              onEnterEdit();
            }
          }}
          testId={`button-edit-${testId}`}
        />
      </div>
    </div>
  );
}
