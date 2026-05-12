/**
 * 10名の人格・日本語シナプス（実在URL）。
 * サンプルデータのURLルール:
 *   - 本 → amazon.co.jp の商品（/dp/…）
 *   - 動画 → Netflix / YouTube / Amazon Prime Video / Disney+ のみ
 * keywords は seed-sample-data.mts で Gemini により充填。
 */

export type SeedRow = {
  author: string;
  source_url: string;
  target_url: string;
  description: string;
};

/** 動画プラットフォーム（サンプル用） */
const YT = (v: string) => `https://www.youtube.com/watch?v=${v}`;
const NF = (titleId: string) => `https://www.netflix.com/jp/title/${titleId}`;
/** Prime Video（ストアフロント／地域でリダイレクト） */
const PRIME_VIDEO_HOME = "https://www.amazon.co.jp/gp/video/storefront";
/** Disney+（トップ／作品ページは地域差があるためホームをサンプル基準に） */
const DISNEY_PLUS_HOME = "https://www.disneyplus.com/ja-jp/home";

/**
 * ペルソナ概要
 *
 * 星野蓮     建築・都市・デザイン史 / 制約が生む必然性、機能と美が分かれる瞬間
 * 氷室紗季   映画・文学・思想 / 作品の「時間の使い方」、沈黙・省略・余白
 * 朝倉みずほ 食文化・人類学・民俗学 / 食を権力・移民・社会階層の読み解きツールとして使う
 * 古城拓真   ソフトウェア・技術史・数学 / 抽象化のレイヤーに美を見る、10年後も通じる設計か
 * 神崎エリカ 現代アート・ファッション・資本主義論 / 値段のつき方、市場と価値のズレ
 * 七海ロク   音楽・身体・即興 / グルーヴの「ズレ」、予定調和を外す瞬間
 * 相馬一平   哲学・言語・存在論 / 概念はいつ発明されたか、言葉が生まれる前の感覚
 * 藤宮さやか 雑誌・編集・ポップカルチャー / どう届けたか、媒体・タイミングの選択が意味を決める
 * 黒川レオ   地政学・旅・都市論 / 栄枯盛衰の理由、場所に刻まれた経済・戦争・移動の痕跡
 * 白露ユイ   認知科学・詩・学習論 / なぜこれは覚えられるか、記憶に残る構造（リズム・イメージ・驚き）
 */

export const SEED_AUTHORS = [
  "星野蓮",
  "氷室紗季",
  "朝倉みずほ",
  "古城拓真",
  "神崎エリカ",
  "七海ロク",
  "相馬一平",
  "藤宮さやか",
  "黒川レオ",
  "白露ユイ",
] as const;

export type SeedAuthor = (typeof SEED_AUTHORS)[number];

export const SEED_ROWS: SeedRow[] = [
  // ── 星野蓮（建築・都市） ─────────────────────────────────────────────────
  {
    author: "星野蓮",
    source_url: "https://www.amazon.co.jp/dp/4306044327",
    target_url: "https://www.amazon.co.jp/dp/4480099697",
    description:
      "『空間へ』（磯崎新）と丹下健三の評伝を並べて読むと、「廃墟になることを前提にした建物」という発想がいかに異常で誠実かがわかる。建築は時間を内包しなければならない。",
  },
  {
    author: "星野蓮",
    source_url: "https://www.amazon.co.jp/dp/4480099697",
    target_url: YT("0HCpOn7IHmI"),
    description:
      "丹下・磯崎の文脈で、都市と尊厳の話をする建築の短い講演映像を観ると、ガラスと鉄の「何も隠さない」ことの暴力と美しさが身体に伝わる。静止画の建築写真だけでは足りない。",
  },
  {
    author: "星野蓮",
    source_url: "https://www.amazon.co.jp/dp/4306044327",
    target_url: NF("80057281"),
    description:
      "抽象絵画と建築が同じ時代に噴き出した感覚を、美術のドキュメンタリーで追体験すると読書の裏付けになる。バウハウス以降の「形式」が絵画と建築のあいだを行き来する。",
  },
  {
    author: "星野蓮",
    source_url: "https://www.amazon.co.jp/dp/4480099697",
    target_url: PRIME_VIDEO_HOME,
    description:
      "都市とインフラの変遷を扱うドキュメンタリを Prime Video で観たあとで読み返すと、工場地帯の必然性がよりはっきり見える。地図と映像はセットで使う。",
  },

  // ── 氷室紗季（映画・文学） ───────────────────────────────────────────────
  {
    author: "氷室紗季",
    source_url: "https://www.amazon.co.jp/dp/4003101618",
    target_url: YT("sPCdQXPqAoE"),
    description:
      "カフカの『変身』は変身した後の話をほとんど語らない。ゴダール『勝手にしやがれ』も、ベルモンドが死ぬ理由を説明しない。どちらも「省略」が意味の本体になっている。",
  },
  {
    author: "氷室紗季",
    source_url: "https://www.amazon.co.jp/dp/4309410987",
    target_url: NF("80234304"),
    description:
      "蓮實重彦の映画論を読んでから、長回しと「間」を楽しむ日本ドラマを Netflix で観ると、ショットの設計が身体に落ちる。台詞のあとの空白が画面だとよりはっきりする。",
  },
  {
    author: "氷室紗季",
    source_url: "https://www.amazon.co.jp/dp/4309463533",
    target_url: DISNEY_PLUS_HOME,
    description:
      "スーザン・ソンタグ『写真論』の「記録の倫理」と、大作スペクタクル映画の視聴体験は、どちらも「見せられる暴力」の境界を問う。シャッターとカットは別の装置だ。",
  },
  {
    author: "氷室紗季",
    source_url: "https://www.amazon.co.jp/dp/4622073455",
    target_url: YT("sPCdQXPqAoE"),
    description:
      "バルト『明るい部屋』で語られるプンクトゥムは、観客が自分の記憶を投影する一点だ。映画の「省略」と写真論を、短い名作映像で思い出しながら読むと整理しやすい。",
  },

  // ── 朝倉みずほ（食文化） ─────────────────────────────────────────────────
  {
    author: "朝倉みずほ",
    source_url: "https://www.amazon.co.jp/dp/4480068058",
    target_url: "https://www.amazon.co.jp/dp/4003348214",
    description:
      "石毛直道『食の文化を語る』とカレーの文化史を並べると、ラーメンもカレーも「起源を辿ると権力と移動」になる。移民と屋台と戦後の変異が、同じ型で読める。",
  },
  {
    author: "朝倉みずほ",
    source_url: "https://www.amazon.co.jp/dp/4480068058",
    target_url: YT("Ug8HsZfxIpk"),
    description:
      "農園からテーブルまでのドキュメンタリーを見たあとで辻静雄を読むと、「素材への敬意」がフランスと日本で全然違う論理から来ているのが腹落ちする。",
  },
  {
    author: "朝倉みずほ",
    source_url: "https://www.amazon.co.jp/dp/4062576651",
    target_url: NF("80234304"),
    description:
      "味噌と発酵の本を読んだあと深夜の食堂ドラマを観ると、一杯のスープに地方の気候と労働と塩の政治が濃縮されているのがわかる。食事の戯曲性が強い。",
  },
  {
    author: "朝倉みずほ",
    source_url: "https://www.amazon.co.jp/dp/4003348214",
    target_url: PRIME_VIDEO_HOME,
    description:
      "インド料理の番組でスパイスの層を見てからカレー史を読むと、香りの順序が歴史の順序と対応している気がする。映像は味の手前までしか届かないが、その手前が広い。",
  },

  // ── 古城拓真（ソフトウェア・技術史） ───────────────────────────────────
  {
    author: "古城拓真",
    source_url: "https://www.amazon.co.jp/dp/4873119464",
    target_url: "https://www.amazon.co.jp/dp/4822283585",
    description:
      "『A Philosophy of Software Design』と Git の本を並べると、「複雑性をどこに閉じ込めるか」が同じ問いとして見える。抽象の層を一枚ずつ剥がす作業は読書でもデバッグでも同じだ。",
  },
  {
    author: "古城拓真",
    source_url: "https://www.amazon.co.jp/dp/4873119464",
    target_url: YT("aircAruvnKk"),
    description:
      "3Blue1Brown の直感映像を見てから設計の本を読み返すと、抽象と具体の往復が楽になる。本は定義、動画はデモ——学習順序として相性がいい。",
  },
  {
    author: "古城拓真",
    source_url: "https://www.amazon.co.jp/dp/4621303252",
    target_url: NF("81040344"),
    description:
      "クヌースの著書を読みながら Netflix でシリーズ物を観ると、ルール設計とサバイバルが同じ「制約の下での選択」として見える。美しい制約には物語がある。",
  },
  {
    author: "古城拓真",
    source_url: "https://www.amazon.co.jp/dp/4822283585",
    target_url: DISNEY_PLUS_HOME,
    description:
      "バージョン管理と分岐の話は、タイムループ物語の因果と似ている。ブランチを頭に描きながら観ると、パラレル世界のマージ競合が笑えてくる。",
  },

  // ── 神崎エリカ（アート・市場） ───────────────────────────────────────────
  {
    author: "神崎エリカ",
    source_url: "https://www.amazon.co.jp/dp/4480841334",
    target_url: "https://www.amazon.co.jp/dp/4480068554",
    description:
      "『現代アートビジネス』と消費社会の古典を並べると、値段が「作品の良さ」ではなく「物語の強度」でつく仕組みが腑に落ちる。市場は批評じゃない、別のゲームだ。",
  },
  {
    author: "神崎エリカ",
    source_url: "https://www.amazon.co.jp/dp/4480841334",
    target_url: YT("m7GBcVrklFE"),
    description:
      "オークションとアート市場の解説動画を見てから読むと、落札のドラマと本文の分析が同期する。価格が可視化されると説得力が増す。",
  },
  {
    author: "神崎エリカ",
    source_url: "https://www.amazon.co.jp/dp/4480861459",
    target_url: NF("81040344"),
    description:
      "村上隆の文脈と消費社会論を読んだあと、サバイバル・ゲーム系ドラマを観ると、「かわいい」と「怖さ」が同じ通貨で流通しているのがわかる。",
  },
  {
    author: "神崎エリカ",
    source_url: "https://www.amazon.co.jp/dp/4480068554",
    target_url: PRIME_VIDEO_HOME,
    description:
      "ヴェブレンから古着バブルまで読んだあと、ファッション史ドキュメンタリを Prime Video で観ると、記号の更新がストーリーと同じ速度で起きている。",
  },

  // ── 七海ロク（音楽・身体） ───────────────────────────────────────────────
  {
    author: "七海ロク",
    source_url: "https://www.amazon.co.jp/dp/4883922189",
    target_url: YT("m7GBcVrklFE"),
    description:
      "世界音楽論を読みながらポップの MV を観ると、身体性の漂白と再利用の仕方がわかって複雑になる。リズムは文化を越えると言い切れない。",
  },
  {
    author: "七海ロク",
    source_url: "https://www.amazon.co.jp/dp/4883922189",
    target_url: NF("80057281"),
    description:
      "ジャズ史の本を読んでから Netflix で音楽の使われ方が特徴的なドラマを観ると、リズムが「一緒にズレること」だと説明されたあとに耳が勝手に追いかける。",
  },
  {
    author: "七海ロク",
    source_url: "https://www.amazon.co.jp/dp/4883922189",
    target_url: DISNEY_PLUS_HOME,
    description:
      "即興と「間」の本を読んだあと、音楽を核にしたアニメ映画を Disney+ で観ると、一拍の空白が転換点と同じ構造だとわかる。",
  },
  {
    author: "七海ロク",
    source_url: "https://www.amazon.co.jp/dp/4883922189",
    target_url: PRIME_VIDEO_HOME,
    description:
      "ライブ映像でグルーヴのズレを観測してから読み返すと、譜面にない情報がどこから来たか説明しやすくなる。映像はメトロノームの外側を教えてくれる。",
  },

  // ── 相馬一平（哲学・言語） ─────────────────────────────────────────────
  {
    author: "相馬一平",
    source_url: "https://www.amazon.co.jp/dp/4003361431",
    target_url: "https://www.amazon.co.jp/dp/4004306159",
    description:
      "ハイデガー入門とドストエフスキーを並べると、「存在」の概念が言語化される前の日常が小説側に残っているのがわかる。哲学は遅れて名前を付ける。",
  },
  {
    author: "相馬一平",
    source_url: "https://www.amazon.co.jp/dp/4062919621",
    target_url: YT("aircAruvnKk"),
    description:
      "論理と言語の入門を映像でイメージしてから読み返すと、「語りえないもの」が図解で一瞬だけ形を取る。沈黙は映像でも使える。",
  },
  {
    author: "相馬一平",
    source_url: "https://www.amazon.co.jp/dp/4004306159",
    target_url: NF("80057281"),
    description:
      "デリダの難解さを味わったあと、倫理が言葉に耐えられない瞬間を描くドラマを観ると、翻訳不可能なものが演技で補われる。字幕は二次創作だ。",
  },
  {
    author: "相馬一平",
    source_url: "https://www.amazon.co.jp/dp/4003368215",
    target_url: DISNEY_PLUS_HOME,
    description:
      "カントの図式論を読んだあと、歴史のなかで観念が具体的な仕事に落ちる物語映画を観ると、概念と直感のあいだが画面いっぱいに広がる。",
  },

  // ── 藤宮さやか（編集・メディア） ───────────────────────────────────────
  {
    author: "藤宮さやか",
    source_url: "https://www.amazon.co.jp/dp/4582834558",
    target_url: "https://www.amazon.co.jp/dp/4163902805",
    description:
      "美術展示の見世物性を論じた本と、編集者のエッセイを並べると、「どう見せるか」が価値の大半を占める場面が重なる。余白は思想だ。",
  },
  {
    author: "藤宮さやか",
    source_url: "https://www.amazon.co.jp/dp/4582834558",
    target_url: YT("jNQXAC9IVRw"),
    description:
      "短いウェブ映像の編集リズムに慣れてから読み返すと、キャプションと照明がどちらも編集だとわかる。展示と動画は同じ欲望の装置の別フォーマットだ。",
  },
  {
    author: "藤宮さやか",
    source_url: "https://www.amazon.co.jp/dp/4309414028",
    target_url: NF("80234304"),
    description:
      "マクルーハンを読んだあと、短いエピソードが連なるドラマを Netflix で観ると、フォーマットが笑いより先に身体に入る。「メディアはメッセージ」が冗談みたいに実証される。",
  },
  {
    author: "藤宮さやか",
    source_url: "https://www.amazon.co.jp/dp/4163902805",
    target_url: PRIME_VIDEO_HOME,
    description:
      "雑誌論と詩のコピーを読んだあと、メディアの現場ドキュメンタリを Prime Video で観ると、見出しの暴力が会議室で生成されているのがわかる。",
  },

  // ── 黒川レオ（地政学・都市） ───────────────────────────────────────────
  {
    author: "黒川レオ",
    source_url: "https://www.amazon.co.jp/dp/4122049415",
    target_url: "https://www.amazon.co.jp/dp/4004315123",
    description:
      "交易史と香港の都市論を並べると、シルクロードも香港も「勢力圏のグラデーション」として読める。栄枯盛衰は道ではなくネットワークだ。",
  },
  {
    author: "黒川レオ",
    source_url: "https://www.amazon.co.jp/dp/4122049415",
    target_url: YT("Ug8HsZfxIpk"),
    description:
      "交易路の解説動画で地図を追いながら読むと、ハブ都市の理由が立体化する。地図は経済史の断面図だ。",
  },
  {
    author: "黒川レオ",
    source_url: "https://www.amazon.co.jp/dp/4309463878",
    target_url: NF("80234304"),
    description:
      "デトロイトの都市崩壊を読んだあと、人の移動と仕事の現場を扱うドラマを観ると、インフラが画面の端に常にいる。都市崩壊は政治の結果だ。",
  },
  {
    author: "黒川レオ",
    source_url: "https://www.amazon.co.jp/dp/4004315123",
    target_url: DISNEY_PLUS_HOME,
    description:
      "香港の地層を読んだあと、都市がステージになるアクション映画を観ると、金融資本が背景として笑える。リアルが先に残酷すぎると風刺が効く。",
  },

  // ── 白露ユイ（認知科学・詩） ───────────────────────────────────────────
  {
    author: "白露ユイ",
    source_url: "https://www.amazon.co.jp/dp/4532321433",
    target_url: "https://www.amazon.co.jp/dp/4622073455",
    description:
      "カーネマンのピーク・エンドとバルトの写真論を並べると、記憶が「再生」ではなく「編集」だとわかる。終わり方が体験を定義する。",
  },
  {
    author: "白露ユイ",
    source_url: "https://www.amazon.co.jp/dp/4532321433",
    target_url: YT("aircAruvnKk"),
    description:
      "直感と論理の解説動画を観てから読み返すと、実験の図がそのまま日常の失敗談に見える。図解は記憶のアンカーになる。",
  },
  {
    author: "白露ユイ",
    source_url: "https://www.amazon.co.jp/dp/4750516864",
    target_url: NF("81040344"),
    description:
      "教育と認知負荷の本を読んだあと、成長と学びのドキュメンタリを観ると、「覚えなくていい」の設計が娯楽にも通じる。",
  },
  {
    author: "白露ユイ",
    source_url: "https://www.amazon.co.jp/dp/4004315409",
    target_url: PRIME_VIDEO_HOME,
    description:
      "谷川俊太郎を声に出して読むリズムと、詩や朗読の短い特集を Prime Video で観ると、プロソディが耳と目の両方に刺さる。",
  },

  // ── 同一テーマ・異なる視点（URLは本ルールに合わせる） ───────────────────
  {
    author: "神崎エリカ",
    source_url: "https://www.amazon.co.jp/dp/4480841334",
    target_url: YT("m7GBcVrklFE"),
    description:
      "アート市場の本を読んでから同じ系統の解説動画を観ると、価格のドラマとして切り取れる。落札の瞬間は演出だ。",
  },
  {
    author: "白露ユイ",
    source_url: "https://www.amazon.co.jp/dp/4532321433",
    target_url: YT("aircAruvnKk"),
    description:
      "同じバイアス解説でも、先に動画で腹落ちしてから本文で定義を拾うと、用語が身体に残る。順序が学習の質を変える。",
  },
  {
    author: "氷室紗季",
    source_url: "https://www.amazon.co.jp/dp/4622073455",
    target_url: YT("sPCdQXPqAoE"),
    description:
      "バルトを読んでから映像の「省略」を思い出すと、プンクトゥムが共有されにくい理由が補強される。",
  },

  // ── プロジェクト・ヘイル・メアリー（本＝Amazon、関連動画は許容プラットフォーム） ──
  {
    author: "白露ユイ",
    source_url: "https://www.amazon.co.jp/dp/4152101539",
    target_url: "https://www.amazon.co.jp/dp/4532321433",
    description:
      "『プロジェクト・ヘイル・メアリー』の主人公は記憶を失ったまま目覚める。物語の構造そのものが「記憶の再構成」で、読者はグレースが思い出すたびに情報を得る。カーネマンのピーク・エンドでいうとラストは完璧に設計されている。",
  },
  {
    author: "相馬一平",
    source_url: "https://www.amazon.co.jp/dp/4152101539",
    target_url: "https://www.amazon.co.jp/dp/4004306159",
    description:
      "グレースとロッキーが言語を作る場面は、ウィトゲンシュタインの言語ゲームの実験そのものだ。共有できる生活形式がない者同士が、どうやって意味を作るか。",
  },
  {
    author: "古城拓真",
    source_url: "https://www.amazon.co.jp/dp/4152101539",
    target_url: "https://www.amazon.co.jp/dp/4621303252",
    description:
      "グレースがアストロファージの代謝を解析するプロセスは、計算可能性を定義するときの思考と同じ構造をしている。未知の系を観察し、最小の公理から法則を導く。",
  },
  {
    author: "氷室紗季",
    source_url: "https://www.amazon.co.jp/dp/4152101539",
    target_url: YT("sPCdQXPqAoE"),
    description:
      "宇宙や孤独を扱う映画のイメージで気分を合わせたあとで『ヘイル・メアリー』を読むと、対話不可能な知性への態度の差がはっきりする。映画と小説で同じ問いを別速度で処理する。",
  },
  {
    author: "七海ロク",
    source_url: "https://www.amazon.co.jp/dp/4152101539",
    target_url: NF("81040344"),
    description:
      "ロッキーとの音のやりとりはセッションに聞こえる。異なる音楽体系が接触するとき、新しいリズムが生まれる——ストリーミングで観慣れた編集リズムとも共鳴する。",
  },
  {
    author: "黒川レオ",
    source_url: "https://www.amazon.co.jp/dp/4122049415",
    target_url: "https://www.amazon.co.jp/dp/4152101539",
    description:
      "交易路が「共通の利害」で開ける話と、太陽の危機という共通敵で協力が始まる話は、地政学のスケールが違うだけで骨格が同じだ。",
  },

  // ── リング12セル用：同一フォーカスに届く「別URL」を増やす（本↔本／動画↔本） ──
  {
    author: "白露ユイ",
    source_url: YT("sPCdQXPqAoE"),
    target_url: "https://www.amazon.co.jp/dp/4152101539",
    description:
      "映像の「省略」を先に観てから読むと、グレースの記憶の欠片がどこから埋まっていくかが追いやすい。フォーマットが先、物語が後。",
  },
  {
    author: "七海ロク",
    source_url: NF("80057281"),
    target_url: "https://www.amazon.co.jp/dp/4152101539",
    description:
      "編集リズムの強いドラマに慣れた耳で読むと、章の切り方とサスペンスの呼吸が噛み合う。長い旅のあとの一瞬の静音が効く。",
  },
  {
    author: "氷室紗季",
    source_url: YT("Ug8HsZfxIpk"),
    target_url: "https://www.amazon.co.jp/dp/4152101539",
    description:
      "ドキュメンタリーの「素材への敬意」を味わったあとで読むと、ロッキーとの共同作業が料理に似ていると思えてくる。交渉はレシピだ。",
  },
  {
    author: "古城拓真",
    source_url: YT("aircAruvnKk"),
    target_url: "https://www.amazon.co.jp/dp/4152101539",
    description:
      "直感と形式化の往復を映像で温めてから読むと、未知の生命系をモデル化する場面が数学の授業みたいに見える。",
  },
  {
    author: "朝倉みずほ",
    source_url: PRIME_VIDEO_HOME,
    target_url: "https://www.amazon.co.jp/dp/4152101539",
    description:
      "食と移動のドキュメンタリを観たあとで読むと、宇宙船という閉じた厨房で文化が混ざる感じが腹落ちする。",
  },
  {
    author: "神崎エリカ",
    source_url: DISNEY_PLUS_HOME,
    target_url: "https://www.amazon.co.jp/dp/4152101539",
    description:
      "スペクタクルで友情が試される物語に慣れた目で読むと、協力のドラマが商業的にも誠実にも読める。",
  },
  {
    author: "星野蓮",
    source_url: "https://www.amazon.co.jp/dp/4480099697",
    target_url: "https://www.amazon.co.jp/dp/4152101539",
    description:
      "巨大構造物の話と、恒星を救う話はスケールが違うが、「制約のなかで何を諦めないか」は同じ問いだ。",
  },
  {
    author: "藤宮さやか",
    source_url: "https://www.amazon.co.jp/dp/4309414028",
    target_url: "https://www.amazon.co.jp/dp/4152101539",
    description:
      "メディア論を読んだあとSFを読むと、フォーマットが先に身体に入る怖さが宇宙でも再現されている。",
  },
  {
    author: "相馬一平",
    source_url: "https://www.amazon.co.jp/dp/4062919621",
    target_url: "https://www.amazon.co.jp/dp/4152101539",
    description:
      "言語以前の生活形式を想像する練習として、異種知性との交渉小説は実験台になる。定義が後から追いつく。",
  },
  {
    author: "白露ユイ",
    source_url: "https://www.amazon.co.jp/dp/4152101539",
    target_url: "https://www.amazon.co.jp/dp/4622073455",
    description:
      "記憶を失った主人公と、写真が記憶を編集する話は、同じテーマの裏表。ピーク・エンドは小説でも写真でも効く。",
  },
  {
    author: "白露ユイ",
    source_url: "https://www.amazon.co.jp/dp/4152101539",
    target_url: "https://www.amazon.co.jp/dp/4003101618",
    description:
      "身体が変容する寓話と、知らない星で生き直す話。どちらも「自己」の輪郭が溶けるところから始まる。",
  },
  {
    author: "氷室紗季",
    source_url: "https://www.amazon.co.jp/dp/4152101539",
    target_url: "https://www.amazon.co.jp/dp/4309463533",
    description:
      "記録の倫理を問う批評と、ログと科学がすべてを決めるSF。シャッターとセンサは似た暴力を持つ。",
  },
  {
    author: "朝倉みずほ",
    source_url: "https://www.amazon.co.jp/dp/4152101539",
    target_url: "https://www.amazon.co.jp/dp/4480068058",
    description:
      "異文化の食卓と、異星の食料問題。どちらも「何を食べるか」は政治だ。",
  },
  {
    author: "古城拓真",
    source_url: "https://www.amazon.co.jp/dp/4152101539",
    target_url: PRIME_VIDEO_HOME,
    description:
      "長いミッションのあいだに挟まる短い映像——休息のフォーマットが、集中と同じくらい設計の対象だ。",
  },
  {
    author: "七海ロク",
    source_url: "https://www.amazon.co.jp/dp/4152101539",
    target_url: NF("80234304"),
    description:
      "短いエピソードが連なるドラマのリズムで読むと、章立ての呼吸が同じ型に見える。",
  },
  {
    author: "神崎エリカ",
    source_url: "https://www.amazon.co.jp/dp/4152101539",
    target_url: DISNEY_PLUS_HOME,
    description:
      "友情と犠牲の商業叙事を浴びたあとで読むと、ロッキーとの線の引き方がより鮮明になる。",
  },
  {
    author: "星野蓮",
    source_url: "https://www.amazon.co.jp/dp/4152101539",
    target_url: "https://www.amazon.co.jp/dp/4306044327",
    description:
      "閉じた環境で秩序をつくる話と、建築が時間を抱える話。スケールは違うが「耐える形」は似る。",
  },
  {
    author: "黒川レオ",
    source_url: "https://www.amazon.co.jp/dp/4152101539",
    target_url: "https://www.amazon.co.jp/dp/4309463878",
    description:
      "衰退した都市と、衰退しかけた文明。インフラの話はいつも政治の話だ。",
  },
  {
    author: "藤宮さやか",
    source_url: "https://www.amazon.co.jp/dp/4152101539",
    target_url: "https://www.amazon.co.jp/dp/4582834558",
    description:
      "見世物としての美術と、宇宙の危機を見世物化しないための科学コミュニケーション。見せ方は倫理だ。",
  },
  {
    author: "白露ユイ",
    source_url: "https://www.amazon.co.jp/dp/4622073455",
    target_url: YT("aircAruvnKk"),
    description:
      "写真が記憶を編集する話を読んだあと、図解で思考を編集する映像を観ると、メタファが重なる。",
  },
  {
    author: "白露ユイ",
    source_url: "https://www.amazon.co.jp/dp/4622073455",
    target_url: NF("81040344"),
    description:
      "プンクトゥムの話のあと、集団の極限状態のドラマを観ると、何が刺さって残るかが残酷にはっきりする。",
  },
  {
    author: "氷室紗季",
    source_url: "https://www.amazon.co.jp/dp/4622073455",
    target_url: "https://www.amazon.co.jp/dp/4152101539",
    description:
      "バルトのプンクトゥムと、失われた記憶のピース。どちらも「刺さる一点」が物語を動かす。",
  },
  {
    author: "白露ユイ",
    source_url: "https://www.amazon.co.jp/dp/4532321433",
    target_url: "https://www.amazon.co.jp/dp/4622073455",
    description:
      "カーネマンとバルトを並べると、記憶と感情の編集が同じテーブルに並ぶ。終わり方が体験を決める。",
  },
];

export function buildSeedRows(): SeedRow[] {
  return SEED_ROWS;
}
