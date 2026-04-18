import { runPreviewCapture } from "./lib/prepare.js";

function parsePointList(rawValue) {
  return String(rawValue || "")
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value));
}

async function main() {
  const [roundId, startSec, endSec, capturePoints] = process.argv.slice(2);
  if (!roundId) {
    throw new Error(
      "Usage: npm run preview -- {system}_round{No} [startSec] [endSec] [capturePoint1,capturePoint2]"
    );
  }

  const payload = await runPreviewCapture({
    roundId,
    startSec: startSec == null ? undefined : Number(startSec),
    endSec: endSec == null ? undefined : Number(endSec),
    capturePointsSec: parsePointList(capturePoints),
  });

  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
