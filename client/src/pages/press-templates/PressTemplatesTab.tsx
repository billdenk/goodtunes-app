// PressTemplatesTab — container for the Templates tab in the press portal.
// Reads the `?template=<specId>` deep-link param: when set, renders the
// template detail; otherwise the index grid. Opening a template writes
// `?tab=templates&template=<specId>` (history.replaceState, merging existing
// params — mirrors PressPortal.handleTabChange); onBack deletes the param the
// same way. A local state is synced from wouter's useSearch so browser
// back/forward re-render correctly.

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearch } from "wouter";
import type { TemplatesPayload } from "./types";
import { PressTemplatesIndex } from "./PressTemplatesIndex";
// Live end-to-end GT-layer proof (handoff, Aug 14 2026) — reached from the
// index's upload sheet via `&livetest=1`; the chosen file rides the transit
// store, so a refresh on this URL bounces back to the index.
import PressTemplateLiveTest from "./PressTemplateLiveTest";

export function PressTemplatesTab({ pressId }: { pressId: string }) {
  const search = useSearch();

  // Staff (view-only) must not see edit affordances in the detail view —
  // canEdit comes from the server payload (same query the index uses, so
  // this is a cache hit, not a second request).
  const { data } = useQuery<TemplatesPayload>({
    queryKey: [`/api/press/${pressId}/templates`],
  });
  const canEdit = data?.canEdit ?? false;

  // Local state synced from the URL so browser back/forward re-render.
  const [specId, setSpecId] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get("template"),
  );
  const [liveTestView, setLiveTestView] = useState<boolean>(
    () => new URLSearchParams(window.location.search).get("livetest") === "1",
  );

  useEffect(() => {
    const sp = new URLSearchParams(search);
    setSpecId(sp.get("template"));
    setLiveTestView(sp.get("livetest") === "1");
  }, [search]);

  const writeUrl = (mutate: (sp: URLSearchParams) => void) => {
    const sp = new URLSearchParams(window.location.search);
    sp.set("tab", "templates");
    mutate(sp);
    history.replaceState(null, "", `${window.location.pathname}?${sp}`);
  };

  const openSpec = (id: string) => {
    setSpecId(id);
    writeUrl((sp) => {
      sp.set("template", id);
      sp.delete("test");
    });
  };

  const onBack = () => {
    setSpecId(null);
    setLiveTestView(false);
    writeUrl((sp) => {
      sp.delete("template");
      sp.delete("test");
      sp.delete("livetest");
    });
  };

  const openLiveTest = () => {
    setLiveTestView(true);
    writeUrl((sp) => sp.set("livetest", "1"));
  };

  const exitLiveTest = () => {
    setLiveTestView(false);
    writeUrl((sp) => sp.delete("livetest"));
  };

  if (liveTestView) {
    return <PressTemplateLiveTest pressId={pressId} canEdit={canEdit} onExit={exitLiveTest} />;
  }

  // Opening a template (?template=<id>) lands on the live-test instrument
  // reading the saved canon file — GT overlays + the Template → Art file →
  // Results flow (Bill, Aug 14 2026: the static record page is retired).
  if (specId) {
    return <PressTemplateLiveTest pressId={pressId} canEdit={canEdit} specId={specId} onExit={onBack} />;
  }

  return <PressTemplatesIndex pressId={pressId} onOpenSpec={openSpec} onOpenLiveTest={openLiveTest} />;
}

export default PressTemplatesTab;
