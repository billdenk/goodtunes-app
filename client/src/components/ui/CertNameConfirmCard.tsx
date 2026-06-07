// Shared "name on your GoodDeed® certificate" confirm/edit control.
//
// Task #1467 added an inline name editor to the in-page PDF viewer so
// digital-only owners (no physical signed-cert add-on, so no
// `signed_cert_certificates` row) could correct the synthesized
// recipient name. Task #1479 surfaces that same step earlier — right on
// the post-checkout /welcome screen — so fresh buyers catch a wrong name
// before their first download instead of discovering the editor later.
//
// Task #1604 consolidates the cert print controls behind one pencil:
//   • Name is a ONE-TIME courtesy edit. The server stamps certConfirmedAt
//     on first save and returns `nameEditable: false` thereafter (POST
//     then 409s), so the input locks after the first save.
//   • Paper size (A4 / US Letter) is ALWAYS editable — it's a print
//     preference, shown in light text under the name — and rides the same
//     POST. Both fields re-render the PDF on save.
//
// Both surfaces talk to the same GET/POST /api/orders/:orderId/cert/
// digital-name endpoints, which return `editable: false` (and refuse the
// POST with 409) for physical signed-cert orders. Those keep the
// operator-driven CertConfirmationCard flow in Orders.tsx, untouched.
//
// The component self-gates: it fetches the digital-name info on mount and
// renders nothing until it knows the name is editable, so callers can drop
// it in unconditionally.
import { useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { IconButton } from "@/components/ui/IconButton";

type PaperSize = "letter" | "a4";

interface DigitalNameInfo {
  editable: boolean;
  /**
   * One-time-courtesy lock for the NAME only. Older servers don't send it;
   * fall back to `editable && !confirmed`. Paper size ignores this.
   */
  nameEditable?: boolean;
  confirmed: boolean;
  currentName: string;
  defaultName: string;
  /** Per-order paper size (override or country default). */
  paperSize?: PaperSize;
  /** Country-derived default, for reference. */
  defaultPaperSize?: PaperSize;
}

interface CertNameConfirmCardProps {
  /** Owning order id — drives the digital-name endpoints. */
  orderId: string;
  /**
   * "bar" = the compact inline row used inside the PDF viewer sheet.
   * "card" = the standalone card used on the /welcome screen.
   */
  variant?: "bar" | "card";
  /** Fired after a successful save (e.g. the sheet re-renders the PDF). */
  onSaved?: (name: string) => void;
  /**
   * Fired while editing as the fan toggles the paper-size segments, so the
   * host viewer can preview the new page proportions BEFORE the save
   * re-renders the real PDF. `null` clears the preview (save / cancel).
   */
  onPaperPreview?: (paper: PaperSize | null) => void;
}

const PAPER_LABEL: Record<PaperSize, string> = {
  letter: "US Letter",
  a4: "A4",
};

export function CertNameConfirmCard({
  orderId,
  variant = "card",
  onSaved,
  onPaperPreview,
}: CertNameConfirmCardProps) {
  const [info, setInfo] = useState<DigitalNameInfo | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftPaper, setDraftPaper] = useState<PaperSize | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    // Best-effort: physical signed-cert orders come back
    // { editable: false } and we simply render nothing.
    apiRequest("GET", `/api/orders/${orderId}/cert/digital-name`)
      .then((r) => r.json())
      .then((data: DigitalNameInfo) => {
        if (cancelledRef.current) return;
        setInfo(data);
        setDraft(data.currentName ?? "");
        setDraftPaper(data.paperSize);
      })
      .catch(() => {
        /* non-fatal — the surface just omits the editor */
      });
    return () => {
      cancelledRef.current = true;
    };
  }, [orderId]);

  // Name is editable until the first save (server stamps certConfirmedAt).
  const nameEditable = info
    ? info.nameEditable ?? (info.editable && !info.confirmed)
    : false;

  const handleSave = async () => {
    if (!info) return;
    const trimmed = draft.trim();
    const nameChanged = nameEditable && trimmed !== (info.currentName ?? "");
    const paperChanged =
      draftPaper !== undefined && draftPaper !== info.paperSize;

    if (nameEditable && !trimmed) {
      setSaveError("A name is required.");
      return;
    }
    if (!nameChanged && !paperChanged) {
      // Nothing to persist — just leave edit mode.
      setEditing(false);
      setSaveError(null);
      return;
    }

    // Build a minimal body so name-only saves stay { name } (and a
    // paper-only save never touches the locked name).
    const payload: { name?: string; paperSize?: PaperSize } = {};
    if (nameChanged) payload.name = trimmed;
    if (paperChanged) payload.paperSize = draftPaper;

    setSaving(true);
    setSaveError(null);
    try {
      const r = await apiRequest(
        "POST",
        `/api/orders/${orderId}/cert/digital-name`,
        payload,
      );
      const data = await r.json();
      const saved = (data?.confirmedName as string) ?? (nameChanged ? trimmed : info.currentName);
      const savedPaper = (data?.paperSize as PaperSize | undefined) ?? draftPaper ?? info.paperSize;
      setInfo((prev) =>
        prev
          ? {
              ...prev,
              currentName: saved,
              confirmed: nameChanged ? true : prev.confirmed,
              nameEditable: nameChanged ? false : prev.nameEditable,
              paperSize: savedPaper,
            }
          : prev,
      );
      setDraft(saved);
      setDraftPaper(savedPaper);
      setEditing(false);
      onPaperPreview?.(null);
      onSaved?.(saved);
    } catch (e: unknown) {
      let msg = "Couldn't save that. Please try again.";
      try {
        if (e && typeof e === "object" && "message" in e) {
          const parsed = String((e as { message?: string }).message ?? "");
          // apiRequest throws "<status>: <json>"; pull the message field.
          const jsonStart = parsed.indexOf("{");
          if (jsonStart >= 0) {
            const body = JSON.parse(parsed.slice(jsonStart));
            if (body?.message) msg = body.message;
          } else if (parsed) {
            msg = parsed;
          }
        }
      } catch {
        /* keep default */
      }
      setSaveError(msg);
    } finally {
      setSaving(false);
    }
  };

  if (!info?.editable) return null;

  const paper = info.paperSize;

  const editForm = (
    <div className="flex flex-col gap-3 rounded-xl bg-white/5 border border-white/10 px-3 py-3">
      <div className="flex flex-col gap-2">
        <label
          htmlFor={`cert-name-input-${orderId}`}
          className="text-xs uppercase tracking-wider text-fan-secondary"
        >
          Name on certificate
        </label>
        <input
          id={`cert-name-input-${orderId}`}
          type="text"
          value={draft}
          maxLength={80}
          autoFocus={nameEditable}
          disabled={!nameEditable || saving}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !saving) handleSave();
          }}
          placeholder="e.g. Jane Doe"
          className="bg-white/10 text-white text-base rounded-lg px-3 py-2 outline-none focus:bg-white/15 disabled:opacity-60"
          data-testid="input-cert-name"
        />
        {nameEditable ? (
          <p className="text-xs text-fan-faint leading-snug" data-testid="text-cert-name-onetime">
            You can set this name once. After you save, it's locked in.
          </p>
        ) : (
          <p className="text-xs text-fan-faint leading-snug" data-testid="text-cert-name-locked">
            This name is locked after your first save.
          </p>
        )}
      </div>

      {/* Paper size — always editable; a print preference, not the name. */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs uppercase tracking-wider text-fan-secondary">
          Paper size
        </span>
        <div
          className="inline-flex rounded-lg bg-white/10 p-0.5 self-start"
          role="group"
          aria-label="Certificate paper size"
        >
          {(["letter", "a4"] as PaperSize[]).map((size) => {
            const active = (draftPaper ?? paper) === size;
            return (
              <button
                key={size}
                type="button"
                onClick={() => {
                  setDraftPaper(size);
                  onPaperPreview?.(size);
                }}
                disabled={saving}
                aria-pressed={active}
                className={
                  "px-3 py-1.5 rounded-md text-sm font-medium transition-colors " +
                  (active
                    ? "bg-white text-[var(--brand-bg)]"
                    : "text-fan-secondary active:opacity-70")
                }
                data-testid={`button-paper-${size}`}
              >
                {PAPER_LABEL[size]}
              </button>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-fan-faint leading-snug" data-testid="text-cert-derogatory-disclaimer">
        Certificates bearing derogatory, offensive, or infringing names may be
        declined or cancelled.
      </p>

      {saveError && (
        <div className="text-xs" style={{ color: "var(--brand-pink)" }} data-testid="text-cert-name-error">
          {saveError}
        </div>
      )}
      <div className="flex items-center gap-2 mt-0.5">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || (nameEditable && !draft.trim())}
          className="px-3 py-1.5 rounded-full bg-[var(--brand-mint)] text-[var(--brand-bg)] text-sm font-semibold disabled:opacity-50 active:opacity-80"
          data-testid="button-save-cert-name"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setSaveError(null);
            setDraft(info.currentName ?? "");
            setDraftPaper(info.paperSize);
            onPaperPreview?.(null);
          }}
          disabled={saving}
          className="text-sm text-fan-secondary active:opacity-70 disabled:opacity-50"
          data-testid="button-cancel-cert-name"
        >
          Cancel
        </button>
      </div>
    </div>
  );

  const viewRow = (
    <div className="flex items-center gap-3 rounded-xl bg-white/5 border border-white/10 px-3 py-2.5">
      <div className="flex-1 min-w-0">
        <div className="text-xs uppercase tracking-wider text-fan-secondary">
          Name on certificate
        </div>
        <div className="text-sm font-medium text-white truncate" data-testid="text-cert-name">
          {info.currentName}
        </div>
        {paper && (
          <div className="text-xs text-fan-faint mt-0.5" data-testid="text-cert-paper-size">
            {PAPER_LABEL[paper]}
          </div>
        )}
      </div>
      <div className="flex-shrink-0" style={{ color: "var(--brand-mint)" }}>
        <IconButton
          variant="ghost"
          size="md"
          label="Edit certificate details"
          onClick={() => {
            setDraft(info.currentName ?? "");
            setDraftPaper(info.paperSize);
            setSaveError(null);
            setEditing(true);
          }}
          data-testid="button-edit-cert-name"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
          </svg>
        </IconButton>
      </div>
    </div>
  );

  // Bar variant view — plain inline text under the sheet title (no boxed
  // card), with a small, understated pencil to the left that opens the same
  // inline editor. The value spans keep their testids holding ONLY the
  // value so callers/tests read the name + paper size cleanly.
  const editPencil = (
    <div className="flex-shrink-0 -ml-1" style={{ color: "var(--brand-mint)" }}>
      <IconButton
        variant="ghost"
        size="md"
        label="Edit certificate details"
        onClick={() => {
          setDraft(info.currentName ?? "");
          setDraftPaper(info.paperSize);
          setSaveError(null);
          setEditing(true);
        }}
        data-testid="button-edit-cert-name"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
        </svg>
      </IconButton>
    </div>
  );

  const barViewRow = (
    <div className="flex items-center gap-1.5">
      {editPencil}
      <div className="min-w-0 flex flex-col gap-0.5">
        <div className="flex flex-wrap items-baseline gap-x-2 leading-snug">
          <span className="text-xs uppercase tracking-wider text-fan-faint">
            Name on certificate:
          </span>
          <span
            className="text-base font-medium text-fan-primary truncate"
            data-testid="text-cert-name"
          >
            {info.currentName}
          </span>
        </div>
        {paper && (
          <div className="flex flex-wrap items-baseline gap-x-2 leading-snug">
            <span className="text-xs uppercase tracking-wider text-fan-faint">
              Paper size:
            </span>
            <span className="text-base text-fan-secondary" data-testid="text-cert-paper-size">
              {PAPER_LABEL[paper]}
            </span>
          </div>
        )}
      </div>
    </div>
  );

  if (variant === "bar") {
    return (
      <div className="px-4 pb-3" data-testid="cert-name-editor">
        {editing ? editForm : barViewRow}
      </div>
    );
  }

  const body = editing ? editForm : viewRow;

  return (
    <div
      className="rounded-2xl border border-white/10 bg-white/5 p-5 mb-5"
      data-testid="cert-name-editor"
    >
      <div className="text-fan-faint text-xs uppercase tracking-wider font-semibold mb-1.5">
        Name on your GoodDeed®
      </div>
      <p className="text-fan-faint text-xs mb-3 leading-snug">
        This is the name we'll print on your certificate — correct it now if it
        isn't right.
      </p>
      {body}
    </div>
  );
}
