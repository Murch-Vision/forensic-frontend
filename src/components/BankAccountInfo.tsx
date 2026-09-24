import {useState} from "react";
import {parseMongolianIban} from "../lib/iban";

export function BankAccountInfo({number}: {number: string}) {
  const account = parseMongolianIban(number);
  const [message, setMessage] = useState("");

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setMessage(`${label} хууллаа`);
    } catch {
      setMessage("Хуулж чадсангүй. Дугаарыг сонгож хуулна уу.");
    }
  }

  return (
    <div style={{display: "grid", gap: 8, minWidth: 0}}>
      <div style={{fontSize: 13, fontWeight: 600, color: "var(--accent-cyan)"}}>
        {account?.bankName ?? "Банк тодорхойгүй"}
      </div>
      {account && (
        <div style={{display: "flex", gap: 8, flexWrap: "wrap",
          alignItems: "center"}}>
          <span className="id-chip" style={{overflowWrap: "anywhere", minWidth: 0}}>
            {account.iban}
          </span>
          <button className="btn btn-sm"
            onClick={() => copy(account.iban, "IBAN")}>IBAN хуулах</button>
        </div>
      )}
      <div style={{display: "flex", gap: 8, flexWrap: "wrap",
        alignItems: "center"}}>
        <span className="id-chip" style={{overflowWrap: "anywhere", minWidth: 0}}>
          {account?.accountNumber ?? number}
        </span>
        <button className="btn btn-sm"
          onClick={() => copy(account?.accountNumber ?? number, "Дансны дугаар")}>
          Дансны дугаар хуулах
        </button>
      </div>
      {message && <div role="status" style={{fontSize: 11,
        color: "var(--text-secondary)"}}>{message}</div>}
    </div>
  );
}
