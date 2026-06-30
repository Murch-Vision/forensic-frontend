/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : MapPage.tsx
 * Created at  : 2026-06-23
 * Updated at  : 2026-06-24
 * Author      : jeefo
 * Purpose     :
 * Description :
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/
import {useState} from "react";
import {useQuery} from "@apollo/client";
import {CircleMarker, MapContainer, TileLayer, Tooltip} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import {LOCATION_DENSITY, MAP_QUERY} from "../graphql/queries";
import {Card, DataTable, Loading, PageHeader, StatCard} from "../components/kit";
import {riskClass} from "../lib/format";

interface MapData {
  suspectLocations: {
    suspectId: number;
    fullName: string;
    displayName: string;
    lat: number;
    lng: number;
    resolvedFrom: string;
  }[];
  suspects: {
    id: number;
    fullName: string;
    riskLevel: string;
    city: string | null;
    country: string | null;
  }[];
}

interface Density {
  lat: number;
  lng: number;
  count: number;
  displayName: string;
}

const RISK_COLOR: Record<string, string> = {
  CRITICAL: "#FF0040",
  HIGH: "#FF1744",
  MEDIUM: "#FFAB00",
  LOW: "#00E676",
  UNKNOWN: "#90A4AE",
};

type Mode = "markers" | "heatmap" | "both";

export default function MapPage() {
  const {data, loading} = useQuery<MapData>(MAP_QUERY);
  const [mode, setMode] = useState<Mode>("markers");
  const [windowDays, setWindowDays] = useState(0);
  const densityQ = useQuery<{locationDensity: Density[]}>(LOCATION_DENSITY, {
    variables: {windowDays: windowDays || null},
  });

  if (loading || !data) {
    return (
      <div className="page-container">
        <PageHeader icon="🗺" title="Газрын зураг" subtitle="БАЙРШЛЫН ШИНЖИЛГЭЭ" />
        <Loading />
      </div>
    );
  }

  const riskById = new Map(data.suspects.map((s) => [s.id, s.riskLevel]));
  const density = densityQ.data?.locationDensity ?? [];
  const maxCount = Math.max(1, ...density.map((d) => d.count));
  const topBucket = density[0];
  const riskCounts: Record<string, number> = {};
  for (const s of data.suspects) {
    riskCounts[s.riskLevel] = (riskCounts[s.riskLevel] ?? 0) + 1;
  }

  const modeBtn = (m: Mode, label: string) => (
    <button className={mode === m ? "btn btn-primary" : "btn"}
      onClick={() => setMode(m)} style={{marginRight: 4}}>{label}</button>
  );

  return (
    <div className="page-container">
      <PageHeader icon="🗺" title="Газрын зураг"
        subtitle="БАЙРШЛЫН ШИНЖИЛГЭЭ (Leaflet · OpenStreetMap)"
        actions={
          <>
            {modeBtn("markers", "Цэгүүд")}
            {modeBtn("heatmap", "Дулааны")}
            {modeBtn("both", "Хоёул")}
            <select className="form-input" value={windowDays}
              onChange={(e) => setWindowDays(Number(e.target.value))}
              style={{marginLeft: 8, maxWidth: 140}}>
              <option value={0}>Бүх хугацаа</option>
              <option value={30}>Сүүлийн 30 хоног</option>
              <option value={90}>Сүүлийн 90 хоног</option>
              <option value={365}>Сүүлийн жил</option>
            </select>
          </>
        } />

      <Card title="Газрын зураг" noPadding style={{marginBottom: 16}}>
        <MapContainer center={[47.92, 104.5]} zoom={5}
          style={{height: 460, width: "100%", background: "#0A0A1F"}}>
          <TileLayer attribution="&copy; OpenStreetMap"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {(mode === "heatmap" || mode === "both") && density.map((d, i) => (
            <CircleMarker key={`d${i}`} center={[d.lat, d.lng]}
              radius={8 + (d.count / maxCount) * 28}
              pathOptions={{color: "#FF6D00", fillColor: "#FF1744",
                fillOpacity: 0.35, weight: 0}}>
              <Tooltip>{d.displayName}: {d.count} гүйлгээ</Tooltip>
            </CircleMarker>
          ))}
          {(mode === "markers" || mode === "both") && data.suspectLocations.map((loc) => {
            const risk = riskById.get(loc.suspectId) ?? "UNKNOWN";
            const color = RISK_COLOR[risk] ?? "#90A4AE";
            return (
              <CircleMarker key={loc.suspectId} center={[loc.lat, loc.lng]}
                radius={9} pathOptions={{color, fillColor: color,
                  fillOpacity: 0.75}}>
                <Tooltip>{loc.fullName} — {loc.displayName} ({risk})</Tooltip>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </Card>

      <div className="metrics-grid">
        <StatCard label="Байршил" value={data.suspectLocations.length} color="cyan" />
        <StatCard label="Дулааны цэг" value={density.length} color="amber" />
        <StatCard label="Идэвхтэй бүс"
          value={topBucket ? `${topBucket.displayName} (${topBucket.count})` : "—"}
          color="red" />
        <StatCard label="Өндөр эрсдэл"
          value={(riskCounts.HIGH ?? 0) + (riskCounts.CRITICAL ?? 0)} color="red" />
      </div>

      <Card title="Шийдвэрлэсэн байршил" noPadding>
        <DataTable
          rows={data.suspectLocations}
          rowKey={(l) => l.suspectId}
          empty="Байршил тогтоогдсонгүй"
          columns={[
            {header: "Сэжигтэн", render: (l) => l.fullName},
            {header: "Газар", render: (l) => l.displayName},
            {header: "Өргөрөг", align: "right", render: (l) => l.lat.toFixed(4)},
            {header: "Уртраг", align: "right", render: (l) => l.lng.toFixed(4)},
            {header: "Эрсдэл", render: (l) => (
              <span className={`badge ${riskClass(riskById.get(l.suspectId)
                ?? "unknown")}`}>
                {riskById.get(l.suspectId) ?? "—"}
              </span>
            )},
          ]}
        />
      </Card>
    </div>
  );
}
