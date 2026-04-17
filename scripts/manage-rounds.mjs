import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const sourceRoot = path.join(repoRoot, "source");
const generatedRoot = path.join(repoRoot, "apps", "timeline-viewer", "public", "generated");

const COMMAND = process.argv[2];
const ROUND_ID = process.argv[3];

function printUsage() {
  console.log(`Usage:
  npm run timeline:round:add -- round{No}
  npm run timeline:round:remove -- round{No}
  npm run timeline:round:restart -- round{No}`);
}

function normalizeRoundId(rawValue) {
  const nextValue = String(rawValue || "").trim().toLowerCase();
  if (!/^round\d+$/.test(nextValue)) {
    throw new Error(`Invalid round id "${rawValue}". Use round{No}, for example round2.`);
  }
  return nextValue;
}

async function fileExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf-8"));
}

async function writeJson(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf-8");
}

async function updateGeneratedIndex(roundIdToDrop) {
  const indexPath = path.join(generatedRoot, "index.json");
  if (!(await fileExists(indexPath))) {
    return;
  }

  const currentIndex = await readJson(indexPath);
  const nextRounds = (currentIndex.rounds || []).filter((round) => round.id !== roundIdToDrop);
  await writeJson(indexPath, {
    ...currentIndex,
    generatedAt: new Date().toISOString(),
    rounds: nextRounds,
  });
}

async function addRound(roundId) {
  const roundRoot = path.join(sourceRoot, roundId);
  await fs.mkdir(roundRoot, { recursive: true });

  console.log(`Created ${roundId} at ${path.relative(repoRoot, roundRoot)}`);
  console.log("Next:");
  console.log(`1. Put video.mp4, network.har, and recording.json into source/${roundId}/`);
  console.log(`2. Run npm run timeline:prepare`);
  console.log(`3. Run npm run timeline:dev`);
}

async function removeRound(roundId) {
  const roundRoot = path.join(sourceRoot, roundId);
  const generatedRoundRoot = path.join(generatedRoot, roundId);

  await fs.rm(roundRoot, { recursive: true, force: true });
  await fs.rm(generatedRoundRoot, { recursive: true, force: true });
  await updateGeneratedIndex(roundId);

  console.log(`Removed source/${roundId} and generated viewer output.`);
}

async function restartRound(roundId) {
  const roundRoot = path.join(sourceRoot, roundId);
  if (!(await fileExists(roundRoot))) {
    throw new Error(`source/${roundId} does not exist. Create it first with timeline:round:add.`);
  }

  await fs.rm(path.join(roundRoot, "artifacts"), { recursive: true, force: true });
  await fs.rm(path.join(roundRoot, "viewer"), { recursive: true, force: true });
  await fs.rm(path.join(generatedRoot, roundId), { recursive: true, force: true });
  await updateGeneratedIndex(roundId);

  console.log(`Cleared artifacts and viewer output for ${roundId}.`);
  console.log("Source files were kept. Re-run npm run timeline:prepare to rebuild the timeline.");
}

async function main() {
  if (!COMMAND || !ROUND_ID) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const roundId = normalizeRoundId(ROUND_ID);

  if (COMMAND === "add") {
    await addRound(roundId);
    return;
  }

  if (COMMAND === "remove") {
    await removeRound(roundId);
    return;
  }

  if (COMMAND === "restart") {
    await restartRound(roundId);
    return;
  }

  throw new Error(`Unknown command "${COMMAND}". Use add, remove, or restart.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
