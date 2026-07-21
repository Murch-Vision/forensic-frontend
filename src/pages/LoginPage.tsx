/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : LoginPage.tsx
 * Created at  : 2026-07-05
 * Author      : jeefo
 * Purpose     : Full-screen sign-in. Shown whenever no one is authenticated;
 *               the rest of the app is gated behind it.
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/
import {useState} from "react";
import {useAuth} from "../lib/auth";

export default function LoginPage() {
  const {login} = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(username, password);
    } catch (err) {
      setError(String(err).replace(/^(Error|ApolloError):\s*/, ""));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{
      height: "100vh", display: "flex", alignItems: "center",
      justifyContent: "center", background:
        "radial-gradient(circle at 50% 30%, #0d1030 0%, #050510 70%)",
    }}>
      <form onSubmit={submit} className="card" style={{
        width: 380, padding: 32, display: "flex", flexDirection: "column",
        gap: 16,
      }}>
        <div style={{textAlign: "center"}}>
          <div style={{fontSize: 30}}>🕵️</div>
          <div style={{
            fontWeight: 700, letterSpacing: 1, color: "var(--accent-cyan)",
            fontSize: 15, marginTop: 6,
          }}>
            FORENSIC ANALYST
          </div>
          <div style={{color: "var(--text-secondary)", fontSize: 12,
            marginTop: 4}}>
            Хэлтсийн шинжилгээний систем
          </div>
        </div>

        <div>
          <div className="form-label">Нэвтрэх нэр</div>
          <input className="form-input" style={{width: "100%"}} autoFocus
            value={username} onChange={(e) => setUsername(e.target.value)}
            placeholder="admin" autoComplete="username" />
        </div>
        <div>
          <div className="form-label">Нууц үг</div>
          <input className="form-input" style={{width: "100%"}} type="password"
            value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••" autoComplete="current-password" />
        </div>

        {error && (
          <div style={{color: "var(--accent-red)", fontSize: 13,
            textAlign: "center"}}>
            {error}
          </div>
        )}

        <button className="btn btn-primary" type="submit" disabled={busy}
          style={{width: "100%", height: 40}}>
          {busy ? "Нэвтэрч байна…" : "Нэвтрэх"}
        </button>
      </form>
    </div>
  );
}
