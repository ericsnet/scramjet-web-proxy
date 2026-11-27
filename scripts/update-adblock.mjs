import { updateBlocklist, adblockStats } from "../adblock.js";

const force = process.argv.includes("--force");
const result = await updateBlocklist({ force });
console.log(JSON.stringify(result, null, 2));
if (result.error) process.exitCode = 1;
else console.log("Lista activa:", adblockStats().count, "dominios");
