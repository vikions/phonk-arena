import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const privateKey = process.env.PRIVATE_KEY ?? "";
const formattedPrivateKey = privateKey
  ? privateKey.startsWith("0x")
    ? privateKey
    : `0x${privateKey}`
  : "";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    preferWasm: true,
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    monadMainnet: {
      url: process.env.MONAD_RPC ?? "",
      chainId: 143,
      accounts: formattedPrivateKey ? [formattedPrivateKey] : [],
    },
  },
};

export default config;
