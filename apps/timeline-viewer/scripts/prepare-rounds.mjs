import { runPrepareCli } from "../../timeline-server/src/lib/prepare.js";

runPrepareCli(process.argv.slice(2)).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
