// Shared chrome tokens for the admin auth screens (Login, ForgotPassword,
// ResetPassword, and any future admin auth page). Extracted from Login.tsx
// so every screen the admin sees while signed-out paints the same card,
// inputs, primary button, and ghost back link — no second copy to drift.
//
// `Mode` is only used by Login's segmented control. ForgotPassword and
// ResetPassword don't touch the segmented fields; they just consume
// `page / card / subtitle / label / input / hint / primaryBtn / ghostBtn /
// errorBox / backChip`.
import type React from "react";

export type Mode = "login" | "register";

export type Chrome = {
  page: string;
  card: string;
  subtitle: string;
  label: string;
  input: string;
  inputCenter: string;
  hint: string;
  primaryBtn: string;
  primaryBtnStyle?: React.CSSProperties;
  ghostBtn: string;
  segmentedWrap: string;
  segmentedThumbClass: string;
  segmentedThumbStyle: (mode: Mode) => React.CSSProperties;
  segmentedBtn: (active: boolean) => string;
  oauthBtn: string;
  oauthIcon: { googleW: number; googleH: number; appleW: number; appleH: number; appleFill: string };
  divider: string;
  dividerText: string;
  step1Tick: (on: boolean) => string;
  step2Tick: (on: boolean) => string;
  stepLabel: string;
  errorBox: string;
  totpErr: string;
  qrFrame: string;
  recoveryWrap: string;
  recoveryItem: string;
  backChip: string;
  backChevronSize: number;
  footer: string;
};

export const ADMIN_CHROME: Chrome = {
  page: "min-h-screen w-full flex justify-center items-center bg-slate-50",
  card: "relative w-full max-w-[400px] px-6 py-8 bg-white rounded-xl border border-slate-200 shadow-sm",
  subtitle: "mt-3 text-slate-500 text-[13px] text-center",
  label: "text-slate-600 text-[11px] font-semibold uppercase tracking-wider block mb-1.5",
  input:
    "w-full h-9 border border-slate-300 rounded-md px-3 text-slate-900 placeholder-slate-400 text-sm bg-white focus:outline-none focus:border-[#319ED8] focus:ring-1 focus:ring-[#319ED8] transition-colors",
  inputCenter:
    "w-full h-10 border border-slate-300 rounded-md px-3 text-slate-900 text-center text-lg tracking-widest bg-white focus:outline-none focus:border-[#319ED8] focus:ring-1 focus:ring-[#319ED8]",
  hint: "text-slate-500 text-[11px] mt-1.5",
  primaryBtn:
    "mt-3 w-full h-9 rounded-md font-medium text-sm text-white bg-[#319ED8] hover:bg-[#2a8cc1] disabled:opacity-40 disabled:cursor-not-allowed transition-colors active:scale-[0.98]",
  ghostBtn: "mt-3 w-full text-slate-500 text-sm hover:text-slate-700",
  segmentedWrap: "relative flex mb-6 p-0.5 rounded-md bg-slate-100",
  segmentedThumbClass: "absolute top-0.5 bottom-0.5 rounded-[5px] transition-all duration-200",
  segmentedThumbStyle: (mode) => ({
    width: "calc(50% - 2px)",
    left: mode === "login" ? "2px" : "calc(50%)",
    background: "white",
    boxShadow: "0 1px 2px rgba(15,23,42,0.08)",
  }),
  segmentedBtn: (active) =>
    `relative flex-1 py-1.5 rounded-[5px] text-sm font-medium transition-colors duration-150 ${active ? "text-slate-900" : "text-slate-500"}`,
  oauthBtn:
    "w-full h-9 rounded-md border border-slate-300 bg-white text-slate-700 text-sm font-medium flex items-center justify-center gap-2 hover:bg-slate-50 active:scale-[0.98] transition-all",
  oauthIcon: { googleW: 16, googleH: 16, appleW: 14, appleH: 16, appleFill: "currentColor" },
  divider: "flex-1 h-px bg-slate-200",
  dividerText: "text-slate-400 text-xs",
  step1Tick: (on) => `h-1 w-10 rounded-full ${on ? "bg-[#319ED8]" : "bg-slate-200"}`,
  step2Tick: (on) => `h-1 w-10 rounded-full ${on ? "bg-[#319ED8]" : "bg-slate-200"}`,
  stepLabel: "text-slate-400 text-[11px] ml-2",
  errorBox: "bg-red-50 border border-red-200 rounded-md px-3 py-2 text-red-600 text-sm",
  totpErr: "text-red-600 text-sm mt-2",
  qrFrame: "w-48 h-48 rounded-lg bg-white border border-slate-200 p-2",
  recoveryWrap: "mt-6 rounded-md p-4 border border-slate-200 bg-slate-50",
  recoveryItem: "px-2 py-1 rounded bg-white border border-slate-200",
  backChip:
    "w-9 h-9 shrink-0 rounded-md flex items-center justify-center text-slate-600 hover:text-slate-900 border border-slate-300 bg-white active:scale-[0.94] transition-all",
  backChevronSize: 18,
  footer: "",
};

export const CUSTOMER_CHROME: Chrome = {
  page: "min-h-screen w-full flex flex-col items-center justify-center gap-10 py-10 px-4",
  card: "relative w-full max-w-[390px] px-6",
  subtitle: "mt-3 text-white/55 text-[13px] text-center",
  label: "text-white/50 text-xs font-medium uppercase tracking-wider block mb-1.5 ml-1",
  input:
    "w-full border border-white/10 rounded-2xl px-4 py-3.5 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#319ED8] transition-colors",
  inputCenter:
    "w-full border border-white/10 rounded-2xl px-4 py-3.5 text-white text-center text-lg tracking-widest focus:outline-none focus:border-[#319ED8]",
  hint: "text-white/35 text-[11px] mt-1.5 ml-1",
  primaryBtn:
    "mt-2 py-4 rounded-2xl font-semibold text-base text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.98]",
  primaryBtnStyle: { background: "linear-gradient(135deg, #1D5E8F, #319ED8)" },
  ghostBtn: "mt-3 w-full text-white/55 text-sm hover:text-white",
  segmentedWrap: "relative flex mb-6 p-1 rounded-2xl",
  segmentedThumbClass: "absolute top-1 bottom-1 rounded-xl transition-all duration-200",
  segmentedThumbStyle: (mode) => ({
    width: "calc(50% - 4px)",
    left: mode === "login" ? "4px" : "calc(50%)",
    background: "rgba(255,255,255,0.15)",
    boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
  }),
  segmentedBtn: (active) =>
    `relative flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors duration-150 ${active ? "text-white" : "text-white/35"}`,
  oauthBtn:
    "w-full py-3.5 rounded-full bg-white text-[#0f0f0f] text-sm font-semibold flex items-center justify-center gap-2.5 active:scale-[0.98] transition-transform",
  oauthIcon: { googleW: 18, googleH: 18, appleW: 16, appleH: 18, appleFill: "#0f0f0f" },
  divider: "flex-1 h-px bg-white/15",
  dividerText: "text-white/40 text-xs",
  step1Tick: (on) => `h-1 w-10 rounded-full ${on ? "bg-[#319ED8]" : "bg-white/15"}`,
  step2Tick: (on) => `h-1 w-10 rounded-full ${on ? "bg-[#319ED8]" : "bg-white/15"}`,
  stepLabel: "text-white/40 text-[11px] ml-2",
  errorBox: "bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm",
  totpErr: "text-red-400 text-sm mt-2",
  qrFrame: "w-48 h-48 rounded-2xl bg-white p-2",
  recoveryWrap: "mt-6 rounded-2xl p-4",
  recoveryItem: "px-2 py-1 rounded bg-white/10",
  backChip:
    "w-14 h-14 shrink-0 rounded-full flex items-center justify-center text-white/85 hover:text-white active:scale-[0.94] transition-all",
  backChevronSize: 20,
  footer: "w-full max-w-[440px] text-center text-[10px] leading-snug px-8",
};
