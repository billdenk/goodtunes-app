import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, apiErrorBody, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CustomerUser } from "@shared/schema";

/**
 * AdminEditCustomerDialog — the operator-facing editor for a fan's core
 * identity (Task #2218).
 *
 * Lets a super_admin correct a customer's real name, display name, public
 * @handle, login email, deliverable contact email, and phone straight from
 * the Customer detail page. Styled to the GoodTunes admin guide (light
 * surface, dark high-contrast text, brand-blue Save) to match
 * AdminEditProfileDialog.
 *
 * The @handle mirrors `username` server-side (both globally unique). A
 * uniqueness clash comes back as a 409 carrying `{ field, message }`, which
 * we pin to the right input so the operator sees "that handle is taken" vs
 * "that email is taken" inline rather than as a generic toast. Addresses are
 * intentionally out of scope here (append-only Stripe snapshots).
 */
type FieldErrors = Partial<
  Record<"realName" | "displayName" | "handle" | "email" | "contactEmail" | "phone", string>
>;

export function AdminEditCustomerDialog({
  open,
  onOpenChange,
  customer,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customer: CustomerUser;
}) {
  const { toast } = useToast();

  const [realName, setRealName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [handle, setHandle] = useState("");
  const [email, setEmail] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  // Re-seed from the canonical record whenever the dialog opens (canceling =
  // closing without saving, so re-seeding on open discards unsaved edits).
  useEffect(() => {
    if (!open) return;
    setRealName(customer.realName || "");
    setDisplayName(customer.displayName || "");
    setHandle((customer.handle || customer.username || "").toLowerCase());
    setEmail(customer.email || "");
    setContactEmail(customer.contactEmail || "");
    setPhone(customer.phone || "");
    setFieldErrors({});
    setFormError(null);
  }, [open, customer.id]);

  const original = {
    realName: customer.realName || "",
    displayName: customer.displayName || "",
    handle: (customer.handle || customer.username || "").toLowerCase(),
    email: customer.email || "",
    contactEmail: customer.contactEmail || "",
    phone: customer.phone || "",
  };
  const isDirty =
    realName !== original.realName ||
    displayName !== original.displayName ||
    handle !== original.handle ||
    email !== original.email ||
    contactEmail !== original.contactEmail ||
    phone !== original.phone;

  const save = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("PATCH", `/api/admin/customers/${customer.id}`, {
        realName: realName.trim(),
        displayName: displayName.trim(),
        handle: handle.trim().toLowerCase(),
        email: email.trim(),
        contactEmail: contactEmail.trim(),
        phone: phone.trim(),
      });
      return r.json();
    },
    onSuccess: (profile: unknown) => {
      // The route returns the same payload GET serves, so drop it straight
      // into the cache and also invalidate to stay honest.
      queryClient.setQueryData(["/api/admin/customers", customer.id], profile);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/customers", customer.id] });
      toast({ title: "Identity updated", description: "The fan's details were saved." });
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      const body = apiErrorBody<{ field?: keyof FieldErrors; message?: string }>(err);
      if (body?.field && body.message) {
        setFieldErrors({ [body.field]: body.message });
        setFormError(null);
      } else {
        setFormError(body?.message || (err instanceof Error ? err.message : "Couldn't save those changes."));
      }
    },
  });

  const handleSave = () => {
    setFieldErrors({});
    setFormError(null);
    save.mutate();
  };

  const inputClass =
    "w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)]/40 focus:border-[var(--brand-blue)]";
  const errorClass = "border-[color:var(--brand-pink)] focus:ring-[color:var(--brand-pink)]/30";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md bg-white rounded-2xl border-slate-200 shadow-xl p-6 gap-5 text-slate-900"
        data-testid="dialog-admin-edit-customer"
      >
        <DialogHeader className="space-y-1">
          <DialogTitle
            className="text-slate-900 text-lg font-bold tracking-tight"
            data-testid="text-admin-edit-customer-title"
          >
            Edit customer
          </DialogTitle>
          <DialogDescription className="text-slate-500 text-sm">
            Correct this fan&apos;s identity. The @handle is kept unique across the app. Addresses
            stay read-only.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <label htmlFor="admin-cust-real-name" className="block text-xs font-semibold text-slate-700">
              Name
            </label>
            <input
              id="admin-cust-real-name"
              type="text"
              value={realName}
              onChange={(e) => setRealName(e.target.value)}
              placeholder="Full name"
              className={`${inputClass} ${fieldErrors.realName ? errorClass : ""}`}
              data-testid="input-admin-customer-real-name"
            />
            {fieldErrors.realName && (
              <p className="text-xs text-[color:var(--brand-pink)]">{fieldErrors.realName}</p>
            )}
          </div>

          {/* Display name */}
          <div className="space-y-1.5">
            <label htmlFor="admin-cust-display-name" className="block text-xs font-semibold text-slate-700">
              Display Name
            </label>
            <input
              id="admin-cust-display-name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="How their name shows"
              className={`${inputClass} ${fieldErrors.displayName ? errorClass : ""}`}
              data-testid="input-admin-customer-display-name"
            />
            {fieldErrors.displayName && (
              <p className="text-xs text-[color:var(--brand-pink)]">{fieldErrors.displayName}</p>
            )}
          </div>

          {/* Handle */}
          <div className="space-y-1.5">
            <label htmlFor="admin-cust-handle" className="block text-xs font-semibold text-slate-700">
              Handle
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                @
              </span>
              <input
                id="admin-cust-handle"
                type="text"
                value={handle}
                onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ""))}
                placeholder="handle"
                className={`${inputClass} pl-7 ${fieldErrors.handle ? errorClass : ""}`}
                data-testid="input-admin-customer-handle"
              />
            </div>
            {fieldErrors.handle ? (
              <p className="text-xs text-[color:var(--brand-pink)]">{fieldErrors.handle}</p>
            ) : (
              <p className="text-xs text-slate-400">
                3–30 characters: lowercase letters, numbers, dot, underscore, or hyphen. Mirrors their
                username.
              </p>
            )}
          </div>

          {/* Login email */}
          <div className="space-y-1.5">
            <label htmlFor="admin-cust-email" className="block text-xs font-semibold text-slate-700">
              Login Email
            </label>
            <input
              id="admin-cust-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className={`${inputClass} ${fieldErrors.email ? errorClass : ""}`}
              data-testid="input-admin-customer-email"
            />
            {fieldErrors.email && (
              <p className="text-xs text-[color:var(--brand-pink)]">{fieldErrors.email}</p>
            )}
          </div>

          {/* Contact email */}
          <div className="space-y-1.5">
            <label htmlFor="admin-cust-contact-email" className="block text-xs font-semibold text-slate-700">
              Contact Email
            </label>
            <input
              id="admin-cust-contact-email"
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="Optional — for receipts if login email is a relay"
              className={`${inputClass} ${fieldErrors.contactEmail ? errorClass : ""}`}
              data-testid="input-admin-customer-contact-email"
            />
            {fieldErrors.contactEmail && (
              <p className="text-xs text-[color:var(--brand-pink)]">{fieldErrors.contactEmail}</p>
            )}
          </div>

          {/* Phone */}
          <div className="space-y-1.5">
            <label htmlFor="admin-cust-phone" className="block text-xs font-semibold text-slate-700">
              Phone
            </label>
            <input
              id="admin-cust-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Optional"
              className={`${inputClass} ${fieldErrors.phone ? errorClass : ""}`}
              data-testid="input-admin-customer-phone"
            />
            {fieldErrors.phone && (
              <p className="text-xs text-[color:var(--brand-pink)]">{fieldErrors.phone}</p>
            )}
          </div>
        </div>

        {formError && (
          <p className="-mt-1 text-xs text-[color:var(--brand-pink)]" data-testid="text-admin-customer-error">
            {formError}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={save.isPending}
            className="text-slate-600 hover:text-slate-900"
            data-testid="button-admin-edit-customer-cancel"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={save.isPending || !isDirty}
            className="bg-[color:var(--brand-blue)] text-white hover:bg-[color:var(--brand-blue)]/90"
            data-testid="button-admin-edit-customer-save"
          >
            {save.isPending ? "Saving\u2026" : "Save changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
