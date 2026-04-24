import { readFileSync } from "fs";
import { resolve } from "path";

import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

interface SidecarArtifact {
  abi: unknown[];
  bytecode: string;
  contractName?: string;
}

function readSidecarArtifact(): SidecarArtifact {
  const artifactPath = resolve(__dirname, "../../frontend/src/lib/abi/PhonkArenaSidecar.json");
  return JSON.parse(readFileSync(artifactPath, "utf8")) as SidecarArtifact;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const artifact = readSidecarArtifact();
  const epochDurationSeconds = BigInt(process.env.ARENA_EPOCH_DURATION_SECONDS ?? "86400");
  const contractFactory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, deployer);

  const sidecar = await contractFactory.deploy(epochDurationSeconds);
  await sidecar.waitForDeployment();

  const address = await sidecar.getAddress();

  console.log("Deployer:", deployer.address);
  console.log(`${artifact.contractName ?? "PhonkArenaSidecar"}:`, address);
  console.log("Epoch duration:", epochDurationSeconds.toString(), "seconds");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
