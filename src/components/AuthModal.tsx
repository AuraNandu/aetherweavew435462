"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, Sparkles, LogIn, UserPlus, X } from "lucide-react";
import {
  AURA_PALETTES,
  SHIP_CHASSIS_LIST,
  type PublicUser,
  type ShipChassis,
} from "@/lib/game-types";
import { ShipPreview } from "./ShipPreview";

export function AuthPanel({
  initialMode = "register",
  subtitle,
  onSuccess,
  onClose,
}: {
  initialMode?: "login" | "register";
  subtitle?: string;
  onSuccess: (user: PublicUser) => void;
  onClose?: () => void;
}) {
  const [mode, setMode] = useState<"login" | "register">(initialMode);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [shipChassis, setShipChassis] = useState<ShipChassis>("valkyrie");
  const [auraColor, setAuraColor] = useState("#22d3ee");

  const [checkingName, setCheckingName] = useState(false);
  const [nameAvailable, setNameAvailable] = useState<boolean | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "register") {
      setNameAvailable(null);
      setNameError(null);
      return;
    }
    const trimmed = username.trim();
    if (!trimmed) {
      setNameAvailable(null);
      setNameError(null);
      return;
    }
    const timer = setTimeout(async () => {
      setCheckingName(true);
      try {
        const res = await fetch(
          `/api/auth/check-username?username=${encodeURIComponent(trimmed)}`
        );
        const data = (await res.json()) as {
          available: boolean;
          error: string | null;
        };
        setNameAvailable(data.available);
        setNameError(data.error);
      } catch {
        setNameAvailable(null);
      } finally {
        setCheckingName(false);
      }
    }, 260);
    return () => clearTimeout(timer);
  }, [username, mode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const endpoint =
        mode === "register" ? "/api/auth/register" : "/api/auth/login";
      const payload =
        mode === "register"
          ? { username, password, shipChassis, auraColor }
          : { username, password };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { user?: PublicUser; error?: string };
      if (!res.ok || !data.user) {
        setError(data.error || "Authentication failed.");
      } else {
        onSuccess(data.user);
      }
    } catch {
      setError("Network error while authenticating.");
    } finally {
      setSubmitting(false);
    }
  };

  const quickDemoLogin = async (demoName: string) => {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: demoName, password: "aether2026" }),
      });
      const data = (await res.json()) as { user?: PublicUser; error?: string };
      if (!res.ok || !data.user) {
        setError(data.error || "Demo login failed.");
      } else {
        onSuccess(data.user);
      }
    } catch {
      setError("Failed to connect.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative w-full max-w-lg rounded-2xl border border-cyan-400/25 bg-[#090e1d]/95 p-6 shadow-[0_0_60px_rgba(34,211,238,0.16)] backdrop-blur-xl">
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      )}

      <div className="mb-5 flex items-center gap-3">
        <img
          src="/images/aetherweave-emblem.png"
          alt="Aetherweave"
          className="h-11 w-11 rounded-xl border border-cyan-400/30 object-cover"
        />
        <div>
          <h2 className="font-display text-lg font-bold tracking-wider text-white">
            PILOT ACCESS TERMINAL
          </h2>
          <p className="text-xs text-slate-400">
            {subtitle ||
              "Claim a unique pilot callsign to enter multiplayer rooms, voice comms, and add friends."}
          </p>
        </div>
      </div>

      {/* Mode toggle */}
      <div className="mb-5 grid grid-cols-2 gap-1.5 rounded-xl bg-slate-950/80 p-1 border border-white/10">
        <button
          type="button"
          onClick={() => {
            setMode("register");
            setError(null);
          }}
          className={`flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold uppercase tracking-wider transition ${
            mode === "register"
              ? "bg-gradient-to-r from-cyan-500/25 to-violet-500/25 text-cyan-200 border border-cyan-400/40"
              : "text-slate-400 hover:text-white"
          }`}
        >
          <UserPlus className="h-3.5 w-3.5" />
          New Callsign
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("login");
            setError(null);
          }}
          className={`flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold uppercase tracking-wider transition ${
            mode === "login"
              ? "bg-gradient-to-r from-cyan-500/25 to-violet-500/25 text-cyan-200 border border-cyan-400/40"
              : "text-slate-400 hover:text-white"
          }`}
        >
          <LogIn className="h-3.5 w-3.5" />
          Pilot Sign In
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-300">
            Unique Pilot Callsign
          </label>
          <div className="relative">
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. StarWeaver_99"
              required
              minLength={3}
              maxLength={20}
              className="w-full rounded-xl border border-white/15 bg-slate-950/90 px-3.5 py-2.5 pr-9 text-sm text-white placeholder-slate-500 outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/40"
            />
            {mode === "register" && username.trim().length > 0 && (
              <div className="absolute right-3 top-2.5">
                {checkingName ? (
                  <span className="text-[11px] text-slate-400">...</span>
                ) : nameAvailable ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-rose-400" />
                )}
              </div>
            )}
          </div>
          {mode === "register" && nameError && (
            <p className="mt-1 text-xs text-rose-400">{nameError}</p>
          )}
          {mode === "register" && nameAvailable && !nameError && (
            <p className="mt-1 text-xs text-emerald-400">
              Callsign available and locked uniquely to you.
            </p>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-300">
            Passkey
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Minimum 6 characters"
            required
            minLength={6}
            className="w-full rounded-xl border border-white/15 bg-slate-950/90 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/40"
          />
        </div>

        {mode === "register" && (
          <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3.5">
            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Select Craft & Aura
              </span>
              <span className="text-[11px] text-cyan-300">
                {SHIP_CHASSIS_LIST.find((s) => s.id === shipChassis)?.name}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-[#060a17]">
                <ShipPreview
                  chassis={shipChassis}
                  auraColor={auraColor}
                  size={56}
                />
              </div>
              <div className="flex-1 space-y-2">
                <div className="grid grid-cols-2 gap-1.5">
                  {SHIP_CHASSIS_LIST.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setShipChassis(c.id)}
                      className={`rounded-lg px-2 py-1 text-left text-[11px] font-medium transition ${
                        shipChassis === c.id
                          ? "border border-cyan-400/60 bg-cyan-500/20 text-cyan-200"
                          : "border border-white/10 bg-white/5 text-slate-400 hover:text-white"
                      }`}
                    >
                      {c.name.split(" ")[0]}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1.5">
                  {AURA_PALETTES.map((a) => (
                    <button
                      key={a.hex}
                      type="button"
                      onClick={() => setAuraColor(a.hex)}
                      title={a.name}
                      className={`h-5 w-5 rounded-full border transition ${
                        auraColor === a.hex
                          ? "scale-110 border-white ring-2 ring-white/40"
                          : "border-white/20 opacity-75 hover:opacity-100"
                      }`}
                      style={{ backgroundColor: a.hex }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || (mode === "register" && nameAvailable === false)}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 via-sky-500 to-violet-500 py-2.5 text-sm font-bold uppercase tracking-wider text-slate-950 shadow-[0_0_24px_rgba(34,211,238,0.4)] transition hover:brightness-110 disabled:opacity-50"
        >
          <Sparkles className="h-4 w-4" />
          {submitting
            ? "Connecting..."
            : mode === "register"
            ? "Launch Pilot Profile"
            : "Enter Nexus"}
        </button>
      </form>

      <div className="mt-4 border-t border-white/10 pt-3.5">
        <p className="mb-2 text-[11px] uppercase tracking-wider text-slate-400">
          Instant Test / Demo Pilots (Great for 2-Tab Multiplayer)
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={submitting}
            onClick={() => quickDemoLogin("NovaValkyrie")}
            className="rounded-lg border border-cyan-400/25 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-200 transition hover:bg-cyan-500/20"
          >
            Login as NovaValkyrie
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => quickDemoLogin("ApexZephyr")}
            className="rounded-lg border border-violet-400/25 bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-violet-200 transition hover:bg-violet-500/20"
          >
            Login as ApexZephyr
          </button>
        </div>
      </div>
    </div>
  );
}
