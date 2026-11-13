import {DataTable} from "./kit";
import type {ReportGraphAnalysis} from "../lib/reportGraphAnalysis";

export default function ReportGraphAnalysisPreview({analysis}: {analysis: ReportGraphAnalysis}) {
  return <div className="report-analysis-preview">
    {([['Дундын харилцаа · Дүнгээр топ 20', analysis.shared, ['Дундын харилцагч', 'Холбогдох хүмүүс', 'Дамжлага', 'Баримт']],
      ['Улаанаар тэмдэглэсэн этгээдийн харилцаа', analysis.red, ['Этгээд', 'Харилцагч', 'Харилцаа']]] as const)
      .map(([title, section, headers]) => <div key={title}>
        <h3>{title} ({section.rows.length})</h3>
        {section.image && <img className="report-analysis-image" alt={`${title} · тайлангийн зураглал`}
          src={`data:image/png;base64,${section.image.imageBase64}`}
          width={section.image.width} height={section.image.height}
          style={{display: "block", width: "100%", height: "auto", marginTop: 12}} />}
        <DataTable rows={section.rows} rowKey={(_, i) => i}
          scroll={{overflow: "auto", maxHeight: 320}}
          columns={headers.map((header, i) => ({header, render: (row: string[]) => row[i]}))} />
      </div>)}
  </div>;
}
