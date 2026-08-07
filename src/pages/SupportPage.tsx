/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : SupportPage.tsx
 * Created at  : 2026-08-07
 * Author      : jeefo
 * Purpose     : "Алдаа мэдэгдэх" — staff send technical requests (алдаа /
 *               санал / асуулт) to the developer. The api proxies them into
 *               the maestro feedback inbox and attaches who sent it from the
 *               session.
 * Description :
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/
import {useRef, useState} from "react";
import {useMutation} from "@apollo/client";
import {PageHeader, Card} from "../components/kit";
import {SEND_SUPPORT_REQUEST} from "../graphql/support";

const TYPES = ["Алдаа", "Санал", "Асуулт"];

const MAX_IMAGES = 3;
const MAX_TEXT   = 3800;

// Downscale a picked image to a JPEG data URL (longest side ≤1600px) — a full
// screenshot shrinks to a few hundred KB before it ever leaves the browser.
// Returns null for files the browser cannot decode as an image.
async function compressImage(file: File): Promise<string | null> {
  if (!file.type.startsWith("image/")) return null;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("decode failed"));
      el.src = url;
    });
    const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function SupportPage() {
  const [type, setType] = useState(TYPES[0]);
  const [text, setText] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const [send, {loading}] = useMutation<{sendSupportRequest: boolean}>(
    SEND_SUPPORT_REQUEST);

  async function onPick(files: FileList | null) {
    if (!files) return;
    const picked = Array.from(files);
    const compressed = await Promise.all(picked.map(compressImage));
    const ok = compressed.filter((d): d is string => d !== null);
    if (ok.length) {
      setImages((prev) => [...prev, ...ok].slice(0, MAX_IMAGES));
    }
    if (fileInput.current) fileInput.current.value = "";
  }

  async function onSend() {
    if (!text.trim() || loading) return;
    setError(null);
    setSent(false);
    try {
      await send({variables: {input: {type, text: text.trim(), images}}});
      setText("");
      setImages([]);
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="page-container">
      <PageHeader icon={"🛠️"} title="Алдаа мэдэгдэх"
        subtitle="ХӨГЖҮҮЛЭГЧИД ХҮСЭЛТ ИЛГЭЭХ" />

      <Card title="ШИНЭ ХҮСЭЛТ">
        <div style={{maxWidth: 720, display: "flex", flexDirection: "column",
          gap: 16, padding: "8px 4px 4px"}}>
          <div>
            <label className="form-label">Төрөл</label>
            <div style={{display: "flex", gap: 8}}>
              {TYPES.map((t) => (
                <button key={t}
                  className={t === type ? "btn btn-primary" : "btn"}
                  onClick={() => setType(t)}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="form-label">Дэлгэрэнгүй</label>
            <textarea
              className="form-input"
              rows={6}
              maxLength={MAX_TEXT}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Аль хуудсан дээр, юу болсныг тодорхой бичнэ үү"
            />
          </div>

          <div>
            <label className="form-label">
              Дэлгэцийн зураг ({MAX_IMAGES} хүртэл)
            </label>
            <div style={{display: "flex", gap: 12, flexWrap: "wrap",
              alignItems: "center"}}>
              {images.map((src, i) => (
                <div key={i} style={{display: "flex", flexDirection: "column",
                  alignItems: "center", gap: 4}}>
                  <img src={src} alt={`Зураг ${i + 1}`}
                    style={{width: 104, height: 78, objectFit: "cover",
                      borderRadius: 6,
                      border: "1px solid var(--border-primary)"}} />
                  <button className="btn btn-sm"
                    onClick={() => setImages(
                      (prev) => prev.filter((_, j) => j !== i))}>
                    Хасах
                  </button>
                </div>
              ))}
              {images.length < MAX_IMAGES && (
                <button className="btn"
                  onClick={() => fileInput.current?.click()}>
                  Зураг нэмэх
                </button>
              )}
              <input ref={fileInput} type="file" accept="image/*" multiple
                style={{display: "none"}}
                onChange={(e) => onPick(e.target.files)} />
            </div>
          </div>

          <div style={{display: "flex", gap: 12, alignItems: "center"}}>
            <button className="btn btn-primary" onClick={onSend}
              disabled={!text.trim() || loading}>
              {loading ? "ИЛГЭЭЖ БАЙНА…" : "ИЛГЭЭХ"}
            </button>
            {sent && (
              <span style={{color: "var(--accent-green, #00C853)",
                fontSize: 12}}>
                Илгээгдлээ
              </span>
            )}
            {error && (
              <span style={{color: "var(--accent-red, #FF5252)",
                fontSize: 12}}>
                {error}
              </span>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
