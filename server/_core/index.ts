import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { registerHealthRoute } from "../health";
import { startAllWorkers, stopAllWorkers } from "../workers/stubs";
import { resolveBaseUrlInfo } from "../m5/baseUrl";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  registerHealthRoute(app);

  // Dev-only endpoints (no auth, only works in development)
  if (process.env.NODE_ENV === 'development') {
    app.post('/api/dev/seed-topics', async (_req, res) => {
      try {
        const { runTopicDiscovery } = await import('../m2/worker');
        const results = await runTopicDiscovery(['seeded', 'seasonal']);
        res.json({ success: true, results });
      } catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
      }
    });

    app.post('/api/dev/accept-topics', async (req, res) => {
      try {
        const { getDb } = await import('../db');
        const { topics } = await import('../../drizzle/schema');
        const { eq, desc } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) { res.json({ accepted: 0 }); return; }
        const count = (req.body as { count?: number }).count ?? 3;
        const candidates = await db.select({ id: topics.id }).from(topics)
          .where(eq(topics.status, 'candidate'))
          .orderBy(desc(topics.opportunityScore as Parameters<typeof desc>[0]))
          .limit(count);
        for (const { id } of candidates) {
          await db.update(topics).set({ status: 'accepted' }).where(eq(topics.id, id));
        }
        res.json({ accepted: candidates.length, topicIds: candidates.map(t => t.id) });
      } catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
      }
    });

    app.post('/api/dev/generate-batch', async (req, res) => {
      try {
        const { runContentGeneration } = await import('../m3/worker');
        const batchSize = (req.body as { batchSize?: number }).batchSize ?? 3;
        const results = await runContentGeneration({ batchSize });
        const totalCost = results.reduce((s, r) => s + r.estimatedCostUsd, 0);
        res.json({
          success: true,
          results,
          summary: {
            succeeded: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length,
            totalCostUsd: parseFloat(totalCost.toFixed(6)),
          }
        });
      } catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
      }
    });

    app.post('/api/dev/review-all', async (_req, res) => {
      try {
        const { reviewAllPendingPages } = await import('../m4/runner');
        const results = await reviewAllPendingPages();
        res.json({ success: true, results });
      } catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
      }
    });

    app.post('/api/dev/publish-all', async (req, res) => {
      try {
        const { publishAllApproved } = await import('../m5/publisher');
        const { baseUrl } = resolveBaseUrlInfo(req);
        const results = await publishAllApproved(baseUrl);
        res.json({ success: true, published: results.filter(r => r.success).length, results });
      } catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
      }
    });
  }

  // Sitemap endpoint (public)
  app.get('/sitemap.xml', async (req, res) => {
    try {
      const { generateSitemapEntries, buildSitemapXml } = await import('../m5/sitemap');
      const { baseUrl } = resolveBaseUrlInfo(req);
      const entries = await generateSitemapEntries(baseUrl);
      const xml = buildSitemapXml(entries, baseUrl);
      res.set('Content-Type', 'application/xml');
      res.send(xml);
    } catch (err) {
      res.status(500).send('Sitemap generation failed');
    }
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    // Start background workers (stubs in M1, full impl in M2-M5)
    startAllWorkers();
  });

  // Graceful shutdown
  process.on("SIGTERM", async () => {
    console.log("[Server] SIGTERM received, shutting down workers...");
    await stopAllWorkers();
    server.close(() => process.exit(0));
  });
}

startServer().catch(console.error);
