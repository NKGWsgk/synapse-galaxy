/**
 * 作品ページに出す題名の整形（表示用。DBの題名は変えない）。
 * Amazon電子書籍の商品名や、動画・公式サイトのページ名には、作品名以外が混ざる。検索結果に出る題名なので、作品名だけに寄せる。
 * 整形の結果が空になるときは、元の題名をそのまま返す。
 */

const OPEN = "【";
const CLOSE = "】";

/** 先頭側の「】」だけが残っている題名（【が欠けている）に【を補い、末尾の閉じていない【…（途中で切れた部分）を落とす。 */
function fixBrackets(t: string): string {
  let s = t;
  const firstClose = s.indexOf(CLOSE);
  const firstOpen = s.indexOf(OPEN);
  if (firstClose >= 0 && (firstOpen < 0 || firstClose < firstOpen)) s = OPEN + s;
  const lastOpen = s.lastIndexOf(OPEN);
  if (lastOpen > s.lastIndexOf(CLOSE) && lastOpen > 0) s = s.slice(0, lastOpen);
  return s.trim();
}

/** 「彼岸島 ４８日後… 彼岸島４８日後…」のように、同じ題名が2回続くものを1回にする。 */
function dedupeRepeated(t: string): string {
  const tokens = t.split(/\s+/);
  for (let k = 1; k <= tokens.length - 1; k++) {
    const head = tokens.slice(0, k).join("");
    const tail = tokens.slice(k).join("");
    if (head.length >= 3 && head === tail) return tokens.slice(0, k).join(" ");
  }
  return t;
}

export function cleanWorkTitle(raw: string): string {
  const original = raw.trim();
  let s = original;
  // 電子書籍の商品名: 末尾の eBook / Kindle版
  s = s.replace(/\s*(?:eBook|Kindle版|Kindle Edition)\s*$/i, "");
  // 【電子単行本】【単行本版】【電子コミック限定特典付き】などの販売形態の括弧
  s = s.replace(/\s*【[^】]*(?:電子|単行本|特典|Kindle|限定|コミック版)[^】]*】\s*/g, " ");
  // 出版社レーベル（(A.L.C. DX) のような、略称のドットを含む括弧）
  s = s.replace(/\s*\((?:[A-Z]\.){2,}[^)]*\)\s*$/, "");
  // 巻数の前の「 ： 」
  s = s.replace(/\s*[：:]\s+(?=\d)/g, " ");
  // サイト名・ストア名の付け足し
  s = s.replace(/\s*[|｜]\s*[^|｜]*(?:公式サイト|公式|Official|Netflix|Amazon\.co\.jp|YouTube|Prime Video|Disney\+|U-NEXT)[^|｜]*$/i, "");
  s = s.replace(/\s+-\s+(?:Amazon\.co\.jp|Netflix|YouTube|Prime Video)\s*$/i, "");
  s = s.replace(/\s+/g, " ").trim();
  s = dedupeRepeated(s);
  s = fixBrackets(s);
  s = s.replace(/\s+/g, " ").trim();
  return s.length >= 2 ? s : original;
}
