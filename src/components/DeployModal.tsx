"use client";

import { Cloud, GitBranch, Terminal, CheckCircle2, X } from "lucide-react";
import { getConfiguredWorkerWsUrl } from "@/lib/realtime-client";

export function DeployModal({ onClose }: { onClose: () => void }) {
  const cfUrl = getConfiguredWorkerWsUrl();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
      <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-cyan-400/30 bg-[#080d1c] p-6 shadow-[0_0_80px_rgba(34,211,238,0.2)]">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-orange-400/40 bg-orange-500/15 text-orange-300">
            <Cloud className="h-6 w-6" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold tracking-wider text-white">
              CLOUDFLARE WORKERS & GIT DEPLOYMENT
            </h2>
            <p className="text-xs text-slate-400">
              Dual-Engine Architecture: Built-in SSE/PostgreSQL + Cloudflare Durable Objects WebSocket Relay
            </p>
          </div>
        </div>

        <div className="mb-5 rounded-xl border border-white/10 bg-slate-950/80 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Active Realtime Transport
            </span>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                cfUrl
                  ? "border border-orange-400/40 bg-orange-500/15 text-orange-300"
                  : "border border-emerald-400/40 bg-emerald-500/15 text-emerald-300"
              }`}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {cfUrl
                ? "Cloudflare relay URL configured"
                : "Built-in Next.js SSE + PostgreSQL Active"}
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            {cfUrl
              ? `Game traffic for rooms is sent to ${cfUrl}. Lobby state still syncs through this app, and the live connection status is shown in the room header.`
              : "Running natively via built-in Next.js SSE + PostgreSQL! Set NEXT_PUBLIC_CF_WORKER_WS_URL after running wrangler deploy to route room traffic through Cloudflare Edge Durable Objects."}
          </p>
        </div>

        <div className="space-y-4 text-xs">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="mb-2 flex items-center gap-2 font-semibold uppercase tracking-wider text-cyan-300">
              <GitBranch className="h-4 w-4" />
              1. Push Repository to Git
            </div>
            <pre className="overflow-x-auto rounded-lg bg-black/60 p-3 font-mono text-[11px] text-slate-200">
{`git init
git add .
git commit -m "feat: Aetherweave multiplayer arena + Cloudflare Workers"
git branch -M main
git remote add origin https://github.com/<your-user>/aetherweave.git
git push -u origin main`}
            </pre>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="mb-2 flex items-center gap-2 font-semibold uppercase tracking-wider text-orange-300">
              <Terminal className="h-4 w-4" />
              2. Deploy Cloudflare Worker + Durable Objects Relay
            </div>
            <pre className="overflow-x-auto rounded-lg bg-black/60 p-3 font-mono text-[11px] text-slate-200">
{`cd cloudflare-worker
npm install
npx wrangler login
npx wrangler deploy
# Copy the deployed workers.dev URL (e.g. wss://aetherweave-relay.<sub >.workers.dev)`}
            </pre>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="mb-2 flex items-center gap-2 font-semibold uppercase tracking-wider text-violet-300">
              <Cloud className="h-4 w-4" />
              3. Deploy the Next.js app with OpenNext (not yet tested, see README)
            </div>
            <pre className="overflow-x-auto rounded-lg bg-black/60 p-3 font-mono text-[11px] text-slate-200">
{`# In project root, set DATABASE_URL (Hyperdrive / Neon / Supabase) & NEXT_PUBLIC_CF_WORKER_WS_URL
npx @opennextjs/cloudflare build
npx wrangler deploy`}
            </pre>
            <p className="mt-2 text-[11px] text-slate-400">
              Included files: <code className="text-cyan-300">cloudflare-worker/wrangler.toml</code>,{" "}
              <code className="text-cyan-300">cloudflare-worker/src/index.ts</code>,{" "}
              <code className="text-cyan-300">wrangler.jsonc</code>,{" "}
              <code className="text-cyan-300">open-next.config.ts</code>,{" "}
              <code className="text-cyan-300">.github/workflows/deploy-cloudflare.yml</code>, and{" "}
              <code className="text-cyan-300">README.md</code>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
