// English names and line letters for Japanese train lines, so routes from Japanese sources
// read "Ginza Line · G" instead of "東京メトロ銀座線". Matched by the longest key found in the
// provider's line name. Unknown lines keep their Japanese name.

type Line = { en: string; code?: string };

const LINES: Record<string, Line> = {
  // Tokyo Metro
  "銀座線": { en: "Ginza Line", code: "G" },
  "丸ノ内線": { en: "Marunouchi Line", code: "M" },
  "日比谷線": { en: "Hibiya Line", code: "H" },
  "東京メトロ東西線": { en: "Tozai Line", code: "T" },
  "千代田線": { en: "Chiyoda Line", code: "C" },
  "有楽町線": { en: "Yurakucho Line", code: "Y" },
  "半蔵門線": { en: "Hanzomon Line", code: "Z" },
  "南北線": { en: "Namboku Line", code: "N" },
  "副都心線": { en: "Fukutoshin Line", code: "F" },
  // Toei
  "都営浅草線": { en: "Toei Asakusa Line", code: "A" },
  "都営三田線": { en: "Toei Mita Line", code: "I" },
  "都営新宿線": { en: "Toei Shinjuku Line", code: "S" },
  "都営大江戸線": { en: "Toei Oedo Line", code: "E" },
  "大江戸線": { en: "Toei Oedo Line", code: "E" },
  // JR East (Tokyo)
  "山手線": { en: "JR Yamanote Line", code: "JY" },
  "京浜東北線": { en: "JR Keihin-Tohoku Line", code: "JK" },
  "中央線快速": { en: "JR Chuo Line (Rapid)", code: "JC" },
  "中央・総武線各駅停車": { en: "JR Chuo-Sobu Line", code: "JB" },
  "総武線各駅停車": { en: "JR Chuo-Sobu Line", code: "JB" },
  "中央総武線各停": { en: "JR Chuo-Sobu Line", code: "JB" },
  "総武線各停": { en: "JR Chuo-Sobu Line", code: "JB" },
  "総武線快速": { en: "JR Sobu Line (Rapid)", code: "JO" },
  "横須賀線": { en: "JR Yokosuka Line", code: "JO" },
  "埼京線": { en: "JR Saikyo Line", code: "JA" },
  "湘南新宿ライン": { en: "JR Shonan-Shinjuku Line", code: "JS" },
  "京葉線": { en: "JR Keiyo Line", code: "JE" },
  "東海道線": { en: "JR Tokaido Line", code: "JT" },
  "上野東京ライン": { en: "JR Ueno-Tokyo Line" },
  "中央本線": { en: "JR Chuo Main Line" },
  "中央線": { en: "JR Chuo Line" },
  // Shinkansen
  "東海道新幹線": { en: "Tokaido Shinkansen" },
  "東北新幹線": { en: "Tohoku Shinkansen" },
  "北陸新幹線": { en: "Hokuriku Shinkansen" },
  "上越新幹線": { en: "Joetsu Shinkansen" },
  "山陽新幹線": { en: "Sanyo Shinkansen" },
  // Other Tokyo-area railways
  "ゆりかもめ": { en: "Yurikamome", code: "U" },
  "りんかい線": { en: "Rinkai Line", code: "R" },
  "つくばエクスプレス": { en: "Tsukuba Express", code: "TX" },
  "東京モノレール": { en: "Tokyo Monorail", code: "MO" },
  "京成本線": { en: "Keisei Main Line", code: "KS" },
  "成田スカイアクセス": { en: "Keisei Narita Sky Access", code: "KS" },
  "京急本線": { en: "Keikyu Main Line", code: "KK" },
  "京急空港線": { en: "Keikyu Airport Line", code: "KK" },
  "小田急小田原線": { en: "Odakyu Odawara Line", code: "OH" },
  "京王線": { en: "Keio Line", code: "KO" },
  "京王井の頭線": { en: "Keio Inokashira Line", code: "IN" },
  "西武池袋線": { en: "Seibu Ikebukuro Line", code: "SI" },
  "西武豊島線": { en: "Seibu Toshima Line", code: "SI" },
  "西武新宿線": { en: "Seibu Shinjuku Line", code: "SS" },
  "東急東横線": { en: "Tokyu Toyoko Line", code: "TY" },
  "東急田園都市線": { en: "Tokyu Den-en-toshi Line", code: "DT" },
  "東武スカイツリーライン": { en: "Tobu Skytree Line", code: "TS" },
  "富士急行線": { en: "Fujikyu Line", code: "FJ" },
  "富士山麓電気鉄道": { en: "Fujikyu Line", code: "FJ" },
  // Osaka Metro
  "御堂筋線": { en: "Midosuji Line", code: "M" },
  "谷町線": { en: "Tanimachi Line", code: "T" },
  "四つ橋線": { en: "Yotsubashi Line", code: "Y" },
  "大阪メトロ中央線": { en: "Chuo Line (Osaka)", code: "C" },
  "千日前線": { en: "Sennichimae Line", code: "S" },
  "堺筋線": { en: "Sakaisuji Line", code: "K" },
  "長堀鶴見緑地線": { en: "Nagahori Tsurumi-ryokuchi Line", code: "N" },
  "大阪環状線": { en: "JR Osaka Loop Line", code: "O" },
  // Sapporo (its Namboku/Tozai lines share names with Tokyo's, so they're matched with the operator)
  "札幌市営地下鉄南北線": { en: "Namboku Line (Sapporo)", code: "N" },
  "札幌市営地下鉄東西線": { en: "Tozai Line (Sapporo)", code: "T" },
  "札幌市営地下鉄東豊線": { en: "Toho Line (Sapporo)", code: "H" },
  "東豊線": { en: "Toho Line (Sapporo)", code: "H" },
  "札幌市電": { en: "Sapporo Streetcar", code: "SC" },
  "函館本線": { en: "JR Hakodate Line" },
  "千歳線": { en: "JR Chitose Line" },
  "富良野線": { en: "JR Furano Line" },
  // Kyoto
  "烏丸線": { en: "Karasuma Line", code: "K" },
  "京都市営地下鉄東西線": { en: "Tozai Line (Kyoto)", code: "T" },
  "嵯峨野線": { en: "JR Sagano Line", code: "E" },
  "奈良線": { en: "JR Nara Line", code: "D" },
};

const KEYS = Object.keys(LINES).sort((a, b) => b.length - a.length);

/** "東京メトロ銀座線" → { en: "Ginza Line", code: "G" }; unknown lines keep their name. */
export function englishLine(name: string): Line {
  const n = name.normalize("NFKC").replace(/(内回り|外回り|\(.*?\))/g, "");
  const key = KEYS.find((k) => n.includes(k));
  if (key) return LINES[key];
  if (n.includes("バス")) return { en: n.replace(/バス/, " bus").trim() };
  return { en: n };
}
