import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Streamdown } from "streamdown";
import {
  CheckCircle,
  XCircle,
  Loader2,
  FlaskConical,
  FileText,
  BarChart3,
  AlertTriangle,
  Clock,
  DollarSign,
  Zap,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RunResult {
  runNumber: number;
  topic: string;
  generated: boolean;
  decision: "approve" | "reject";
  publishScore: number;
  safetyScore: number;
  usefulnessScore: number;
  readabilityScore: number;
  rendered: boolean;
  estimatedCostUsd: number;
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  draftContent: string | null;
  qualityReasons: string[];
  requiredChanges: string[];
  errorMessage: string | null;
  notes: string;
}

// ─── Score Badge ──────────────────────────────────────────────────────────────

function ScoreBadge({ score, threshold }: { score: number; threshold: number }) {
  const pass = score >= threshold;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono font-bold ${
        pass ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700"
      }`}
    >
      {pass ? <CheckCircle size={11} /> : <XCircle size={11} />}
      {score}
    </span>
  );
}

// ─── Single Run Card ──────────────────────────────────────────────────────────

function RunCard({ run }: { run: RunResult }) {
  const [showDraft, setShowDraft] = useState(false);
  const approved = run.decision === "approve";

  return (
    <Card className={`border-2 ${approved ? "border-emerald-300" : "border-red-200"}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-slate-700">
            Run #{run.runNumber}
          </CardTitle>
          <Badge
            variant={approved ? "default" : "destructive"}
            className={`text-xs font-bold ${approved ? "bg-emerald-600" : ""}`}
          >
            {approved ? "✓ APPROVED" : "✗ REJECTED"}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-slate-500 mt-1">
          <span className="flex items-center gap-1">
            <Clock size={11} />
            {(run.latencyMs / 1000).toFixed(1)}s
          </span>
          <span className="flex items-center gap-1">
            <DollarSign size={11} />
            ${run.estimatedCostUsd.toFixed(5)}
          </span>
          <span className="flex items-center gap-1">
            <Zap size={11} />
            {run.totalTokens} tokens
          </span>
          {run.rendered && (
            <span className="flex items-center gap-1 text-emerald-600 font-medium">
              <CheckCircle size={11} />
              Rendered
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Score grid */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          {[
            { label: "Publish", score: run.publishScore, threshold: 75 },
            { label: "Safety", score: run.safetyScore, threshold: 95 },
            { label: "Usefulness", score: run.usefulnessScore, threshold: 75 },
            { label: "Readability", score: run.readabilityScore, threshold: 70 },
          ].map(({ label, score, threshold }) => (
            <div key={label} className="flex items-center justify-between bg-slate-50 rounded px-2 py-1">
              <span className="text-slate-600">{label}</span>
              <ScoreBadge score={score} threshold={threshold} />
            </div>
          ))}
        </div>

        {/* Reasons */}
        {run.qualityReasons.length > 0 && (
          <div className="text-xs text-slate-500 space-y-0.5">
            {run.qualityReasons.slice(0, 3).map((r, i) => (
              <div key={i} className="flex items-start gap-1">
                <AlertTriangle size={10} className="mt-0.5 shrink-0 text-amber-500" />
                <span>{r}</span>
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {run.errorMessage && (
          <div className="text-xs text-red-600 bg-red-50 rounded p-2">
            Error: {run.errorMessage}
          </div>
        )}

        {/* Draft toggle */}
        {run.draftContent && (
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs"
            onClick={() => setShowDraft(!showDraft)}
          >
            <FileText size={12} className="mr-1" />
            {showDraft ? "Hide Draft" : "View Draft"}
          </Button>
        )}

        {showDraft && run.draftContent && (
          <div className="prose prose-sm max-w-none bg-slate-50 rounded p-4 text-sm border border-slate-200 max-h-96 overflow-y-auto">
            <Streamdown>{run.draftContent}</Streamdown>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Evidence Summary ─────────────────────────────────────────────────────────

function EvidenceSummary({
  summary,
}: {
  summary: {
    passRate: string;
    avgCostUsd: number;
    avgLatencyMs: number;
    usefulDraftCount: string;
    renderedPageCount: string;
    safetyFailures: number;
    decision: string;
    reason: string;
  };
}) {
  const isGo = summary.decision === "GO";
  return (
    <Card className={`border-2 ${isGo ? "border-emerald-400 bg-emerald-50" : "border-red-300 bg-red-50"}`}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart3 size={18} />
          M0 Evidence Summary
          <Badge
            className={`ml-auto text-sm font-bold px-3 py-1 ${isGo ? "bg-emerald-600" : "bg-red-600"}`}
          >
            {isGo ? "✓ GO" : "✗ NO-GO"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm mb-3">
          {[
            { label: "Pass Rate", value: summary.passRate },
            { label: "Avg Cost", value: `$${summary.avgCostUsd.toFixed(5)}` },
            { label: "Avg Latency", value: `${(summary.avgLatencyMs / 1000).toFixed(1)}s` },
            { label: "Useful Drafts", value: summary.usefulDraftCount },
            { label: "Rendered Pages", value: summary.renderedPageCount },
            { label: "Safety Failures", value: String(summary.safetyFailures) },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white rounded p-2 border border-slate-200">
              <div className="text-xs text-slate-500">{label}</div>
              <div className="font-bold text-slate-800">{value}</div>
            </div>
          ))}
        </div>
        <div className={`text-sm font-medium ${isGo ? "text-emerald-700" : "text-red-700"}`}>
          {summary.reason}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Approved Draft Staging Page ──────────────────────────────────────────────

function StagingPage({ run }: { run: RunResult }) {
  if (!run.draftContent) return null;
  return (
    <Card className="border-2 border-emerald-400">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base text-emerald-700">
          <CheckCircle size={18} />
          Staging Page — Run #{run.runNumber} (Approved)
        </CardTitle>
        <p className="text-xs text-slate-500">
          This is how the approved draft renders as a public page.
        </p>
      </CardHeader>
      <CardContent>
        <div className="prose prose-slate max-w-none bg-white rounded border border-slate-200 p-6">
          <Streamdown>{run.draftContent}</Streamdown>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <ScoreBadge score={run.publishScore} threshold={75} />
          <span className="text-slate-400">publish</span>
          <ScoreBadge score={run.safetyScore} threshold={95} />
          <span className="text-slate-400">safety</span>
          <ScoreBadge score={run.usefulnessScore} threshold={75} />
          <span className="text-slate-400">usefulness</span>
          <ScoreBadge score={run.readabilityScore} threshold={70} />
          <span className="text-slate-400">readability</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PrototypePage() {
  const { data: briefData } = trpc.m0.getBrief.useQuery();

  const [singleResult, setSingleResult] = useState<RunResult | null>(null);
  const [evidenceRuns, setEvidenceRuns] = useState<RunResult[]>([]);
  const [evidenceSummary, setEvidenceSummary] = useState<null | {
    passRate: string;
    avgCostUsd: number;
    avgLatencyMs: number;
    usefulDraftCount: string;
    renderedPageCount: string;
    safetyFailures: number;
    decision: string;
    reason: string;
  }>(null);

  const generateMutation = trpc.m0.generateDraft.useMutation({
    onSuccess: (data) => setSingleResult(data as RunResult),
  });

  const evidenceMutation = trpc.m0.runEvidence.useMutation({
    onSuccess: (data) => {
      setEvidenceRuns(data.runs as RunResult[]);
      setEvidenceSummary(data.summary);
    },
  });

  const approvedRun = evidenceRuns.find((r) => r.decision === "approve") ?? (singleResult?.decision === "approve" ? singleResult : null);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <FlaskConical size={22} className="text-indigo-600" />
          <div>
            <h1 className="text-lg font-bold text-slate-900">AI Micro-Publisher — Milestone 0</h1>
            <p className="text-xs text-slate-500">
              Prototype validation: hardcoded topic → LLM draft → quality gate → approve/reject
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">

        {/* Topic Brief */}
        {briefData && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <FileText size={15} />
                Hardcoded Prototype Brief
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs text-slate-500 mb-1">Topic</div>
                  <div className="font-medium text-slate-800">{briefData.brief.topic}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1">Target Keyword</div>
                  <div className="font-mono text-xs bg-slate-100 px-2 py-1 rounded text-slate-700">
                    {briefData.brief.target_keyword}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1">Page Type / Tone</div>
                  <div className="text-slate-700">{briefData.brief.page_type} · {briefData.brief.tone}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1">Required Sections</div>
                  <div className="flex flex-wrap gap-1">
                    {briefData.brief.required_sections.map((s) => (
                      <span key={s} className="bg-indigo-100 text-indigo-700 text-xs px-2 py-0.5 rounded">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <Separator className="my-3" />
              <div className="text-xs text-slate-500">
                <span className="font-medium">Quality thresholds: </span>
                publish ≥{briefData.thresholds.publishScore} · safety ≥{briefData.thresholds.safetyScore} · usefulness ≥{briefData.thresholds.usefulnessScore} · readability ≥{briefData.thresholds.readabilityScore}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Single Generate */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Button
              onClick={() => generateMutation.mutate({ runNumber: 1 })}
              disabled={generateMutation.isPending || evidenceMutation.isPending}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {generateMutation.isPending ? (
                <><Loader2 size={15} className="mr-2 animate-spin" />Generating…</>
              ) : (
                <><Zap size={15} className="mr-2" />Generate Single Draft</>
              )}
            </Button>
            <Button
              onClick={() => evidenceMutation.mutate()}
              disabled={generateMutation.isPending || evidenceMutation.isPending}
              variant="outline"
              className="border-indigo-300 text-indigo-700 hover:bg-indigo-50"
            >
              {evidenceMutation.isPending ? (
                <><Loader2 size={15} className="mr-2 animate-spin" />Running 5 Generations…</>
              ) : (
                <><BarChart3 size={15} className="mr-2" />Run 5-Run Evidence Table</>
              )}
            </Button>
          </div>

          {generateMutation.isError && (
            <div className="text-sm text-red-600 bg-red-50 rounded p-3 border border-red-200">
              Generation failed: {generateMutation.error?.message}
            </div>
          )}
          {evidenceMutation.isError && (
            <div className="text-sm text-red-600 bg-red-50 rounded p-3 border border-red-200">
              Evidence run failed: {evidenceMutation.error?.message}
            </div>
          )}
        </div>

        {/* Single result */}
        {singleResult && evidenceRuns.length === 0 && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide">Single Run Result</h2>
            <RunCard run={singleResult} />
          </div>
        )}

        {/* Evidence Table */}
        {evidenceRuns.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide flex items-center gap-2">
              <BarChart3 size={15} />
              5-Run Evidence Table
            </h2>

            {/* Tabular summary */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse bg-white rounded-lg overflow-hidden shadow-sm border border-slate-200">
                <thead>
                  <tr className="bg-slate-100 text-slate-600">
                    <th className="px-3 py-2 text-left font-semibold">Run</th>
                    <th className="px-3 py-2 text-center font-semibold">Generated</th>
                    <th className="px-3 py-2 text-center font-semibold">Decision</th>
                    <th className="px-3 py-2 text-center font-semibold">Publish</th>
                    <th className="px-3 py-2 text-center font-semibold">Safety</th>
                    <th className="px-3 py-2 text-center font-semibold">Useful</th>
                    <th className="px-3 py-2 text-center font-semibold">Read</th>
                    <th className="px-3 py-2 text-center font-semibold">Rendered</th>
                    <th className="px-3 py-2 text-right font-semibold">Cost</th>
                    <th className="px-3 py-2 text-right font-semibold">Latency</th>
                  </tr>
                </thead>
                <tbody>
                  {evidenceRuns.map((run) => (
                    <tr key={run.runNumber} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-2 font-mono font-bold text-slate-700">#{run.runNumber}</td>
                      <td className="px-3 py-2 text-center">
                        {run.generated ? <CheckCircle size={13} className="text-emerald-500 mx-auto" /> : <XCircle size={13} className="text-red-400 mx-auto" />}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`font-bold ${run.decision === "approve" ? "text-emerald-600" : "text-red-500"}`}>
                          {run.decision.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center"><ScoreBadge score={run.publishScore} threshold={75} /></td>
                      <td className="px-3 py-2 text-center"><ScoreBadge score={run.safetyScore} threshold={95} /></td>
                      <td className="px-3 py-2 text-center"><ScoreBadge score={run.usefulnessScore} threshold={75} /></td>
                      <td className="px-3 py-2 text-center"><ScoreBadge score={run.readabilityScore} threshold={70} /></td>
                      <td className="px-3 py-2 text-center">
                        {run.rendered ? <CheckCircle size={13} className="text-emerald-500 mx-auto" /> : <XCircle size={13} className="text-red-400 mx-auto" />}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-600">${run.estimatedCostUsd.toFixed(5)}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-600">{(run.latencyMs / 1000).toFixed(1)}s</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Individual run cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {evidenceRuns.map((run) => (
                <RunCard key={run.runNumber} run={run} />
              ))}
            </div>
          </div>
        )}

        {/* Summary */}
        {evidenceSummary && <EvidenceSummary summary={evidenceSummary} />}

        {/* Staging page — first approved draft */}
        {approvedRun && (
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide">
              Approved Staging Page
            </h2>
            <StagingPage run={approvedRun} />
          </div>
        )}
      </div>
    </div>
  );
}
