import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Check, X, ExternalLink } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ArtistPickerField } from "./ArtistPickerField";
import { Combobox, EntityCombobox } from "./Combobox";
import {
  AddressAutocompleteField,
  type NormalizedAddress,
} from "./AddressAutocompleteField";
import type { PartnerAddressSnapshot } from "@shared/schema";

/**
 * Shared in-place edit panel used across the new admin detail pages
 * (instrument, vendor, label, …). Reads as a tidy `dl` block; the
 * hover-reveal pencil flips the panel into a form. Save PUTs the diff
 * to `endpoint` and invalidates the supplied query keys. Cancel reverts
 * to the cached values.
 *
 * One panel per logical group (e.g. "Identity", "Links", "Notes") —
 * Save commits all changed fields in that group in one request.
 */

export type FieldType =
  | "text"
  | "url"
  | "textarea"
  | "number"
  | "currency"
  | "date"
  | "select"
  | "combobox"
  | "entity-combobox"
  | "artist-picker"
  | "address";

/* Convert an edited dollar string (e.g. "50" or "19.99") to integer
 * cents for the wire. Currency fields are seeded into the form as a
 * dollar string ((cents / 100).toFixed(2)) and round-trip back to
 * integer cents here on save. Returns the raw string untouched when it
 * isn't a finite number so the server's own validation surfaces the
 * error instead of us silently nulling/zeroing the price. */
function dollarsToCents(s: string): number | string {
  const n = Number(s);
  if (!Number.isFinite(n)) return s;
  return Math.round(n * 100);
}

export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldConfig {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  // For url fields: optional inline icon to show next to the link in
  // read mode (e.g. Instagram glyph). Edit-mode UI is unchanged.
  readIcon?: React.ComponentType<{ className?: string }>;
  // For select fields: the choices. value goes on the wire, label is
  // shown in both the dropdown and the read-mode value cell.
  options?: FieldOption[];
  // For artist-picker fields: the sibling draft key that receives the
  // selected person's id (e.g. "primaryArtistId"). The picker drives two
  // keys at once — this field's `key` gets the display name, `idKey` gets
  // the FK. Both are seeded from `values` on entering edit mode and both
  // are included in the PUT diff on save.
  idKey?: string;
  // For combobox fields: a GET endpoint that returns existing values for
  // this field. Response can be either `{ <key>: string[] }` or a bare
  // string[] — both are accepted. The combobox merges these into its
  // searchable list and lets the admin pick one OR type a brand-new
  // value that gets saved as-is (free-text behind the scenes). Used by
  // the album Genre field today.
  optionsEndpoint?: string;
  // For entity-combobox fields (Task #1378): a searchable picker over
  // real *records* (labels today) rather than free text. `key` stores
  // the picked record's **id** (so the wire gets the FK), while the UI
  // shows the record's name. `entityListEndpoint` GETs the existing
  // records (`[{id, name, …}]`), `entityCreateEndpoint` POSTs `{ name }`
  // to mint a new one inline (no navigation away), and `emptyOptionLabel`
  // names the none/empty row (e.g. "Independent") that clears the FK.
  // For read-mode display the id→name lookup reuses `options`, so pass a
  // static `options` list alongside (value=id, label=name + the empty row).
  entityListEndpoint?: string;
  entityCreateEndpoint?: string;
  emptyOptionLabel?: string;
  // Optional smart-fill: when an entity-combobox picks/creates a record
  // AND the `autofillKey` field's draft is still empty, prefill it from
  // `{autofillSiblingKey value} {entity name}` (sibling omitted if blank).
  // Used for the album Copyright line auto-filling from Year + Label.
  // Never overwrites a non-empty target; the field stays fully editable.
  autofillKey?: string;
  autofillSiblingKey?: string;
  // For address fields (Task #489): the sibling key that holds the
  // structured `PartnerAddressSnapshot`. When the operator picks a
  // Google Places suggestion the panel writes both keys in one PUT —
  // `field.key` gets the formatted text, `addressKey` gets the
  // {line1, line2, city, state, postalCode, country} struct. When the
  // operator only edits the text (no suggestion accepted), the struct
  // is left untouched — we'd rather keep the old struct than null it
  // out from a tiny typo. Blanking the text to empty clears both.
  addressKey?: string;
}

/* Format a YYYY-MM-DD (or ISO) date string for read mode. Returns the
 * raw string if it isn't parseable so we never lose information.
 *
 * For bare YYYY-MM-DD we parse the parts ourselves and build a Date in
 * local time. The naive `new Date("2025-05-16")` would be UTC midnight,
 * which `toLocaleDateString` then renders in local time — so anyone
 * west of UTC sees the previous day. Release dates are calendar dates,
 * not instants, so the displayed day must match what the admin typed. */
function formatDateRead(d: string): string {
  try {
    const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
    const dt = ymd
      ? new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]))
      : new Date(d);
    if (isNaN(dt.getTime())) return d;
    return dt.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return d;
  }
}

export interface EditablePanelProps {
  title: string;
  testId?: string;
  // PUT endpoint. Must accept `{ [fieldKey]: value }` body shape.
  endpoint: string;
  // Current source-of-truth values, keyed by field key. Most keys are
  // string-shaped; address-snapshot sibling keys (FieldConfig.addressKey)
  // carry a `PartnerAddressSnapshot` object instead.
  values: Record<string, string | PartnerAddressSnapshot | null | undefined>;
  fields: FieldConfig[];
  // Query keys to invalidate after a successful save. Each entry is the
  // full TanStack v5 array key. The list query for the entity should
  // also be included so card chrome updates immediately.
  invalidate: (readonly unknown[])[];
  // Optional extra content rendered after the field list in read mode
  // only. Use for read-only metadata that doesn't belong in the form
  // (e.g. a label name that needs a dropdown to actually change).
  readExtras?: React.ReactNode;
  // Optional always-visible action rendered in the read-mode header,
  // left of the edit pencil. Use for a panel-scoped action that isn't a
  // field edit (e.g. "Refresh streaming links").
  headerAction?: React.ReactNode;
  // Field grid width. Default 2 (legacy two-column layout). Use 4 for
  // wide horizontal panels (e.g. album Overview Release strip).
  columns?: 2 | 4;
  // Task #79 — when the caller knows the session can't edit (partner
  // missing edit_metadata, post-sale lock, etc.), hide the pencil and
  // surface a quiet hint instead of the action affordance. The server
  // is still the gate; this just keeps the UI honest.
  disabled?: boolean;
  disabledReason?: string;
  // Optional post-save hook. Receives the parsed JSON response from the
  // PUT endpoint (or null when nothing changed and no request was sent).
  // Use when the server returns extra payload the caller needs to act on
  // — e.g. an `artistLabelConflict` follow-up confirm.
  onSaved?: (response: any) => void;
}

export function EditablePanel({
  title,
  testId,
  endpoint,
  values,
  fields,
  invalidate,
  readExtras,
  headerAction,
  columns = 2,
  disabled = false,
  disabledReason,
  onSaved,
}: EditablePanelProps) {
  const [editing, setEditing] = useState(false);
  // Draft holds string values for almost every field; address-snapshot
  // sibling keys (FieldConfig.addressKey) carry an object instead.
  const [draft, setDraft] = useState<
    Record<string, string | PartnerAddressSnapshot | null>
  >({});
  const { toast } = useToast();
  const qc = useQueryClient();
  const firstInputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(
    null,
  );
  const editButtonRef = useRef<HTMLButtonElement | null>(null);

  // Snapshot current values into the draft only when we *enter* edit
  // mode. We deliberately do not re-sync on subsequent `values` changes
  // so a background refetch can't clobber what the admin is typing.
  // Cancel/Save reset by leaving edit mode and seeding fresh next time.
  useEffect(() => {
    if (editing) {
      const next: Record<string, string | PartnerAddressSnapshot | null> = {};
      for (const f of fields) {
        next[f.key] = (values[f.key] as string | null | undefined) ?? "";
        if (f.idKey)
          next[f.idKey] = (values[f.idKey] as string | null | undefined) ?? "";
        if (f.addressKey)
          next[f.addressKey] =
            (values[f.addressKey] as PartnerAddressSnapshot | null | undefined) ??
            null;
      }
      setDraft(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  // Auto-focus the first input when entering edit mode so keyboard users
  // can start typing immediately. `firstInputRef` is attached to the
  // top-most field below.
  useEffect(() => {
    if (editing && firstInputRef.current) {
      firstInputRef.current.focus();
      // Place the caret at the end of any pre-filled text.
      const el = firstInputRef.current;
      const len = el.value.length;
      try {
        el.setSelectionRange(len, len);
      } catch {
        // some input types (e.g. url) don't support setSelectionRange
      }
    }
  }, [editing]);

  // After saving / cancelling, return focus to the pencil so keyboard
  // users land where they started.
  const exitEdit = () => {
    setEditing(false);
    setDraft({});
    // queueMicrotask so the read-mode button is in the DOM before we focus it.
    queueMicrotask(() => editButtonRef.current?.focus());
  };

  const mut = useMutation({
    mutationFn: async () => {
      // Only send fields whose draft differs from current. Empty strings
      // are sent as null so blanking a field actually clears it.
      const body: Record<string, string | number | PartnerAddressSnapshot | null> = {};
      const diffKey = (
        k: string,
        transform?: (s: string) => string | number,
      ) => {
        const before = (values[k] as string | null | undefined) ?? "";
        const after = (draft[k] as string | null | undefined) ?? "";
        if (before !== after) {
          const trimmed = (after as string).trim();
          if (trimmed === "") {
            body[k] = null;
          } else {
            body[k] = transform ? transform(trimmed) : trimmed;
          }
        }
      };
      for (const f of fields) {
        diffKey(f.key, f.type === "currency" ? dollarsToCents : undefined);
        if (f.idKey) diffKey(f.idKey);
        if (f.addressKey) {
          // Snapshot diff via JSON equality. Blanking the formatted text
          // also nulls the snapshot so the two stay coherent.
          const beforeSnap = values[f.addressKey] ?? null;
          const afterSnap = draft[f.addressKey] ?? null;
          const formattedAfter =
            ((draft[f.key] as string | null | undefined) ?? "").trim();
          let nextSnap: PartnerAddressSnapshot | null =
            afterSnap as PartnerAddressSnapshot | null;
          if (formattedAfter === "") nextSnap = null;
          if (JSON.stringify(beforeSnap ?? null) !== JSON.stringify(nextSnap ?? null)) {
            body[f.addressKey] = nextSnap;
          }
        }
      }
      if (Object.keys(body).length === 0)
        return { changed: null, response: null, status: null as number | null };
      const res = await apiRequest("PUT", endpoint, body);
      let response: any = null;
      try {
        response = await res.json();
      } catch {
        response = null;
      }
      return { changed: body, response, status: res.status as number | null };
    },
    onSuccess: async ({ changed, response, status }) => {
      // Refresh any combobox option lists that just had a value added /
      // edited from this form — otherwise the freshly-added genre /
      // tag / category won't show up as an existing option next time.
      const comboKeys = fields
        .filter((f) => f.type === "combobox" && f.optionsEndpoint)
        .map((f) => [f.optionsEndpoint] as readonly unknown[]);
      await Promise.all(
        [...invalidate, ...comboKeys].map((key) =>
          qc.invalidateQueries({ queryKey: key }),
        ),
      );
      exitEdit();
      if (!changed) return;
      // Task #2468 — the partner-edit gate returns 202 when a save is
      // DIVERTED to the GoodTunes review queue instead of applied: an
      // approval-mode partner, or an artist owner editing a released /
      // post-sale release. Nothing was written, so say "Sent for review"
      // rather than falsely claiming the field updated (and skip onSaved,
      // which assumes a real write). Operators + direct-save partners get
      // 200 and the unchanged "updated" path.
      if (status === 202) {
        toast({
          title: "Sent for review",
          description:
            response?.message ||
            `Your change to ${title.toLowerCase()} was sent to GoodTunes for review.`,
        });
        return;
      }
      toast({ title: `${title} updated` });
      if (onSaved) onSaved(response);
    },
    onError: (e: any) => {
      toast({
        title: `Couldn't save ${title.toLowerCase()}`,
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      });
    },
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    // Light client-side required-field guard. The server still validates.
    for (const f of fields) {
      const v = draft[f.key];
      // Task #489 — addressKey snapshots live in the same draft map but
      // aren't strings; the required-guard only inspects the free-text
      // field at f.key, so coerce non-strings to "" defensively.
      if (f.required && !(typeof v === "string" ? v : "").trim()) {
        toast({
          title: `${f.label} is required`,
          variant: "destructive",
        });
        return;
      }
    }
    mut.mutate();
  };

  const handleCancel = () => {
    exitEdit();
  };

  const slug = title.toLowerCase().replace(/[^a-z]+/g, "-");
  const panelTestId = testId ?? `panel-${slug}`;

  // Layout buckets: short fields share the 2-col grid; textareas stack
  // full-width beneath. Mirrors what the pages had before.
  const shortFields = fields.filter((f) => f.type !== "textarea");
  const longFields = fields.filter((f) => f.type === "textarea");

  // Patch helper passed to EditInput. Address fields use it to write
  // both the formatted text key and the structured snapshot key in one
  // tick (no useState race) when an autocomplete suggestion is picked.
  const patchDraft = (
    kv: Record<string, string | PartnerAddressSnapshot | null>,
  ) => setDraft((d) => ({ ...d, ...kv }));

  if (editing) {
    return (
      <form
        onSubmit={handleSave}
        className="rounded-2xl bg-white border border-[var(--brand-blue)]/40 shadow-sm p-6 space-y-5"
        data-testid={panelTestId}
        data-mode="edit"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-slate-900 text-[14px] font-bold">{title}</h2>
          <span className="text-[11px] text-[var(--brand-blue)] font-semibold uppercase tracking-wider">
            Editing
          </span>
        </div>
        {shortFields.length > 0 && (
          <div
            className={[
              "grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4",
              columns === 4 ? "lg:grid-cols-4" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {shortFields.map((f, i) => (
              <EditInput
                key={f.key}
                field={f}
                value={(draft[f.key] as string | null | undefined) ?? ""}
                idValue={f.idKey ? ((draft[f.idKey] as string | null | undefined) ?? "") : ""}
                draft={draft}
                onChange={(v) =>
                  setDraft((d) => ({ ...d, [f.key]: v }))
                }
                patch={patchDraft}
                inputRef={
                  i === 0 && shortFields.length > 0
                    ? (firstInputRef as React.RefObject<HTMLInputElement>)
                    : undefined
                }
              />
            ))}
          </div>
        )}
        {longFields.map((f, i) => (
          <EditInput
            key={f.key}
            field={f}
            value={(draft[f.key] as string | null | undefined) ?? ""}
            idValue=""
            draft={draft}
            onChange={(v) => setDraft((d) => ({ ...d, [f.key]: v }))}
            patch={patchDraft}
            inputRef={
              shortFields.length === 0 && i === 0
                ? (firstInputRef as React.RefObject<HTMLTextAreaElement>)
                : undefined
            }
          />
        ))}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={handleCancel}
            disabled={mut.isPending}
            className="h-8 px-3 rounded-md bg-white border border-slate-200 text-slate-700 text-[12px] font-semibold hover:bg-slate-50 inline-flex items-center gap-1.5"
            data-testid={`button-cancel-${slug}`}
          >
            <X className="w-3.5 h-3.5" />
            Cancel
          </button>
          <button
            type="submit"
            disabled={mut.isPending}
            className="h-8 px-3 rounded-md bg-[var(--brand-blue)] text-white text-[12px] font-semibold hover:bg-[#2890c8] inline-flex items-center gap-1.5 disabled:opacity-60"
            data-testid={`button-save-${slug}`}
          >
            {mut.isPending ? (
              <Spinner className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Check className="w-3.5 h-3.5" />
            )}
            Save
          </button>
        </div>
      </form>
    );
  }

  return (
    <section
      className="group rounded-2xl bg-white border border-slate-200 shadow-sm p-6 space-y-5"
      data-testid={panelTestId}
      data-mode="read"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-slate-900 text-[14px] font-bold">{title}</h2>
        <div className="flex items-center gap-2">
          {headerAction}
          {disabled ? (
            <span
              className="text-[11px] font-medium text-slate-400 italic"
              title={disabledReason || "Read-only"}
              data-testid={`badge-readonly-${slug}`}
            >
              {disabledReason || "Read-only"}
            </span>
          ) : (
            <button
              ref={editButtonRef}
              type="button"
              onClick={() => setEditing(true)}
              aria-label={`Edit ${title}`}
              title={`Edit ${title}`}
              data-testid={`button-edit-${slug}`}
              className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-900 inline-flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
      {shortFields.length > 0 && (
        <dl
          className={[
            "grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4",
            columns === 4 ? "lg:grid-cols-4" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {shortFields.map((f) => {
            // Task #489 — addressKey snapshots co-exist in the values
            // map but are not displayed; ReadField only ever renders
            // the free-text at f.key, so coerce non-strings to null.
            const raw = values[f.key];
            const v = typeof raw === "string" ? raw : null;
            return <ReadField key={f.key} field={f} value={v} />;
          })}
        </dl>
      )}
      {longFields.map((f) => {
        const raw = values[f.key];
        const v = typeof raw === "string" ? raw : null;
        return <ReadField key={f.key} field={f} value={v} />;
      })}
      {readExtras}
    </section>
  );
}

/* ─── Subcomponents ────────────────────────────────────────────────── */

function ReadField({
  field,
  value,
}: {
  field: FieldConfig;
  value: string | null;
}) {
  const slug = field.key
    .replace(/([A-Z])/g, "-$1")
    .toLowerCase();
  const testId = `field-${slug}`;

  if (field.type === "url") {
    const Icon = field.readIcon;
    return (
      <div className="min-w-0" data-testid={testId}>
        <dt className="text-slate-400 text-[10.5px] font-semibold uppercase tracking-wider mb-0.5">
          {field.label}
        </dt>
        <dd className="text-[13.5px] min-w-0">
          {value ? (
            <a
              href={value}
              target="_blank"
              rel="noreferrer"
              className="text-[var(--brand-blue)] font-medium hover:underline flex items-center gap-1 min-w-0 max-w-full"
            >
              {Icon && <Icon className="w-3.5 h-3.5 flex-shrink-0" />}
              <span className="truncate min-w-0 flex-1">
                {value.replace(/^https?:\/\//, "")}
              </span>
              <ExternalLink className="w-3 h-3 flex-shrink-0" />
            </a>
          ) : (
            <span className="text-slate-300 italic">Not set</span>
          )}
        </dd>
      </div>
    );
  }

  if (field.type === "textarea") {
    return (
      <div data-testid={testId}>
        <dt className="text-slate-400 text-[10.5px] font-semibold uppercase tracking-wider mb-1">
          {field.label}
        </dt>
        <dd
          className={[
            "text-[13.5px] leading-relaxed whitespace-pre-line",
            value ? "text-slate-700" : "text-slate-300 italic",
          ].join(" ")}
        >
          {value || `No ${field.label.toLowerCase()} yet`}
        </dd>
      </div>
    );
  }

  // text / number / date / select all use the same compact layout in
  // read mode — the difference is just how `value` is rendered.
  let display: string | null = value;
  if (value && field.type === "date") display = formatDateRead(value);
  else if (value && field.type === "currency") display = `$${value}`;
  else if (field.type === "select" && field.options) {
    // Match on current value (including ""). An empty-value option (e.g.
    // "Solo artist") takes priority over the generic "—" fallback so a
    // solo artist doesn't read as blank in read mode.
    const matched = field.options.find((o) => o.value === (value ?? ""));
    if (matched) display = matched.label;
    else display = value;
  } else if (field.type === "entity-combobox" && field.options) {
    // Resolve the stored id → record name. The empty/none option (id "")
    // maps to its label (e.g. "Independent") so an album with no label
    // reads as its meaningful default, not "Not set".
    display =
      field.options.find((o) => o.value === (value ?? ""))?.label ?? value;
  }
  return (
    <div data-testid={testId}>
      <dt className="text-slate-400 text-[10.5px] font-semibold uppercase tracking-wider mb-0.5">
        {field.label}
      </dt>
      <dd
        className={[
          "text-[13.5px]",
          display ? "text-slate-900 font-medium" : "text-slate-300 italic",
        ].join(" ")}
      >
        {display || "Not set"}
      </dd>
    </div>
  );
}

function EditInput({
  field,
  value,
  idValue,
  draft,
  onChange,
  patch,
  inputRef,
}: {
  field: FieldConfig;
  value: string;
  idValue: string;
  draft: Record<string, string | PartnerAddressSnapshot | null>;
  onChange: (next: string) => void;
  patch: (
    kv: Record<string, string | PartnerAddressSnapshot | null>,
  ) => void;
  inputRef?:
    | React.RefObject<HTMLInputElement>
    | React.RefObject<HTMLTextAreaElement>;
}) {
  if (field.type === "artist-picker") {
    return (
      <ArtistPickerField
        label={field.label}
        required={field.required}
        nameValue={value}
        idValue={idValue}
        onChange={({ name, id }) => {
          const next: Record<string, string> = { [field.key]: name };
          if (field.idKey) next[field.idKey] = id;
          patch(next);
        }}
      />
    );
  }
  const slug = field.key
    .replace(/([A-Z])/g, "-$1")
    .toLowerCase();
  const testId = `input-${slug}`;
  const baseLabel = (
    <label className="text-slate-400 text-[10.5px] font-semibold uppercase tracking-wider block mb-1">
      {field.label}
      {field.required && (
        <span className="ml-1 text-[var(--brand-pink)] normal-case">·  required</span>
      )}
    </label>
  );

  if (field.type === "currency") {
    return (
      <div>
        {baseLabel}
        <div className="flex items-center gap-2">
          <span className="text-slate-400 text-sm">$</span>
          <input
            ref={inputRef as React.RefObject<HTMLInputElement> | undefined}
            type="text"
            inputMode="decimal"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            className="w-full h-9 rounded-md border border-slate-300 bg-white px-3 text-[13.5px] text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)] focus:border-transparent tabular-nums"
            data-testid={testId}
          />
        </div>
      </div>
    );
  }

  if (field.type === "textarea") {
    return (
      <div>
        {baseLabel}
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement> | undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={5}
          placeholder={field.placeholder}
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-[13.5px] text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)] focus:border-transparent resize-y leading-relaxed"
          data-testid={testId}
        />
      </div>
    );
  }

  if (field.type === "combobox") {
    return (
      <div>
        {baseLabel}
        <Combobox
          value={value}
          onChange={onChange}
          optionsEndpoint={field.optionsEndpoint}
          placeholder={field.placeholder}
          testId={testId}
        />
      </div>
    );
  }

  if (field.type === "entity-combobox") {
    return (
      <div>
        {baseLabel}
        <EntityCombobox
          value={value}
          listEndpoint={field.entityListEndpoint!}
          createEndpoint={field.entityCreateEndpoint!}
          emptyOptionLabel={field.emptyOptionLabel}
          placeholder={field.placeholder}
          testId={testId}
          onPick={(entity) => {
            const next: Record<string, string | PartnerAddressSnapshot | null> = {
              [field.key]: entity?.id ?? "",
            };
            // Smart copyright-line fill: only when a real entity was
            // picked/created AND the target field is still empty — never
            // clobber a copyright line the operator already wrote. Stays
            // editable afterward; it's just a draft seed.
            if (entity && field.autofillKey) {
              const current =
                ((draft[field.autofillKey] as string | null | undefined) ?? "").trim();
              if (!current) {
                const sib = field.autofillSiblingKey
                  ? ((draft[field.autofillSiblingKey] as string | null | undefined) ?? "").trim()
                  : "";
                next[field.autofillKey] = sib
                  ? `${sib} ${entity.name}`
                  : entity.name;
              }
            }
            patch(next);
          }}
        />
      </div>
    );
  }

  if (field.type === "address") {
    return (
      <div>
        {baseLabel}
        <AddressAutocompleteField
          ref={inputRef as React.RefObject<HTMLInputElement> | undefined}
          value={value}
          onChange={onChange}
          onAddress={(snap: NormalizedAddress) => {
            // Map the Places normalized snapshot to the persisted
            // PartnerAddressSnapshot shape (Stripe-style `state` rather
            // than Places' `region`). Write both the formatted text and
            // the struct in one patch so the panel diff picks both up
            // and the next PUT sends them together.
            const next: Record<string, string | PartnerAddressSnapshot | null> = {
              [field.key]: snap.formatted || value,
            };
            if (field.addressKey) {
              next[field.addressKey] = {
                line1: snap.line1 || null,
                line2: snap.line2 || null,
                city: snap.city || null,
                state: snap.region || null,
                postalCode: snap.postalCode || null,
                country: snap.country || null,
              };
            }
            patch(next);
          }}
          placeholder={field.placeholder}
          testId={testId}
        />
      </div>
    );
  }

  if (field.type === "select") {
    return (
      <div>
        {baseLabel}
        <select
          ref={inputRef as React.RefObject<HTMLInputElement> | undefined as any}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-9 rounded-md border border-slate-300 bg-white px-3 text-[13.5px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)] focus:border-transparent"
          data-testid={testId}
        >
          {!field.required && !(field.options ?? []).some((o) => o.value === "") && (
            <option value="">—</option>
          )}
          {(field.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  const inputType =
    field.type === "url"
      ? "url"
      : field.type === "number"
        ? "number"
        : field.type === "date"
          ? "date"
          : "text";

  return (
    <div>
      {baseLabel}
      <input
        ref={inputRef as React.RefObject<HTMLInputElement> | undefined}
        type={inputType}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        className="w-full h-9 rounded-md border border-slate-300 bg-white px-3 text-[13.5px] text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)] focus:border-transparent"
        data-testid={testId}
      />
    </div>
  );
}

