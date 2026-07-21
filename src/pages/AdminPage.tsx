/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : AdminPage.tsx
 * Created at  : 2026-07-05
 * Author      : jeefo
 * Purpose     : The department boss's control room (ADMIN only). Two panels:
 *               (1) Accounts — create detectives, activate/deactivate, reset
 *                   passwords.
 *               (2) Case access — grant/revoke which detectives may open which
 *                   case. Merging cases lives on the /cases page.
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/
import {useState} from "react";
import {useMutation, useQuery} from "@apollo/client";
import {Card, Empty, Loading, PageHeader} from "../components/kit";
import {Select} from "../components/inputs";
import {useAuth} from "../lib/auth";
import type {AuthUser} from "../lib/auth";
import {
  ADMIN_CASES_QUERY,
  CASE_MEMBERS_QUERY,
  CREATE_USER,
  GRANT_CASE_ACCESS,
  RESET_USER_DEVICE,
  RESET_USER_PASSWORD,
  REVOKE_CASE_ACCESS,
  SET_USER_ACTIVE,
  USERS_QUERY,
} from "../graphql/auth";

// The admin list carries the extra device-lock flag the small `me` payload
// doesn't.
interface AdminUser extends AuthUser {
  deviceBound: boolean;
}

interface CaseRef {
  id: number; caseId: string; caseName: string; status: string;
  ownerUserId: number | null;
}

export default function AdminPage() {
  const {user: me, isAdmin} = useAuth();

  if (!isAdmin) {
    return (
      <div className="page-container">
        <PageHeader icon="🛡" title="Удирдлага" subtitle="ЗӨВХӨН АДМИН" />
        <Empty message="Энэ хуудас зөвхөн админд нээлттэй." />
      </div>
    );
  }

  return (
    <div className="page-container">
      <PageHeader icon="🛡" title="Удирдлага"
        subtitle="БҮРТГЭЛ БОЛОН КЕЙСИЙН ХАНДАХ ЭРХ" />
      <UsersPanel meId={me?.id ?? -1} />
      <CaseAccessPanel />
    </div>
  );
}

/* ---------------------------------------------------------------- accounts */
function UsersPanel({meId}: {meId: number}) {
  const {data, loading, refetch} = useQuery<{users: AdminUser[]}>(USERS_QUERY);
  const [createUser] = useMutation(CREATE_USER);
  const [setActive] = useMutation(SET_USER_ACTIVE);
  const [resetPw] = useMutation(RESET_USER_PASSWORD);
  const [resetDevice] = useMutation(RESET_USER_DEVICE);
  // Two-click confirm for wiping a device binding (no native popup).
  const [confirmDevice, setConfirmDevice] = useState<number | null>(null);

  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("DETECTIVE");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // The account whose password-change MODAL is open (null = closed). A real
  // dialog, not a cramped inline field jammed in the actions column.
  const [pwUser, setPwUser] = useState<AdminUser | null>(null);
  const [pwVal, setPwVal] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwErr, setPwErr] = useState("");
  const [pwDone, setPwDone] = useState(false);
  // Filter the roster instead of scrolling it (scales to many detectives).
  const [search, setSearch] = useState("");

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      await createUser({variables: {input:
        {username, password, fullName: fullName || null, role}}});
      setUsername(""); setFullName(""); setPassword(""); setRole("DETECTIVE");
      await refetch();
    } catch (err) {
      setError(String(err).replace(/^(Error|ApolloError):\s*/, ""));
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(u: AuthUser) {
    await setActive({variables: {userId: u.id, active: !u.active}});
    await refetch();
  }

  function openPwModal(u: AdminUser) {
    setPwUser(u); setPwVal(""); setPwErr(""); setPwDone(false);
  }
  async function savePw() {
    if (!pwUser) return;
    if (pwVal.length < 6) {setPwErr("Дор хаяж 6 тэмдэгт байх ёстой"); return;}
    setPwBusy(true); setPwErr("");
    try {
      await resetPw({variables: {userId: pwUser.id, password: pwVal}});
      // Confirm success in-modal, then auto-close — no guessing whether it
      // worked.
      setPwDone(true);
      setTimeout(() => setPwUser(null), 1100);
    } catch (err) {
      setPwErr(String(err).replace(/^(Error|ApolloError):\s*/, ""));
    } finally {
      setPwBusy(false);
    }
  }

  async function doResetDevice(id: number) {
    await resetDevice({variables: {userId: id}});
    setConfirmDevice(null);
    await refetch();
  }

  const allUsers = data?.users ?? [];
  const sq = search.trim().toLowerCase();
  const users = sq
    ? allUsers.filter((u) => u.username.toLowerCase().includes(sq)
      || u.fullName?.toLowerCase().includes(sq)
      || (u.role === "ADMIN" ? "дарга админ" : "мөрдөгч").includes(sq))
    : allUsers;

  return (
    <Card title={`Бүртгэлүүд (${allUsers.length})`} style={{marginBottom: 16}}
      actions={
        <input className="form-input" style={{width: 240}} value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Нэр, нэвтрэх нэрээр хайх…" />
      }>
      {/* Create account row */}
      {/* autoComplete="off" + a non-standard field name stops Chrome from
          autofilling the LOGGED-IN admin's saved credentials into this
          create-account form (which both leaked the password and painted the
          fields white). */}
      <form onSubmit={onCreate} autoComplete="off" style={{display: "flex",
        gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 16}}>
        <div>
          <div className="form-label">Нэвтрэх нэр</div>
          <input className="form-input" style={{width: 150}} value={username}
            name="new-account-username" autoComplete="off"
            onChange={(e) => setUsername(e.target.value)} placeholder="detective1" />
        </div>
        <div>
          <div className="form-label">Бүтэн нэр</div>
          <input className="form-input" style={{width: 170}} value={fullName}
            name="new-account-fullname" autoComplete="off"
            onChange={(e) => setFullName(e.target.value)} placeholder="Овог Нэр" />
        </div>
        <div>
          <div className="form-label">Нууц үг</div>
          <input className="form-input" style={{width: 140}} type="password"
            value={password} name="new-account-password"
            autoComplete="new-password"
            onChange={(e) => setPassword(e.target.value)}
            placeholder="дор хаяж 6 тэмдэгт" />
        </div>
        <div>
          <div className="form-label">Үүрэг</div>
          <Select value={role} onChange={setRole} style={{width: 150}}
            options={[
              {value: "DETECTIVE", label: "Мөрдөгч"},
              {value: "ADMIN", label: "Дарга (админ)"},
            ]} />
        </div>
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "…" : "＋ Бүртгэл нээх"}
        </button>
        {error && (
          <span style={{color: "var(--accent-red)", fontSize: 13}}>{error}</span>
        )}
      </form>

      {loading ? <Loading /> : (
        <table className="data-grid" style={{width: "100%"}}>
          <thead>
            <tr>
              <th>Нэвтрэх нэр</th><th>Бүтэн нэр</th><th>Үүрэг</th>
              <th>Төлөв</th><th>Төхөөрөмж</th>
              <th style={{textAlign: "right"}}>Үйлдэл</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr><td colSpan={6} style={{color: "var(--text-muted)",
                padding: "16px", textAlign: "center"}}>
                «{search}» — тохирох бүртгэл олдсонгүй
              </td></tr>
            )}
            {users.map((u) => (
              <tr key={u.id}>
                <td style={{fontFamily: "var(--font-mono)"}}>{u.username}</td>
                <td>{u.fullName ?? "—"}</td>
                <td>
                  <span className={`badge ${u.role === "ADMIN"
                    ? "warning" : "info"}`}>
                    {u.role === "ADMIN" ? "Дарга" : "Мөрдөгч"}
                  </span>
                </td>
                <td>
                  <span className={`badge ${u.active ? "low" : "unknown"}`}>
                    {u.active ? "Идэвхтэй" : "Идэвхгүй"}
                  </span>
                </td>
                {/* Device lock — admins aren't locked; detectives show the
                    binding state + a reset the boss uses when they change PC. */}
                <td style={{whiteSpace: "nowrap"}}>
                  {u.role === "ADMIN" ? (
                    <span style={{color: "var(--text-muted)"}}>—</span>
                  ) : !u.deviceBound ? (
                    <span style={{color: "var(--text-muted)", fontSize: 12}}>
                      Холбогдоогүй
                    </span>
                  ) : confirmDevice === u.id ? (
                    <span style={{display: "inline-flex", gap: 6,
                      alignItems: "center"}}>
                      <span style={{fontSize: 12}}>Шинэчлэх үү?</span>
                      <button className="btn btn-sm btn-danger"
                        onClick={() => doResetDevice(u.id)}>Тийм</button>
                      <button className="btn btn-sm"
                        onClick={() => setConfirmDevice(null)}>Үгүй</button>
                    </span>
                  ) : (
                    <span style={{display: "inline-flex", gap: 6,
                      alignItems: "center"}}>
                      <span className="badge low">🔒 Холбогдсон</span>
                      <button className="btn btn-sm"
                        title="Хуучин төхөөрөмжийг устгах — мөрдөгч шинэ компьютероос дахин холбоно"
                        onClick={() => setConfirmDevice(u.id)}>
                        ♻ Шинэчлэх
                      </button>
                    </span>
                  )}
                </td>
                <td style={{textAlign: "right", whiteSpace: "nowrap"}}>
                  <span style={{display: "inline-flex", gap: 6}}>
                    <button className="btn btn-sm"
                      onClick={() => openPwModal(u)}
                      title="Энэ хэрэглэгчийн нууц үгийг солих">
                      🔑 Нууц үг солих
                    </button>
                    {u.id !== meId && (
                      <button className={`btn btn-sm ${u.active
                        ? "btn-danger" : ""}`}
                        onClick={() => toggleActive(u)}>
                        {u.active ? "⏸ Идэвхгүй" : "▶ Идэвхжүүлэх"}
                      </button>
                    )}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Password-change dialog — a clear modal, not an inline field. */}
      {pwUser && (
        <div className="modal-overlay"
          onClick={() => !pwBusy && setPwUser(null)}>
          <div className="modal-content" style={{width: "min(440px, 92vw)"}}
            onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">🔑 Нууц үг солих</span>
              <button className="modal-close" onClick={() => setPwUser(null)}
                aria-label="Хаах">×</button>
            </div>
            <div className="modal-body">
              <div style={{color: "var(--text-secondary)", fontSize: 13,
                marginBottom: 14}}>
                <b style={{color: "var(--text-primary)"}}>
                  {pwUser.fullName ?? pwUser.username}</b>
                {" "}(<span style={{fontFamily: "var(--font-mono)"}}>
                  {pwUser.username}</span>) хэрэглэгчийн шинэ нууц үг:
              </div>
              {/* A dummy hidden field absorbs Chrome's autofill so it can't
                  dump the admin's own password into the box below. */}
              <input type="text" name="username" autoComplete="username"
                style={{display: "none"}} />
              <input className="form-input" style={{width: "100%"}}
                type="password" autoFocus value={pwVal}
                name="admin-set-new-password" autoComplete="new-password"
                onChange={(e) => setPwVal(e.target.value)}
                onKeyDown={(e) => {if (e.key === "Enter") savePw();}}
                placeholder="Шинэ нууц үг (дор хаяж 6 тэмдэгт)" />
              {pwErr && (
                <div style={{color: "var(--accent-red)", fontSize: 13,
                  marginTop: 10}}>{pwErr}</div>
              )}
              {pwDone && (
                <div style={{color: "var(--accent-green)", fontSize: 13,
                  marginTop: 10}}>
                  ✓ Нууц үг солигдлоо. Хэрэглэгч дахин нэвтэрнэ.
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setPwUser(null)}
                disabled={pwBusy}>Болих</button>
              <button className="btn btn-primary" onClick={savePw}
                disabled={pwBusy || pwDone}>
                {pwBusy ? "Хадгалж байна…" : "Хадгалах"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------ case access */
function CaseAccessPanel() {
  const {data} = useQuery<{caseFiles: CaseRef[]; users: AuthUser[]}>(
    ADMIN_CASES_QUERY);
  const [caseId, setCaseId] = useState<number | null>(null);
  const cases = data?.caseFiles ?? [];
  const detectives = (data?.users ?? []).filter((u) => u.role === "DETECTIVE");
  const selected = cases.find((c) => c.id === caseId) ?? null;

  const membersQ = useQuery<{caseMembers: AuthUser[]}>(CASE_MEMBERS_QUERY, {
    variables: {caseFileId: caseId}, skip: caseId == null});
  const [grant] = useMutation(GRANT_CASE_ACCESS);
  const [revoke] = useMutation(REVOKE_CASE_ACCESS);

  // Search-to-add: the boss types a name instead of scrolling every account.
  const [q, setQ] = useState("");

  const members = membersQ.data?.caseMembers ?? [];
  const memberIds = new Set(members.map((m) => m.id));
  const owner = detectives.find((u) => u.id === selected?.ownerUserId) ?? null;

  async function doGrant(u: AuthUser) {
    await grant({variables: {caseFileId: caseId, userId: u.id}});
    setQ("");
    await membersQ.refetch();
  }
  async function doRevoke(u: AuthUser) {
    await revoke({variables: {caseFileId: caseId, userId: u.id}});
    await membersQ.refetch();
  }

  // Candidates to ADD = detectives who don't already have access, matched
  // against the query. Capped so a 1000-detective org shows a handful, never
  // the whole roster.
  const query = q.trim().toLowerCase();
  const candidates = detectives
    .filter((u) => u.id !== owner?.id && !memberIds.has(u.id))
    .filter((u) => !query
      || u.fullName?.toLowerCase().includes(query)
      || u.username.toLowerCase().includes(query))
    .slice(0, 8);

  return (
    <Card title="Кейсийн хандах эрх">
      <div style={{display: "flex", gap: 8, alignItems: "flex-end",
        marginBottom: 16}}>
        <div>
          <div className="form-label">Кейс сонгох</div>
          <Select value={caseId ?? ""}
            onChange={(v) => {setCaseId(v ? Number(v) : null); setQ("");}}
            style={{width: 300}}
            triggerLabel={selected
              ? `${selected.caseId} · ${selected.caseName}` : "Кейс сонгоно уу…"}
            options={[{value: "", label: "Кейс сонгоно уу…"},
              ...cases.map((c) => ({value: c.id,
                label: `${c.caseId} · ${c.caseName}`}))]} />
        </div>
      </div>

      {caseId == null ? (
        <Empty message="Хандах эрхийг тохируулах кейсээ дээрээс сонгоно уу." />
      ) : (
        <div style={{display: "grid", gridTemplateColumns: "1fr 1fr",
          gap: 20, alignItems: "start"}}>

          {/* LEFT — who currently has access (short: owner + granted only) */}
          <div>
            <div className="form-label" style={{marginBottom: 8}}>
              Хандах эрхтэй ({(owner ? 1 : 0) + members.length})
            </div>
            {!owner && members.length === 0 ? (
              <div style={{color: "var(--text-muted)", fontSize: 13,
                padding: "8px 0"}}>
                Хараахан хэн ч хандах эрхгүй байна.
              </div>
            ) : (
              <div style={{display: "flex", flexDirection: "column", gap: 6}}>
                {owner && (
                  <AccessRow u={owner} badge="Эзэмшигч" />
                )}
                {members.map((u) => (
                  <AccessRow key={u.id} u={u}
                    onRemove={() => doRevoke(u)} />
                ))}
              </div>
            )}
          </div>

          {/* RIGHT — search-to-add (never lists the whole roster) */}
          <div>
            <div className="form-label" style={{marginBottom: 8}}>
              Мөрдөгч нэмэх
            </div>
            <input className="form-input" style={{width: "100%"}}
              value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Нэр эсвэл нэвтрэх нэрээр хайх…" />
            <div style={{marginTop: 8, display: "flex",
              flexDirection: "column", gap: 6}}>
              {candidates.length === 0 ? (
                <div style={{color: "var(--text-muted)", fontSize: 13}}>
                  {query
                    ? "Тохирох мөрдөгч алга."
                    : "Бүх мөрдөгч энэ кейст хандах эрхтэй."}
                </div>
              ) : candidates.map((u) => (
                <button key={u.id} type="button"
                  className="access-add-row" onClick={() => doGrant(u)}>
                  <span style={{flex: 1, textAlign: "left"}}>
                    <span style={{color: "var(--text-primary)"}}>
                      {u.fullName ?? u.username}</span>
                    <span style={{color: "var(--text-muted)",
                      fontFamily: "var(--font-mono)", fontSize: 12,
                      marginLeft: 8}}>{u.username}</span>
                  </span>
                  <span style={{color: "var(--accent-cyan)"}}>＋ Нэмэх</span>
                </button>
              ))}
              {!query && detectives.filter((u) => u.id !== owner?.id
                && !memberIds.has(u.id)).length > candidates.length && (
                <div style={{color: "var(--text-muted)", fontSize: 12}}>
                  …нэрээр хайж бусдыг олно уу
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

// One row in the "who has access" list — a name with either an owner badge or
// a remove button.
function AccessRow({u, badge, onRemove}: {
  u: AuthUser; badge?: string; onRemove?: () => void;
}) {
  return (
    <div style={{display: "flex", alignItems: "center", gap: 8,
      padding: "8px 12px", background: "var(--bg-input)",
      border: "1px solid var(--border-primary)", borderRadius: 6}}>
      <span style={{flex: 1}}>
        <span style={{color: "var(--text-primary)"}}>
          {u.fullName ?? u.username}</span>
        <span style={{color: "var(--text-muted)",
          fontFamily: "var(--font-mono)", fontSize: 12, marginLeft: 8}}>
          {u.username}</span>
      </span>
      {badge ? (
        <span className="badge info">{badge}</span>
      ) : (
        <button className="btn btn-sm btn-danger" onClick={onRemove}>
          ✕ Хасах
        </button>
      )}
    </div>
  );
}
