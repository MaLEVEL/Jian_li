import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(await readFile(path.join(here, "..", "manifest.json"), "utf8"));
const background = await readFile(path.join(here, "..", "background.js"), "utf8");
const backendConfig = await readFile(path.join(here, "..", "..", "backend", "app", "config.py"), "utf8");

assert.equal(manifest.manifest_version, 3);
assert.deepEqual(manifest.permissions, ["storage", "scripting", "activeTab"]);
assert.ok(!manifest.host_permissions.some((value) => value.includes("zhipin.com")), "extension must not receive persistent BOSS host access");
assert.ok(manifest.host_permissions.every((value) => /^http:\/\/(127\.0\.0\.1|localhost)\//.test(value)));
assert.deepEqual(manifest.optional_host_permissions, ["http://*/*", "https://*/*"]);
assert.equal(typeof manifest.key, "string");
const publicKey = Buffer.from(manifest.key, "base64");
const extensionId = [...createHash("sha256").update(publicKey).digest("hex").slice(0, 32)]
  .map((digit) => String.fromCharCode(97 + Number.parseInt(digit, 16)))
  .join("");
assert.match(extensionId, /^[a-p]{32}$/);
assert.match(backendConfig, new RegExp(`DEFAULT_EXTENSION_ORIGIN = 'chrome-extension://${extensionId}'`));
assert.match(background, /DEFAULT_SERVER_URL = "http:\/\/127\.0\.0\.1:18001"/);
assert.match(background, /host\.endsWith\("\.ts\.net"\)/);
assert.match(background, /parts\[0\] === 127/);

console.log(`manifest tests passed: stable extension id ${extensionId}`);
