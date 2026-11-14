// Wraps the OpenNext worker to add a cron: every 30 minutes, retry paid orders that are not at CJ yet or
// not paid there (app/api/cj/retry). Plain JS so the type check does not need the build output.
import { default as handler } from "./.open-next/worker.js";

export default {
  fetch: handler.fetch,
  async scheduled(_event, env, ctx) {
    const url = new URL("/api/cj/retry", env.APP_ORIGIN || "https://helpme-cf.sakanapp65.workers.dev");
    ctx.waitUntil(env.WORKER_SELF_REFERENCE.fetch(new Request(url, { method: "POST" }))
      .then(response => { if (!response.ok) console.error("CJ retry cron:", response.status); })
      .catch(err => console.error("CJ retry cron failed:", err.message)));
  }
};
