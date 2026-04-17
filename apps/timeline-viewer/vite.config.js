import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const sourceRoot = path.join(repoRoot, "source");
const DEFAULT_REQUEST_KINDS = ["document-get", "document-post", "ajax"];
const ALL_GROUPS_VALUE = "__all__";
const DEFAULT_ZOOM = 0.05;

function createDefaultViewerState(roundId) {
  return {
    version: 2,
    roundId,
    startAnchor: null,
    endAnchor: null,
    hiddenSliceIds: [],
    offsets: {},
    zoom: DEFAULT_ZOOM,
    selectedGroupIds: [ALL_GROUPS_VALUE],
    requestKindFilter: [...DEFAULT_REQUEST_KINDS],
    requestUrlPattern: "",
    updatedAt: null,
  };
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf-8"));
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function listRounds() {
  const entries = await fs.readdir(sourceRoot, { withFileTypes: true });
  const roundDirs = entries
    .filter((entry) => entry.isDirectory() && /^round\d+$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => Number(left.replace(/\D+/g, "")) - Number(right.replace(/\D+/g, "")));

  const rounds = [];
  for (const roundId of roundDirs) {
    const metaPath = path.join(sourceRoot, roundId, "viewer", "round-meta.json");
    if (await fileExists(metaPath)) {
      rounds.push(await readJson(metaPath));
    }
  }

  return rounds;
}

function timelineApiPlugin() {
  return {
    name: "timeline-viewer-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/")) {
          next();
          return;
        }

        const url = new URL(req.url, "http://localhost");
        const pathname = url.pathname;

        const sendJson = (statusCode, payload) => {
          res.statusCode = statusCode;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify(payload, null, 2));
        };

        const readBody = async () =>
          new Promise((resolve, reject) => {
            let body = "";
            req.on("data", (chunk) => {
              body += chunk;
            });
            req.on("end", () => resolve(body));
            req.on("error", reject);
          });

        try {
          if (pathname === "/api/round-index" && req.method === "GET") {
            sendJson(200, {
              generatedAt: new Date().toISOString(),
              rounds: await listRounds(),
              writable: true,
            });
            return;
          }

          const match = pathname.match(/^\/api\/rounds\/([^/]+)\/(timeline|state)$/);
          if (!match) {
            sendJson(404, { error: `Unknown API route: ${pathname}` });
            return;
          }

          const [, roundId, resource] = match;
          const roundRoot = path.join(sourceRoot, roundId);
          const viewerRoot = path.join(roundRoot, "viewer");
          const timelinePath = path.join(viewerRoot, "timeline.json");
          const statePath = path.join(viewerRoot, "viewer-state.json");

          if (!(await fileExists(timelinePath))) {
            sendJson(404, { error: `Missing timeline data for ${roundId}. Run timeline prepare first.` });
            return;
          }

          if (resource === "timeline" && req.method === "GET") {
            sendJson(200, await readJson(timelinePath));
            return;
          }

          if (resource === "state" && req.method === "GET") {
            const payload = (await fileExists(statePath))
              ? await readJson(statePath)
              : createDefaultViewerState(roundId);
            sendJson(200, payload);
            return;
          }

          if (resource === "state" && req.method === "POST") {
            const rawBody = await readBody();
            const nextState = JSON.parse(rawBody || "{}");
            await fs.mkdir(viewerRoot, { recursive: true });
            await fs.writeFile(
              statePath,
              JSON.stringify(
                {
                  ...createDefaultViewerState(roundId),
                  ...nextState,
                  roundId,
                  updatedAt: new Date().toISOString(),
                },
                null,
                2
              ),
              "utf-8"
            );
            sendJson(200, { ok: true, updatedAt: new Date().toISOString() });
            return;
          }

          sendJson(405, { error: `Method ${req.method} not allowed for ${pathname}` });
        } catch (error) {
          sendJson(500, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [vue(), timelineApiPlugin()],
  server: {
    port: 4173,
  },
});
