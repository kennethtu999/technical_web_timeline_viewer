import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const sourceRoot = path.join(repoRoot, "source");
const baselineRoot = path.join(sourceRoot, "baseline");
const DEFAULT_SYSTEM_ID = "esbgib";
const ROUND_CONFIG_FILE = "round_config.json";
const ROUND_ID_REGEX = /^(?:[a-z0-9][a-z0-9_-]*_)?round\d+$/i;
const ROUND_ID_PARTS_REGEX = /^(?:([a-z0-9][a-z0-9_-]*)_)?round(\d+)$/i;

const COMMAND = process.argv[2];
const ROUND_ID = process.argv[3];

function printUsage() {
  console.log(`Usage:
  npm run timeline:round:add -- {system}_round{No}
  npm run timeline:round:remove -- {system}_round{No}
  npm run timeline:round:restart -- {system}_round{No}`);
}

function normalizeRoundId(rawValue) {
  const nextValue = String(rawValue || "").trim().toLowerCase();
  if (!ROUND_ID_REGEX.test(nextValue)) {
    throw new Error(
      `Invalid round id "${rawValue}". Use round{No} or {system}_round{No}, for example round2 or megageb_round1.`
    );
  }
  return nextValue;
}

function parseRoundId(roundId) {
  const normalizedRoundId = normalizeRoundId(roundId);
  const parts = normalizedRoundId.match(ROUND_ID_PARTS_REGEX);
  if (!parts) {
    throw new Error(`Invalid round id "${roundId}".`);
  }

  return {
    normalizedRoundId,
    systemId: String(parts[1] || "").trim() || DEFAULT_SYSTEM_ID,
    roundNumber: Number(parts[2]),
  };
}

async function fileExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function addRound(roundId) {
  const roundInfo = parseRoundId(roundId);
  const roundRoot = path.join(sourceRoot, roundInfo.normalizedRoundId);
  await fs.mkdir(roundRoot, { recursive: true });
  const roundConfigPath = path.join(roundRoot, ROUND_CONFIG_FILE);
  const systemDefaultConfigPath = path.join(
    baselineRoot,
    `${roundInfo.systemId}_round_default.json`
  );

  if (!(await fileExists(roundConfigPath)) && (await fileExists(systemDefaultConfigPath))) {
    const config = JSON.parse(await fs.readFile(systemDefaultConfigPath, "utf-8"));
    await fs.writeFile(
      roundConfigPath,
      JSON.stringify(
        {
          ...config,
          system_id: String(config.system_id || roundInfo.systemId).trim() || roundInfo.systemId,
          round_key:
            String(config.round_key || "").trim() ||
            `${roundInfo.systemId}_round_${roundInfo.roundNumber}`,
        },
        null,
        2
      ),
      "utf-8"
    );
  }

  console.log(`Created ${roundInfo.normalizedRoundId} at ${path.relative(repoRoot, roundRoot)}`);
  console.log("Next:");
  console.log(`1. Put video.mp4, network.har, and recording.json into source/${roundInfo.normalizedRoundId}/`);
  console.log(`2. Check source/${roundInfo.normalizedRoundId}/${ROUND_CONFIG_FILE}`);
  console.log(`3. Run npm run timeline:prepare`);
  console.log(`4. Run npm run timeline:dev`);
}

async function removeRound(roundId) {
  const roundRoot = path.join(sourceRoot, normalizeRoundId(roundId));

  await fs.rm(roundRoot, { recursive: true, force: true });

  console.log(`Removed source/${roundId}.`);
}

async function restartRound(roundId) {
  const normalizedRoundId = normalizeRoundId(roundId);
  const roundRoot = path.join(sourceRoot, normalizedRoundId);
  if (!(await fileExists(roundRoot))) {
    throw new Error(`source/${normalizedRoundId} does not exist. Create it first with timeline:round:add.`);
  }

  await fs.rm(path.join(roundRoot, "artifacts"), { recursive: true, force: true });
  await fs.rm(path.join(roundRoot, "viewer"), { recursive: true, force: true });
  await fs.rm(path.join(roundRoot, "preview"), { recursive: true, force: true });

  console.log(`Cleared artifacts, preview, and viewer output for ${normalizedRoundId}.`);
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
