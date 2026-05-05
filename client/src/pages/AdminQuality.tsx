import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Streamdown } from "streamdown";
import {
  Loader2, ShieldCheck, XCircle, RefreshCw, Play, Eye,
  CheckCircle, AlertTriangle, BarChart3, GitMerge, RotateCcw
} from "lucide-react";
import { toast } from "sonner";
import { getLoginUrl } from "@/const";

// ─── Score bar ────────────────────────────────────────────────────────────────

function ScoreBar({ score, label, threshold = 0 }: { score: number; label: string; threshold?: number }) {
  const pass = threshold === 0 || score >= threshold;
  const color = score >= 75 ? "bg-emerald-500" : score >= 50 ? "bg-amber-400" : "bg-red-400";
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-xs">
        <span className="text-slate-500">{label}</span>
        <span className={`font-mono font-bold ${pass ? "text-emerald-600" : "text-red-500"}`}>{score}</span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

// ─── Decision badge ───────────────────────────────────────────────────────────

function DecisionBadge({ decision }: { decision: string | null }) {
  if (!decision) return <span className="text-xs text-slate-400">Pending</span>;
  const config: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
    approve: { label: "Approved", className: "bg-emerald-100 text-emerald-700", icon: <CheckCircle size={11} /> },
    retry: { label: "Retry", className: "bg-amber-100 text-amber-700", icon: <RotateCcw size={11} /> },
    merge: { label: "Merge", className: "bg-blue-100 text-blue-700", icon: <GitMerge size={11} /> },
    reject: { label: "Rejected", className: "bg-red-100 text-red-600", icon: <XCircle size={11} /> },
    reject_stage1: { label: "Rejected (S1)", className: "bg-red-100 text-red-600", icon: <XCircle size={11} /> },
  };
  const c = config[decision] ?? { label: decision, className: "bg-slate-100 text-slate-600", icon: null };
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${c.className}`}>
      {c.icon}{c.label}
    </span>
  );
}

// ─── Draft preview modal ──────────────────────────────────────────────────────

function DraftPreview({ pageId, onClose }: { pageId: number; onClose: () => void }) {
  const { data, isLoading } = trpc.quality.getReviewDetail.useQuery({ pageId });
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[85vh] overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold text-slate-800">Draft Review Detail</h3>
          <Button size="sm" variant="outline" onClick={onClose}>Close</Button>
        </div>
        <div className="overflow-y-auto p-4 space-y-4">
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="animate-spin text-slate-400" /></div>
          ) : data ? (
            <>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <ScoreBar score={data.publishScore} label="Publish Score" threshold={70} />
                <ScoreBar score={data.safetyScore} label="Safety" threshold={90} />
                <ScoreBar score={data.usefulnessScore} label="Usefulness" threshold={70} />
                <ScoreBar score={data.coherenceScore} label="Coherence" threshold={70} />
                <ScoreBar score={data.factualGroundingScore} label="Factual Grounding" threshold={75} />
                <ScoreBar score={data.readabilityScore} label="Readability" />
                <ScoreBar score={data.originalityScore} label="Originality" />
              </div>
              {data.qualityReasons && Array.isArray(data.qualityReasons) && data.qualityReasons.length > 0 && (
                <div className="bg-amber-50 rounded p-3 text-xs space-y-1">
                  <div className="font-semibold text-amber-700">Quality Notes:</div>
                  {(data.qualityReasons as string[]).map((r, i) => (
                    <div key={i} className="text-amber-600 flex items-start gap-1">
                      <AlertTriangle size={10} className="mt-0.5 shrink-0" />
                      {r}
                    </div>
                  ))}
                </div>
              )}
              <div className="prose prose-sm max-w-none border-t pt-3">
                <Streamdown>{data.bodyMarkdown}</Streamdown>
              </div>
            </>
          ) : (
            <p className="text-slate-400 text-center py-8">Page not found</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminQualityPage() {
  const { user, isAuthenticated, loading } = useAuth();
  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "approved" | "rejected" | "reviewing">("all");
  const [previewPageId, setPreviewPageId] = useState<number | null>(null);

  const utils = trpc.useUtils();

  const { data: statsData } = trpc.quality.stats.useQuery(undefined, {
    enabled: isAuthenticated && user?.role === "admin",
    refetchInterval: 30000,
  });

  const { data, isLoading, refetch } = trpc.quality.listPending.useQuery(
    { status: statusFilter, limit: 50 },
    { enabled: isAuthenticated && user?.role === "admin" }
  );

  const reviewPageMutation = trpc.quality.reviewPage.useMutation({
    onSuccess: (result) => {
      toast.success(`Review complete — decision: ${result.result.decision}`);
      utils.quality.listPending.invalidate();
      utils.quality.stats.invalidate();
    },
    onError: (e) => toast.error(`Review failed: ${e.message}`),
  });

  const reviewAllMutation = trpc.quality.reviewAll.useMutation({
    onSuccess: (result) => {
      const s = result.summary;
      toast.success(`Reviewed ${s.total} drafts — approved: ${s.approved}, rejected: ${s.rejected}, retry: ${s.retry}, merge: ${s.merge}`);
      utils.quality.listPending.invalidate();
      utils.quality.stats.invalidate();
    },
    onError: (e) => toast.error(`Review all failed: ${e.message}`),
  });

  const overrideMutation = trpc.quality.manualOverride.useMutation({
    onSuccess: () => {
      toast.success("Override applied");
      utils.quality.listPending.invalidate();
      utils.quality.stats.invalidate();
    },
    onError: (e) => toast.error(e.message),
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
            <ShieldCheck size={20} className="text-indigo-600" />
            <div>
              <h1 className="text-base font-bold text-slate-900">Quality Review</h1>
              <p className="text-xs text-slate-500">M4 — Two-stage quality gate: heuristics + LLM review</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => { window.location.assign("/admin/publishing"); }}
            >
              Publishing
            </Button>
            <Button size="sm" variant="outline" onClick={() => refetch()}>
              <RefreshCw size={13} className="mr-1" />Refresh
            </Button>
            <Button
              size="sm"
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
              onClick={() => reviewAllMutation.mutate()}
              disabled={reviewAllMutation.isPending}
            >
              {reviewAllMutation.isPending ? (
                <><Loader2 size={13} className="mr-1 animate-spin" />Reviewing…</>
              ) : (
                <><Play size={13} className="mr-1" />Review All Pending</>
              )}
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        {/* Stats */}
        {statsData && (
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            {[
              { label: "Draft", value: statsData.draft ?? 0, color: "text-slate-600" },
              { label: "Reviewing", value: statsData.reviewing ?? 0, color: "text-blue-600" },
              { label: "Approved", value: statsData.approved ?? 0, color: "text-emerald-600" },
              { label: "Rejected", value: statsData.rejected ?? 0, color: "text-red-500" },
              { label: "Published", value: statsData.published ?? 0, color: "text-purple-600" },
              { label: "Total", value: statsData.total ?? 0, color: "text-slate-800" },
            ].map(({ label, value, color }) => (
              <Card key={label} className="text-center py-2">
                <div className={`text-xl font-bold ${color}`}>{value}</div>
                <div className="text-xs text-slate-500">{label}</div>
              </Card>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-1 flex-wrap">
          {(["all", "draft", "reviewing", "approved", "rejected"] as const).map((s) => (
            <Button
              key={s}
              size="sm"
              variant={statusFilter === s ? "default" : "outline"}
              className={`h-8 text-xs capitalize ${statusFilter === s ? "bg-indigo-600 text-white" : ""}`}
              onClick={() => setStatusFilter(s)}
            >
              {s}
            </Button>
          ))}
        </div>

        {/* Page list */}
        {isLoading ? (
          <div className="text-center py-12 text-slate-400"><Loader2 size={24} className="animate-spin mx-auto mb-2" />Loading…</div>
        ) : !data?.pages.length ? (
          <div className="text-center py-12 text-slate-400">
            <BarChart3 size={32} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm">No pages found. Generate drafts first, then run quality review.</p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-xs text-slate-500 mb-2">{data.total} pages total</div>
            {data.pages.map((page) => (
              <div key={page.id} className="bg-white border border-slate-200 rounded-lg p-3 hover:border-indigo-200 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-medium text-sm text-slate-800 truncate">{page.title}</span>
                      <DecisionBadge decision={page.qualityDecision} />
                      <span className={`text-xs px-1.5 py-0.5 rounded ${page.policyStatus === "approved" ? "bg-emerald-100 text-emerald-700" : page.policyStatus === "rejected" ? "bg-red-100 text-red-600" : "bg-slate-100 text-slate-500"}`}>
                        {page.policyStatus}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 font-mono">{page.slug}</div>
                    {page.rejectionReason && (
                      <div className="text-xs text-red-500 mt-1 flex items-start gap-1">
                        <AlertTriangle size={10} className="mt-0.5 shrink-0" />
                        {page.rejectionReason}
                      </div>
                    )}
                    {page.publishScore > 0 && (
                      <div className="grid grid-cols-4 gap-2 mt-2">
                        <ScoreBar score={page.publishScore} label="Publish" threshold={70} />
                        <ScoreBar score={page.safetyScore} label="Safety" threshold={90} />
                        <ScoreBar score={page.usefulnessScore} label="Useful" threshold={70} />
                        <ScoreBar score={page.readabilityScore} label="Read" />
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setPreviewPageId(page.id)}>
                      <Eye size={11} className="mr-1" />View
                    </Button>
                    {page.status === "draft" && (
                      <Button
                        size="sm"
                        className="h-7 px-2 text-xs bg-indigo-600 text-white hover:bg-indigo-700"
                        onClick={() => reviewPageMutation.mutate({ pageId: page.id })}
                        disabled={reviewPageMutation.isPending}
                      >
                        {reviewPageMutation.isPending ? <Loader2 size={11} className="animate-spin" /> : <ShieldCheck size={11} />}
                      </Button>
                    )}
                    {(page.status === "reviewing" || page.status === "rejected") && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs border-emerald-300 text-emerald-700"
                        onClick={() => overrideMutation.mutate({ pageId: page.id, decision: "approve" })}
                        disabled={overrideMutation.isPending}
                      >
                        <CheckCircle size={11} />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
