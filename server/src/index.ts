import { createApp } from "./app.js";

const { app, workflows, store } = await createApp();
const port = Number(process.env.PORT ?? 3001);

const automationHandle = setInterval(() => {
  workflows.processDueAutomations().catch((error) => {
    console.error("automation_loop_failed", error);
  });
}, 60_000);

const server = app.listen(port, () => {
  console.log(`API running on http://localhost:${port}`);
});

const shutdown = async () => {
  clearInterval(automationHandle);
  server.close();
  await store.close();
};

process.on("SIGINT", () => {
  void shutdown();
});

process.on("SIGTERM", () => {
  void shutdown();
});
