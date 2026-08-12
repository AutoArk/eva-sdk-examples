export function inspectPubLockPackage(lockText, packageName) {
  const normalized = lockText.replace(/\r\n?/g, "\n");
  const escapedName = escapeRegExp(packageName);
  const block = new RegExp(`^  ${escapedName}:\\n((?: {4,}.*\\n)+)`, "m").exec(normalized)?.[1];
  if (typeof block !== "string") {
    throw new Error(`pub lock is missing ${packageName}`);
  }
  const value = (field) => new RegExp(`^ {4,}${field}: ["']?([^"'\\n]+)["']?\\s*$`, "m").exec(block)?.[1];
  return {
    sha256: value("sha256"),
    source: value("source"),
    url: value("url"),
    version: value("version"),
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
