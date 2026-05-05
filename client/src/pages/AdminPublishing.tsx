import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertTriangle,
  CheckCircle,
  ExternalLink,
  Globe,
  Loader2,
  RefreshCw,
  Rocket,
  Send,
} from "lucide-react";
import { toast } from "sonner";

function openPublicPage(slug: string) {
  window.open(`/p/${slug}`, "_blank", "noopener,noreferrer");
}

export default function AdminPublishingPage() {
  const { user, isAuthenticated, loading } = useAuth();
  const utils = trpc.useUtils();

  const publishConfig = trpc.publishing.getConfig.useQuery(undefined, {
    enabled: isAuthenticated && user?.role === "admin",
  });

  const approvedPages = trpc.quality.listPending.useQuery(
    { status: "approved", limit: 50 },
    { enabled: isAuthenticated && user?.role === "admin" },
  );

  const publishedPages = trpc.publishing.listPublished.useQuery(
    { limit: 50 },
    { enabled: isAuthenticated && user?.role === "admin" },
  );

  const publishPageMutation = trpc.publishing.publishPage.useMutation({
    onSuccess: ({ result }) => {
      toast.success(`Published ${result.slug}`);
      void Promise.all([
        utils.quality.listPending.invalidate(),
        utils.quality.stats.invalidate(),
        utils.publishing.listPublished.invalidate(),
        utils.publishing.getSitemapEntries.invalidate(),
      ]);
    },
    onError: (error) => toast.error(`Publish failed: ${error.message}`),
  });

  const publishAllMutation = trpc.publishing.publishAll.useMutation({
    onSuccess: ({ published, failed }) => {
      toast.success(`Publish all finished — published: ${published}, failed: ${failed}`);
      void Promise.all([
        utils.quality.listPending.invalidate(),
        utils.quality.stats.invalidate(),
        utils.publishing.listPublished.invalidate(),
        utils.publishing.getSitemapEntries.invalidate(),
      ]);
    },
    onError: (error) => toast.error(`Publish all failed: ${error.message}`),
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-slate-400" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Button onClick={() => { window.location.href = getLoginUrl(); }}>
          Login
        </Button>
      </div>
    );
  }

  if (user?.role !== "admin") {
    return (
      <div className="min-h-screen flex items-center justify-center text-red-600">
        <AlertTriangle size={32} className="mr-2" />
        Admin access required
      </div>
    );
  }

  const approvedCount = approvedPages.data?.pages.length ?? 0;
  const publishedCount = publishedPages.data?.pages.length ?? 0;
  const isRefreshing = approvedPages.isFetching || publishedPages.isFetching || publishConfig.isFetching;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Rocket size={20} className="text-indigo-600" />
            <div>
              <h1 className="text-base font-bold text-slate-900">Publishing</h1>
              <p className="text-xs text-slate-500">M5 — Inspect approved pages, publish them, and verify public URLs</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void publishConfig.refetch();
                void approvedPages.refetch();
                void publishedPages.refetch();
              }}
            >
              <RefreshCw size={13} className={`mr-1 ${isRefreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => { window.location.assign("/admin/quality"); }}
            >
              Quality Queue
            </Button>
            <Button
              size="sm"
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
              onClick={() => publishAllMutation.mutate()}
              disabled={publishAllMutation.isPending || approvedCount === 0}
            >
              {publishAllMutation.isPending ? (
                <>
                  <Loader2 size={13} className="mr-1 animate-spin" />
                  Publishing…
                </>
              ) : (
                <>
                  <Send size={13} className="mr-1" />
                  Publish All Approved
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Card>
            <CardContent className="pt-4">
              <div className="text-xs text-slate-500">Approved Ready</div>
              <div className="text-2xl font-bold text-emerald-600">{approvedCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-xs text-slate-500">Published Rows</div>
              <div className="text-2xl font-bold text-indigo-600">{publishedCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-xs text-slate-500">Resolved Base URL</div>
              <div className="text-sm font-mono text-slate-700 break-all">
                {publishConfig.data?.baseUrl ?? "Loading…"}
              </div>
              <div className="text-xs text-slate-400 mt-1">
                source: {publishConfig.data?.source ?? "unknown"}
              </div>
            </CardContent>
          </Card>
        </div>

        {publishConfig.data?.usingPlaceholderBaseUrl && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
            <div className="font-semibold flex items-center gap-2">
              <AlertTriangle size={14} />
              Placeholder public host in use
            </div>
            <div className="mt-1">
              `VITE_APP_URL` is not configured and the request host could not be resolved, so publish results may point at the placeholder domain instead of the real public site.
            </div>
          </div>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <CheckCircle size={15} className="text-emerald-600" />
              Approved Pages Ready for Publish
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {approvedPages.isLoading ? (
              <div className="text-center py-8 text-slate-400">
                <Loader2 size={20} className="animate-spin mx-auto mb-2" />
                Loading approved pages…
              </div>
            ) : !approvedPages.data?.pages.length ? (
              <div className="text-sm text-slate-500">No approved pages are waiting for publish.</div>
            ) : (
              approvedPages.data.pages.map((page) => (
                <div key={page.id} className="border border-slate-200 rounded-lg p-3 bg-white">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm text-slate-800">{page.title}</div>
                      <div className="text-xs font-mono text-slate-400 mt-1">{page.slug}</div>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">approved</Badge>
                        <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">
                          decision: {page.qualityDecision ?? "none"}
                        </Badge>
                        <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">
                          publish: {page.publishScore}
                        </Badge>
                        <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">
                          safety: {page.safetyScore}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openPublicPage(page.slug)}
                      >
                        <ExternalLink size={12} className="mr-1" />
                        Test Route
                      </Button>
                      <Button
                        size="sm"
                        className="bg-indigo-600 hover:bg-indigo-700 text-white"
                        onClick={() => publishPageMutation.mutate({ pageId: page.id })}
                        disabled={publishPageMutation.isPending}
                      >
                        {publishPageMutation.isPending ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <>
                            <Send size={12} className="mr-1" />
                            Publish
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Globe size={15} className="text-indigo-600" />
              Published Pages
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {publishedPages.isLoading ? (
              <div className="text-center py-8 text-slate-400">
                <Loader2 size={20} className="animate-spin mx-auto mb-2" />
                Loading published pages…
              </div>
            ) : !publishedPages.data?.pages.length ? (
              <div className="text-sm text-slate-500">No published pages found yet.</div>
            ) : (
              publishedPages.data.pages.map((page) => (
                <div key={page.id} className="border border-slate-200 rounded-lg p-3 bg-white">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm text-slate-800">{page.title}</div>
                      <div className="text-xs font-mono text-slate-400 mt-1">{page.publicUrl}</div>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100">published</Badge>
                        <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">
                          policy: {page.policyStatus}
                        </Badge>
                        {page.publishedAt && (
                          <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">
                            {new Date(page.publishedAt).toLocaleString()}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openPublicPage(page.slug)}
                    >
                      <ExternalLink size={12} className="mr-1" />
                      Open Page
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
