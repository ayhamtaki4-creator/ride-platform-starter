import { generateKeyPairSync } from "node:crypto";

const { publicKey, privateKey } = generateKeyPairSync("ec", {
  namedCurve: "prime256v1",
});

const publicJwk = publicKey.export({ format: "jwk" });
const privateJwk = privateKey.export({ format: "jwk" });

if (!publicJwk.x || !publicJwk.y || !privateJwk.d) {
  throw new Error("Failed to export P-256 VAPID keys.");
}

const applicationServerKey = Buffer.concat([
  Buffer.from([0x04]),
  Buffer.from(publicJwk.x, "base64url"),
  Buffer.from(publicJwk.y, "base64url"),
]).toString("base64url");

console.log("WEB_PUSH_ENABLED=\"true\"");
console.log(`WEB_PUSH_PUBLIC_KEY=\"${applicationServerKey}\"`);
console.log(`WEB_PUSH_PRIVATE_KEY=\"${privateJwk.d}\"`);
console.log('WEB_PUSH_SUBJECT="mailto:ops@example.com"');
console.log("");
console.log("Replace WEB_PUSH_SUBJECT with an email or HTTPS contact URI you control.");
console.log("Keep WEB_PUSH_PRIVATE_KEY only on the API server and never expose it to the portal.");
