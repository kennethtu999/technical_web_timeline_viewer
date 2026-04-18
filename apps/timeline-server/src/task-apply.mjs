import { applyRoundWithBaseline } from "./lib/prepare.js";

async function main() {
  const [roundId] = process.argv.slice(2);
  if (!roundId) {
    throw new Error("Usage: npm run apply -- {system}_round{No}");
  }

  const payload = await applyRoundWithBaseline({
    roundId,
  });

  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
