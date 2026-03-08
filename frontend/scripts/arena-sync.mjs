const baseUrl = (process.env.ARENA_SYNC_BASE_URL || "").trim().replace(/\/+$/, "");
const adminSecret = (process.env.ADMIN_SECRET || "").trim();

if (!baseUrl) {
  console.error("ARENA_SYNC_BASE_URL is required.");
  process.exit(1);
}

if (!adminSecret) {
  console.error("ADMIN_SECRET is required.");
  process.exit(1);
}

async function callAdminRoute(path) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${adminSecret}`,
      "Content-Type": "application/json",
    },
  });

  const rawBody = await response.text();
  let payload = null;

  try {
    payload = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    payload = rawBody;
  }

  if (!response.ok) {
    const errorMessage =
      payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : typeof payload === "string"
          ? payload
          : `HTTP ${response.status}`;

    throw new Error(`${path} failed: ${errorMessage}`);
  }

  return payload;
}

async function main() {
  console.log(`Arena sync started for ${baseUrl}`);

  const finalizeResult = await callAdminRoute("/api/admin/epoch-finalize");
  console.log("Finalize:", JSON.stringify(finalizeResult));

  const startResult = await callAdminRoute("/api/admin/epoch-start");
  console.log("Start:", JSON.stringify(startResult));

  console.log("Arena sync finished.");
}

main().catch((error) => {
  console.error("Arena sync failed.", error);
  process.exit(1);
});
