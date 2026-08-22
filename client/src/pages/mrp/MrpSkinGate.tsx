// #3295 review gate — the MRP portal screens are Memphis's OWN skin, so a
// white-label host whose press does NOT carry the mrp-light skin must not
// mount them. Unknown/unskinned hosts fall back to the neutral landing
// instead of rendering another press's client data inside MRP chrome.
import { useEffect } from "react";
import { useLocation } from "wouter";
import { useWhitelabelBrand } from "@/hooks/useWhitelabelBrand";

export default function MrpSkinGate({ children }: { children: React.ReactNode }) {
  const { brand, isLoading } = useWhitelabelBrand();
  const [, navigate] = useLocation();
  const blocked = !isLoading && (!brand || !brand.known || brand.skin !== "mrp-light");
  useEffect(() => {
    if (blocked) navigate("/", { replace: true });
  }, [blocked, navigate]);
  if (isLoading || blocked) return null;
  return <>{children}</>;
}
