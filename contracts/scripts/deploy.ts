import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

function toBytes32MatchId(raw: string): string {
  if (raw.startsWith("0x") && raw.length === 66) {
    return raw;
  }

  const capped = raw.slice(0, 31);
  return ethers.encodeBytes32String(capped);
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const contractFactory = await ethers.getContractFactory("PhonkArenaResults");

  const minDuration = Number(process.env.MIN_DURATION_SECONDS ?? "0");
  const arena = await contractFactory.deploy(minDuration);
  await arena.waitForDeployment();

  const address = await arena.getAddress();

  const matchIdRaw = process.env.MATCH_ID ?? "MONAD-MAIN-001";
  const matchId = toBytes32MatchId(matchIdRaw);
  const autoStart = process.env.AUTO_START_MATCH === "true";

  if (autoStart) {
    const startTx = await arena.startMatch(matchId);
    await startTx.wait();
    console.log("Match started on-chain:", matchIdRaw, matchId);
  }

  console.log("Deployer:", deployer.address);
  console.log("PhonkArenaResults:", address);
  console.log("Min duration:", minDuration, "seconds");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});