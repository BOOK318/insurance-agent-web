export const BOC_PRODUCT_CODE_NAMES: Record<string, string> = {
  IBA01: '存享保費回贈個人意外保險計劃',
  IBC05: '摯守護危疾保險計劃',
  IBC07: '非凡守護危疾保險計劃',
  IBC10: '守護未來終身壽險計劃',
  IBC11: '危疾188終身壽險計劃',
  IBC12: '守護伴您保險計劃（附加危疾保障）',
  IBE65: '精選目標五年保險計劃',
  IBE66: '守躍保險計劃',
  IBL05: '裕悅綻保障投資相連計劃',
  IBM08: '中銀人壽標準自願醫保',
  IBM10: '非凡守護靈活自願醫保',
  IBM11: '全數保費回贈住院現金保險計劃',
  IBN12: '目標三年保險計劃',
  IBN13: '非凡即享年金計劃',
  IBN14: '中銀人壽延期年金計劃（固定年期）',
  IBN15: '中銀人壽延期年金計劃（終身）',
  IBT06: '「安年保」定期人壽保險計劃',
  IBT17: '自選無憂壽險計劃',
  IBT22: '守護伴您保險計劃',
  IBU19: '薈富萬用壽險計劃',
  IBU32: '盛世傳承萬用壽險計劃 II - 精選',
  IBU33: '盛世傳承萬用壽險計劃 II - 優越',
  IBU34: '盛世傳承萬用壽險計劃 II - 卓越',
  IBU35: '盛世傳承萬用壽險計劃 II - 簡易',
  IBW41: '綻放人生收益壽險計劃（簡易版）',
  IBW55: '家傳戶曉終身壽險計劃',
  IBW56: '家傳戶曉終身壽險計劃（享逸版）',
  IBW61: '百年傳承終身保險計劃 II - 精選',
  IBW62: '百年傳承終身保險計劃 II - 優越',
  IBW64: '百年傳承終身保險計劃 II - 卓越',
  IBW65: '薪火傳承環球終身壽險計劃',
  IBW66: '鑄富世代環球終身壽險計劃',
  IBW67: '月悅出息終身享保險計劃',
  IBW68: '寰御安心環球終身保險計劃',
  IBW69: '薪粹傳承環球終身保險計劃',
};

export function getBocProductCodeLegend() {
  return Object.entries(BOC_PRODUCT_CODE_NAMES)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([code, name]) => `${code} = ${getBocProductShortName(name)}（${name}）`)
    .join('\n');
}

export function getBocProductShortName(name: string) {
  const chars = [...name.replace(/[「」()（）\s-]/g, '')].filter(char => /\p{Script=Han}/u.test(char));
  return chars.slice(0, 2).join('') || name.slice(0, 2);
}

export function expandBocProductCodes(text: string) {
  return text.replace(/\b(IB[A-Z]\d{2})\b/g, (code: string, _match: string, offset: number) => {
    const name = BOC_PRODUCT_CODE_NAMES[code];
    if (!name) return code;
    const shortName = getBocProductShortName(name);

    const after = text.slice(offset + code.length, offset + code.length + name.length + 8);
    if (
      after.startsWith(`（${shortName}`) ||
      after.startsWith(`(${shortName}`) ||
      after.startsWith(`（${name}`) ||
      after.startsWith(`(${name}`) ||
      after.includes(shortName) ||
      after.includes(name)
    ) {
      return code;
    }

    return `${code}（${shortName}）`;
  });
}
