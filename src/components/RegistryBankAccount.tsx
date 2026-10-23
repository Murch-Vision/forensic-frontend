import {useEffect, useRef, useState} from "react";
import {useApolloClient, useMutation} from "@apollo/client";
import {BANK_ACCOUNT_CLEANUP_PREVIEW, DELETE_ORPHAN_BANK_ACCOUNT}
  from "../graphql/queries";
import {BankAccountInfo} from "./BankAccountInfo";
import type {StoredBankAccount} from "../lib/iban";

export interface RegistryAccount extends StoredBankAccount { id: number }

interface CleanupPreview {
  id: number;
  accountNumber: string;
  txnCount: number;
  cases: {id: number; caseId: string; caseName: string}[];
}

export function RegistryBankAccount({account, personName, onVerified, onDeleted}: {
  account: RegistryAccount;
  personName: string;
  onVerified: () => unknown;
  onDeleted: (accountNumber: string, transactions: number) => void;
}) {
  const client = useApolloClient();
  const [remove, deletion] = useMutation<{deleteOrphanBankAccount: {
    accountNumber: string; transactions: number;
  }}>(DELETE_ORPHAN_BANK_ACCOUNT);
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [preview, setPreview] = useState<CleanupPreview | null>(null);
  const [error, setError] = useState("");
  const request = useRef(0);
  const trigger = useRef<HTMLButtonElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  useEffect(() => () => { request.current++; }, []);
  useEffect(() => { if (open) cancelButton.current?.focus(); }, [open]);

  function cancel() {
    if (deletion.loading) return;
    request.current++;
    setOpen(false);
    trigger.current?.focus();
  }

  async function inspect() {
    const current = ++request.current;
    setOpen(true); setPreview(null); setError(""); setChecking(true);
    try {
      // Always refresh: neither the page's active case nor cached person-level
      // case badges describe where this exact account is still in use.
      const {data} = await client.query<{bankAccountCleanupPreview: CleanupPreview}>({
        query: BANK_ACCOUNT_CLEANUP_PREVIEW, variables: {id: account.id},
        fetchPolicy: "network-only",
      });
      if (request.current === current) setPreview(data.bankAccountCleanupPreview);
    } catch (e) {
      if (request.current === current) setError((e as Error).message);
    } finally {
      if (request.current === current) setChecking(false);
    }
  }

  async function confirm() {
    if (!preview || preview.id !== account.id || preview.cases.length
      || checking || deletion.loading) return;
    setError("");
    try {
      const {data} = await remove({variables: {id: account.id}});
      if (!data) throw new Error("Устгасан үр дүн ирсэнгүй. Жагсаалтаа шинэчилнэ үү.");
      setOpen(false);
      client.cache.evict({id: client.cache.identify({__typename: "BankAccount", id: account.id})});
      onDeleted(data.deleteOrphanBankAccount.accountNumber,
        data.deleteOrphanBankAccount.transactions);
      // Refresh counts, search identifiers, and any mounted evidence screens.
      // The preview uses client.query, so this cannot re-query a deleted row.
      await client.refetchQueries({include: "active"});
    } catch (e) {
      setError((e as Error).message);
      // The server rechecks case references at deletion time. Never leave a
      // stale confirmation usable after a rejected delete.
      setPreview(null);
    }
  }

  return <div className="registry-account-row" style={{display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 84px", gap: "12px 8px",
    alignItems: "start", paddingBottom: 16,
    borderBottom: "1px solid var(--border-primary)"}}>
    <BankAccountInfo account={account} personName={personName} onVerified={onVerified} />
    <button ref={trigger} className="btn btn-sm btn-danger"
      aria-label={`Данс ${account.accountNumber} устгах`}
      aria-expanded={open} disabled={open || deletion.loading} onClick={inspect}>
      Устгах
    </button>
    {open && <div role="region" aria-label={`${account.accountNumber} данс устгах`}
      onKeyDown={e => { if (e.key === "Escape") cancel(); }}
      style={{gridColumn: "1 / -1", padding: 12,
        borderLeft: "2px solid var(--accent-amber)", background: "var(--bg-secondary)"}}>
      <div style={{fontWeight: 600, overflowWrap: "anywhere"}}>{account.accountNumber}</div>
      {checking && <p role="status">Хэрэгт холбогдсон эсэхийг шалгаж байна…</p>}
      {preview && (preview.cases.length ? <>
        <p>Энэ данс хэрэгт ашиглагдаж байна. Нэгдсэн бүртгэлээс устгах боломжгүй.</p>
        <ul>{preview.cases.map(c => <li key={c.id}>{c.caseName} · {c.caseId}</li>)}</ul>
      </> : <p>Хэрэгт холбоогүй данс болон түүний {preview.txnCount} гүйлгээг
        нэгдсэн бүртгэлээс бүрмөсөн устгах уу? Буцаах боломжгүй.</p>)}
      {error && <p role="alert">{error}</p>}
      <div style={{display: "flex", gap: 8, flexWrap: "wrap"}}>
        <button ref={cancelButton} className="btn btn-sm" disabled={deletion.loading}
          onClick={cancel}>Болих</button>
        {preview && preview.cases.length === 0 && <button className="btn btn-sm btn-danger"
          onClick={confirm} disabled={deletion.loading || checking}>
          {deletion.loading ? "Устгаж байна…" : "Устгахыг баталгаажуулах"}
        </button>}
        {!checking && !preview && <button className="btn btn-sm"
          onClick={inspect} disabled={deletion.loading}>Дахин шалгах</button>}
      </div>
    </div>}
    {!open && error && <p role="alert" style={{gridColumn: "1 / -1"}}>{error}</p>}
  </div>;
}
