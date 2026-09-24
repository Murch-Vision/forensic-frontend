// Монголбанк: төлбөрийн системийн оролцогчдын нэгдсэн бүртгэл.
// https://www.mongolbank.mn/file/3f7c21cf6f04ca21d181404a14a3313e/files/codeofparticipants.pdf
const BANK_NAMES: Record<string, string> = {
  "0001": "Монголбанк",
  "0003": "Капитал банк ЭХА",
  "0004": "Худалдаа хөгжлийн банк",
  "0005": "Хаан банк",
  "0015": "Голомт банк",
  "0018": "Хадгаламж банк ЭХА",
  "0019": "Тээвэр хөгжлийн банк",
  "0021": "Ариг банк",
  "0024": "Зоос банк",
  "0025": "Анод банк",
  "0029": "Үндэсний хөрөнгө оруулалтын банк",
  "0030": "Капитрон банк",
  "0032": "Хас банк",
  "0033": "Чингис хаан банк",
  "0034": "Төрийн банк",
  "0036": "Хөгжлийн банк",
  "0038": "Богд банк",
  "0039": "М банк",
  "0050": "Мобифинанс ББСБ",
  "0051": "Хай пэймэнт солюшнс",
  "0052": "Ард кредит ББСБ",
  "0053": "Инвескор Хэтэвч ББСБ",
  "0054": "Нэткапитал Финанс Корпораци ББСБ",
  "0055": "Дата бэйнк",
  "0056": "360 Файнанс ББСБ",
  "0057": "Супер ап хэтэвч",
  "0058": "Токи ББСБ",
  "0059": "Сэнд Эм Эн ББСБ",
  "0060": "Хадгаламжийн даатгалын корпораци",
  "0090": "Сангийн яам (Төрийн сан)",
  "0094": "Монголын үнэт цаасны клирингийн төв",
  "0095": "Үнэт цаасны төвлөрсөн хадгаламжийн төв",
  "0201": "Бонум",
  "0202": "ККТТ",
  "0203": "Нэгди Процессор",
};

// Decode the structure only; this does not verify account existence or checksum.
export function parseMongolianIban(value: string) {
  const iban = value.replace(/\s/g, "").toUpperCase();
  if (!/^MN\d{18}$/.test(iban)) return null;
  const bankCode = iban.slice(4, 8);
  return {
    iban,
    bankCode,
    bankName: BANK_NAMES[bankCode] ?? null,
    // Preserve all 12 digits: legacy account lengths vary between banks.
    accountNumber: iban.slice(8),
  };
}

// A stored account as the API returns it.
export interface StoredBankAccount {
  accountNumber     : string;
  iban?             : string | null;
  bankName?         : string | null;
  accountHolderName?: string | null;
}

// What the UI shows for an account: the verified IBAN (bank_accounts.iban)
// wins over the imported number, the stored bank name fills in codes the
// table above lacks.
export function describeAccount(account: StoredBankAccount) {
  const parsed = parseMongolianIban(account.iban ?? "")
    ?? parseMongolianIban(account.accountNumber);
  return {
    iban         : parsed?.iban ?? null,
    bankCode     : parsed?.bankCode ?? null,
    bankName     : parsed?.bankName ?? account.bankName ?? null,
    accountNumber: parsed?.accountNumber ?? account.accountNumber,
    holderName   : account.accountHolderName ?? null,
  };
}

// A person/holder "name" that is really an account number or IBAN — what an
// import writes when the statement carries no owner name.
export function isNumberLikeName(name: string | null | undefined): boolean {
  const text = String(name ?? "").trim();
  return !text || /^[-–—_.]+$/.test(text)
    || /^(unknown|null|n\/?a|тодорхойгүй)$/i.test(text)
    || /^[A-Z]{0,2}\d[\d\s-]*$/i.test(text);
}
