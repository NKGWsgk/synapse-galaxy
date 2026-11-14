/** クライアントからも使える、シェア文面・URL の組み立て（サーバー専用の依存を持たない） */

/** X（旧Twitter）の投稿画面を開く URL */
export function buildXIntentUrl(text: string, url: string): string {
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
}

/** シェア投稿の本文雛形（URL は別パラメータで付く） */
export function buildShareText(d: { title: string; source: { title: string }; target: { title: string } }): string {
  const head = `『${d.source.title}』→『${d.target.title}』`;
  return d.title ? `${head}\n「${d.title}」でつなぎました\n#シナプスギャラクシー` : `${head}\nをつなぎました\n#シナプスギャラクシー`;
}
