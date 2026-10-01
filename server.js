const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public");
const SEED = path.join(ROOT, "data", "pages.json");
const LOCAL_DB = process.env.DB_PATH || path.join("/tmp", "notion-pages.json");
const MONGO_URI = process.env.MONGODB_URI || "";
const MONGO_DB = process.env.MONGODB_DB || "notion";
const MONGO_COL = process.env.MONGODB_COLLECTION || "pages";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function seedPages() {
  try { return JSON.parse(fs.readFileSync(SEED, "utf8")); } catch { return []; }
}

let colPromise = null;
async function collection() {
  if (!MONGO_URI) return null;
  if (!colPromise) {
    colPromise = (async () => {
      const { MongoClient } = require("mongodb");
      const client = new MongoClient(MONGO_URI);
      await client.connect();
      const col = client.db(MONGO_DB).collection(MONGO_COL);
      if ((await col.countDocuments()) === 0) {
        const seed = seedPages();
        if (seed.length) await col.insertMany(seed);
      }
      return col;
    })();
  }
  return colPromise;
}

function publicPage(doc, full) {
  const page = { id: doc.id, title: doc.title || "Sin título", updated: Number(doc.updated || 0) };
  if (full) page.body = doc.body || "";
  return page;
}
function localRead() {
  try { if (fs.existsSync(LOCAL_DB)) return JSON.parse(fs.readFileSync(LOCAL_DB, "utf8")); } catch {}
  const seed = seedPages(); localWrite(seed); return seed;
}
function localWrite(rows) { fs.writeFileSync(LOCAL_DB, JSON.stringify(rows, null, 2)); }
function matches(page, q) {
  if (!q) return true;
  return `${page.title} ${page.body || ""}`.toLowerCase().includes(q);
}
function send(res, status, body, type = TYPES[".json"]) {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
function body(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => { raw += c; });
    req.on("end", () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); } });
  });
}
function file(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) return send(res, 404, "No encontrado", "text/plain; charset=utf-8");
    send(res, 200, data, TYPES[path.extname(filePath)] || "application/octet-stream");
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    const col = await collection();
    if (req.method === "GET" && (url.pathname === "/health" || url.pathname === "/healthz")) {
      return send(res, 200, { ok: true, store: col ? "mongodb" : "local" });
    }
    if (req.method === "GET" && url.pathname === "/api/pages") {
      const q = (url.searchParams.get("q") || "").toLowerCase();
      const rows = col ? (await col.find({}, { projection: { _id: 0 } }).toArray()) : localRead();
      return send(res, 200, rows.filter((p) => matches(p, q)).sort((a, b) => Number(b.updated || 0) - Number(a.updated || 0)).map((p) => publicPage(p, false)));
    }
    if (req.method === "POST" && url.pathname === "/api/pages") {
      const data = await body(req);
      const page = { id: "p" + Date.now(), title: String(data.title || "Sin título").slice(0, 80), body: String(data.body || ""), updated: Date.now() };
      if (col) await col.insertOne({ ...page });
      else { const rows = localRead(); rows.push(page); localWrite(rows); }
      return send(res, 201, publicPage(page, true));
    }
    const one = url.pathname.match(/^\/api\/pages\/([^/]+)$/);
    if (one) {
      const id = one[1];
      if (req.method === "GET") {
        if (col) {
          const doc = await col.findOne({ id }, { projection: { _id: 0 } });
          if (!doc) return send(res, 404, { error: "no" });
          return send(res, 200, publicPage(doc, true));
        }
        const page = localRead().find((p) => p.id === id);
        if (!page) return send(res, 404, { error: "no" });
        return send(res, 200, publicPage(page, true));
      }
      if (req.method === "PUT") {
        const data = await body(req);
        const patch = { updated: Date.now() };
        if (data.title != null) patch.title = String(data.title).slice(0, 80);
        if (data.body != null) patch.body = String(data.body).slice(0, 20000);
        if (col) {
          await col.updateOne({ id }, { $set: patch });
          const again = await col.findOne({ id });
          if (!again) return send(res, 404, { error: "no" });
          return send(res, 200, publicPage(again, true));
        }
        const rows = localRead();
        const page = rows.find((p) => p.id === id);
        if (!page) return send(res, 404, { error: "no" });
        Object.assign(page, patch);
        localWrite(rows);
        return send(res, 200, publicPage(page, true));
      }
      if (req.method === "DELETE") {
        if (col) {
          const out = await col.deleteOne({ id });
          return out.deletedCount ? send(res, 200, { ok: true }) : send(res, 404, { error: "no" });
        }
        const rows = localRead();
        const next = rows.filter((p) => p.id !== id);
        if (next.length === rows.length) return send(res, 404, { error: "no" });
        localWrite(next);
        return send(res, 200, { ok: true });
      }
    }
    const rel = url.pathname === "/" ? "/index.html" : url.pathname;
    const safe = path.normalize(rel).replace(/^(\.\.[/\\])+/, "");
    file(res, path.join(PUBLIC, safe));
  } catch (err) {
    console.error(err);
    send(res, 500, { error: "store", detail: String(err.message || err) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`listening on http://${HOST}:${PORT} store=${MONGO_URI ? "mongodb" : "local"}`);
});
