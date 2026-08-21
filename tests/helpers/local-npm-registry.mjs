/*
 * Copyright 2026 Arka Labs
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { createReadStream, readFileSync } from "node:fs";
import { createServer } from "node:http";

const configurationPath = process.argv[2];
if (configurationPath === undefined) throw new Error("Configuration de registre npm local absente.");

const configuration = JSON.parse(readFileSync(configurationPath, "utf8"));
const artifacts = new Map(Object.entries(configuration.artifacts));
const packages = configuration.packages;

const server = createServer((request, response) => {
  const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
  const pathname = decodeURIComponent(requestUrl.pathname);
  if (pathname === "/-/ping") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end("{}");
    return;
  }
  if (pathname.startsWith("/tarballs/")) {
    const artifactPath = artifacts.get(pathname.slice("/tarballs/".length));
    if (typeof artifactPath !== "string") {
      response.writeHead(404);
      response.end();
      return;
    }
    response.writeHead(200, { "content-type": "application/octet-stream" });
    createReadStream(artifactPath).on("error", () => response.destroy()).pipe(response);
    return;
  }

  const packageName = pathname.slice(1);
  const packageMetadata = packages[packageName];
  if (packageMetadata === undefined) {
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "not_found" }));
    return;
  }
  response.writeHead(200, { "content-type": "application/json" });
  const host = request.headers.host ?? "127.0.0.1";
  const versions = Object.fromEntries(Object.entries(packageMetadata.versions).map(([version, record]) => [
    version,
    {
      ...record.manifest,
      dist: {
        tarball: `http://${host}/tarballs/${record.artifactId}`,
        integrity: record.integrity,
      },
    },
  ]));
  response.end(JSON.stringify({
    name: packageName,
    "dist-tags": { latest: packageMetadata.latest },
    versions,
  }));
});

server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Adresse du registre npm local invalide.");
  process.stdout.write(`${JSON.stringify({ url: `http://127.0.0.1:${address.port}/` })}\n`);
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
