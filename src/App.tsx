import { useMemo, useRef, useState } from 'react';
import { sampleNetwork } from './sampleData';
import { parseNetworkJson } from './validation';
import type { JourneyResult, Network } from './types';
import { planJourney } from './planner';
import { durationText, formatMinute } from './time';

function buildInitialNetwork(): Network {
  const result = parseNetworkJson(JSON.stringify(sampleNetwork));
  if (!result.ok) throw new Error(result.errors.join('; '));
  return result.network;
}

const emptyResult: JourneyResult | null = null;

export default function App() {
  const [network, setNetwork] = useState<Network>(buildInitialNetwork);
  const [origin, setOrigin] = useState('A');
  const [destination, setDestination] = useState('E');
  const [departureInput, setDepartureInput] = useState('08:00');
  const [maxTransfers, setMaxTransfers] = useState(2);
  const [result, setResult] = useState<JourneyResult | null>(emptyResult);
  const [searched, setSearched] = useState(false);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importText, setImportText] = useState(JSON.stringify(sampleNetwork, null, 2));
  const fileRef = useRef<HTMLInputElement>(null);

  const stopMap = useMemo(() => new Map(network.stops.map((s) => [s.id, s])), [network]);
  const usedStopIds = useMemo(() => {
    if (!result?.feasible) return new Set<string>();
    const ids = new Set<string>([result.origin, result.destination]);
    result.segments.forEach((seg) => {
      ids.add(seg.boardStopId);
      ids.add(seg.alightStopId);
    });
    return ids;
  }, [result]);

  const parseTimeInput = (value: string): number | null => {
    const match = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(value);
    if (!match) return null;
    const h = Number(match[1]);
    const m = Number(match[2]);
    if (h > 47 || m > 59) return null;
    return h * 60 + m;
  };

  const departureMinute = parseTimeInput(departureInput);

  const handleSearch = () => {
    if (departureMinute === null) return;
    const journey = planJourney(network, origin, destination, departureMinute, maxTransfers);
    setResult(journey);
    setSearched(true);
  };

  const applyNetwork = (next: Network) => {
    setNetwork(next);
    setImportErrors([]);
    setResult(null);
    setSearched(false);
    const ids = next.stops.map((s) => s.id);
    if (!ids.includes(origin)) setOrigin(ids[0] ?? '');
    if (!ids.includes(destination)) setDestination(ids[ids.length - 1] ?? '');
  };

  const handleImportText = () => {
    const parsed = parseNetworkJson(importText);
    if (!parsed.ok) {
      setImportErrors(parsed.errors);
      return;
    }
    applyNetwork(parsed.network);
    setImportText(JSON.stringify(parsed.network, null, 2));
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    setImportText(text);
    const parsed = parseNetworkJson(text);
    if (!parsed.ok) {
      setImportErrors(parsed.errors);
    } else {
      applyNetwork(parsed.network);
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const loadSample = () => {
    const parsed = parseNetworkJson(JSON.stringify(sampleNetwork));
    if (!parsed.ok) throw new Error('sample invalid');
    setImportText(JSON.stringify(sampleNetwork, null, 2));
    applyNetwork(parsed.network);
    setOrigin('A');
    setDestination('E');
    setDepartureInput('08:00');
    setMaxTransfers(2);
  };

  const stopName = (id: string) => stopMap.get(id)?.name ?? id;
  const totalDuration = result?.feasible && result.arrivalTime !== null ? result.arrivalTime - result.departureTime : null;

  return (
    <main className="app">
      <h1>离线公交换乘规划器</h1>
      <p className="hint">所有计算均在浏览器本地完成，不接入地图或在线交通服务。时刻按运营日零点起的分钟计，支持跨午夜（超过 24:00 显示次日标识）。</p>

      <section className="card">
        <h2>查询条件</h2>
        <div className="form-row">
          <label>
            起点
            <select value={origin} onChange={(e) => { setOrigin(e.target.value); setSearched(false); setResult(null); }}>
              {network.stops.map((s) => <option key={s.id} value={s.id}>{s.name}（{s.id}）</option>)}
            </select>
          </label>
          <label>
            终点
            <select value={destination} onChange={(e) => { setDestination(e.target.value); setSearched(false); setResult(null); }}>
              {network.stops.map((s) => <option key={s.id} value={s.id}>{s.name}（{s.id}）</option>)}
            </select>
          </label>
          <label>
            出发时刻
            <input
              type="text"
              value={departureInput}
              onChange={(e) => { setDepartureInput(e.target.value); setSearched(false); setResult(null); }}
              placeholder="HH:MM，如 23:30"
            />
          </label>
          <label>
            最多换乘
            <input type="number" min={0} max={10} value={maxTransfers} onChange={(e) => { setMaxTransfers(Math.max(0, Number(e.target.value) || 0)); setSearched(false); setResult(null); }} />
          </label>
          <button type="button" onClick={handleSearch} disabled={departureMinute === null || origin === ''}>
            查询最早到达
          </button>
          {departureMinute === null && <span className="error-text">时刻格式应为 HH:MM（小时可达 47，以表示次日）</span>}
        </div>
      </section>

      <section className="card">
        <h2>行程结果</h2>
        {!searched && <p className="muted">请设置查询条件后点击“查询最早到达”。</p>}
        {searched && result && !result.feasible && (
          <p className="error-text">在允许 {maxTransfers} 次换乘、出发时刻 {formatMinute(departureMinute ?? 0)} 之后，没有可以从 {stopName(result.origin)} 到达 {stopName(result.destination)} 的可行班次。</p>
        )}
        {searched && result?.feasible && (
          <div>
            {result.segments.length === 0 ? (
              <p>起点与终点相同，零乘车行程，到达时刻 {formatMinute(result.departureTime)}。</p>
            ) : (
              <>
                <ol className="segments">
                  {result.segments.map((seg, i) => (
                    <li key={i} className="segment">
                      <div><strong>{seg.routeName}</strong> <span className="muted">班次 {seg.tripId}</span></div>
                      <div>上车：{stopName(seg.boardStopId)}（{seg.boardStopId}），发车 {formatMinute(seg.boardDepart)}</div>
                      <div>下车：{stopName(seg.alightStopId)}（{seg.alightStopId}），到达 {formatMinute(seg.alightArrive)}</div>
                      {i === 0 && <div className="wait">候车等待：{durationText(result.initialWait ?? 0)}</div>}
                      {i > 0 && <div className="wait">换乘等待：{durationText(result.transferWaits[i - 1]?.wait ?? 0)}（本站最短换乘 {stopMap.get(seg.boardStopId)?.minTransferMinutes ?? 0} 分钟）</div>}
                    </li>
                  ))}
                </ol>
                <dl className="summary">
                  <div><dt>到达时刻</dt><dd>{formatMinute(result.arrivalTime!)}</dd></div>
                  <div><dt>总耗时</dt><dd>{durationText(totalDuration ?? 0)}</dd></div>
                  <div><dt>换乘次数</dt><dd>{result.transfers}</dd></div>
                </dl>
              </>
            )}
          </div>
        )}
      </section>

      <section className="card">
        <h2>站点与班次示意图</h2>
        <div className="network-diagram">
          {network.trips.map((trip) => (
            <div key={trip.id} className="trip-row">
              <div className="trip-label"><strong>{trip.routeName}</strong><span className="muted"> {trip.id}</span></div>
              <div className="trip-stops">
                {trip.stops.map((ts, j) => (
                  <div key={j} className={`stop-node ${usedStopIds.has(ts.stopId) ? 'used' : ''}`}>
                    <span className="dot" />
                    <span className="stop-text">{stopName(ts.stopId)}<br /><small>{formatMinute(ts.arrive)} / {formatMinute(ts.depart)}</small></span>
                    {j < trip.stops.length - 1 && <span className="line" />}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>路网数据</h2>
        <div className="form-row">
          <button type="button" onClick={loadSample}>载入示例</button>
          <button type="button" onClick={handleImportText}>导入编辑区 JSON</button>
          <button type="button" onClick={() => fileRef.current?.click()}>从文件导入 JSON</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => handleFile(e.target.files?.[0])} />
          <span className="muted">当前 {network.stops.length} 个站点，{network.trips.length} 个班次。导入失败会保留原有路网并列出错误位置。</span>
        </div>
        <textarea
          className="json-editor"
          rows={18}
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          spellCheck={false}
        />
        {importErrors.length > 0 && (
          <div className="error-box">
            <strong>导入失败，原路网未改动：</strong>
            <ul>{importErrors.map((err, i) => <li key={i}>{err}</li>)}</ul>
          </div>
        )}
      </section>
    </main>
  );
}
