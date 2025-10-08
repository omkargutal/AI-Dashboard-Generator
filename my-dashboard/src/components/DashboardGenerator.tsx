import React, { useState, useRef, useEffect } from "react";
import vegaEmbed from "vega-embed";

type Row = Record<string, any>;

export default function DashboardGenerator() {
  const [spec, setSpec] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const DEFAULT_INTENT = "Provide insightful charts and KPIs for the dataset.";
  const [intent, setIntent] = useState(DEFAULT_INTENT);
  const [rows, setRows] = useState<Row[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  // list of chart types user can select; see SUPPORTED_CHARTS below
  const [selectedCharts, setSelectedCharts] = useState<string[]>(['Column Chart', 'Line Chart', 'Pie Chart']);
  const [layoutCols, setLayoutCols] = useState<string>('1fr');
  const [filters, setFilters] = useState<Record<string, any>>({});
  const [kpis, setKpis] = useState<any>({});
  const hasData = rows.length > 0;

  // Supported chart types (a subset implemented with Vega-Lite)
  const SUPPORTED_CHARTS: { id: string; label: string; category: string }[] = [
    { id: 'bar', label: 'Bar Chart', category: 'Comparison' },
    { id: 'column', label: 'Column Chart', category: 'Comparison' },
    { id: 'grouped_bar', label: 'Grouped Bar/Column Chart', category: 'Comparison' },
    { id: 'stacked_bar', label: 'Stacked Bar/Column Chart', category: 'Comparison' },
    { id: 'lollipop', label: 'Lollipop Chart', category: 'Comparison' },
    { id: 'line', label: 'Line Chart', category: 'Trend' },
    { id: 'area', label: 'Area Chart', category: 'Trend' },
    { id: 'spline', label: 'Spline Chart', category: 'Trend' },
    { id: 'step', label: 'Step Chart', category: 'Trend' },
    { id: 'histogram', label: 'Histogram', category: 'Distribution' },
    { id: 'boxplot', label: 'Box Plot', category: 'Distribution' },
    { id: 'scatter', label: 'Scatter Plot', category: 'Correlation' },
    { id: 'bubble', label: 'Bubble Chart', category: 'Correlation' },
    { id: 'heatmap', label: 'Heatmap', category: 'Correlation' },
    { id: 'pie', label: 'Pie Chart', category: 'Composition' },
    { id: 'donut', label: 'Donut Chart', category: 'Composition' },
  ];
  

  // Robust CSV parser: supports quoted fields and commas inside quotes
  function parseCsv(text: string) {
    const rows: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '"') {
        // lookahead for escaped quotes
        if (inQuotes && text[i+1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === '\n' && !inQuotes) {
        rows.push(current.replace(/\r$/, ''));
        current = '';
      } else {
        current += ch;
      }
    }
    if (current.length) rows.push(current.replace(/\r$/, ''));

    const lines = rows.filter(r => r.trim().length > 0);
    if (lines.length === 0) return { cols: [], rows: [] };

    // split a CSV line into fields respecting quotes
    function splitLine(line: string) {
      const res: string[] = [];
      let cur = '';
      let inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQ && line[i+1] === '"') { cur += '"'; i++; }
          else inQ = !inQ;
        } else if (ch === ',' && !inQ) {
          res.push(cur);
          cur = '';
        } else cur += ch;
      }
      res.push(cur);
      return res.map(s => s.trim());
    }

    const cols = splitLine(lines[0]).map(c => c.trim());
    const dataRows = lines.slice(1).map(l => {
      const fields = splitLine(l);
      const obj: any = {};
      cols.forEach((c, i) => { obj[c] = fields[i] ?? ''; });
      return obj;
    });

    return { cols, rows: dataRows };
  }

  // Infer schema (numeric / categorical / temporal / text) from parsed rows
  function inferSchema(cols: string[], dataRows: Row[]) {
    const total = dataRows.length || 1;
    const numeric: string[] = [];
    const categorical: string[] = [];
    const temporal: string[] = [];
    const text: string[] = [];

    for (const col of cols) {
      const values = dataRows.map(r => r[col]).filter(v => v != null && String(v).trim() !== '');
      const uniq = Array.from(new Set(values.map(v => String(v))));
      // detect numeric: >80% parse to number
      const numCount = values.reduce((s, v) => s + (isNaN(Number(String(v).replace(/,/g, ''))) ? 0 : 1), 0);
      if (values.length > 0 && numCount / values.length > 0.8) {
        numeric.push(col);
        continue;
      }
      // detect temporal (year or date)
      const yearLike = values.filter(v => /^\d{4}$/.test(String(v))).length;
      const isoLike = values.filter(v => /^\d{4}-\d{2}-\d{2}/.test(String(v))).length;
      if (values.length > 0 && (yearLike / values.length > 0.6 || isoLike / values.length > 0.6)) {
        temporal.push(col);
        continue;
      }
      // categorical if unique small relative to total or small absolute
      if (uniq.length <= Math.max(50, total * 0.2)) {
        categorical.push(col);
      } else {
        text.push(col);
      }
    }
    return { numeric, categorical, temporal, text };
  }

  // Generate a brief context summary automatically from the dataset
  function generateContext(cols: string[], schema: any, rowsSample: Row[]) {
    const n = rowsSample.length;
    const parts = [] as string[];
    parts.push(`Dataset has ${n} rows and ${cols.length} columns.`);
    if (schema.numeric.length) parts.push(`Numeric fields: ${schema.numeric.slice(0,5).join(', ')}.`);
    if (schema.categorical.length) parts.push(`Categorical fields: ${schema.categorical.slice(0,8).join(', ')}.`);
    if (schema.temporal.length) parts.push(`Temporal fields: ${schema.temporal.join(', ')}.`);
    parts.push('Please provide concise analyses, top KPIs, and recommended charts for these fields.');
    return parts.join(' ');
  }

  async function submitFormWithFormData(form: FormData) {
    setLoading(true);
    setSpec(null);
    try {
      const res = await fetch("http://localhost:8000/generate_dashboard", { method: "POST", body: form });
      const text = await res.text();
      let json: any = null;
      try { json = text ? JSON.parse(text) : null; } catch {}
      if (!res.ok) {
        const message = json?.detail ?? json?.error ?? text ?? `Request failed with status ${res.status}`;
        alert(`Server error: ${message}`);
        console.error("Server error response:", res.status, text);
        return;
      }
      if (!json || !json.dashboard) {
        alert("Unexpected response from server (no dashboard).");
        console.error("Unexpected server response:", text);
        return;
      }
      setSpec(json.dashboard);
    } catch (err: any) {
      console.error(err);
      alert(`Request failed: ${err?.message ?? String(err)}`);
    } finally { setLoading(false); }
  }

  async function onUploadAndGenerate(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const input = fileRef.current;
    if (!input) return;
    // If a file isn't selected yet, trigger click and wait for selection
    if (!input.files?.length) {
      input.click();
      // wait for user selection
      const handler = async () => {
        input.removeEventListener('change', handler);
        if (!input.files?.length) return;
        const file = input.files[0];
        const form = new FormData();
        form.append('file', file);
        form.append('intent', intent);
        const text = await file.text();
  const parsed = parseCsv(text);
  setColumns(parsed.cols);
  setRows(parsed.rows);
  const schema = inferSchema(parsed.cols, parsed.rows);
  // if user didn't provide context, set an auto-generated one
  if (!intent || intent === DEFAULT_INTENT) {
    setIntent(generateContext(parsed.cols, schema, parsed.rows.slice(0,5)));
  }
  // always generate locally so uploads immediately show visuals
  generateLocalDashboard(parsed.cols, parsed.rows, undefined, schema);
        // still attempt server-side generation in background
        submitFormWithFormData(form).catch(() => {});
      };
      input.addEventListener('change', handler);
      return;
    }

    const file = input.files[0];
    const form = new FormData();
    form.append("file", file);
    form.append("intent", intent);
    // parse locally for table view
    const text = await file.text();
  const parsed = parseCsv(text);
  setColumns(parsed.cols);
  setRows(parsed.rows);
  const schema = inferSchema(parsed.cols, parsed.rows);
  if (!intent || intent === DEFAULT_INTENT) {
    setIntent(generateContext(parsed.cols, schema, parsed.rows.slice(0,5)));
  }
  // generate locally immediately
  generateLocalDashboard(parsed.cols, parsed.rows, undefined, schema);
  // and attempt backend generation as well (non-blocking)
  submitFormWithFormData(form).catch(() => {});
  }

  function clearAll() {
    setRows([]);
    setColumns([]);
    setSpec(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function tryRandomData() {
    // Load the sample CSV from the repository's sample-data folder
    try {
      const res = await fetch("/sample-data/sample.csv");
      if (!res.ok) throw new Error(`Failed to load sample.csv: ${res.status}`);
      const text = await res.text();
      const parsed = parseCsv(text);
      setColumns(parsed.cols);
      setRows(parsed.rows);
      // reset filters
      const inferredFilters: Record<string, any> = {};
      // initialize category filter if present
      if (parsed.cols.includes('Category')) {
        const cats = Array.from(new Set(parsed.rows.map(r => r['Category']))).filter(Boolean);
        inferredFilters['Category'] = new Set(cats); // use Set for selection
      }
    setFilters(inferredFilters);
    // infer schema and generate dashboard
    const schema = inferSchema(parsed.cols, parsed.rows);
    if (!intent || intent === DEFAULT_INTENT) {
      setIntent(generateContext(parsed.cols, schema, parsed.rows.slice(0,5)));
    }
    // generate with schema so visuals adapt
    generateLocalDashboard(parsed.cols, parsed.rows, inferredFilters, schema);
    } catch (err: any) {
      alert(`Could not load sample data: ${err?.message ?? String(err)}`);
    }
  }

  // Generate a simple dashboard locally (no backend) using vega-lite specs
  function generateLocalDashboard(cols: string[], dataRows: Row[], activeFilters?: Record<string, any>, schema?: any, chartsToInclude?: string[]) {
    if (!cols.length || !dataRows.length) {
      alert('No data to generate dashboard');
      return;
    }

    // Normalize numeric fields
    const values = dataRows.map(r => {
      const out: any = {};
      cols.forEach(c => {
        const v = r[c];
        // remove commas in numbers
        if (typeof v === 'string' && v.match(/^[0-9,]+$/)) {
          out[c] = Number(String(v).replace(/,/g, ''));
        } else if (typeof v === 'string' && v.match(/^\d{4}$/)) {
          out[c] = Number(v);
        } else {
          out[c] = v;
        }
      });
      return out;
    });

    // apply filters if provided
    const filteredValues = (activeFilters && Object.keys(activeFilters).length)
      ? values.filter(v => {
        for (const key of Object.keys(activeFilters)) {
          const sel = activeFilters[key];
          if (sel == null) continue;
          // For Set (categorical multi-select)
          if (sel instanceof Set) {
            if (!sel.has(v[key])) return false;
          } else if (typeof sel === 'object' && sel.min != null && sel.max != null) {
            const val = Number(v[key]);
            if (isNaN(val) || val < sel.min || val > sel.max) return false;
          } else if (typeof sel === 'string' && sel.length > 0) {
            // substring match
            if (!String(v[key]).toLowerCase().includes(sel.toLowerCase())) return false;
          }
        }
        return true;
        })
        : values;

      // Build generic visuals based on schema inference
  const views = [] as any[];
  const fields = schema || inferSchema(cols, dataRows);
  const chosen = (chartsToInclude && chartsToInclude.length) ? chartsToInclude : selectedCharts;

      // compute KPIs from filteredValues using inferred schema
      computeKpis(filteredValues, fields);

    // Helper to push a view safely
    function pushView(v: any) { views.push(v); }

    // Build views according to chosen chart types (map semantic labels to implemented chart builds)
    const addBarLike = () => {
      if (!(fields.categorical.length && fields.numeric.length)) return;
      const cat = fields.categorical[0];
      const num = fields.numeric[0];
      pushView({ id: 'cat_vs_num', title: `${num} by ${cat}`, vega_lite: {
        $schema: 'https://vega.github.io/schema/vega-lite/v5.json', data: { values: filteredValues }, transform: [{ aggregate: [{ op: 'sum', field: num, as: num }], groupby: [cat] }], mark: { type: 'bar' }, encoding: { x: { field: cat, type: 'nominal', sort: '-y', axis: { labelAngle: -30, labelColor: '#9fb6da' } }, y: { field: num, type: 'quantitative', axis: { labelColor: '#9fb6da' } }, color: { value: '#7c3aed' }, tooltip: [{ field: cat }, { field: num, type: 'quantitative', format: ',' }] }, config: { view: { stroke: 'transparent' }, axis: { grid: true, gridColor: '#162033' } } } });
    };

    const addColumn = () => { addBarLike(); };

    const addLine = () => {
      if (!(fields.temporal.length && fields.numeric.length)) return;
      const t = fields.temporal[0];
      const num = fields.numeric[0];
      pushView({ id: 'time_series', title: `${num} by ${t}`, vega_lite: { $schema: 'https://vega.github.io/schema/vega-lite/v5.json', data: { values: filteredValues }, transform: [{ aggregate: [{ op: 'sum', field: num, as: num }], groupby: [t] }], mark: { type: 'line', point: true, interpolate: 'monotone' }, encoding: { x: { field: t, type: 'ordinal', axis: { labelColor: '#9fb6da' } }, y: { field: num, type: 'quantitative', axis: { labelColor: '#9fb6da' } }, color: { value: '#c084fc' }, tooltip: [{ field: t }, { field: num, type: 'quantitative', format: ',' }] }, config: { view: { stroke: 'transparent' }, axis: { grid: true } } } });
    };

    const addPie = () => {
      if (!fields.numeric.length) return;
      const num = fields.numeric[0];
      pushView({ id: 'numeric_pie', title: `Breakdown of ${num}`, vega_lite: { $schema: 'https://vega.github.io/schema/vega-lite/v5.json', data: { values: filteredValues }, transform: [{ aggregate: [{ op: 'sum', field: num, as: num }], groupby: [fields.categorical[0] || num] }], mark: { type: 'arc', innerRadius: 50 }, encoding: { theta: { field: num, type: 'quantitative' }, color: { field: fields.categorical[0] || num, type: 'nominal', scale: { range: ['#7c3aed','#9b5cf6','#f472b6','#60a5fa','#f59e0b','#34d399'] } }, tooltip: [{ field: fields.categorical[0] || num }, { field: num, type: 'quantitative', format: ',' }] } } });
    };

    const addTreemap = () => {
      // Vega-Lite doesn't have native treemap; approximate with stacked bar of categories
      if (!fields.categorical.length || !fields.numeric.length) return;
      const cat = fields.categorical[0];
      const num = fields.numeric[0];
      pushView({ id: 'treemap_approx', title: `Treemap (approx) of ${num} by ${cat}`, vega_lite: { $schema: 'https://vega.github.io/schema/vega-lite/v5.json', data: { values: filteredValues }, transform: [{ aggregate: [{ op: 'sum', field: num, as: num }], groupby: [cat] }], mark: { type: 'bar' }, encoding: { x: { field: num, type: 'quantitative', axis: { labelColor: '#9fb6da' } }, y: { field: cat, type: 'nominal', axis: { labelColor: '#9fb6da' } }, color: { field: cat } }, config: { view: { stroke: 'transparent' } } } });
    };

    // If user explicitly selected chart types, add those in order; otherwise fall back to heuristic
    if (chosen && chosen.length) {
      for (const ch of chosen) {
        const key = ch.toLowerCase();
        if (key.includes('bar') && !key.includes('group')) addBarLike();
        else if (key.includes('column')) addColumn();
        else if (key.includes('line')) addLine();
        else if (key.includes('pie') || key.includes('donut')) addPie();
        else if (key.includes('treemap')) addTreemap();
        // future: support more chart types (histogram, scatter, etc.)
      }
    }

    // If still no views (unsupported selection or missing fields), use legacy fallbacks
    if (views.length === 0) {
      // original heuristics
      if (fields.categorical.length && fields.numeric.length) {
        const cat = fields.categorical[0];
        const num = fields.numeric[0];
        pushView({ id: 'cat_vs_num', title: `${num} by ${cat}`, vega_lite: { $schema: 'https://vega.github.io/schema/vega-lite/v5.json', data: { values: filteredValues }, transform: [{ aggregate: [{ op: 'sum', field: num, as: num }], groupby: [cat] }], mark: { type: 'bar' }, encoding: { x: { field: cat, type: 'nominal', sort: '-y', axis: { labelAngle: -30, labelColor: '#9fb6da' } }, y: { field: num, type: 'quantitative', axis: { labelColor: '#9fb6da' } }, color: { value: '#7c3aed' }, tooltip: [{ field: cat }, { field: num, type: 'quantitative', format: ',' }] }, config: { view: { stroke: 'transparent' }, axis: { grid: true, gridColor: '#162033' } } } });
      }
      if (fields.temporal.length && fields.numeric.length) addLine();
      if (fields.numeric.length) addPie();
    }

    // Numeric trends (temporal) if temporal + numeric
    // Only add if a time_series view hasn't already been created (avoid duplicates)
    if (fields.temporal.length && fields.numeric.length && !views.some((vv: any) => vv.id === 'time_series')) {
      const t = fields.temporal[0];
      const num = fields.numeric[0];
      views.push({
        id: 'time_series',
        title: `${num} by ${t}`,
        vega_lite: {
          $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
          data: { values: filteredValues },
          transform: [{ aggregate: [{ op: 'sum', field: num, as: num }], groupby: [t] }],
          mark: { type: 'line', point: true, interpolate: 'monotone' },
          encoding: {
            x: { field: t, type: 'ordinal', axis: { labelColor: '#9fb6da' } },
            y: { field: num, type: 'quantitative', axis: { labelColor: '#9fb6da' } },
            color: { value: '#c084fc' },
            tooltip: [{ field: t }, { field: num, type: 'quantitative', format: ',' }]
          },
          config: { view: { stroke: 'transparent' }, axis: { grid: true } }
        }
      });
    }

    // If multiple numeric fields, show top numeric breakdown (pie/donut of sums)
    // Only add if a numeric_pie view hasn't already been created (avoid duplicates)
    if (fields.numeric.length && !views.some((vv: any) => vv.id === 'numeric_pie')) {
      const num = fields.numeric[0];
      views.push({
        id: 'numeric_pie',
        title: `Breakdown of ${num}`,
        vega_lite: {
          $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
          data: { values: filteredValues },
          transform: [{ aggregate: [{ op: 'sum', field: num, as: num }], groupby: [fields.categorical[0] || num] }],
          mark: { type: 'arc', innerRadius: 50 },
          encoding: {
            theta: { field: num, type: 'quantitative' },
            color: { field: fields.categorical[0] || num, type: 'nominal', scale: { range: ['#7c3aed','#9b5cf6','#f472b6','#60a5fa','#f59e0b','#34d399'] } },
            tooltip: [{ field: fields.categorical[0] || num }, { field: num, type: 'quantitative', format: ',' }]
          }
        }
      });
    }

    const dashboard = {
      title: 'Dashboard',
      description: 'Auto-generated dashboard (local)',
      layout: { columns: 2 },
      views
    };

    // default sizes for views (small, medium, large)
    dashboard.views = dashboard.views.map((v: any, idx: number) => ({ ...v, size: v.size || (idx === 0 ? 'small' : 'medium') }));

    setSpec(dashboard);
  }

  // compute KPI values from filtered data dynamically using schema
  function computeKpis(values: any[], schema: any) {
    const primary = (schema && schema.numeric && schema.numeric[0]) || null;
    const secondary = (schema && schema.numeric && schema.numeric[1]) || null;
    const category = (schema && schema.categorical && schema.categorical[0]) || null;

    const toNumber = (v: any) => {
      if (v == null || v === '') return 0;
      const n = Number(String(v).replace(/,/g, ''));
      return isNaN(n) ? 0 : n;
    };

    const primaryTotal = primary ? values.reduce((s, r) => s + toNumber(r[primary]), 0) : null;
    const secondaryTotal = secondary ? values.reduce((s, r) => s + toNumber(r[secondary]), 0) : null;
    const avgPrimary = primary && values.length ? Math.round(primaryTotal / values.length) : null;

    // top item by primary numeric
    let topLabel: string | null = null;
    let topValue: any = null;
    if (primary) {
      let best: any = null;
      for (const r of values) {
        const v = toNumber(r[primary]);
        if (!best || v > toNumber(best[primary])) best = r;
      }
      if (best) {
        topLabel = category ? best[category] : (best[Object.keys(best)[0]] ?? null);
        topValue = best[primary];
      }
    }

    setKpis({
      primaryLabel: primary || 'Value',
      primaryTotal,
      secondaryLabel: secondary || null,
      secondaryTotal,
      avgPrimary,
      topLabel,
      topValue,
      rowCount: values.length
    });
  }

  useEffect(() => {
    if (!spec) return;
    const root = document.getElementById("viz-root");
    if (!root) return;
    root.innerHTML = "";
    const views = spec.views ?? [];
  const container = document.createElement("div");
  container.style.display = "grid";
  // auto-fit to avoid empty space; each column minimum 320px
  container.style.gridTemplateColumns = `repeat(auto-fit, minmax(320px, 1fr))`;
  container.style.gap = "12px";
    root.appendChild(container);

    views.forEach((v: any, i: number) => {
      const card = document.createElement("div");
      card.id = `view-card-${i}`;
  card.style.minHeight = "220px";
  card.style.borderRadius = "8px";
  card.style.padding = "10px";
  card.style.background = "linear-gradient(180deg, rgba(11,18,32,0.9), rgba(8,12,22,0.85))";
  card.style.border = "none";
      card.style.boxShadow = "0 6px 14px rgba(2,6,23,0.6)";
      card.style.display = 'flex';
      card.style.flexDirection = 'column';

      const header = document.createElement('div');
      header.style.display = 'flex';
      header.style.justifyContent = 'space-between';
      header.style.alignItems = 'center';
      header.style.marginBottom = '8px';

      const title = document.createElement('div');
      title.textContent = v.title ?? v.id ?? '';
      title.style.fontSize = '16px';
      title.style.color = '#cbd9ee';
      title.style.fontWeight = '600';

      const sizeSelect = document.createElement('select');
      ['small','medium','large'].forEach(s => {
        const opt = document.createElement('option');
        opt.value = s; opt.text = s[0].toUpperCase() + s.slice(1);
        if ((v.size || 'medium') === s) opt.selected = true;
        sizeSelect.appendChild(opt);
      });
      sizeSelect.onchange = (ev) => {
        const newSize = (ev.target as HTMLSelectElement).value;
        // update spec size and re-render
        const newSpec = JSON.parse(JSON.stringify(spec));
        if (newSpec.views && newSpec.views[i]) newSpec.views[i].size = newSize;
        setSpec(newSpec);
        // small delay to allow React state update then re-render
        setTimeout(() => setSpec(newSpec), 10);
      };

      const right = document.createElement('div');
      right.appendChild(sizeSelect);

      header.appendChild(title);
      header.appendChild(right);
      card.appendChild(header);

      const slot = document.createElement("div");
      slot.id = `view-${i}`;
      slot.style.flex = '1 1 auto';
      slot.style.minHeight = '180px';
      card.appendChild(slot);

  // determine grid span
  const size = v.size || 'medium';
  if (size === 'large') card.style.gridColumn = 'span 2';
  else card.style.gridColumn = 'span 1';
  container.appendChild(card);

      // augment vega-lite spec with dark theme and palette defaults
      const specCopy = JSON.parse(JSON.stringify(v.vega_lite || {}));
      specCopy.config = Object.assign({}, specCopy.config || {}, {
        background: '#0f1724',
        view: { stroke: 'transparent' },
        axis: {
          grid: true,
          gridColor: '#162033',
          domainColor: '#314155',
          tickColor: '#314155',
          labelColor: '#9fb6da',
          titleColor: '#9fb6da'
        },
        legend: { labelColor: '#c9d9ee', titleColor: '#c9d9ee' },
        title: { color: '#cbd9ee' }
      });

      // default mark color if not set
      if (specCopy.mark && typeof specCopy.mark === 'object') {
        specCopy.mark = Object.assign({ color: '#7c3aed' }, specCopy.mark);
      } else if (specCopy.mark && typeof specCopy.mark === 'string') {
        specCopy.mark = { type: specCopy.mark, color: '#7c3aed' };
      } else {
        // no mark specified: leave as-is
      }

      // ensure legend is bottom for pie charts
      if (specCopy.mark && specCopy.mark.type === 'arc') {
        specCopy.encoding = Object.assign({}, specCopy.encoding || {}, {
          color: specCopy.encoding?.color || { field: 'Category', type: 'nominal', legend: { orient: 'bottom', labelLimit: 200 } }
        });
      }

      vegaEmbed(`#${slot.id}`, specCopy, { actions: true, renderer: 'canvas' }).catch(console.error);
    });
  }, [spec]);

  // Responsive grid: 1 column unless data is loaded AND width is wide
  useEffect(() => {
    function onResize() {
      if (window.innerWidth < 800 || rows.length === 0) setLayoutCols('1fr');
      else setLayoutCols('320px 1fr');
    }
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [rows.length]);

  return (
  <div style={{display: 'grid', gridTemplateColumns: layoutCols, gap: 12, alignItems: 'start', height: 'calc(100vh - 80px)'}}>
      {/* Left column: Controls + Data Table */}
  <div style={{border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: 12, height: '100%', overflow: 'auto', background: '#0b1220'}}>
        <div style={{display: 'flex', gap: 8, marginBottom: 8}}>
          <button onClick={(e) => onUploadAndGenerate(e)} style={{background:'#2563eb', color:'#fff', padding:'6px 10px', borderRadius:6, cursor:'pointer', fontSize:13}}>Upload Data</button>
          <input ref={fileRef} type="file" accept=",.csv" style={{display:'none'}} />
          <button onClick={clearAll} style={{padding:'6px 10px', marginLeft:'auto', fontSize:13}}>Clear All</button>
        </div>

        <div style={{display:'flex', gap:8, alignItems:'center', marginBottom:8}}>
          <button onClick={() => generateLocalDashboard(columns, rows)} disabled={loading} style={{padding:'6px 10px', fontSize:13}}>{loading ? 'Generating...' : 'Generate a Dashboard'}</button>
          <a href="https://platform.openai.com/account/api-keys" target="_blank" rel="noreferrer" style={{marginLeft:8, color:'#9bd0ff'}}>Set up Your API Key</a>
        </div>

        <div style={{marginBottom:8, fontSize:13, color:'#9bd0ff'}}>Load sample data URL — in a note in case of data shortage or testing: <button onClick={tryRandomData} style={{marginLeft:8, padding:'4px 8px'}}>Load sample</button></div>

        <div style={{marginBottom:8}}>
          <label style={{fontSize:12, color:'#666'}}>Add Context (optional)</label>
          <textarea placeholder="Add extra prompt/context" style={{width:'100%', minHeight:64}} onChange={e => setIntent(e.target.value)} value={intent} />
        </div>

        <div style={{marginBottom:8}}>
          <label style={{fontSize:12, color:'#666'}}>Choose charts to include</label>
          <div style={{display:'flex', gap:8, flexWrap:'wrap', marginTop:6}}>
            {SUPPORTED_CHARTS.map(s => {
              const chosen = selectedCharts.includes(s.label);
              return (
                <button key={s.id} onClick={() => {
                  let next = Array.from(selectedCharts);
                  if (chosen) next = next.filter(x => x !== s.label);
                  else next.push(s.label);
                  setSelectedCharts(next);
                }} style={{padding:'6px 8px', background: chosen ? '#7c3aed' : '#071428', color: chosen ? '#fff' : '#9fb6da', borderRadius:6, border:'none', cursor:'pointer'}}>{s.label}</button>
              );
            })}
          </div>
        </div>

        {!hasData && (
          <div style={{padding: '24px', margin: '24px auto', color: '#8ca1c5', textAlign: 'center'}}>
            <div style={{fontSize:40, marginBottom:8}}>📊</div>
            No data loaded yet.
            <div style={{fontSize:12, color:'#7f9fbf', marginTop:8}}>Upload a CSV or click "Load sample" to generate KPIs and visuals.</div>
          </div>
        )}

        <div style={{marginTop:8}}>
          <h4 style={{margin:0, marginBottom:8, color:'#cbd9ee'}}>Data Table</h4>
          <div style={{maxHeight: '48vh', overflow: 'auto', borderTop: '1px solid rgba(255,255,255,0.04)'}}>
            <table style={{width:'100%', borderCollapse:'collapse', color:'#e6eef8'}}>
              <thead style={{position:'sticky', top:0, background:'rgba(255,255,255,0.02)'}}>
                <tr>
                  {columns.map(c => (
                    <th key={c} style={{textAlign:'left', padding:'8px 10px', borderBottom:'1px solid rgba(255,255,255,0.03)', fontSize:13}}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{background: i%2 ? 'rgba(255,255,255,0.02)' : 'transparent'}}>
                    {columns.map(c => (
                      <td key={c} style={{padding:'8px 10px', borderBottom:'1px solid rgba(255,255,255,0.02)', fontSize:13}}>{r[c]}</td>
                    ))}
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td style={{padding:12}}>No data loaded</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {hasData && (
        <div style={{padding:12, height: '100%', overflow: 'auto'}}>
          <div style={{display:'flex', gap:12, marginBottom:12}}>
            {/* KPI cards */}
            <div style={{display:'flex', gap:12, width:'100%'}}>
              <div style={{flex:1, padding:12, borderRadius:8, background:'linear-gradient(180deg,#071126,#051026)', boxShadow:'0 6px 12px rgba(2,6,23,0.6)'}}>
                <div style={{fontSize:12, color:'#9fb6da'}}>{kpis.primaryLabel ?? 'Primary'}</div>
                <div style={{fontSize:20, fontWeight:800, color:'#e6eef8'}}>{kpis.primaryTotal ? kpis.primaryTotal.toLocaleString() : '—'}</div>
                <div style={{fontSize:12, color:'#7f9fbf'}}>{kpis.rowCount ? `${kpis.rowCount} rows` : ''}</div>
              </div>
              <div style={{flex:1, padding:12, borderRadius:8, background:'linear-gradient(180deg,#071126,#051026)', boxShadow:'0 6px 12px rgba(2,6,23,0.6)'}}>
                <div style={{fontSize:12, color:'#9fb6da'}}>{kpis.secondaryLabel ?? 'Secondary'}</div>
                <div style={{fontSize:20, fontWeight:800, color:'#e6eef8'}}>{kpis.secondaryTotal ? kpis.secondaryTotal.toLocaleString() : '—'}</div>
                <div style={{fontSize:12, color:'#7f9fbf'}}>Avg: {kpis.avgPrimary ?? '—'}</div>
              </div>
              <div style={{flex:1, padding:12, borderRadius:8, background:'linear-gradient(180deg,#071126,#051026)', boxShadow:'0 6px 12px rgba(2,6,23,0.6)'}}>
                <div style={{fontSize:12, color:'#9fb6da'}}>Top</div>
                <div style={{fontSize:18, fontWeight:700, color:'#e6eef8'}}>{kpis.topLabel ?? '—'}</div>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div style={{display:'flex', gap:12, marginBottom:12, alignItems:'center'}}>
            {/* Category multi-select */}
            {columns.includes('Category') && (
              <div style={{padding:8, background:'#071226', borderRadius:8}}>
                <div style={{fontSize:12, color:'#9fb6da', marginBottom:6}}>Category</div>
                <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
                  {Array.from(new Set(rows.map(r => r['Category'] || ''))).filter(Boolean).map(cat => {
                    const selected = filters['Category'] ? filters['Category'].has(cat) : true;
                    return (
                      <button key={cat} onClick={() => {
                        const set = new Set(filters['Category'] ? Array.from(filters['Category']) : Array.from(new Set(rows.map(r => r['Category']).filter(Boolean))));
                        if (set.has(cat)) set.delete(cat); else set.add(cat);
                        const newFilters = { ...filters, Category: set };
                        setFilters(newFilters);
                        generateLocalDashboard(columns, rows, newFilters);
                      }} style={{padding:'6px 8px', background: selected ? '#7c3aed' : '#071428', color: selected ? '#fff' : '#9fb6da', borderRadius:6, border:'none', cursor:'pointer'}}>{cat}</button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Subscriber range filter */}
            {columns.includes('Subscribers') && (
              <div style={{padding:8, background:'#071226', borderRadius:8, minWidth:220}}>
                <div style={{fontSize:12, color:'#9fb6da', marginBottom:6}}>Subscribers (min)</div>
                <input type="number" placeholder="min subscribers" onChange={e => {
                  const val = e.target.value ? Number(e.target.value) : null;
                  const newFilters = { ...filters };
                  if (val == null) delete newFilters['SubscribersMin']; else newFilters['SubscribersMin'] = val;
                  setFilters(newFilters);
                  generateLocalDashboard(columns, rows, newFilters);
                }} style={{width:160, padding:6, borderRadius:6, border:'1px solid rgba(255,255,255,0.04)', background:'#051026', color:'#e6eef8'}} />
              </div>
            )}
          </div>

          <div id="viz-root" style={{minHeight: 320}} />
        </div>
      )}
    </div>
  );
}
