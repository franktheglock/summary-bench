export function getCanonicalOrigin(): string | null {
  const canonicalOrigin = process.env.NEXT_PUBLIC_CANONICAL_ORIGIN?.trim();

  if (!canonicalOrigin) {
    return null;
  }

  try {
    return new URL(canonicalOrigin).origin;
  } catch {
    return null;
  }
}
