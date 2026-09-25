import { useMemo, useRef, useState } from 'react';
import { passSaverFareSample, sampleNetwork, singleSaverFareSample } from './sampleData';
import { parseNetworkJson } from './validation';
import type { JourneyResult, Network } from './types';
import { planJourney } from './planner';
import { durationText, formatMinute } from './time';
import type { FareQuote, FareScheme } from './fares';
import { computeFareQuote, formatFen, missingSingleFares, parseFareSchemeJson } from './fares';

function buildInitialNetwork(): Network {
  const result = parseNetworkJson(JSON.stringify(sampleNetwork));
  if (!result.ok) throw new Error(result.errors.join('; '));
  return result.network;
}

function buildInitialFareScheme(network: Network): FareScheme {
  const result = parseFareSchemeJson(JSON.stringify(passSaverFareSample), network);
  if (!result.ok) throw new Error(result.errors.join('; '));
  return result.scheme;
}

interface FareDisplay {
  quote: FareQuote | null;
  missing: string[];
}

const emptyResult: JourneyResult | null = null;

export default function App() {
  const [network, setNetwork] = useState<Network>(buildInitialNetwork);
  const [fareScheme, setFareScheme] = useState<FareScheme>(() => buildInitialFareScheme(buildInitialNetwork()));
  const [origin, setOrigin] = useState('A');
  const [destination, setDestination] = useState('E');
  const [departureInput, setDepartureInput] = useState('08:00');
  const [maxTransfers, setMaxTransfers] = useState(2);
  const [result, setResult] = useState<JourneyResult | null>(emptyResult);
  const [fareDisplay, setFareDisplay] = useState<FareDisplay | null>(null);
  const [searched, setSearched] = useState(false);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importText, setImportText] = useState(JSON.stringify(sampleNetwork, null, 2));
  const [fareErrors, setFareErrors] = useState<string[]>([]);
  const [fareText, setFareText] = useState(JSON.stringify(passSaverFareSample, null, 2));
  const fileRef = useRef<HTMLInputElement>(null);
  const fareFileRef = useRef<HTMLInputElement>(null);

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
    if (!journey.feasible) {
      setFareDisplay(null);
      return;
    }
    const missing = missingSingleFares(journey.segments, fareScheme);
    if (missing.length > 0) {
      setFareDisplay({ quote: null, missing });
    } else {
      setFareDisplay({ quote: computeFareQuote(journey.segments, fareScheme), missing: [] });
    }
  };

  const invalidate = () => {
    setSearched(false);
    setResult(null);
    setFareDisplay(null);
  };

  const applyNetwork = (next: Network) => {
    setNetwork(next);
    setImportErrors([]);
    invalidate();
    const ids = next.stops.map((s) => s.id);
    if (!ids.includes(origin)) setOrigin(ids[0] ?? '');
    if (!ids.includes(destination)) setDestination(ids[ids.length - 1] ?? '');
  };

  const applyFareScheme = (next: FareScheme) => {
    setFareScheme(next);
    setFareErrors([]);
    invalidate();
  };

  const handleFareImportText = () => {
    const parsed = parseFareSchemeJson(fareText, network);
    if (!parsed.ok) {
      setFareErrors(parsed.errors);
      return;
    }
    applyFareScheme(parsed.scheme);
    setFareText(JSON.stringify(parsed.scheme, null, 2));
  };

  const handleFareFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    setFareText(text);
    const parsed = parseFareSchemeJson(text, network);
    if (!parsed.ok) {
      setFareErrors(parsed.errors);
    } else {
      applyFareScheme(parsed.scheme);
    }
    if (fareFileRef.current) fareFileRef.current.value = '';
  };

  const handleFareExport = () => {
    const blob = new Blob([JSON.stringify(fareScheme, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'fare-scheme.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const loadFareSample = (sample: unknown) => {
    const parsed = parseFareSchemeJson(JSON.stringify(sample), network);
    if (!parsed.ok) throw new Error('fare sample invalid');
    setFareText(JSON.stringify(sample, null, 2));
    applyFareScheme(parsed.scheme);
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
            <select value={origin} onChange={(e) => { setOrigin(e.target.value); invalidate(); }}>
              {network.stops.map((s) => <option key={s.id} value={s.id}>{s.name}（{s.id}）</option>)}
            </select>
          </label>
          <label>
            终点
            <select value={destination} onChange={(e) => { setDestination(e.target.value); invalidate(); }}>
              {network.stops.map((s) => <option key={s.id} value={s.id}>{s.name}（{s.id}）</option>)}
            </select>
          </label>
          <label>
            出发时刻
            <input
              type="text"
              value={departureInput}
              onChange={(e) => { setDepartureInput(e.target.value); invalidate(); }}
              placeholder="HH:MM，如 23:30"
            />
          </label>
          <label>
            最多换乘
            <input type="number" min={0} max={10} value={maxTransfers} onChange={(e) => { setMaxTransfers(Math.max(0, Number(e.target.value) || 0)); invalidate(); }} />
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
            <div className="fare-quote">
              <h3>最低票价报价</h3>
              {fareDisplay && fareDisplay.missing.length > 0 && (
                <p className="error-text">
                  以下班次的单次票价未配置，无法生成报价：{fareDisplay.missing.join('、')}。请在下方票价方案中补充后重新查询。
                </p>
              )}
              {fareDisplay?.quote && (
                <>
                  {fareDisplay.quote.tickets.length === 0 ? (
                    <p>零乘车行程，总价 {formatFen(0)}。</p>
                  ) : (
                    <>
                      <ol className="tickets">
                        {fareDisplay.quote.tickets.map((tk, i) => (
                          <li key={i} className="ticket">
                            <div>
                              <strong>{tk.name}</strong>
                              <span className="muted"> {tk.kind === 'pass' ? '联票 ' + tk.passId : '单次票'}，{formatFen(tk.price)}</span>
                            </div>
                            <div>购买时刻：{formatMinute(tk.purchaseTime)}{tk.kind === 'pass' && '，到期时刻：' + formatMinute(tk.expiryTime) + '（含开始不含结束）'}</div>
                            <div>覆盖乘车段：{tk.coveredSegments.map((s) => '第 ' + (s + 1) + ' 段（' + result.segments[s].tripId + '）').join('、')}</div>
                          </li>
                        ))}
                      </ol>
                      <dl className="summary">
                        <div><dt>最低总价</dt><dd>{formatFen(fareDisplay.quote.totalCost)}</dd></div>
                        <div><dt>购票张数</dt><dd>{fareDisplay.quote.ticketCount}</dd></div>
                        <div><dt>逐段单买总额</dt><dd>{formatFen(fareDisplay.quote.singleTotal)}</dd></div>
                        <div><dt>节省</dt><dd>{formatFen(fareDisplay.quote.savings)}</dd></div>
                      </dl>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="card">
        <h2>票价方案</h2>
        <div className="form-row">
          <button type="button" onClick={() => loadFareSample(passSaverFareSample)}>联票更省钱示例</button>
          <button type="button" onClick={() => loadFareSample(singleSaverFareSample)}>单次票更省钱示例</button>
          <button type="button" onClick={handleFareImportText}>导入编辑区 JSON</button>
          <button type="button" onClick={() => fareFileRef.current?.click()}>从文件导入 JSON</button>
          <button type="button" onClick={handleFareExport}>导出当前方案 JSON</button>
          <input ref={fareFileRef} type="file" accept="application/json,.json" hidden onChange={(e) => handleFareFile(e.target.files?.[0])} />
          <span className="muted">当前 {Object.keys(fareScheme.singleFares).length} 条单次票价，{fareScheme.passes.length} 种联票。编辑区内容需点击“导入编辑区 JSON”确认后才参与计算；导入失败保留当前方案。</span>
        </div>
        <textarea
          className="json-editor"
          rows={12}
          value={fareText}
          onChange={(e) => setFareText(e.target.value)}
          spellCheck={false}
        />
        {fareErrors.length > 0 && (
          <div className="error-box">
            <strong>票价方案导入失败，当前方案未改动：</strong>
            <ul>{fareErrors.map((err, i) => <li key={i}>{err}</li>)}</ul>
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
