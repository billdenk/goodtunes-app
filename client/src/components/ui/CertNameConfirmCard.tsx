// Shared "name on your GoodDeed® certificate" confirm/edit control.
//
// Task #1467 added an inline name editor to the in-page PDF viewer so
// digital-only owners (no physical signed-cert add-on, so no
// `signed_cert_certificates` row) could correct the synthesized
// recipient name. Task #1479 surfaces that same step earlier — right on
// the post-checkout /welcome screen — so fresh buyers catch a wrong name
// before their first download instead of discovering the editor later.
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

interface DigitalNameInfo {
  editable: boolean;
  confirmed: boolean;
  currentName: string;
  defaultName: string;
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
}

export function CertNameConfirmCard({
  orderId,
  variant = "card",
  onSaved,
}: CertNameConfirmCardProps) {
  const [info, setInfo] = useState<DigitalNameInfo | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
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
      })
      .catch(() => {
        /* non-fatal — the surface just omits the editor */
      });
    return () => {
      cancelledRef.current = true;
    };
  }, [orderId]);

  const handleSave = async () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      setSaveError("A name is required.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const r = await apiRequest("POST", `/api/orders/${orderId}/cert/digital-name`, {
        name: trimmed,
      });
      const data = await r.json();
      const saved = (data?.confirmedName as string) ?? trimmed;
      setInfo((prev) => (prev ? { ...prev, currentName: saved, confirmed: true } : prev));
      setDraft(saved);
      setEditing(false);
      onSaved?.(saved);
    } catch (e: unknown) {
      let msg = "Couldn't save that name. Please try again.";
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

  const editForm = (
    <div className="flex flex-col gap-2 rounded-xl bg-white/5 border border-white/10 px-3 py-3">
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
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !saving) handleSave();
        }}
        placeholder="e.g. Jane Doe"
        className="bg-white/10 text-white text-base rounded-lg px-3 py-2 outline-none focus:bg-white/15"
        data-testid="input-cert-name"
      />
      {saveError && (
        <div className="text-xs" style={{ color: "var(--brand-pink)" }} data-testid="text-cert-name-error">
          {saveError}
        </div>
      )}
      <div className="flex items-center gap-2 mt-0.5">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !draft.trim()}
          className="px-3 py-1.5 rounded-full bg-[var(--brand-mint)] text-[var(--brand-bg)] text-sm font-semibold disabled:opacity-50 active:opacity-80"
          data-testid="button-save-cert-name"
        >
          {saving ? "Saving…" : "Save name"}
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setSaveError(null);
            setDraft(info.currentName ?? "");
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
      </div>
      <button
        type="button"
        onClick={() => {
          setDraft(info.currentName ?? "");
          setSaveError(null);
          setEditing(true);
        }}
        className="flex-shrink-0 text-sm font-semibold active:opacity-70"
        style={{ color: "var(--brand-mint)" }}
        data-testid="button-edit-cert-name"
      >
        Edit
      </button>
    </div>
  );

  const body = editing ? editForm : viewRow;

  if (variant === "bar") {
    return (
      <div className="px-4 pb-3" data-testid="cert-name-editor">
        {body}
      </div>
    );
  }

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
