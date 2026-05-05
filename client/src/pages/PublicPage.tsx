/**
 * M5 — Public Content Page
 * Route: /p/:slug
 *
 * Renders a published article with:
 * - SEO metadata (title, description, canonical)
 * - JSON-LD structured data (Article + FAQPage schemas)
 * - Noindex for archived/rejected pages
 * - No ads (M6 scope)
 */

import { useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Streamdown } from "streamdown";
import { Loader2, AlertTriangle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

// ─── SEO head manager ─────────────────────────────────────────────────────────

function SeoHead({
  title,
  description,
  canonicalUrl,
  structuredData,
  noindex,
}: {
  title: string;
  description: string | null;
  canonicalUrl: string;
  structuredData: unknown;
  noindex: boolean;
}) {
  useEffect(() => {
    // Update document title
    document.title = `${title} | AI Micro-Publisher`;

    // Update/create meta description
    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement("meta");
      metaDesc.setAttribute("name", "description");
      document.head.appendChild(metaDesc);
    }
    metaDesc.setAttribute("content", description ?? title);

    // Update/create canonical link
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.setAttribute("href", canonicalUrl);

    // Noindex meta tag
    let robotsMeta = document.querySelector('meta[name="robots"]');
    if (!robotsMeta) {
      robotsMeta = document.createElement("meta");
      robotsMeta.setAttribute("name", "robots");
      document.head.appendChild(robotsMeta);
    }
    robotsMeta.setAttribute("content", noindex ? "noindex, nofollow" : "index, follow");

    // Inject JSON-LD structured data
    const existingScripts = document.querySelectorAll('script[data-schema="ai-publisher"]');
    existingScripts.forEach((s) => s.remove());

    if (structuredData && Array.isArray(structuredData)) {
      for (const schema of structuredData) {
        const script = document.createElement("script");
        script.type = "application/ld+json";
        script.setAttribute("data-schema", "ai-publisher");
        script.textContent = JSON.stringify(schema, null, 2);
        document.head.appendChild(script);
      }
    }

    return () => {
      // Cleanup on unmount
      document.title = "AI Micro-Publisher";
      document.querySelectorAll('script[data-schema="ai-publisher"]').forEach((s) => s.remove());
    };
  }, [title, description, canonicalUrl, structuredData, noindex]);

  return null;
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PublicPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug ?? "";

  const { data, isLoading, error } = trpc.publishing.getPage.useQuery(
    { slug },
    { enabled: !!slug, retry: false }
  );

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-slate-400" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-slate-500">
        <AlertTriangle size={40} className="text-amber-400" />
        <h1 className="text-xl font-semibold text-slate-700">Page not found</h1>
        <p className="text-sm">This page may not be published yet or the URL is incorrect.</p>
        <Link href="/">
          <Button variant="outline" size="sm">
            <ArrowLeft size={14} className="mr-2" />
            Back to home
          </Button>
        </Link>
      </div>
    );
  }

  const structuredDataArray = Array.isArray(data.structuredData) ? data.structuredData : [];

  return (
    <>
      <SeoHead
        title={data.title}
        description={data.metaDescription}
        canonicalUrl={data.canonicalUrl}
        structuredData={structuredDataArray}
        noindex={data.noindex}
      />

      <div className="min-h-screen bg-white">
        {/* Noindex warning banner (dev only) */}
        {data.noindex && (
          <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-xs text-red-600 text-center">
            ⚠ This page has noindex — it will not appear in search results
          </div>
        )}

        {/* Article */}
        <article className="max-w-2xl mx-auto px-6 py-12">
          {/* Breadcrumb */}
          <nav className="text-xs text-slate-400 mb-6">
            <Link href="/" className="hover:text-slate-600">Home</Link>
            <span className="mx-2">/</span>
            <span className="text-slate-600">{data.title}</span>
          </nav>

          {/* Meta info */}
          <div className="flex items-center gap-3 mb-8 text-xs text-slate-400">
            {data.publishedAt && (
              <time dateTime={new Date(data.publishedAt).toISOString()}>
                Published {new Date(data.publishedAt).toLocaleDateString("en-US", {
                  year: "numeric", month: "long", day: "numeric",
                })}
              </time>
            )}
            <span>·</span>
            <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded">{data.slug}</span>
          </div>

          {/* Article content */}
          <div className="prose prose-slate max-w-none prose-headings:font-bold prose-h1:text-3xl prose-h2:text-xl prose-h2:mt-8 prose-p:leading-relaxed prose-li:leading-relaxed">
            <Streamdown>{data.bodyMarkdown}</Streamdown>
          </div>

          {/* Structured data debug (dev mode) */}
          {structuredDataArray.length > 0 && (
            <details className="mt-12 border border-slate-200 rounded p-3 text-xs">
              <summary className="cursor-pointer text-slate-500 font-medium">
                JSON-LD Structured Data ({structuredDataArray.length} schema{structuredDataArray.length > 1 ? "s" : ""})
              </summary>
              <pre className="mt-2 overflow-auto text-slate-600 text-xs bg-slate-50 p-3 rounded">
                {JSON.stringify(structuredDataArray, null, 2)}
              </pre>
            </details>
          )}
        </article>
      </div>
    </>
  );
}
