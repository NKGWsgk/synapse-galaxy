/** GIS + signInWithIdToken 用の nonce（生値と SHA-256 ハッシュ）を生成する */
export async function generateGoogleAuthNonce(): Promise<[raw: string, hashed: string]> {
  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
  const encodedNonce = new TextEncoder().encode(nonce);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encodedNonce);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashedNonce = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return [nonce, hashedNonce];
}
