import { Component, type ReactNode } from "react";

/**
 * Customer-facing error boundary. Renders a dark, brand-styled card with
 * the actual error message + a short stack so when something throws on
 * mobile Safari we get a screenshot we can act on, instead of a silent
 * blank gradient. Wraps the whole Router in App.tsx.
 */
export class GlobalErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null; info: string | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null, info: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error, info: null };
  }
  componentDidCatch(error: Error, info: { componentStack?: string }) {
    console.error("[GlobalErrorBoundary]", error, info);
    this.setState({ info: info?.componentStack ?? null });
  }
  reset = () => this.setState({ error: null, info: null });
  reload = () => window.location.reload();
  render() {
    if (!this.state.error) return this.props.children;
    const e = this.state.error;
    const stack = (e.stack ?? "").split("\n").slice(0, 6).join("\n");
    const comp = (this.state.info ?? "").split("\n").slice(0, 6).join("\n");
    return (
      <main
        className="min-h-screen w-full bg-[#00062B] text-white p-5 overflow-auto"
        data-testid="global-error-boundary"
      >
        <div className="max-w-[440px] mx-auto pt-10">
          <h1 className="text-[22px] font-bold mb-1">Something broke</h1>
          <p className="text-white/70 text-[13px] mb-4">
            Screenshot this and send it over — it tells us exactly what crashed.
          </p>
          <div className="rounded-xl bg-[#FF5470]/10 border border-[#FF5470]/30 p-4 mb-4">
            <div className="text-[#FF5470] font-semibold text-[14px] mb-2">
              {e.name || "Error"}
            </div>
            <div className="text-white text-[13px] break-words mb-3 font-mono">
              {e.message || "(no message)"}
            </div>
            {stack && (
              <pre className="text-white/60 text-[10px] font-mono whitespace-pre-wrap break-all mb-2">
                {stack}
              </pre>
            )}
            {comp && (
              <pre className="text-white/40 text-[10px] font-mono whitespace-pre-wrap break-all">
                {comp}
              </pre>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={this.reset}
              className="flex-1 h-11 rounded-lg bg-[#319ED8] text-white font-semibold text-[14px] active:opacity-70"
              data-testid="button-error-retry"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={this.reload}
              className="flex-1 h-11 rounded-lg bg-white/10 text-white font-semibold text-[14px] active:opacity-70"
              data-testid="button-error-reload"
            >
              Reload
            </button>
          </div>
        </div>
      </main>
    );
  }
}
