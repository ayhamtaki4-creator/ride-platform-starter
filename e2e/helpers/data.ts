export function collectObjectKeys(
  value: unknown,
  keys = new Set<string>(),
): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectObjectKeys(item, keys);
    }

    return keys;
  }

  if (
    typeof value !== "object" ||
    value === null
  ) {
    return keys;
  }

  for (const [key, item] of Object.entries(value)) {
    keys.add(key);
    collectObjectKeys(item, keys);
  }

  return keys;
}
