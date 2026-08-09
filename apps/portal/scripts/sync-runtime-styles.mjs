import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const portalRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const targets = [
  ["node_modules/react-datepicker/dist/react-datepicker.css", "public/vendor/react-datepicker.css"],
  ["node_modules/react-phone-input-2/lib/style.css", "public/vendor/react-phone-input.css"],
  ["node_modules/leaflet/dist/leaflet.css", "public/vendor/leaflet.css"],
  ["app/booking-mobile.css", "public/vendor/booking-mobile.css"],
];

await mkdir(resolve(portalRoot, "public/vendor"), { recursive: true });

for (const [source, destination] of targets) {
  await copyFile(resolve(portalRoot, source), resolve(portalRoot, destination));
}

console.log(`Synced ${targets.length} runtime stylesheet assets.`);
