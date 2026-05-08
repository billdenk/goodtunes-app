import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { GoodTunesLogo } from "@/components/GoodTunesLogo";

export function Login() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const { login, register, isLoginPending, isRegisterPending, loginError, registerError } = useAuth();
  const [, navigate] = useLocation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (mode === "login") {
        await login({ username, password });
      } else {
        await register({ username, displayName, password });
      }
      navigate("/collection");
    } catch {}
  };

  const isPending = mode === "login" ? isLoginPending : isRegisterPending;
  const error = mode === "login" ? loginError : registerError;

  return (
    <main className="min-h-screen w-full bg-[#00062B] flex justify-center items-center">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full opacity-25" style={{ background: "radial-gradient(circle, #319ED8, transparent)" }} />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full opacity-20" style={{ background: "radial-gradient(circle, #7F10A7, transparent)" }} />
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-80 h-80 rounded-full opacity-10" style={{ background: "radial-gradient(circle, #4AFFCA, transparent)" }} />
      </div>

      <div className="relative w-full max-w-[390px] px-6">
        <div className="flex flex-col items-center mb-10">
          <GoodTunesLogo size="lg" className="mb-4" />
          <p className="text-white/40 text-sm text-center mt-3">
            {mode === "login" ? "Sign in to access your collection." : "Create your account to get started."}
          </p>
        </div>

        <div className="relative flex mb-6 p-1 rounded-2xl" style={{ background: "rgba(255,255,255,0.07)" }}>
          <div
            className="absolute top-1 bottom-1 rounded-xl transition-all duration-200"
            style={{
              width: "calc(50% - 4px)",
              left: mode === "login" ? "4px" : "calc(50%)",
              background: "rgba(255,255,255,0.15)",
              boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
            }}
          />
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`relative flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors duration-150 ${mode === "login" ? "text-white" : "text-white/35"}`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => setMode("register")}
            className={`relative flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors duration-150 ${mode === "register" ? "text-white" : "text-white/35"}`}
          >
            Create Account
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {mode === "register" && (
            <div>
              <label className="text-white/50 text-xs font-medium uppercase tracking-wider block mb-1.5 ml-1">Display Name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your full name"
                className="w-full border border-white/10 rounded-2xl px-4 py-3.5 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#319ED8] transition-colors"
                style={{ background: "rgba(255,255,255,0.06)" }}
                required
              />
            </div>
          )}

          <div>
            <label className="text-white/50 text-xs font-medium uppercase tracking-wider block mb-1.5 ml-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ""))}
              placeholder="@username"
              className="w-full border border-white/10 rounded-2xl px-4 py-3.5 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#319ED8] transition-colors"
              style={{ background: "rgba(255,255,255,0.06)" }}
              required
            />
          </div>

          <div>
            <label className="text-white/50 text-xs font-medium uppercase tracking-wider block mb-1.5 ml-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              className="w-full border border-white/10 rounded-2xl px-4 py-3.5 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#319ED8] transition-colors"
              style={{ background: "rgba(255,255,255,0.06)" }}
              required
            />
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="mt-2 py-4 rounded-2xl font-semibold text-base text-white disabled:opacity-50 transition-all active:scale-[0.98]"
            style={{ background: "linear-gradient(135deg, #1D5E8F, #319ED8)" }}
          >
            {isPending ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4" strokeDashoffset="10" />
                </svg>
                {mode === "login" ? "Signing in..." : "Creating account..."}
              </span>
            ) : mode === "login" ? "Sign In" : "Create Account"}
          </button>
        </form>

        <p className="text-center text-white/20 text-xs mt-8">
          GoodTunes®
        </p>
      </div>
    </main>
  );
}
