/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : SettingsPage.tsx
 * Created at  : 2026-06-23
 * Updated at  : 2026-07-03
 * Author      : jeefo
 * Purpose     : Placeholder — the previous contents (AML thresholds, locale,
 *               data wipe) were removed per user wish; the page stays so a
 *               future settings surface has a home.
 * Description :
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/
import {Card, PageHeader} from "../components/kit";

export default function SettingsPage() {
  return (
    <div className="page-container">
      <PageHeader icon={"\u2699\uFE0F"} title="Тохиргоо"
        subtitle="СИСТЕМИЙН ТОХИРГОО" />
      <Card>
        <div style={{padding: "48px 24px", textAlign: "center",
          color: "var(--text-muted)", fontSize: 13}}>
          Тохиргооны хэсэг одоогоор хоосон байна.
        </div>
      </Card>
    </div>
  );
}
