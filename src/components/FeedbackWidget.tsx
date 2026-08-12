/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : FeedbackWidget.tsx
 * Created at  : 2026-08-13
 * Author      : jeefo
 * Purpose     : Санал хүсэлт — floating intake, reachable from every screen.
 * Description : Ported from billions-tree-frontend's FeedbackWidget: the same
 *               type toggle, drag-and-drop images (max 3, downscaled in the
 *               browser), auto-attached context and localStorage draft.
 *
 *               Two differences, both because this app is behind a login:
 *               there are no name/contact fields (the API takes the sender from
 *               the session, so a report cannot claim to be from someone else),
 *               and it renders for ADMIN only.
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/
import {useEffect, useRef, useState} from "react";
import {useMutation} from "@apollo/client";
import {useLocation} from "react-router-dom";
import {SEND_SUPPORT_REQUEST} from "../graphql/support";
import {useAuth} from "../lib/auth";
import {clientEnv, compressImage} from "../lib/image";

const DRAFT_KEY = "forensic.feedback.draft";
const MAX_IMAGES = 3;
const TYPES = ["Алдаа", "Санал"] as const;
type FeedbackType = (typeof TYPES)[number];

const PLACEHOLDER: Record<FeedbackType, string> = {
  "Алдаа": "Юу ажиллахгүй байсан бэ?",
  "Санал": "Юуг нь өөрчилвөл ажил хөнгөвчлөх вэ?",
};

export default function FeedbackWidget() {
  const {isAdmin} = useAuth();
  const location = useLocation();
  const [send] = useMutation(SEND_SUPPORT_REQUEST);

  const [open, setOpen] = useState(false);
  const [type, setType] = useState<FeedbackType>("Алдаа");
  const [text, setText] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  // A half-written report survives a reload — the bug being reported is often
  // the thing that reloaded the page.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw) as {type?: string; text?: string};
      if (d.text) setText(d.text);
      if (d.type === "Алдаа" || d.type === "Санал") setType(d.type);
    } catch {
      // A corrupt draft is not worth a word to the user.
    }
  }, []);

  useEffect(() => {
    try {
      if (text.trim()) {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({type, text}));
      } else {
        localStorage.removeItem(DRAFT_KEY);
      }
    } catch {
      // Private mode / full quota — the draft is a convenience, not the report.
    }
  }, [type, text]);

  if (!isAdmin) return null;

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    const room = MAX_IMAGES - images.length;
    if (room <= 0) return;
    const picked = Array.from(files).slice(0, room);
    const done = await Promise.all(picked.map(compressImage));
    const ok = done.filter((d): d is string => d !== null);
    if (ok.length) setImages((prev) => [...prev, ...ok].slice(0, MAX_IMAGES));
    if (fileInput.current) fileInput.current.value = "";
  }

  async function submit() {
    if (busy) return;
    if (!text.trim()) {setError("Тайлбараа бичнэ үү."); return;}
    setBusy(true); setError("");
    try {
      await send({variables: {input: {
        type, text: text.trim(), images,
        page: location.pathname,
        client: clientEnv(),
      }}});
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        // ignore
      }
      setText(""); setImages([]); setSent(true);
      setTimeout(() => {setOpen(false); setSent(false);}, 1600);
    } catch (e) {
      setError(String(e).replace(/^(Error|ApolloError):\s*/, ""));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="btn feedback-fab"
        onClick={() => {setError(""); setOpen(true);}}>
        Санал хүсэлт
      </button>

      {open && (
        <div className="modal-overlay" onClick={() => !busy && setOpen(false)}>
          <div className="modal-content" style={{width: "min(520px, 94vw)"}}
            onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Санал хүсэлт</span>
              <button className="modal-close" onClick={() => setOpen(false)}
                aria-label="Хаах">×</button>
            </div>

            {sent ? (
              <div className="modal-body" style={{textAlign: "center",
                padding: "32px 16px", color: "var(--accent-green)"}}>
                Хүлээн авлаа. Баярлалаа!
              </div>
            ) : (
              <>
                <div className="modal-body">
                  <div style={{display: "flex", gap: 8, marginBottom: 12}}>
                    {TYPES.map((v) => (
                      <button key={v} type="button"
                        className={`btn btn-sm ${type === v
                          ? "btn-primary" : ""}`}
                        onClick={() => setType(v)}>
                        {v}
                      </button>
                    ))}
                  </div>

                  <textarea className="form-input" rows={5} autoFocus
                    style={{width: "100%", resize: "vertical"}}
                    value={text} maxLength={3800}
                    placeholder={PLACEHOLDER[type]}
                    onChange={(e) => {setText(e.target.value); setError("");}}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      void addFiles(e.dataTransfer.files);
                    }} />

                  <input ref={fileInput} type="file" accept="image/*" multiple
                    style={{display: "none"}}
                    onChange={(e) => void addFiles(e.target.files)} />

                  <div style={{display: "flex", flexWrap: "wrap", gap: 10,
                    alignItems: "flex-start", marginTop: 12}}>
                    {images.map((data, i) => (
                      <div key={i} style={{position: "relative"}}>
                        <img src={data} alt="" style={{width: 56, height: 56,
                          objectFit: "cover", borderRadius: 6,
                          border: "1px solid var(--border-primary)"}} />
                        <button type="button" className="btn btn-sm btn-danger"
                          style={{position: "absolute", top: -8, right: -8,
                            padding: "0 6px", lineHeight: "18px"}}
                          title="Устгах"
                          onClick={() => setImages((prev) =>
                            prev.filter((_, j) => j !== i))}>
                          ×
                        </button>
                      </div>
                    ))}
                    {images.length < MAX_IMAGES && (
                      <button type="button"
                        className={`feedback-drop${dragging ? " dragging" : ""}`}
                        onClick={() => fileInput.current?.click()}
                        onDragEnter={(e) => {
                          e.preventDefault(); setDragging(true);
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onDragLeave={() => setDragging(false)}
                        onDrop={(e) => {
                          e.preventDefault(); setDragging(false);
                          void addFiles(e.dataTransfer.files);
                        }}>
                        Зургаа энд чирж оруулах эсвэл сонгох
                      </button>
                    )}
                  </div>

                  {/* What rides along without being typed. */}
                  <div style={{marginTop: 12, display: "flex", flexWrap: "wrap",
                    gap: 6, fontSize: 11, color: "var(--text-muted)"}}>
                    <span>Хамт илгээгдэнэ:</span>
                    <span className="badge unknown">{location.pathname}</span>
                    <span className="badge unknown">{clientEnv()}</span>
                  </div>

                  {error && (
                    <div style={{color: "var(--accent-red)", fontSize: 13,
                      marginTop: 10}}>{error}</div>
                  )}
                </div>

                <div className="modal-footer">
                  <button className="btn" onClick={() => setOpen(false)}
                    disabled={busy}>Болих</button>
                  <button className="btn btn-primary" onClick={submit}
                    disabled={busy || !text.trim()}>
                    {busy ? "Илгээж байна…" : "Илгээх"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
