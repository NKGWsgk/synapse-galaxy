/**
 * 日本語のキーワード短文在狭い横幅で折り返すとき、助詞などの後にだけ
 * Unicode 零幅スペース (U+200B) で改行候補を入れる。
 * （カタカナ語の語中で切れにくくする目的。完全な分かち書きではない）
 */
const ZWSP = "\u200b";

/** @internal escaped for RegExp ctor */
function escRe(p: string): string {
  return p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 全角カタカナ＋長音を連続塊として、そのあいだの \u200b を除去（サバイ｜ブ 等）。 */
function stripZwspBetweenKatakana(s: string): string {
  const re = /([\u30A1-\u30FC])\u200b([\u30A1-\u30FC])/gu;
  let t = s;
  for (;;) {
    const next = t.replace(re, "$1$2");
    if (next === t) break;
    t = next;
  }
  return t;
}

/** 複合→長い順。先行は「ひらカタ漢」の典型先頭のみ */
export function jaKeywordSoftBreakHints(raw: string): string {
  const t = raw.normalize("NFC").replace(/\u200b/g, "");
  const follow = "(?=[々〆ぁ-んァ-ヴー一-龥・゛゜〝〟（）《》〈〉「」『』【】〖〗\\[\\]])";
  const phrases = [
    "について",
    "に対して",
    "によって",
    "ために",
    "という",
    "ような",
    "からの",
    "への",
    "には",
    "では",
    "でも",
    "とは",
    "のみ",
    "だけ",
    "しか",
    "ので",
    "とも",
    "にも",
    "より",
    "まで",
    "など",
    "から",
    "ため",
  ].sort((a, b) => b.length - a.length);

  let out = t;
  for (const p of phrases) {
    const re = new RegExp(`${escRe(p)}(?!${escRe(ZWSP)})${follow}`, "gu");
    out = out.replace(re, `${p}${ZWSP}`);
  }

  // 「よ」を助詞セットから分離: 「よりDEEP」のように英字続きではフレーズ「より」がマッチしないため、
  // 「よ」のみが後続ひらならとのルールで よ|\u200B|り と誤って分割されるのを防ぐ。
  /** 助詞など1文字（※よ・も・よのみは別処理。「を」は短い題で頭だけ孤立1行になり余白だけ広くなりやすいので単独ルールに含めず、折返しは CSS に任せる） */
  const reSingle = new RegExp(`([がとはやねわねばゃゅょ])(?!${escRe(ZWSP)})${follow}`, "gu");
  out = out.replace(reSingle, `$1${ZWSP}`);
  const reYoOnly = new RegExp(`よ(?!${escRe(ZWSP)})(?!り)${follow}`, "gu");
  out = out.replace(reYoOnly, `よ${ZWSP}`);
  /** 「おもしろい」「おもう」など語中の『おも』を切らない。助詞『も』は直前が「お」以外のときだけ改行候補にする。 */
  const reMoOnly = new RegExp(`(?<!お)も(?!${escRe(ZWSP)})${follow}`, "gu");
  out = out.replace(reMoOnly, `も${ZWSP}`);
  /* 「でサバイブ」等: 「で」の直後カタへの \u200B は短い題で不自然な2段＋ゆるい横幅になるため入れない */

  // 念のため: まれな順序でも「よ」「り」「おも」を避ける
  out = out.replace(/\u3088\u200b\u308a/gu, "\u3088\u308a");
  out = out.replace(/\u304a\u200b\u3082/gu, "\u304a\u3082");

  /** 連続カタカナ語の語中だけに挟まれた \u200b を除去（例: サバイ｜ブ）— 共通 */
  out = stripZwspBetweenKatakana(out);
  /** 文末の単独『へ』（次行1字だけになりやすい）— 直前文字との結合優先（U+2060） */
  out = out.replace(/(\S)(?=へ\s*$)/u, "$1\u2060");

  return out.replace(new RegExp(ZWSP + "+", "g"), ZWSP);
}
