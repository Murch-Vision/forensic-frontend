import {useEffect, useState} from "react";
import {useMutation} from "@apollo/client";
import {describeAccount, isNumberLikeName, type StoredBankAccount}
  from "../lib/iban";
import {VERIFY_BANK_ACCOUNT} from "../graphql/queries";

// Accounts already looked up automatically this session — a number no bank
// knows is not asked again on every visit.
const autoChecked = new Set<string>();

export function BankAccountInfo({account, personName, onVerified}: {
  account: StoredBankAccount;
  // The person's name — a number here means the owner is still unknown.
  personName?: string;
  onVerified?: () => unknown;
}) {
  const info = describeAccount(account);
  const [message, setMessage] = useState("");
  const [verify, {loading}] = useMutation<{verifyBankAccount: {
    found: boolean; message: string}}>(VERIFY_BANK_ACCOUNT);
  const needsCheck = !info.bankName
    || (personName !== undefined && isNumberLikeName(personName));

  // Unknown bank: look it up as soon as the card shows, no click needed.
  useEffect(() => {
    if (info.bankName || autoChecked.has(account.accountNumber)) return;
    autoChecked.add(account.accountNumber);
    void check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.accountNumber, info.bankName]);

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setMessage(`${label} хууллаа`);
    } catch {
      setMessage("Хуулж чадсангүй. Дугаарыг сонгож хуулна уу.");
    }
  }

  async function check() {
    setMessage("Шалгаж байна…");
    try {
      const {data} = await verify(
        {variables: {accountNumber: account.accountNumber}});
      setMessage(data?.verifyBankAccount.message ?? "");
      if (data?.verifyBankAccount.found) await onVerified?.();
    } catch (e) {
      setMessage((e as Error).message);
    }
  }

  return (
    <div style={{display: "grid", gap: 8, minWidth: 0}}>
      <div style={{display: "flex", gap: 8, flexWrap: "wrap",
        alignItems: "center"}}>
        <span style={{fontSize: 13, fontWeight: 600,
          color: "var(--accent-cyan)"}}>
          {info.bankName ?? (loading ? "Банк шалгаж байна…" : "Банк тодорхойгүй")}
        </span>
        {needsCheck && (
          <button className="btn btn-sm" disabled={loading} onClick={check}
            title="Банк, IBAN, эзэмшигчийн нэрийг IBAN лавлагаагаар шалгах">
            {loading ? "Шалгаж байна…" : "Шалгах"}
          </button>
        )}
      </div>
      {info.holderName && !isNumberLikeName(info.holderName) && (
        <div style={{fontSize: 12, color: "var(--text-secondary)"}}>
          Эзэмшигч: <b>{info.holderName}</b>
        </div>
      )}
      {info.iban && (
        <div style={{display: "flex", gap: 8, flexWrap: "wrap",
          alignItems: "center"}}>
          <span className="id-chip" style={{overflowWrap: "anywhere", minWidth: 0}}>
            {info.iban}
          </span>
          <button className="btn btn-sm"
            onClick={() => copy(info.iban!, "IBAN")}>IBAN хуулах</button>
        </div>
      )}
      <div style={{display: "flex", gap: 8, flexWrap: "wrap",
        alignItems: "center"}}>
        <span className="id-chip" style={{overflowWrap: "anywhere", minWidth: 0}}>
          {info.accountNumber}
        </span>
        <button className="btn btn-sm"
          onClick={() => copy(info.accountNumber, "Дансны дугаар")}>
          Дансны дугаар хуулах
        </button>
      </div>
      {message && <div role="status" style={{fontSize: 11,
        color: "var(--text-secondary)"}}>{message}</div>}
    </div>
  );
}
