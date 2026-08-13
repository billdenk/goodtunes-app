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
// Detail view is authored by another agent with EXACTLY these props —
// { pressId, specId, canEdit, onBack: () => void }. Trust the contract.
import { PressTemplateDetail } from "./PressTemplateDetail";
// Task #3098 — dedicated Test page, deep-linked via `&test=1` on top of the
// `?template=<specId>` scheme so refresh / back keep working.
import { PressTemplateTest } from "./PressTemplateTest";

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
  const [testView, setTestView] = useState<boolean>(
    () => new URLSearchParams(window.location.search).get("test") === "1",
  );

  useEffect(() => {
    const sp = new URLSearchParams(search);
    setSpecId(sp.get("template"));
    setTestView(sp.get("test") === "1");
  }, [search]);

  const writeUrl = (mutate: (sp: URLSearchParams) => void) => {
    const sp = new URLSearchParams(window.location.search);
    sp.set("tab", "templates");
    mutate(sp);
    history.replaceState(null, "", `${window.location.pathname}?${sp}`);
  };

  const openSpec = (id: string) => {
    setSpecId(id);
    setTestView(false);
    writeUrl((sp) => {
      sp.set("template", id);
      sp.delete("test");
    });
  };

  const openTest = () => {
    setTestView(true);
    writeUrl((sp) => sp.set("test", "1"));
  };

  const backToDetail = () => {
    setTestView(false);
    writeUrl((sp) => sp.delete("test"));
  };

  const onBack = () => {
    setSpecId(null);
    setTestView(false);
    writeUrl((sp) => {
      sp.delete("template");
      sp.delete("test");
    });
  };

  if (specId && testView) {
    return (
      <PressTemplateTest
        pressId={pressId}
        specId={specId}
        canEdit={canEdit}
        onBack={backToDetail}
        onBackToIndex={onBack}
      />
    );
  }

  if (specId) {
    return (
      <PressTemplateDetail
        pressId={pressId}
        specId={specId}
        canEdit={canEdit}
        onBack={onBack}
        onOpenTest={openTest}
      />
    );
  }

  return <PressTemplatesIndex pressId={pressId} onOpenSpec={openSpec} />;
}

export default PressTemplatesTab;
