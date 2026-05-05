import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Streamdown } from "streamdown";
import {
  Loader2, Zap, DollarSign, BarChart3, FileText,
  CheckCircle, XCircle, Clock, RefreshCw, Play, Eye
} from "lucide-react";
import { toast } from "sonner";
import { getLoginUrl } from "@/const";

// ─── Spend gauge ──────────────────────────────────────────────────────────────

function SpendGauge({ todayUsd, limitUsd, percentUsed, limitReached }: {
  todayUsd: number; limitUsd: number; percentUsed: number; limitReached: boolean;
}) {
  const barColor = limitReached ? "bg-red-500" : percentUsed > 75 ? "bg-amber-400" : "bg-emerald-500";
  return (
    <Card className={`border-2 ${limitReached ? "border-red-300" : "border-slate-200"}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <DollarSign size={15} className="text-indigo-600" />
          Daily Spend
          {limitReached && <Badge className="bg-red-500 text-white text-xs">LIMIT REACHED</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex justify-between text-sm mb-2">
          <span className="font-bold text-slate-800">${todayUsd.toFixed(5)}</span>
          <span className="text-slate-400">/ ${limitUsd.toFixed(2)} limit</span>
        </div>
        <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${Math.min(100, percentUsed)}%` }} />
        </div>
        <div className="text-xs text-slate-400 mt-1">{percentUsed.toFixed(1)}% used today</div>
      </CardContent>
    </Card>
  );
}

// ─── Job status badge ─────────────────────────────────────────────────────────

function JobStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    queued: { label: "Queued", className: "bg-slate-100 text-slate-600" },
    running: { label: "Running", className: "bg-blue-100 text-blue-700" },
    completed: { label: "Completed", className: "bg-emerald-100 text-emerald-700" },
    failed: { label: "Failed", className: "bg-red-100 text-red-600" },
    skipped: { label: "Skipped", className: "bg-amber-100 text-amber-600" },
  };
  const c = config[status] ?? { label: status, className: "bg-slate-100 text-slate-600" };
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${c.className}`}>{c.label}</span>;
}

// ─── Draft preview modal ──────────────────────────────────────────────────────

function DraftPreview({ pageId, onClose }: { pageId: number; onClose: () => void }) {
  const { data, isLoading } = trpc.generation.getPageDraft.useQuery({ pageId });
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[80vh] overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold text-slate-800">Draft Preview</h3>
          <Button size="sm" variant="outline" onClick={onClose}>Close</Button>
        </div>
        <div className="overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="animate-spin text-slate-400" /></div>
          ) : data ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="bg-slate-100 px-2 py-0.5 rounded">{data.status}</span>
                <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">v{data.version}</span>
                <span className="bg-slate-100 px-2 py-0.5 rounded font-mono">{data.slug}</span>
              </div>
              <Separator />
              <div className="prose prose-sm max-w-none">
                <Streamdown>{data.bodyMarkdown}</Streamdown>
              </div>
            </div>
          ) : (
            <p className="text-slate-400 text-center py-8">Draft not found</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminGenerationPage() {
  const { user, isAuthenticated, loading } = useAuth();
  const [jobStatusFilter, setJobStatusFilter] = useState<"all" | "completed" | "failed">("all");
  const [previewPageId, setPreviewPageId] = useState<number | null>(null);
  const [generatingTopicId, setGeneratingTopicId] = useState<number | null>(null);

  const utils = trpc.useUtils();

  const { data: spendData, refetch: refetchSpend } = trpc.generation.spendSummary.useQuery(undefined, {
    enabled: isAuthenticated && user?.role === "admin",
    refetchInterval: 30000,
  });

  const { data: jobsData, isLoading: jobsLoading, refetch: refetchJobs } = trpc.generation.listJobs.useQuery(
    { status: jobStatusFilter, limit: 50 },
    { enabled: isAuthenticated && user?.role === "admin" }
  );

  const { data: draftsData } = trpc.generation.listDrafts.useQuery(
    { status: "all", limit: 20 },
    { enabled: isAuthenticated && user?.role === "admin" }
  );

  const triggerMutation = trpc.generation.triggerGeneration.useMutation({
    onSuccess: (result) => {
      toast.success(`Generation complete — ${result.summary.succeeded}/${result.results.length} succeeded, cost: $${result.summary.totalCostUsd.toFixed(5)}`);
      utils.generation.listJobs.invalidate();
      utils.generation.spendSummary.invalidate();
      utils.generation.listDrafts.invalidate();
      setGeneratingTopicId(null);
    },
    onError: (e) => { toast.error(`Generation failed: ${e.message}`); setGeneratingTopicId(null); },
  });

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-slate-400" /></div>;
  if (!isAuthenticated) return <div className="min-h-screen flex items-center justify-center"><Button onClick={() => window.location.href = getLoginUrl()}>Login</Button></div>;
  if (user?.role !== "admin") return <div className="min-h-screen flex items-center justify-center text-red-600"><XCircle size={32} className="mr-2" /> Admin access required</div>;

  return (
    <div className="min-h-screen bg-slate-50">
      {previewPageId && <DraftPreview pageId={previewPageId} onClose={() => setPreviewPageId(null)} />}

      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Zap size={20} className="text-indigo-600" />
            <div>
              <h1 className="text-base font-bold text-slate-900">Content Generation</h1>
              <p className="text-xs text-slate-500">M3 — LLM draft pipeline with audit trail</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => { refetchJobs(); refetchSpend(); }}>
              <RefreshCw size={13} className="mr-1" />Refresh
            </Button>
            <Button
              size="sm"
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
              onClick={() => triggerMutation.mutate({ batchSize: 3 })}
              disabled={triggerMutation.isPending || spendData?.limitReached}
            >
              {triggerMutation.isPending ? (
                <><Loader2 size={13} className="mr-1 animate-spin" />Generating…</>
              ) : (
                <><Play size={13} className="mr-1" />Generate Batch (3)</>
              )}
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        {/* Spend gauge */}
        {spendData && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <SpendGauge
              todayUsd={spendData.todayUsd}
              limitUsd={spendData.limitUsd}
              percentUsed={spendData.percentUsed}
              limitReached={spendData.limitReached}
            />
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-slate-500">Jobs Today</div>
                <div className="text-2xl font-bold text-slate-800">{spendData.totalJobsToday}</div>
                <div className="text-xs text-slate-400">avg ${spendData.avgCostPerJobUsd.toFixed(5)}/job</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-slate-500">Remaining Budget</div>
                <div className={`text-2xl font-bold ${spendData.limitReached ? "text-red-500" : "text-emerald-600"}`}>
                  ${spendData.remainingUsd.toFixed(4)}
                </div>
                <div className="text-xs text-slate-400">of ${spendData.limitUsd.toFixed(2)} daily limit</div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Recent drafts */}
        {draftsData && draftsData.drafts.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide flex items-center gap-2">
              <FileText size={14} />
              Recent Drafts ({draftsData.total})
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse bg-white rounded-lg overflow-hidden shadow-sm border border-slate-200">
                <thead>
                  <tr className="bg-slate-100 text-slate-600">
                    <th className="px-3 py-2 text-left">Title</th>
                    <th className="px-3 py-2 text-center">Status</th>
                    <th className="px-3 py-2 text-center">Version</th>
                    <th className="px-3 py-2 text-center">Quality</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {draftsData.drafts.map((draft) => (
                    <tr key={draft.id} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-2 max-w-xs truncate font-medium text-slate-700">{draft.title}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${draft.status === "published" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                          {draft.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center font-mono text-slate-500">v{draft.version}</td>
                      <td className="px-3 py-2 text-center">
                        {draft.publishScore > 0 ? (
                          <span className={`font-mono font-bold ${draft.publishScore >= 75 ? "text-emerald-600" : "text-amber-500"}`}>
                            {draft.publishScore}
                          </span>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => setPreviewPageId(draft.id)}>
                          <Eye size={11} className="mr-1" />Preview
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Job audit log */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide flex items-center gap-2">
              <BarChart3 size={14} />
              Generation Job Audit Log
            </h2>
            <div className="flex gap-1">
              {(["all", "completed", "failed"] as const).map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={jobStatusFilter === s ? "default" : "outline"}
                  className={`h-7 text-xs capitalize ${jobStatusFilter === s ? "bg-indigo-600 text-white" : ""}`}
                  onClick={() => setJobStatusFilter(s)}
                >
                  {s}
                </Button>
              ))}
            </div>
          </div>

          {jobsLoading ? (
            <div className="text-center py-8 text-slate-400"><Loader2 size={20} className="animate-spin mx-auto" /></div>
          ) : !jobsData?.jobs.length ? (
            <div className="text-center py-8 text-slate-400 text-sm">
              No generation jobs yet. Click "Generate Batch" to start.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse bg-white rounded-lg overflow-hidden shadow-sm border border-slate-200">
                <thead>
                  <tr className="bg-slate-100 text-slate-600">
                    <th className="px-3 py-2 text-left">Job ID</th>
                    <th className="px-3 py-2 text-center">Status</th>
                    <th className="px-3 py-2 text-right">Tokens</th>
                    <th className="px-3 py-2 text-right">Cost</th>
                    <th className="px-3 py-2 text-right">Latency</th>
                    <th className="px-3 py-2 text-left">Error</th>
                    <th className="px-3 py-2 text-right">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {jobsData.jobs.map((job) => (
                    <tr key={job.id} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-2 font-mono text-slate-500">#{job.id}</td>
                      <td className="px-3 py-2 text-center"><JobStatusBadge status={job.status} /></td>
                      <td className="px-3 py-2 text-right font-mono text-slate-600">{job.totalTokens ?? 0}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-600">${(job.estimatedCostUsd ?? 0).toFixed(5)}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-600">{job.latencyMs ? `${(job.latencyMs / 1000).toFixed(1)}s` : "—"}</td>
                      <td className="px-3 py-2 text-red-500 max-w-xs truncate">{job.errorMessage ?? ""}</td>
                      <td className="px-3 py-2 text-right text-slate-400">
                        {new Date(job.createdAt).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
