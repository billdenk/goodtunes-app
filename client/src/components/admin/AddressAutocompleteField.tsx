import { useEffect, useRef, useState, forwardRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

/**
 * Admin address input with Google Places autocomplete. Used everywhere
 * the admin types an address (vendor/maker/reseller/press/label/FP
 * shipping). When `GOOGLE_PLACES_API_KEY` isn't configured the field
 * degrades to a plain text input — no broken popover, no toast spam.
 *
 * The value is the formatted address string (what the user sees + what
 * lands in the existing `location`/`shippingAddress` text columns).
 * `onAddress` fires with the full normalized snapshot on selection so
 * future jsonb adopters can store structured fields too.
 *
 * Session-token billing: Places bills autocomplete-then-details as one
 * billable session iff the same token is forwarded on every keystroke
 * and the final details call. We mint a UUID on first keystroke after
 * a selection and replay it for the rest of that burst.
 */
export type NormalizedAddress = {
  formatted: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
};

interface PlacesStatus {
  configured: boolean;
}

interface Suggestion {
  placeId: string;
  text: string;
  mainText: string;
  secondaryText: string;
}

export function usePlacesStatus() {
  return useQuery<PlacesStatus>({
    queryKey: ["/api/admin/places/status"],
    staleTime: 1000 * 60 * 10,
  });
}

function newSessionToken(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export interface AddressAutocompleteFieldProps {
  value: string;
  onChange: (next: string) => void;
  onAddress?: (snapshot: NormalizedAddress) => void;
  placeholder?: string;
  testId?: string;
  className?: string;
  /** When true, render plain <input> with no probe — used as the
   * fallback path when status reports `configured: false`. */
  disabledAutocomplete?: boolean;
}

export const AddressAutocompleteField = forwardRef<
  HTMLInputElement,
  AddressAutocompleteFieldProps
>(function AddressAutocompleteField(
  {
    value,
    onChange,
    onAddress,
    placeholder,
    testId,
    className,
    disabledAutocomplete,
  },
  ref,
) {
  const status = usePlacesStatus();
  const configured = !disabledAutocomplete && status.data?.configured === true;

  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [highlight, setHighlight] = useState(0);
  const [loading, setLoading] = useState(false);
  const sessionTokenRef = useRef<string>("");
  const debounceRef = useRef<number | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const lastQueryRef = useRef<string>("");

  // Close on click-outside.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function ensureSessionToken() {
    if (!sessionTokenRef.current) sessionTokenRef.current = newSessionToken();
    return sessionTokenRef.current;
  }

  async function fetchSuggestions(q: string) {
    if (!configured) return;
    if (q.trim().length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    lastQueryRef.current = q;
    setLoading(true);
    try {
      const token = ensureSessionToken();
      const url = `/api/admin/places/autocomplete?q=${encodeURIComponent(
        q,
      )}&sessiontoken=${encodeURIComponent(token)}`;
      const r = await fetch(url, { credentials: "include" });
      if (!r.ok) {
        setSuggestions([]);
        return;
      }
      const data = (await r.json()) as {
        configured?: boolean;
        suggestions?: Suggestion[];
      };
      // Ignore late responses.
      if (lastQueryRef.current !== q) return;
      const next = data.suggestions ?? [];
      setSuggestions(next);
      setHighlight(0);
      setOpen(next.length > 0);
    } catch {
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }

  function handleInput(next: string) {
    onChange(next);
    if (!configured) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      void fetchSuggestions(next);
    }, 180);
  }

  async function selectSuggestion(s: Suggestion) {
    setOpen(false);
    setSuggestions([]);
    const token = ensureSessionToken();
    try {
      const r = await apiRequest(
        "GET",
        `/api/admin/places/details?placeId=${encodeURIComponent(
          s.placeId,
        )}&sessiontoken=${encodeURIComponent(token)}`,
      );
      const data = (await r.json()) as {
        address?: NormalizedAddress;
      };
      if (data.address) {
        onChange(data.address.formatted || s.text);
        onAddress?.(data.address);
      } else {
        onChange(s.text);
      }
    } catch {
      onChange(s.text);
    } finally {
      // Reset the session token — next keystroke starts a new billing
      // session per Google's pricing model.
      sessionTokenRef.current = "";
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      void selectSuggestion(suggestions[highlight]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const inputCls =
    className ??
    "w-full h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)] focus:border-transparent";

  return (
    <div ref={wrapRef} className="relative">
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={(e) => handleInput(e.target.value)}
        onKeyDown={handleKey}
        onFocus={() => {
          if (suggestions.length > 0) setOpen(true);
        }}
        placeholder={placeholder}
        className={inputCls}
        data-testid={testId}
        autoComplete="off"
        spellCheck={false}
      />
      {open && suggestions.length > 0 && (
        <div
          className="absolute z-30 mt-1 left-0 right-0 max-h-72 overflow-auto rounded-md border border-slate-200 bg-white shadow-lg"
          data-testid={
            testId ? `${testId}-suggestions` : "address-suggestions"
          }
        >
          {suggestions.map((s, i) => (
            <button
              key={s.placeId}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => void selectSuggestion(s)}
              onMouseEnter={() => setHighlight(i)}
              className={[
                "w-full text-left px-3 py-2 flex items-start gap-2 border-b border-slate-100 last:border-b-0",
                i === highlight ? "bg-slate-100" : "bg-white hover:bg-slate-50",
              ].join(" ")}
              data-testid={
                testId ? `${testId}-suggestion-${i}` : `address-suggestion-${i}`
              }
            >
              <MapPin className="w-3.5 h-3.5 mt-0.5 text-slate-400 flex-shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-slate-900 truncate">
                  {s.mainText || s.text}
                </span>
                {s.secondaryText && (
                  <span className="block text-xs text-slate-500 truncate">
                    {s.secondaryText}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
      {configured && loading && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">
          …
        </div>
      )}
    </div>
  );
});

/**
 * One-time admin banner shown across admin shells when the Places key
 * isn't set. Sits dormant when configured. Dismissal is per-browser
 * (localStorage); the next refresh after a key is added makes it stop
 * showing entirely because the probe flips to `configured: true`.
 */
const DISMISS_KEY = "gt.places-banner.dismissed.v1";

export function PlacesBanner() {
  const status = usePlacesStatus();
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  });
  if (status.isLoading) return null;
  if (status.data?.configured) return null;
  if (dismissed) return null;
  return (
    <div
      className="rounded-2xl border border-[var(--apple-hairline,#e6e6ea)] bg-white px-4 py-2.5 text-xs flex items-start gap-3"
      data-testid="banner-places-unconfigured"
    >
      <span
        className="mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ background: "var(--apple-warning, #c98a00)" }}
        aria-hidden
      />
      <div className="flex-1 min-w-0">
        <span className="font-semibold text-[var(--apple-ink,#1d1d1f)]">
          Address autocomplete is off.
        </span>{" "}
        <span className="text-[var(--apple-subink,#6e6e73)]">
          Set <code className="font-mono text-xs">GOOGLE_PLACES_API_KEY</code>{" "}
          in Secrets (Google Cloud project, Places API enabled, billing on) to
          turn on Places suggestions in every admin address field.
        </span>
      </div>
      <button
        type="button"
        onClick={() => {
          window.localStorage.setItem(DISMISS_KEY, "1");
          setDismissed(true);
        }}
        className="text-xs font-medium rounded-full px-2.5 py-1 text-[var(--apple-subink,#6e6e73)] hover:bg-[#f0f0f2] transition-colors"
        data-testid="button-dismiss-places-banner"
      >
        Dismiss
      </button>
    </div>
  );
}
