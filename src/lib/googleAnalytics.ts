/** GA4 Measurement ID（例: G-XXXXXXXXXX）。未設定なら計測しない。 */
export function getGaMeasurementId(): string | null {
  const id = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();
  return id || "G-V9XD87ZDQ6";
}
