export const states = [
  ["01", "Jammu and Kashmir"],
  ["02", "Himachal Pradesh"],
  ["03", "Punjab"],
  ["04", "Chandigarh"],
  ["05", "Uttarakhand"],
  ["06", "Haryana"],
  ["07", "Delhi"],
  ["08", "Rajasthan"],
  ["09", "Uttar Pradesh"],
  ["10", "Bihar"],
  ["11", "Sikkim"],
  ["12", "Arunachal Pradesh"],
  ["13", "Nagaland"],
  ["14", "Manipur"],
  ["15", "Mizoram"],
  ["16", "Tripura"],
  ["17", "Meghalaya"],
  ["18", "Assam"],
  ["19", "West Bengal"],
  ["20", "Jharkhand"],
  ["21", "Odisha"],
  ["22", "Chhattisgarh"],
  ["23", "Madhya Pradesh"],
  ["24", "Gujarat"],
  ["26", "Dadra and Nagar Haveli and Daman and Diu"],
  ["27", "Maharashtra"],
  ["29", "Karnataka"],
  ["30", "Goa"],
  ["31", "Lakshadweep"],
  ["32", "Kerala"],
  ["33", "Tamil Nadu"],
  ["34", "Puducherry"],
  ["35", "Andaman and Nicobar Islands"],
  ["36", "Telangana"],
  ["37", "Andhra Pradesh"],
  ["38", "Ladakh"],
] as const;
export const stateName = (code: string) =>
  states.find((s) => s[0] === code)?.[1] || code;
export const validState = (code: string) => states.some((s) => s[0] === code);
export function validGstin(value: string) {
  if (
    !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(value) ||
    !validState(value.slice(0, 2))
  )
    return false;
  const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const n = alphabet.indexOf(value[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(n / 36) + (n % 36);
  }
  return alphabet[(36 - (sum % 36)) % 36] === value[14];
}
export function inclusiveTax(
  gross: number,
  rateBps: number,
  interstate: boolean,
) {
  const net = Math.round((gross * 10000) / (10000 + rateBps));
  const tax = gross - net;
  const cgst = interstate ? 0 : Math.floor(tax / 2);
  return {
    gross,
    net,
    tax,
    cgst,
    sgst: interstate ? 0 : tax - cgst,
    igst: interstate ? tax : 0,
    rateBps,
  };
}
export function financialYear(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")!.value),
    month = Number(parts.find((p) => p.type === "month")!.value);
  const start = year - (month < 4 ? 1 : 0);
  return `${start}-${String(start + 1).slice(-2)}`;
}
