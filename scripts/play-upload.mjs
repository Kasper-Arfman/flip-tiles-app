// Uploads the signed app bundle to Google Play's internal testing track (run by the Android release
// workflow; docs/developer/deploy/android.md). Talks to the Google Play Developer API directly, so
// when Google refuses, its own explanation is printed (a ready-made action only said "Unknown
// error occurred").
//   GOOGLE_PLAY_SERVICE_ACCOUNT_JSON=... node scripts/play-upload.mjs <file.aab>
// An app that was never published only takes *draft* releases: then it tries again as a draft.
// Writes result=completed|draft|failed (and the reason) to $GITHUB_OUTPUT for the run's summary.
import { createSign } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";

const PACKAGE = "com.kasperarfman.fliptiles";
const TRACK = "internal";
const API = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE}`;
const UPLOAD = `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${PACKAGE}`;

const output = (name, value) => {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${name}<<EOF\n${value}\nEOF\n`);
};
// (ends the script by an error that the end of this file reports; process.exit() while a network
// connection is still open can crash Node on Windows)
class Refused extends Error {}
const fail = (message) => {
  throw new Refused(message);
};
process.on("uncaughtException", (error) => {
  const message = error instanceof Refused ? error.message : String(error?.stack ?? error);
  console.error(`\nNot uploaded to Google Play: ${message}`);
  output("result", "failed");
  output("reason", message);
  process.exitCode = 1;
});

const file = process.argv[2];
if (!file) fail("no .aab given (node scripts/play-upload.mjs <file.aab>)");

let key;
try {
  key = JSON.parse(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON ?? "");
} catch {
  fail("the secret GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is missing or not valid JSON: paste the whole content of the service account's .json file");
}
if (!key.client_email || !key.private_key) fail("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON has no client_email or private_key: is it the service account's key file?");
console.log(`Service account: ${key.client_email}`);

// A token for the API: a JWT signed with the service account's key, traded in at Google
const base64url = (data) => Buffer.from(data).toString("base64url");
async function accessToken() {
  const now = Math.floor(Date.now() / 1000);
  const tokenUri = key.token_uri ?? "https://oauth2.googleapis.com/token";
  const claims = { iss: key.client_email, scope: "https://www.googleapis.com/auth/androidpublisher", aud: tokenUri, iat: now, exp: now + 3600 };
  const unsigned = `${base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64url(JSON.stringify(claims))}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(key.private_key, "base64url");
  const response = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`signing in as the service account failed: ${body.error_description ?? body.error ?? response.status}`);
  return body.access_token;
}

const token = await accessToken().catch((error) => fail(error.message));

async function call(method, url, body, contentType = "application/json") {
  const response = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
    body: body === undefined ? undefined : contentType === "application/json" ? JSON.stringify(body) : body,
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const error = new Error(`${json.error?.message ?? text} (HTTP ${response.status})`);
    error.status = response.status;
    throw error;
  }
  return json;
}

// One "edit": open it, add the bundle, put it on the track, commit (all or nothing)
async function upload(status) {
  const edit = await call("POST", `${API}/edits`, {});
  const bundle = await call("POST", `${UPLOAD}/edits/${edit.id}/bundles?uploadType=media`, readFileSync(file), "application/octet-stream");
  console.log(`Uploaded version code ${bundle.versionCode}`);
  await call("PUT", `${API}/edits/${edit.id}/tracks/${TRACK}`, {
    track: TRACK,
    releases: [{ versionCodes: [String(bundle.versionCode)], status, ...(process.env.RELEASE_NAME ? { name: process.env.RELEASE_NAME } : {}) }],
  });
  await call("POST", `${API}/edits/${edit.id}:commit`);
}

try {
  await upload("completed");
  console.log(`Released to ${TRACK} testing.`);
  output("result", "completed");
} catch (error) {
  if (!/draft/i.test(error.message)) {
    const hint =
      error.status === 401 || error.status === 403
        ? " — the service account may not have access: Play Console → Users and permissions → the service account → this app, with 'Release to testing tracks'; and in Google Cloud the 'Google Play Android Developer API' must be enabled. A new invitation can take up to a day."
        : "";
    fail(error.message + hint);
  }
  console.log(`Google only takes a draft for this app (${error.message}): trying again as a draft.`);
  try {
    await upload("draft");
    console.log(`Uploaded to ${TRACK} testing as a draft.`);
    output("result", "draft");
  } catch (draftError) {
    fail(draftError.message);
  }
}
