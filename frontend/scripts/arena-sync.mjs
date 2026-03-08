const baseUrl = (process.env.ARENA_SYNC_BASE_URL || "").trim().replace(/\/+$/, "");
const adminSecret = (process.env.ADMIN_SECRET || "").trim();
const maxAttempts = 3;
const retryDelayMs = 4_000;

if (!baseUrl) {
  console.error("ARENA_SYNC_BASE_URL is required.");
  process.exit(1);
}

if (!adminSecret) {
  console.error("ADMIN_SECRET is required.");
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function callAdminRoute(path) {
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
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
    } catch (error) {
      lastError = error;

      if (attempt < maxAttempts) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`${path} attempt ${attempt} failed. Retrying in ${retryDelayMs}ms. ${message}`);
        await sleep(retryDelayMs);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`${path} failed`);
}

async function runStep(label, path) {
  try {
    const result = await callAdminRoute(path);
    console.log(`${label}:`, JSON.stringify(result));
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`${label} warning: ${message}`);
    return false;
  }
}

async function main() {
  console.log(`Arena sync started for ${baseUrl}`);

  const finalizeOk = await runStep("Finalize", "/api/admin/epoch-finalize");
  const startOk = await runStep("Start", "/api/admin/epoch-start");

  console.log(`Arena sync finished${finalizeOk && startOk ? "." : " with warnings."}`);
}

main().catch((error) => {
  console.error("Arena sync failed.", error);
  process.exit(1);
});
