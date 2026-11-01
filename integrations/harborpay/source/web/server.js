import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const port = Number(process.env.PORT || 4173);
const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), "dist");

app.disable("x-powered-by");
app.get("/healthz", (_request, response) => response.json({ ok: true, service: "harborpay-web" }));
app.use(express.static(dist, { index: false }));
app.get("*", (_request, response) => response.sendFile(path.join(dist, "index.html")));
app.listen(port, "0.0.0.0");
