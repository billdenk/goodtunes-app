import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Bell, Plus, Trash2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  EVENTS_BY_PARTNER_KIND,
  PARTNER_NOTIFICATION_EVENT_META,
  PARTNER_NOTIFICATION_ROLES,
  PARTNER_NOTIFICATION_ROLE_LABELS,
  type PartnerNotificationKind,
  type PartnerNotificationRole,
} from "@shared/partnerNotifications";

type Recipient = {
  id: string;
  partnerKind: string;
  partnerId: string;
  name: string;
  channel: string;
  address: string;
  role: string;
  events: string[];
  createdAt: string | null;
  lastNotifiedAt: string | null;
};

function recipientsKey(kind: PartnerNotificationKind, id: string) {
  return ["/api/admin/partner-notifications", kind, id, "recipients"] as const;
}

export function useNotificationRecipientCount(
  kind: PartnerNotificationKind,
  id: string,
) {
  const { data } = useQuery<Recipient[]>({
    queryKey: recipientsKey(kind, id),
    enabled: !!id,
  });
  return data?.length ?? 0;
}

function fmtWhen(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function NotificationsCard({
  partnerKind,
  partnerId,
  partnerName,
}: {
  partnerKind: PartnerNotificationKind;
  partnerId: string;
  partnerName: string;
}) {
  const { toast } = useToast();
  const queryKey = recipientsKey(partnerKind, partnerId);
  const { data: recipients = [], isLoading } = useQuery<Recipient[]>({
    queryKey,
    enabled: !!partnerId,
  });

  const eventOptions = EVENTS_BY_PARTNER_KIND[partnerKind];
  const hasEvents = eventOptions.length > 0;

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [role, setRole] = useState<PartnerNotificationRole>("ops");
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [pendingDelete, setPendingDelete] = useState<Recipient | null>(null);

  const resetForm = () => {
    setName("");
    setAddress("");
    setRole("ops");
    setSelectedEvents([]);
    setAdding(false);
  };

  const create = useMutation({
    mutationFn: async () => {
      // Empty selection = subscribe to all events for this partner (and
      // any that ship later). Persist exactly what was picked.
      const r = await apiRequest(
        "POST",
        `/api/admin/partner-notifications/${partnerKind}/${partnerId}/recipients`,
        {
          name: name.trim(),
          address: address.trim(),
          channel: "email",
          role,
          events: selectedEvents,
        },
      );
      return (await r.json()) as Recipient;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: "Recipient added" });
      resetForm();
    },
    onError: (e: any) =>
      toast({ title: "Couldn't add recipient", description: e?.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/partner-notifications/recipients/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: "Recipient removed" });
      setPendingDelete(null);
    },
    onError: (e: any) =>
      toast({ title: "Couldn't remove recipient", description: e?.message, variant: "destructive" }),
  });

  const canSubmit = useMemo(
    () => name.trim().length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address.trim()),
    [name, address],
  );

  const toggleEvent = (key: string) =>
    setSelectedEvents((prev) =>
      prev.includes(key) ? prev.filter((e) => e !== key) : [...prev, key],
    );

  const eventSummary = (events: string[]): string => {
    if (!hasEvents) return "All notifications";
    if (events.length === 0) return "All events";
    return events
      .map((e) => PARTNER_NOTIFICATION_EVENT_META[e as keyof typeof PARTNER_NOTIFICATION_EVENT_META]?.label ?? e)
      .join(", ");
  };

  return (
    <div id="partner-notifications" className="rounded-lg border border-slate-200 bg-white p-5 space-y-4 scroll-mt-20" data-testid="card-notifications">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <Bell className="w-4 h-4 mt-0.5 text-slate-400" strokeWidth={1.75} />
          <div>
            <h2 className="text-slate-900 text-sm font-semibold">Notifications</h2>
            <p className="text-slate-500 text-xs mt-0.5 max-w-md">
              Who at {partnerName} gets emailed when GoodTunes events fire. Email only for now.
            </p>
          </div>
        </div>
        {!adding && (
          <Button
            variant="ghost"
            onClick={() => setAdding(true)}
            className="h-8 px-2.5 text-[color:var(--brand-blue)] hover:bg-[color:var(--brand-blue-soft)]"
            data-testid="button-add-recipient"
          >
            <Plus className="w-4 h-4 mr-1" />
            Add recipient
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="text-slate-400 text-sm py-3">Loading…</div>
      ) : recipients.length === 0 && !adding ? (
        <div className="text-slate-400 text-sm py-3" data-testid="text-no-recipients">
          No one is set up to be notified yet.
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {recipients.map((r) => (
            <li
              key={r.id}
              className="flex items-start justify-between gap-3 py-3"
              data-testid={`row-recipient-${r.id}`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-slate-900 text-sm font-medium truncate" data-testid={`text-recipient-name-${r.id}`}>
                    {r.name}
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 bg-slate-100 rounded px-1.5 py-0.5">
                    {PARTNER_NOTIFICATION_ROLE_LABELS[r.role as PartnerNotificationRole] ?? r.role}
                  </span>
                </div>
                <a
                  href={`mailto:${r.address}`}
                  className="text-xs text-slate-500 hover:text-[color:var(--brand-blue)] hover:underline underline-offset-2 transition-colors break-all"
                  data-testid={`link-recipient-email-${r.id}`}
                >
                  {r.address}
                </a>
                <div className="text-xs text-slate-400 mt-0.5">{eventSummary(r.events)}</div>
                {r.lastNotifiedAt && (
                  <div className="text-xs text-slate-400 mt-0.5" data-testid={`text-last-notified-${r.id}`}>
                    Last notified: {fmtWhen(r.lastNotifiedAt)}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setPendingDelete(r)}
                className="shrink-0 text-slate-300 hover:text-rose-600 transition-colors p-1.5 rounded-md hover:bg-rose-50"
                aria-label={`Remove ${r.name}`}
                data-testid={`button-remove-recipient-${r.id}`}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <div className="rounded-md border border-slate-200 bg-slate-50/60 p-4 space-y-3" data-testid="form-add-recipient">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1">Name</span>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Ops"
                className="h-9"
                data-testid="input-recipient-name"
              />
            </label>
            <label className="block">
              <span className="block text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1">Email</span>
              <Input
                type="email"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="jane@example.com"
                className="h-9"
                data-testid="input-recipient-email"
              />
            </label>
          </div>
          <label className="block">
            <span className="block text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1">Role</span>
            <Select value={role} onValueChange={(v) => setRole(v as PartnerNotificationRole)}>
              <SelectTrigger className="h-9 w-full sm:w-56" data-testid="select-recipient-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PARTNER_NOTIFICATION_ROLES.map((r) => (
                  <SelectItem key={r} value={r} data-testid={`option-role-${r}`}>
                    {PARTNER_NOTIFICATION_ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          {hasEvents ? (
            <div>
              <span className="block text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1.5">
                Notify about
              </span>
              <div className="space-y-2">
                {eventOptions.map((key) => (
                  <label
                    key={key}
                    className="flex items-start gap-2.5 cursor-pointer"
                    data-testid={`toggle-event-${key}`}
                  >
                    <Checkbox
                      checked={selectedEvents.includes(key)}
                      onCheckedChange={() => toggleEvent(key)}
                      className="mt-0.5"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm text-slate-800">
                        {PARTNER_NOTIFICATION_EVENT_META[key].label}
                      </span>
                      <span className="block text-xs text-slate-400">
                        {PARTNER_NOTIFICATION_EVENT_META[key].description}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Leave all unchecked to receive every notification, including new event types.
              </p>
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              No automated notifications route to this partner type yet — recipients you add here
              are saved and will receive notifications once events are wired.
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button
              variant="ghost"
              onClick={resetForm}
              className="h-9 text-slate-500"
              data-testid="button-cancel-recipient"
            >
              Cancel
            </Button>
            <Button
              onClick={() => create.mutate()}
              disabled={!canSubmit || create.isPending}
              className="h-9 bg-[color:var(--brand-blue)] text-white hover:bg-[color:var(--brand-blue)]/90"
              data-testid="button-save-recipient"
            >
              {create.isPending ? "Adding…" : "Add recipient"}
            </Button>
          </div>
        </div>
      )}

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {pendingDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.name} ({pendingDelete?.address}) will stop receiving GoodTunes
              notifications for {partnerName}. Past send history is kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-remove">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingDelete && remove.mutate(pendingDelete.id)}
              className="bg-rose-600 hover:bg-rose-700"
              data-testid="button-confirm-remove"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Small header pill — "Notifications: N recipients". Always rendered
// (including the 0-recipient setup state) and links to the Notifications
// card so the operator can jump straight to setup. `onActivate` lets a
// page switch to the tab that hosts the card before scrolling to it.
export function NotificationsBadge({
  partnerKind,
  partnerId,
  onActivate,
}: {
  partnerKind: PartnerNotificationKind;
  partnerId: string;
  onActivate?: () => void;
}) {
  const count = useNotificationRecipientCount(partnerKind, partnerId);
  const empty = count === 0;
  const jump = () => {
    onActivate?.();
    // Defer the scroll so any tab switch has mounted the card first.
    requestAnimationFrame(() => {
      document.getElementById("partner-notifications")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  };
  return (
    <button
      type="button"
      onClick={jump}
      className={
        "inline-flex items-center gap-1 rounded-full text-xs font-semibold px-2 py-0.5 transition-colors " +
        (empty
          ? "bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          : "bg-slate-100 text-slate-600 hover:bg-slate-200")
      }
      data-testid="badge-notifications"
      title="Manage notification recipients"
    >
      <Bell className="w-3 h-3" strokeWidth={2} />
      {empty ? "Notifications: set up" : `Notifications: ${count} recipient${count === 1 ? "" : "s"}`}
    </button>
  );
}
