import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Search,
  RefreshCw,
  CheckCircle,
  XCircle,
  Loader2,
  TrendingUp,
  AlertTriangle,
  BarChart3,
  Play,
} from "lucide-react";
import { toast } from "sonner";
import { getLoginUrl } from "@/const";

// ─── Score bar ────────────────────────────────────────────────────────────────

function ScoreBar({ score, label, threshold = 0 }: { score: number; label: string; threshold?: number }) {
  const pass = score >= threshold;
  const color = score >= 70 ? "bg-emerald-500" : score >= 40 ? "bg-amber-400" : "bg-red-400";
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-xs text-slate-500">
        <span>{label}</span>
        <span className={`font-mono font-bold ${pass ? "text-emerald-600" : "text-red-500"}`}>{score}</span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    candidate: { label: "Candidate", className: "bg-blue-100 text-blue-700" },
    accepted: { label: "Accepted", className: "bg-emerald-100 text-emerald-700" },
    rejected: { label: "Rejected", className: "bg-red-100 text-red-600" },
    generating: { label: "Generating", className: "bg-purple-100 text-purple-700" },
    done: { label: "Done", className: "bg-slate-100 text-slate-600" },
  };
  const c = config[status] ?? { label: status, className: "bg-slate-100 text-slate-600" };
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${c.className}`}>{c.label}</span>;
}

// ─── Topic row ────────────────────────────────────────────────────────────────

function TopicRow({
  topic,
  onAccept,
  onReject,
  isActing,
}: {
  topic: {
    id: number;
    keyword: string;
    source: string;
    status: string;
    opportunityScore: number;
    trendScore: number;
    searchIntentScore: number;
    policyRiskScore: number;
    duplicationScore: number;
    expectedAdValueScore: number;
    freshnessScore: number;
    contentGapScore: number;
    rejectionReason: string | null;
    createdAt: Date;
  };
  onAccept: (id: number) => void;
  onReject: (id: number) => void;
  isActing: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <div
        className="flex items-start gap-3 p-3 cursor-pointer hover:bg-slate-50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm text-slate-800 truncate">{topic.keyword}</span>
            <StatusBadge status={topic.status} />
            <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{topic.source}</span>
          </div>
          {topic.rejectionReason && (
            <div className="text-xs text-red-500 mt-0.5 flex items-center gap-1">
              <AlertTriangle size={10} />
              {topic.rejectionReason}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right">
            <div className="text-xs text-slate-400">Opportunity</div>
            <div className={`text-lg font-bold font-mono ${topic.opportunityScore >= 60 ? "text-emerald-600" : topic.opportunityScore >= 40 ? "text-amber-500" : "text-red-500"}`}>
              {topic.opportunityScore}
            </div>
          </div>
          {topic.status === "candidate" && (
            <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                onClick={() => onAccept(topic.id)}
                disabled={isActing}
              >
                <CheckCircle size={13} />
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 border-red-200 text-red-500 hover:bg-red-50"
                onClick={() => onReject(topic.id)}
                disabled={isActing}
              >
                <XCircle size={13} />
              </Button>
            </div>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50 p-3 grid grid-cols-2 md:grid-cols-3 gap-3">
          <ScoreBar score={topic.trendScore} label="Trend" />
          <ScoreBar score={topic.searchIntentScore} label="Search Intent" />
          <ScoreBar score={topic.contentGapScore} label="Content Gap" />
          <ScoreBar score={topic.expectedAdValueScore} label="Ad Value" />
          <ScoreBar score={topic.freshnessScore} label="Freshness" />
          <ScoreBar score={topic.policyRiskScore} label="Policy Safety" threshold={50} />
          <ScoreBar score={topic.duplicationScore} label="Uniqueness" threshold={20} />
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminTopicsPage() {
  const { user, isAuthenticated, loading } = useAuth();
  const [statusFilter, setStatusFilter] = useState<"all" | "candidate" | "accepted" | "rejected">("candidate");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [actingId, setActingId] = useState<number | null>(null);

  const utils = trpc.useUtils();

  const { data: statsData } = trpc.topics.stats.useQuery(undefined, {
    enabled: isAuthenticated && user?.role === "admin",
    refetchInterval: 30000,
  });

  const { data, isLoading, refetch } = trpc.topics.list.useQuery(
    { status: statusFilter, search: debouncedSearch || undefined, limit: 50, offset: 0 },
    { enabled: isAuthenticated && user?.role === "admin" }
  );

  const acceptMutation = trpc.topics.accept.useMutation({
    onSuccess: () => {
      toast.success("Topic accepted");
      utils.topics.list.invalidate();
      utils.topics.stats.invalidate();
      setActingId(null);
    },
    onError: (e) => { toast.error(e.message); setActingId(null); },
  });

  const rejectMutation = trpc.topics.reject.useMutation({
    onSuccess: () => {
      toast.success("Topic rejected");
      utils.topics.list.invalidate();
      utils.topics.stats.invalidate();
      setActingId(null);
    },
    onError: (e) => { toast.error(e.message); setActingId(null); },
  });

  const discoveryMutation = trpc.topics.runDiscovery.useMutation({
    onSuccess: (result) => {
      const total = result.results.reduce((s, r) => s + r.accepted, 0);
      toast.success(`Discovery complete — ${total} new candidates`);
      utils.topics.list.invalidate();
      utils.topics.stats.invalidate();
    },
    onError: (e) => toast.error(`Discovery failed: ${e.message}`),
  });

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-slate-400" /></div>;

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-slate-600">Admin access required</p>
          <Button onClick={() => window.location.href = getLoginUrl()}>Login</Button>
        </div>
      </div>
    );
  }

  if (user?.role !== "admin") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center text-red-600">
          <XCircle size={32} className="mx-auto mb-2" />
          <p>Admin access required</p>
        </div>
      </div>
    );
  }

  const handleAccept = (id: number) => {
    setActingId(id);
    acceptMutation.mutate({ id });
  };

  const handleReject = (id: number) => {
    const reason = window.prompt("Rejection reason:");
    if (!reason) return;
    setActingId(id);
    rejectMutation.mutate({ id, reason });
  };

  const handleSearch = (val: string) => {
    setSearch(val);
    clearTimeout((window as { _searchTimer?: ReturnType<typeof setTimeout> })._searchTimer);
    (window as { _searchTimer?: ReturnType<typeof setTimeout> })._searchTimer = setTimeout(() => setDebouncedSearch(val), 400);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <TrendingUp size={20} className="text-indigo-600" />
            <div>
              <h1 className="text-base font-bold text-slate-900">Topic Candidates</h1>
              <p className="text-xs text-slate-500">M2 — Autonomous topic discovery</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => refetch()}
              disabled={isLoading}
            >
              <RefreshCw size={13} className={`mr-1 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              size="sm"
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
              onClick={() => discoveryMutation.mutate({ sources: ["seeded", "seasonal", "hackernews", "reddit"] })}
              disabled={discoveryMutation.isPending}
            >
              {discoveryMutation.isPending ? (
                <><Loader2 size={13} className="mr-1 animate-spin" />Running…</>
              ) : (
                <><Play size={13} className="mr-1" />Run Discovery</>
              )}
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        {/* Stats */}
        {statsData && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: "Candidates", value: statsData.candidate, color: "text-blue-600" },
              { label: "Accepted", value: statsData.accepted, color: "text-emerald-600" },
              { label: "Rejected", value: statsData.rejected, color: "text-red-500" },
              { label: "Generating", value: statsData.generating, color: "text-purple-600" },
              { label: "Done", value: statsData.done, color: "text-slate-500" },
            ].map(({ label, value, color }) => (
              <Card key={label} className="text-center py-3">
                <div className={`text-2xl font-bold ${color}`}>{value}</div>
                <div className="text-xs text-slate-500">{label}</div>
              </Card>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-48">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search keywords…"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>
          <div className="flex gap-1">
            {(["all", "candidate", "accepted", "rejected"] as const).map((s) => (
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
        </div>

        {/* Topic list */}
        <div className="space-y-2">
          {isLoading ? (
            <div className="text-center py-12 text-slate-400">
              <Loader2 size={24} className="animate-spin mx-auto mb-2" />
              Loading topics…
            </div>
          ) : !data?.topics.length ? (
            <div className="text-center py-12 text-slate-400">
              <BarChart3 size={32} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">No topics found.</p>
              <p className="text-xs mt-1">Click "Run Discovery" to discover topics from RSS feeds and seeded keywords.</p>
            </div>
          ) : (
            <>
              <div className="text-xs text-slate-500 mb-2">{data.total} topics total</div>
              {data.topics.map((topic) => (
                <TopicRow
                  key={topic.id}
                  topic={topic as Parameters<typeof TopicRow>[0]["topic"]}
                  onAccept={handleAccept}
                  onReject={handleReject}
                  isActing={actingId === topic.id}
                />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
