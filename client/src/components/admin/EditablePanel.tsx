import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Loader2, Check, X, ExternalLink } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

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

export type FieldType = "text" | "url" | "textarea";

export interface FieldConfig {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  // For url fields: optional inline icon to show next to the link in
  // read mode (e.g. Instagram glyph). Edit-mode UI is unchanged.
  readIcon?: React.ComponentType<{ className?: string }>;
}

export interface EditablePanelProps {
  title: string;
  testId?: string;
  // PUT endpoint. Must accept `{ [fieldKey]: value }` body shape.
  endpoint: string;
  // Current source-of-truth values, keyed by field key.
  values: Record<string, string | null | undefined>;
  fields: FieldConfig[];
  // Query keys to invalidate after a successful save. Each entry is the
  // full TanStack v5 array key. The list query for the entity should
  // also be included so card chrome updates immediately.
  invalidate: (readonly unknown[])[];
}

export function EditablePanel({
  title,
  testId,
  endpoint,
  values,
  fields,
  invalidate,
}: EditablePanelProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
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
      const next: Record<string, string> = {};
      for (const f of fields) next[f.key] = values[f.key] ?? "";
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
      const body: Record<string, string | null> = {};
      for (const f of fields) {
        const before = values[f.key] ?? "";
        const after = draft[f.key] ?? "";
        if (before !== after) {
          body[f.key] = after.trim() === "" ? null : after;
        }
      }
      if (Object.keys(body).length === 0) return null;
      await apiRequest("PUT", endpoint, body);
      return body;
    },
    onSuccess: async (changed) => {
      await Promise.all(
        invalidate.map((key) => qc.invalidateQueries({ queryKey: key })),
      );
      exitEdit();
      if (changed) toast({ title: `${title} updated` });
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
      if (f.required && !(draft[f.key] ?? "").trim()) {
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

  if (editing) {
    return (
      <form
        onSubmit={handleSave}
        className="rounded-2xl bg-white border border-[#319ED8]/40 shadow-sm p-6 space-y-5"
        data-testid={panelTestId}
        data-mode="edit"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-slate-900 text-[14px] font-bold">{title}</h2>
          <span className="text-[11px] text-[#319ED8] font-semibold uppercase tracking-wider">
            Editing
          </span>
        </div>
        {shortFields.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
            {shortFields.map((f, i) => (
              <EditInput
                key={f.key}
                field={f}
                value={draft[f.key] ?? ""}
                onChange={(v) =>
                  setDraft((d) => ({ ...d, [f.key]: v }))
                }
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
            value={draft[f.key] ?? ""}
            onChange={(v) => setDraft((d) => ({ ...d, [f.key]: v }))}
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
            className="h-8 px-3 rounded-md bg-[#319ED8] text-white text-[12px] font-semibold hover:bg-[#2890c8] inline-flex items-center gap-1.5 disabled:opacity-60"
            data-testid={`button-save-${slug}`}
          >
            {mut.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
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
      </div>
      {shortFields.length > 0 && (
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
          {shortFields.map((f) => (
            <ReadField
              key={f.key}
              field={f}
              value={values[f.key] ?? null}
            />
          ))}
        </dl>
      )}
      {longFields.map((f) => (
        <ReadField key={f.key} field={f} value={values[f.key] ?? null} />
      ))}
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
      <div data-testid={testId}>
        <dt className="text-slate-400 text-[10.5px] font-semibold uppercase tracking-wider mb-0.5">
          {field.label}
        </dt>
        <dd className="text-[13.5px]">
          {value ? (
            <a
              href={value}
              target="_blank"
              rel="noreferrer"
              className="text-[#319ED8] font-medium hover:underline inline-flex items-center gap-1"
            >
              {Icon && <Icon className="w-3.5 h-3.5 flex-shrink-0" />}
              <span className="truncate max-w-[320px]">
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

  return (
    <div data-testid={testId}>
      <dt className="text-slate-400 text-[10.5px] font-semibold uppercase tracking-wider mb-0.5">
        {field.label}
      </dt>
      <dd
        className={[
          "text-[13.5px]",
          value ? "text-slate-900 font-medium" : "text-slate-300 italic",
        ].join(" ")}
      >
        {value || "Not set"}
      </dd>
    </div>
  );
}

function EditInput({
  field,
  value,
  onChange,
  inputRef,
}: {
  field: FieldConfig;
  value: string;
  onChange: (next: string) => void;
  inputRef?:
    | React.RefObject<HTMLInputElement>
    | React.RefObject<HTMLTextAreaElement>;
}) {
  const slug = field.key
    .replace(/([A-Z])/g, "-$1")
    .toLowerCase();
  const testId = `input-${slug}`;
  const baseLabel = (
    <label className="text-slate-400 text-[10.5px] font-semibold uppercase tracking-wider block mb-1">
      {field.label}
      {field.required && (
        <span className="ml-1 text-[#FF5470] normal-case">·  required</span>
      )}
    </label>
  );

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
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-[13.5px] text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-[#319ED8] focus:border-transparent resize-y leading-relaxed"
          data-testid={testId}
        />
      </div>
    );
  }

  return (
    <div>
      {baseLabel}
      <input
        ref={inputRef as React.RefObject<HTMLInputElement> | undefined}
        type={field.type === "url" ? "url" : "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        className="w-full h-9 rounded-md border border-slate-300 bg-white px-3 text-[13.5px] text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-[#319ED8] focus:border-transparent"
        data-testid={testId}
      />
    </div>
  );
}
