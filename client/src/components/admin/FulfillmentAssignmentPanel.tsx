// Task #2703 — album Physical → Fulfillment sub-tab panel.
//
// One place a press or operator assigns where this release ships from:
// a fulfillment warehouse partner, the press itself (self-fulfill), a
// saved "Other" custom company, or a brand-new company entered inline
// ("Other…"). When the picked destination is a custom company, its full
// contact card (contact person, phone, email, address, residential flag,
// notes) renders below the picker — that card is only ever seen by the
// press and super admins (the server returns [] destinations for every
// other role, and AdminAlbum only mounts this panel for those viewers).
//
// Separately, the "Customers see" block edits the album's customer-facing
// shipper display name — what the order-shipped email says the record was
// shipped by. Blank means the platform default, "GoodTunes"; fans never
// see the real fulfillment company unless the operator deliberately types
// it here.
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Pencil, Truck } from "lucide-react";

export interface FulfillmentDestOption {
  id: string;
  kind: "partner" | "manufacturer" | "custom";
  name: string;
  isDefault?: boolean;
  city?: string | null;
  country?: string | null;
  companyName?: string | null;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  isResidential?: boolean;
  addressLine1?: string | null;
  addressLine2?: string | null;
  state?: string | null;
  postalCode?: string | null;
  notes?: string | null;
}

const INPUT_CLS =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[var(--brand-blue)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-blue)] disabled:opacity-60";

const OTHER_NEW = "__other_new__";

type ContactDraft = {
  companyName: string;
  contactName: string;
  phone: string;
  email: string;
  isResidential: boolean;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  notes: string;
};

const EMPTY_DRAFT: ContactDraft = {
  companyName: "",
  contactName: "",
  phone: "",
  email: "",
  isResidential: false,
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "",
  notes: "",
};

function draftFromDest(d: FulfillmentDestOption): ContactDraft {
  return {
    companyName: d.companyName ?? "",
    contactName: d.contactName ?? "",
    phone: d.phone ?? "",
    email: d.email ?? "",
    isResidential: !!d.isResidential,
    addressLine1: d.addressLine1 ?? "",
    addressLine2: d.addressLine2 ?? "",
    city: d.city ?? "",
    state: d.state ?? "",
    postalCode: d.postalCode ?? "",
    country: d.country ?? "",
    notes: d.notes ?? "",
  };
}

function ContactFields({
  draft,
  setDraft,
  idPrefix,
}: {
  draft: ContactDraft;
  setDraft: (next: ContactDraft) => void;
  idPrefix: string;
}) {
  const set = (patch: Partial<ContactDraft>) => setDraft({ ...draft, ...patch });
  return (
    <div className="space-y-2">
      <input placeholder="Company name" value={draft.companyName} onChange={(e) => set({ companyName: e.target.value })} className={INPUT_CLS} data-testid={`input-${idPrefix}-company`} />
      <input placeholder="Contact name" value={draft.contactName} onChange={(e) => set({ contactName: e.target.value })} className={INPUT_CLS} data-testid={`input-${idPrefix}-contact`} />
      <div className="grid grid-cols-2 gap-2">
        <input placeholder="Phone" value={draft.phone} onChange={(e) => set({ phone: e.target.value })} className={INPUT_CLS} data-testid={`input-${idPrefix}-phone`} />
        <input placeholder="Email" value={draft.email} onChange={(e) => set({ email: e.target.value })} className={INPUT_CLS} data-testid={`input-${idPrefix}-email`} />
      </div>
      <input placeholder="Address line 1" value={draft.addressLine1} onChange={(e) => set({ addressLine1: e.target.value })} className={INPUT_CLS} data-testid={`input-${idPrefix}-line1`} />
      <input placeholder="Address line 2 (optional)" value={draft.addressLine2} onChange={(e) => set({ addressLine2: e.target.value })} className={INPUT_CLS} data-testid={`input-${idPrefix}-line2`} />
      <div className="grid grid-cols-2 gap-2">
        <input placeholder="City" value={draft.city} onChange={(e) => set({ city: e.target.value })} className={INPUT_CLS} data-testid={`input-${idPrefix}-city`} />
        <input placeholder="State" value={draft.state} onChange={(e) => set({ state: e.target.value })} className={INPUT_CLS} data-testid={`input-${idPrefix}-state`} />
        <input placeholder="Postal code" value={draft.postalCode} onChange={(e) => set({ postalCode: e.target.value })} className={INPUT_CLS} data-testid={`input-${idPrefix}-postal`} />
        <input placeholder="Country" value={draft.country} onChange={(e) => set({ country: e.target.value })} className={INPUT_CLS} data-testid={`input-${idPrefix}-country`} />
      </div>
      <label className="flex items-center gap-2 text-xs text-slate-600">
        <input
          type="checkbox"
          checked={draft.isResidential}
          onChange={(e) => set({ isResidential: e.target.checked })}
          data-testid={`checkbox-${idPrefix}-residential`}
        />
        Residential address
      </label>
      <textarea placeholder="Notes (optional)" value={draft.notes} onChange={(e) => set({ notes: e.target.value })} className={`${INPUT_CLS} min-h-[60px]`} data-testid={`input-${idPrefix}-notes`} />
    </div>
  );
}

function draftToBody(draft: ContactDraft) {
  return {
    name: draft.companyName.trim() || null,
    contactName: draft.contactName.trim() || null,
    phone: draft.phone.trim() || null,
    email: draft.email.trim() || null,
    isResidential: draft.isResidential,
    addressLine1: draft.addressLine1.trim() || null,
    addressLine2: draft.addressLine2.trim() || null,
    city: draft.city.trim() || null,
    state: draft.state.trim() || null,
    postalCode: draft.postalCode.trim() || null,
    country: draft.country.trim() || null,
    notes: draft.notes.trim() || null,
  };
}

export function FulfillmentAssignmentPanel({
  albumId,
  fulfillmentPartnerId,
  fulfillmentManufacturerId,
  fulfillmentDestinationId,
  shipperDisplayName,
}: {
  albumId: string;
  fulfillmentPartnerId: string | null;
  fulfillmentManufacturerId: string | null;
  fulfillmentDestinationId: string | null;
  shipperDisplayName: string | null;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: dests = [] } = useQuery<FulfillmentDestOption[]>({
    queryKey: ["/api/fulfillment-destinations"],
  });
  // When split rows exist they take routing precedence — say so instead
  // of pretending the single pick governs.
  const { data: splits = [] } = useQuery<{ id: string }[]>({
    queryKey: ["/api/admin/albums", albumId, "fulfillment-splits"],
  });

  const currentId =
    fulfillmentPartnerId ?? fulfillmentManufacturerId ?? fulfillmentDestinationId ?? "";
  const [selectedId, setSelectedId] = useState<string>(currentId);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setSelectedId(currentId);
  }, [albumId, currentId]);

  // "Other…" inline create form
  const [newDraft, setNewDraft] = useState<ContactDraft>(EMPTY_DRAFT);
  const creatingNew = selectedId === OTHER_NEW;

  // Contact-card edit for the picked custom destination
  const [editingContact, setEditingContact] = useState(false);
  const [contactDraft, setContactDraft] = useState<ContactDraft>(EMPTY_DRAFT);
  const [savingContact, setSavingContact] = useState(false);

  // Customer-facing shipper display name
  const [shipperDraft, setShipperDraft] = useState(shipperDisplayName ?? "");
  const [savingShipper, setSavingShipper] = useState(false);
  useEffect(() => {
    setShipperDraft(shipperDisplayName ?? "");
  }, [albumId, shipperDisplayName]);

  const selectedDest = dests.find((d) => d.id === selectedId);
  const currentDest = dests.find((d) => d.id === currentId);
  const dirty = selectedId !== currentId && !creatingNew;

  async function saveAlbumDestination(destId: string, kind: string | null) {
    const body: Record<string, string | null> = {
      fulfillmentPartnerId: null,
      fulfillmentManufacturerId: null,
      fulfillmentDestinationId: null,
    };
    if (destId && kind === "partner") body.fulfillmentPartnerId = destId;
    else if (destId && kind === "manufacturer") body.fulfillmentManufacturerId = destId;
    else if (destId && kind === "custom") body.fulfillmentDestinationId = destId;
    await apiRequest("PUT", `/api/admin/albums/${albumId}`, body);
    await qc.invalidateQueries({ queryKey: ["/api/albums", albumId] });
  }

  async function handleSaveSelection() {
    setSaving(true);
    try {
      await saveAlbumDestination(selectedId, selectedDest?.kind ?? null);
      toast({ title: "Fulfillment destination saved." });
    } catch {
      toast({ title: "Could not save fulfillment destination", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateOther() {
    if (!newDraft.companyName.trim() && !newDraft.contactName.trim()) {
      toast({ title: "Company or contact name is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await apiRequest(
        "POST",
        "/api/admin/fulfillment-destinations",
        draftToBody(newDraft),
      );
      const created = await res.json();
      await qc.invalidateQueries({ queryKey: ["/api/fulfillment-destinations"] });
      await saveAlbumDestination(created.id, "custom");
      setSelectedId(created.id);
      setNewDraft(EMPTY_DRAFT);
      toast({ title: "Company saved and assigned." });
    } catch {
      toast({ title: "Could not save company", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveContact() {
    if (!currentDest) return;
    setSavingContact(true);
    try {
      await apiRequest(
        "PUT",
        `/api/admin/fulfillment-destinations/${currentDest.id}`,
        draftToBody(contactDraft),
      );
      await qc.invalidateQueries({ queryKey: ["/api/fulfillment-destinations"] });
      setEditingContact(false);
      toast({ title: "Contact saved." });
    } catch {
      toast({ title: "Could not save contact", variant: "destructive" });
    } finally {
      setSavingContact(false);
    }
  }

  async function handleSaveShipper() {
    setSavingShipper(true);
    try {
      await apiRequest("PUT", `/api/admin/albums/${albumId}`, {
        shipperDisplayName: shipperDraft.trim() || null,
      });
      await qc.invalidateQueries({ queryKey: ["/api/albums", albumId] });
      toast({ title: "Shipper display name saved." });
    } catch {
      toast({ title: "Could not save shipper display name", variant: "destructive" });
    } finally {
      setSavingShipper(false);
    }
  }

  const group = (kind: FulfillmentDestOption["kind"], label: string) => {
    const rows = dests.filter((d) => d.kind === kind);
    if (rows.length === 0) return null;
    return (
      <optgroup label={label}>
        {rows.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
            {d.kind === "custom" && d.city ? ` — ${d.city}` : ""}
          </option>
        ))}
      </optgroup>
    );
  };

  const addr = currentDest
    ? [
        currentDest.addressLine1,
        currentDest.addressLine2,
        [currentDest.city, currentDest.state, currentDest.postalCode].filter(Boolean).join(", "),
        currentDest.country,
      ].filter((s) => s && String(s).trim())
    : [];

  return (
    <div className="space-y-4" data-testid="panel-fulfillment-assignment">
      {/* ── Destination picker ─────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2 mb-1">
          <Truck className="w-4 h-4 text-slate-400" />
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Fulfillment destination
          </p>
        </div>
        <p className="text-xs text-slate-400 mb-3">
          Who ships this release to customers: a fulfillment warehouse, the press
          itself, or another company.
        </p>
        {splits.length > 0 && (
          <p
            className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700"
            data-testid="note-fulfillment-splits-precedence"
          >
            Split shipments are configured on the Overview tab — those rows take
            precedence over this single destination.
          </p>
        )}
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className={INPUT_CLS}
          data-testid="select-fulfillment-destination"
        >
          <option value="">— Platform default —</option>
          {group("partner", "Fulfillment warehouses")}
          {group("manufacturer", "Press (self-fulfill)")}
          {group("custom", "Other companies")}
          <option value={OTHER_NEW}>Other… (add a company)</option>
        </select>

        {creatingNew && (
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
            <p className="text-xs font-semibold text-slate-700">New fulfillment company</p>
            <ContactFields draft={newDraft} setDraft={setNewDraft} idPrefix="fulfillment-new" />
            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                size="sm"
                onClick={handleCreateOther}
                disabled={saving || (!newDraft.companyName.trim() && !newDraft.contactName.trim())}
                data-testid="btn-save-fulfillment-new"
              >
                {saving ? "Saving…" : "Save & assign"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSelectedId(currentId)}
                data-testid="btn-cancel-fulfillment-new"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {dirty && (
          <div className="flex gap-2 mt-3">
            <Button
              type="button"
              size="sm"
              onClick={handleSaveSelection}
              disabled={saving}
              data-testid="btn-save-fulfillment-destination"
            >
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setSelectedId(currentId)}
              data-testid="btn-cancel-fulfillment-destination"
            >
              Cancel
            </Button>
          </div>
        )}
      </div>

      {/* ── Contact card (custom destinations only) ────────────────── */}
      {currentDest?.kind === "custom" && (
        <div
          className="rounded-xl border border-slate-200 bg-white p-4"
          data-testid="card-fulfillment-contact"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Contact
            </p>
            {!editingContact && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-slate-400"
                onClick={() => {
                  setContactDraft(draftFromDest(currentDest));
                  setEditingContact(true);
                }}
                data-testid="btn-edit-fulfillment-contact"
              >
                <Pencil className="w-4 h-4" />
              </Button>
            )}
          </div>
          {!editingContact ? (
            <div className="mt-2 space-y-1 text-sm text-slate-900">
              {currentDest.companyName && (
                <p className="font-semibold" data-testid="text-contact-company">
                  {currentDest.companyName}
                </p>
              )}
              {currentDest.contactName && (
                <p data-testid="text-contact-name">{currentDest.contactName}</p>
              )}
              {currentDest.phone && (
                <p className="text-slate-600" data-testid="text-contact-phone">
                  {currentDest.phone}
                </p>
              )}
              {currentDest.email && (
                <p className="text-slate-600" data-testid="text-contact-email">
                  {currentDest.email}
                </p>
              )}
              {addr.length > 0 && (
                <p className="text-slate-600" data-testid="text-contact-address">
                  {addr.join(" · ")}
                  {currentDest.isResidential ? " (residential)" : ""}
                </p>
              )}
              {currentDest.notes && (
                <p className="text-xs text-slate-400" data-testid="text-contact-notes">
                  {currentDest.notes}
                </p>
              )}
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              <ContactFields
                draft={contactDraft}
                setDraft={setContactDraft}
                idPrefix="fulfillment-contact"
              />
              <div className="flex gap-2 pt-1">
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSaveContact}
                  disabled={savingContact}
                  data-testid="btn-save-fulfillment-contact"
                >
                  {savingContact ? "Saving…" : "Save"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditingContact(false)}
                  data-testid="btn-cancel-fulfillment-contact"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Customer-facing shipper identity ───────────────────────── */}
      <div
        className="rounded-xl border border-slate-200 bg-white p-4"
        data-testid="card-shipper-display"
      >
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
          Customers see
        </p>
        <p className="text-xs text-slate-400 mt-1 mb-3">
          The shipper name shown to customers (for example in the "your record
          shipped" email). Leave blank for the default, GoodTunes.
        </p>
        <input
          placeholder="GoodTunes"
          value={shipperDraft}
          onChange={(e) => setShipperDraft(e.target.value)}
          className={INPUT_CLS}
          data-testid="input-shipper-display-name"
        />
        {(shipperDraft.trim() || "") !== (shipperDisplayName ?? "").trim() && (
          <div className="flex gap-2 mt-3">
            <Button
              type="button"
              size="sm"
              onClick={handleSaveShipper}
              disabled={savingShipper}
              data-testid="btn-save-shipper-display"
            >
              {savingShipper ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShipperDraft(shipperDisplayName ?? "")}
              data-testid="btn-cancel-shipper-display"
            >
              Cancel
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
