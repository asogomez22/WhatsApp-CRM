import { createApp } from "./app.js";

const { app, workflows } = createApp();
const port = Number(process.env.PORT ?? 3001);

app.listen(port, () => {
  console.log(`API running on http://localhost:${port}`);
});

setInterval(() => {
  workflows.processDueAutomations().catch((error) => {
    console.error("automation_loop_failed", error);
  });
}, 60_000);
