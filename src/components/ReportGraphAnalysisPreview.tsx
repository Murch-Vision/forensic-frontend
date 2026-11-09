import {DataTable} from "./kit";
import {formatMoney} from "../lib/format";
import type {ReportGraphAnalysis} from "../lib/reportGraphAnalysis";

export default function ReportGraphAnalysisPreview({analysis}: {analysis: ReportGraphAnalysis}) {
  return <div className="report-analysis-preview">
    <h3>Мөнгөн урсгал ({analysis.flow.length})</h3>
    <DataTable rows={analysis.flow} rowKey={(_, i) => i}
      scroll={{overflow: "auto", maxHeight: 320}} columns={[
        {header: "Этгээд / данс", render: r => r.from},
        {header: "Чиглэл", render: r => r.directed ? "→" : "↔ Тодорхойгүй"},
        {header: "Харилцагч", render: r => r.to},
        {header: "Дүн", align: "right", render: r => formatMoney(r.amount)},
      ]} />
    {([['Дундын харилцаа', analysis.shared, ['Дундын харилцагч', 'Холбогдох хүмүүс', 'Дамжлага', 'Баримт']],
      ['Улаанаар тэмдэглэсэн этгээдийн харилцаа', analysis.red, ['Этгээд', 'Харилцагч', 'Харилцаа']]] as const)
      .map(([title, section, headers]) => <div key={title}>
        <h3>{title} ({section.rows.length})</h3>
        <DataTable rows={section.rows} rowKey={(_, i) => i}
          scroll={{overflow: "auto", maxHeight: 320}}
          columns={headers.map((header, i) => ({header, render: (row: string[]) => row[i]}))} />
        {section.image && <img className="report-analysis-image" alt={`${title} · тайлангийн зураглал`}
          src={`data:image/png;base64,${section.image.imageBase64}`}
          width={section.image.width} height={section.image.height}
          style={{display: "block", width: "100%", height: "auto", marginTop: 12}} />}
      </div>)}
  </div>;
}
