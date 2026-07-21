/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : PersonFormModal.tsx
 * Created at  : 2026-07-06
 * Author      : jeefo
 * Purpose     :
 * Description : Shared "add / edit person" modal. Owns the form, the photo
 *               resize and the create/update mutation, so any page (People,
 *               Link chart) can pop it and get the saved suspect back.
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/
import {useEffect, useState} from "react";
import {useMutation} from "@apollo/client";
import {CREATE_SUSPECT, UPDATE_SUSPECT} from "../graphql/suspects";
import {Select} from "./inputs";
import type {RiskLevel, SuspectInput} from "../types";

export interface PersonForm extends SuspectInput {
  id?: number;
}

export const EMPTY_PERSON_FORM: PersonForm = {
  fullName: "",
  gender: "Male",
  riskLevel: "UNKNOWN",
};

const RISK_LEVELS: RiskLevel[] = ["UNKNOWN", "LOW", "MEDIUM", "HIGH", "CRITICAL"];
const RISK_LABELS: Record<RiskLevel, string> = {
  UNKNOWN: "Тодорхойгүй",
  LOW: "Бага",
  MEDIUM: "Дунд",
  HIGH: "Өндөр",
  CRITICAL: "Маш өндөр",
};
const GENDER_OPTIONS = [
  {value: "Male", label: "Эрэгтэй"},
  {value: "Female", label: "Эмэгтэй"},
];

// Downscale the chosen image to a 256x256 JPEG data-URI (keeps the DB small).
function resizeToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read failed"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("decode failed"));
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("no 2d context"));
        ctx.drawImage(img, 0, 0, 256, 256);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export interface SavedPerson {
  id: number;
  fullName: string;
  riskLevel: string;
}

export default function PersonFormModal(props: {
  open: boolean;
  // Prefilled form → edit mode (has id). null/undefined → create a new person.
  initial?: PersonForm | null;
  onClose: () => void;
  // Fired after a successful create/update with the saved suspect. The host
  // decides what to do (refetch a list, draw a link to the new node, …).
  onSaved: (saved: SavedPerson) => void | Promise<void>;
}) {
  const {open, initial, onClose, onSaved} = props;
  const [form, setForm] = useState<PersonForm>(EMPTY_PERSON_FORM);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [createSuspect] = useMutation(CREATE_SUSPECT);
  const [updateSuspect] = useMutation(UPDATE_SUSPECT);
  const isEditing = form.id !== undefined;

  // Reset the form each time the modal opens (initial is stable host state).
  useEffect(() => {
    if (open) {
      setForm(initial ? {...initial} : {...EMPTY_PERSON_FORM});
      setError("");
    }
  }, [open, initial]);

  if (!open) return null;

  function setField<K extends keyof PersonForm>(key: K, value: PersonForm[K]) {
    setForm((f) => ({...f, [key]: value}));
  }

  async function onPhotoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const uri = await resizeToDataUri(file);
      setForm((f) => ({...f, photoData: uri}));
      setError("");
    } catch (err) {
      setError("Зураг ачаалахад алдаа гарлаа: " + String(err));
    }
  }

  async function save() {
    setError("");
    if (!form.fullName.trim()) {
      setError("Бүтэн нэр заавал бөглөх");
      return;
    }
    const {id, ...input} = form;
    setBusy(true);
    try {
      const res = id !== undefined
        ? await updateSuspect({variables: {id, input}})
        : await createSuspect({variables: {input}});
      const saved = (id !== undefined
        ? res.data?.updateSuspect
        : res.data?.createSuspect) as SavedPerson | undefined;
      await onSaved(saved ?? {id: id ?? 0, fullName: form.fullName,
        riskLevel: form.riskLevel ?? "UNKNOWN"});
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{width: "min(720px, 92vw)"}}
        onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">
            {isEditing ? "МЭДЭЭЛЭЛ ЗАСАХ" : "ШИНЭ ХҮН НЭМЭХ"}
          </span>
          <button className="modal-close" title="Хаах" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <div style={{display: "flex", gap: 24, flexWrap: "wrap"}}>
            <div style={{width: 96, flexShrink: 0}}>
              <label className={`avatar-upload${
                form.photoData ? " has-photo" : ""}`}
                title="Зураг сонгох — холбоосын зураглалд ашиглана">
                {form.photoData ? (
                  <>
                    <img src={form.photoData} alt="preview" />
                    <span className="avatar-upload-overlay">СОЛИХ</span>
                  </>
                ) : (
                  <span className="avatar-upload-hint">
                    Зураг<br />сонгох
                  </span>
                )}
                <input type="file" accept="image/*"
                  style={{display: "none"}} onChange={onPhotoSelected} />
              </label>
              {form.photoData && (
                <button type="button" className="avatar-remove"
                  onClick={() => setField("photoData", null)}>
                  Устгах
                </button>
              )}
            </div>
            <div className="form-grid-2"
              style={{flex: 1, minWidth: 260, alignContent: "start"}}>
              <div style={{gridColumn: "1 / -1"}}>
                <label className="form-label">Бүтэн нэр *</label>
                <input className="form-input" autoFocus
                  value={form.fullName}
                  onChange={(e) => setField("fullName", e.target.value)} />
              </div>
              <div>
                <label className="form-label">Өөр нэр</label>
                <input className="form-input"
                  value={form.aliases ?? ""}
                  onChange={(e) => setField("aliases", e.target.value)} />
              </div>
              <div>
                <label className="form-label">Регистрийн дугаар</label>
                <input className="form-input"
                  value={form.nationalId ?? ""}
                  onChange={(e) => setField("nationalId", e.target.value)} />
              </div>
              <div>
                <label className="form-label">Хүйс</label>
                <Select style={{width: "100%"}}
                  value={form.gender ?? "Male"}
                  onChange={(v) => setField("gender", String(v))}
                  options={GENDER_OPTIONS} />
              </div>
              <div>
                <label className="form-label">Эрсдэлийн түвшин</label>
                <Select style={{width: "100%"}}
                  value={form.riskLevel ?? "UNKNOWN"}
                  onChange={(v) => setField("riskLevel", v as RiskLevel)}
                  options={RISK_LEVELS.map((r) => ({
                    value: r, label: RISK_LABELS[r]}))} />
              </div>
            </div>
          </div>

          <div className="form-section-label">Холбоо барих</div>
          <div className="form-grid-2">
            <div>
              <label className="form-label">Утас</label>
              <input className="form-input"
                value={form.primaryPhone ?? ""}
                onChange={(e) => setField("primaryPhone", e.target.value)} />
            </div>
            <div>
              <label className="form-label">И-мэйл</label>
              <input className="form-input"
                value={form.email ?? ""}
                onChange={(e) => setField("email", e.target.value)} />
            </div>
            <div>
              <label className="form-label">Хаяг</label>
              <input className="form-input"
                value={form.address ?? ""}
                onChange={(e) => setField("address", e.target.value)} />
            </div>
            <div>
              <label className="form-label">Хот</label>
              <input className="form-input"
                value={form.city ?? ""}
                onChange={(e) => setField("city", e.target.value)} />
            </div>
          </div>

          <div className="form-section-label">Ажил / тэмдэглэл</div>
          <div className="form-grid-2">
            <div>
              <label className="form-label">Ажил мэргэжил</label>
              <input className="form-input"
                value={form.occupation ?? ""}
                onChange={(e) => setField("occupation", e.target.value)} />
            </div>
            <div>
              <label className="form-label">Байгууллага</label>
              <input className="form-input"
                value={form.organization ?? ""}
                onChange={(e) => setField("organization", e.target.value)} />
            </div>
            <div style={{gridColumn: "1 / -1"}}>
              <label className="form-label">Тэмдэглэл</label>
              <textarea className="form-input"
                style={{minHeight: 72, resize: "vertical"}}
                value={form.notes ?? ""}
                onChange={(e) => setField("notes", e.target.value)} />
            </div>
          </div>

          {error && (
            <div className="form-error-box"
              style={{marginTop: 16, marginBottom: 0}}>
              {error}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose} disabled={busy}>
            ЦУЦЛАХ
          </button>
          <button className="btn btn-accent" onClick={save} disabled={busy}>
            {busy ? "…" : isEditing ? "ХАДГАЛАХ" : "ҮҮСГЭХ"}
          </button>
        </div>
      </div>
    </div>
  );
}
