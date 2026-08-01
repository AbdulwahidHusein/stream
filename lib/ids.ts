/**
 * ID generation. Public IDs are the only ones that appear in URLs, so §14
 * requires them to be high-entropy (≥ 10 chars) rather than sequential.
 */

/** Unambiguous alphabet — no 0/O/1/l/I to survive being read aloud or retyped. */
const PUBLIC_ALPHABET = "23456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
const PUBLIC_ID_LENGTH = 12;

/** ~70 bits of entropy — unguessable, since the share link is the only access control. */
export function newPublicId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(PUBLIC_ID_LENGTH));
  let out = "";
  for (const byte of bytes) out += PUBLIC_ALPHABET[byte % PUBLIC_ALPHABET.length];
  return out;
}

/** Internal row id. Not sortable yet — swap for UUIDv7/ULID when ordering matters (§8). */
export function newId(): string {
  return crypto.randomUUID();
}
