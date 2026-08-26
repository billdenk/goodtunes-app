// Task #3394 — GoodTunes-side cross-press "My projects" view (held OFF).
//
// The one non-press-branded surface of the cross-press import: the
// customer's own account view of all their pressing projects across
// presses. Because it is GoodTunes-branded (never a white-label host), it
// MAY name the presses the customer worked with — that's their own account
// data, not a cross-press leak. Specs only; no price ever appears here.
//
// Flag-gated OFF at compile time (CROSS_PRESS_MY_PROJECTS_ENABLED in
// shared/crossPressImport.ts): while false, App.tsx never registers the
// route and the backing endpoint answers 404, so this file is unreachable.
// Plain components until Ruby's handoff lands
// (docs/handoff-briefs/cross-press-import-ruby.md).

import { useQuery } from '@tanstack/react-query';

type CrossPressProject = {
  id: string;
  title: string | null;
  savedAt: string | null;
  format: string | null;
  sizeId: string | null;
  colorName: string | null;
  colorTierName: string | null;
  jacketName: string | null;
  lastQuantity: number | null;
  pressName: string | null;
};

export default function MyProjects() {
  const { data, isLoading } = useQuery<{ projects: CrossPressProject[] }>({
    queryKey: ['/api/customer/cross-press-projects'],
    retry: false,
  });
  const projects = data?.projects ?? [];

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-bold tracking-tight" data-testid="heading-my-projects">
        My projects
      </h1>
      <p className="mt-2 text-sm opacity-70">
        All your pressing projects, in one place. Specs only — pricing always lives with the
        press you run each project with.
      </p>

      {isLoading && <p className="mt-8 text-sm opacity-70">Loading your projects…</p>}
      {!isLoading && projects.length === 0 && (
        <p className="mt-8 text-sm opacity-70" data-testid="text-no-projects">
          No pressing projects on your account yet.
        </p>
      )}

      <div className="mt-6 grid gap-3">
        {projects.map((p) => {
          const bits = [
            p.format,
            p.colorTierName,
            p.colorName,
            p.jacketName,
            p.lastQuantity ? `${p.lastQuantity.toLocaleString()} units` : null,
          ].filter(Boolean);
          return (
            <div
              key={p.id}
              className="rounded-lg border border-white/10 bg-white/5 px-4 py-3"
              data-testid={`card-project-${p.id}`}
            >
              <div className="flex items-baseline justify-between gap-4">
                <div className="font-semibold">{p.title ?? 'Untitled project'}</div>
                {p.pressName && <div className="text-xs opacity-60">{p.pressName}</div>}
              </div>
              <div className="mt-1 text-sm opacity-70">{bits.join(' · ') || 'Saved specs'}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
