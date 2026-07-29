// ShopifyDisconnectButton (Task #2918) — small "Disconnect" affordance on a
// connected-store row. Deliberately NO GoodTunes-side token revocation:
// disconnection happens by uninstalling the app in the Shopify admin, so
// the app/uninstalled webhook cleans us up properly and the row clears on
// its own. This button just explains that and deep-links to the store's
// Shopify apps settings page.
import { useState } from "react";
import { ExternalLink } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";

/** `your-store.myshopify.com` → `https://admin.shopify.com/store/your-store/settings/apps` */
export function shopifyAppsSettingsUrl(shopDomain: string): string {
  const handle = shopDomain.replace(/\.myshopify\.com$/i, "");
  return `https://admin.shopify.com/store/${handle}/settings/apps`;
}

export function ShopifyDisconnectButton({ shopDomain, testId }: { shopDomain: string; testId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[12px] text-slate-400 hover:text-slate-600 underline underline-offset-2 shrink-0"
        data-testid={testId}
      >
        Disconnect
      </button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent data-testid="dialog-shopify-disconnect">
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect {shopDomain}?</AlertDialogTitle>
            <AlertDialogDescription>
              Disconnecting removes GoodTunes from this store. You'll uninstall the app in your Shopify admin —
              we'll update here automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-disconnect-cancel">Cancel</AlertDialogCancel>
            <a
              href={shopifyAppsSettingsUrl(shopDomain)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800"
              data-testid="button-open-shopify-apps"
            >
              Open Shopify apps settings <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
