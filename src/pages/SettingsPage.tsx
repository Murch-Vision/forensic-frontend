/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : SettingsPage.tsx
 * Created at  : 2026-06-23
 * Updated at  : 2026-07-21
 * Author      : jeefo
 * Purpose     : System settings surface — shows the running version and lets
 *               an admin self-update (git pull + restart) from the UI.
 * Description :
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/
import {useState} from "react";
import {useMutation, useQuery} from "@apollo/client";
import {Card, PageHeader} from "../components/kit";
import {APP_VERSION_QUERY, SELF_UPDATE} from "../graphql/queries";
import {useAuth} from "../lib/auth";

interface VersionInfo {
  version: string;
  commit: string;
  branch: string;
}

interface UpdateResult {
  updated: boolean;
  previousVersion: string;
  newVersion: string;
  previousCommit: string;
  newCommit: string;
  message: string;
  restarting: boolean;
}

export default function SettingsPage() {
  const {isAdmin} = useAuth();
  const {data, loading, refetch} =
    useQuery<{appVersion: VersionInfo}>(APP_VERSION_QUERY);
  const [result, setResult] = useState<UpdateResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [selfUpdate, {loading: updating}] =
    useMutation<{selfUpdate: UpdateResult}>(SELF_UPDATE);

  const v = data?.appVersion;

  async function onUpdate() {
    setError(null);
    setResult(null);
    try {
      const res = await selfUpdate();
      const r = res.data?.selfUpdate ?? null;
      setResult(r);
      // If nothing restarted, the version query may still be worth refreshing.
      if (r && !r.restarting) await refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="page-container">
      <PageHeader icon={"⚙️"} title="Тохиргоо"
        subtitle="СИСТЕМИЙН ТОХИРГОО" />

      <Card title="ХУВИЛБАР БА ШИНЭЧЛЭЛ">
        <div style={{padding: "8px 4px 4px", fontSize: 13}}>
          {loading && (
            <div style={{color: "var(--text-muted)"}}>Ачааллаж байна…</div>
          )}
          {v && (
            <div style={{display: "flex", flexWrap: "wrap", gap: 32,
              alignItems: "center"}}>
              <Field label="Хувилбар" value={v.version} />
              <Field label="Commit" value={v.commit} mono />
              <Field label="Салбар" value={v.branch} mono />
            </div>
          )}

          <div style={{marginTop: 24, display: "flex", gap: 12,
            alignItems: "center"}}>
            <button
              className="btn btn-primary"
              onClick={onUpdate}
              disabled={!isAdmin || updating}
              title={isAdmin
                ? "Кодыг git-ээс татаж, шинэчлэл байвал серверийг дахин ачаална"
                : "Зөвхөн админ шинэчлэх боломжтой"}
            >
              {updating ? "ШИНЭЧИЛЖ БАЙНА…" : "ШИНЭЧЛЭЛ ШАЛГАХ БА ТАТАХ"}
            </button>
            {!isAdmin && (
              <span style={{color: "var(--text-muted)", fontSize: 12}}>
                Зөвхөн хэлтсийн дарга системийг шинэчилнэ.
              </span>
            )}
          </div>

          {error && (
            <div style={{marginTop: 16, padding: "10px 14px", borderRadius: 6,
              background: "rgba(255,60,60,0.08)", color: "var(--accent-red)",
              fontSize: 12.5}}>
              Алдаа: {error}
            </div>
          )}

          {result && (
            <div style={{marginTop: 16, padding: "10px 14px", borderRadius: 6,
              background: result.updated
                ? "rgba(46,200,120,0.08)" : "rgba(120,140,160,0.08)",
              color: result.updated
                ? "var(--accent-green)" : "var(--text-secondary)",
              fontSize: 12.5}}>
              <div>{result.message}</div>
              {result.updated && (
                <div style={{marginTop: 4, color: "var(--text-muted)",
                  fontFamily: "var(--font-mono)", fontSize: 11.5}}>
                  {result.previousCommit} → {result.newCommit}
                  {result.previousVersion !== result.newVersion &&
                    ` (${result.previousVersion} → ${result.newVersion})`}
                </div>
              )}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function Field({label, value, mono}:
  {label: string; value: string; mono?: boolean}) {
  return (
    <div>
      <div style={{fontSize: 11, textTransform: "uppercase",
        letterSpacing: 0.5, color: "var(--text-muted)"}}>{label}</div>
      <div style={{fontSize: 15, marginTop: 2, color: "var(--text-primary)",
        fontFamily: mono ? "var(--font-mono)" : undefined}}>{value}</div>
    </div>
  );
}
