import { useState, useEffect, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from 'recharts';
import { Plus, X, TrendingUp, TrendingDown, Trash2, Search, BarChart3, Sparkles, Activity, Database } from 'lucide-react';

const STORAGE_KEY = 'cardledger:collection:v1';

const COLORS = {
  bg: '#0b100f',
  surface: '#141b1a',
  surface2: '#1c2624',
  border: '#28342f',
  borderSoft: '#1f2a27',
  text: '#f1e9d6',
  textDim: '#a89f8c',
  textMute: '#6f7470',
  gold: '#d4a04c',
  goldDim: '#7a5a26',
  green: '#7ba87a',
  red: '#cc6b5c',
  ink: '#0b100f',
};

const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700;9..144,900&family=IBM+Plex+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap');
`;

// ---------- helpers ----------
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

const fmtMoney = (n, opts = {}) => {
  if (n == null || isNaN(n)) return '—';
  const abs = Math.abs(n);
  if (opts.compact && abs >= 1000) {
    if (abs >= 1_000_000) return '$' + (n / 1_000_000).toFixed(2) + 'M';
    if (abs >= 10_000) return '$' + Math.round(n / 1000) + 'k';
    return '$' + (n / 1000).toFixed(1) + 'k';
  }
  if (abs >= 1000) return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const fmtPct = (n) => {
  if (n == null || isNaN(n) || !isFinite(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return sign + n.toFixed(1) + '%';
};

const fmtDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const fmtRelDate = (iso) => {
  if (!iso) return '—';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return days + 'd ago';
  if (days < 365) return Math.floor(days / 30) + 'mo ago';
  return Math.floor(days / 365) + 'y ago';
};

const todayISO = () => new Date().toISOString().slice(0, 10);
const daysAgoISO = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

const computeMetrics = (card) => {
  const pp = (card.pricePoints || []).slice().sort((a, b) => new Date(a.date) - new Date(b.date));
  if (pp.length === 0) {
    return {
      currentValue: card.purchasePrice || 0,
      hasData: false,
      lastUpdate: null,
      change30dPct: null,
      change7dPct: null,
      changeAllPct: null,
      gainLoss: 0,
      gainLossPct: null,
      pointCount: 0,
    };
  }
  const latest = pp[pp.length - 1];
  const currentValue = latest.price;

  const findPriceAtOrBefore = (days) => {
    const target = new Date();
    target.setDate(target.getDate() - days);
    let best = null;
    for (const p of pp) {
      if (new Date(p.date) <= target) best = p;
      else break;
    }
    return best ? best.price : null;
  };

  const p30 = findPriceAtOrBefore(30);
  const p7 = findPriceAtOrBefore(7);
  const change30dPct = p30 && p30 > 0 ? ((currentValue - p30) / p30) * 100 : null;
  const change7dPct = p7 && p7 > 0 ? ((currentValue - p7) / p7) * 100 : null;
  const first = pp[0].price;
  const changeAllPct = first > 0 && pp.length > 1 ? ((currentValue - first) / first) * 100 : null;

  const purchase = card.purchasePrice || 0;
  const gainLoss = currentValue - purchase;
  const gainLossPct = purchase > 0 ? (gainLoss / purchase) * 100 : null;

  return {
    currentValue,
    hasData: true,
    lastUpdate: latest.date,
    change30dPct,
    change7dPct,
    changeAllPct,
    gainLoss,
    gainLossPct,
    pointCount: pp.length,
  };
};

// ---------- demo data ----------
const buildDemoCards = () => {
  const mk = (overrides, points) => ({
    id: uid(),
    notes: '',
    parallel: '',
    ...overrides,
    pricePoints: points.map(([date, price, source]) => ({
      id: uid(),
      date: typeof date === 'number' ? daysAgoISO(date) : date,
      price,
      source: source || 'eBay',
    })),
  });
  return [
    mk(
      { player: 'Shohei Ohtani', year: 2018, set: 'Topps Chrome', cardNumber: '150', condition: 'PSA 10', purchasePrice: 220, purchaseDate: '2022-08-14' },
      [[180, 380], [120, 410], [90, 450], [60, 520], [30, 610], [14, 640], [3, 685]],
    ),
    mk(
      { player: 'Mike Trout', year: 2009, set: 'Bowman Chrome Draft', cardNumber: 'BCP89', condition: 'PSA 9', parallel: 'Refractor', purchasePrice: 1900, purchaseDate: '2021-06-02' },
      [[180, 2400], [120, 2350], [90, 2200], [60, 2050], [30, 1980], [10, 1850], [2, 1820]],
    ),
    mk(
      { player: 'LeBron James', year: 2003, set: 'Topps Chrome', cardNumber: '111', condition: 'PSA 9', purchasePrice: 3200, purchaseDate: '2020-11-22' },
      [[180, 4100], [120, 4400], [90, 4600], [60, 5000], [30, 5400], [12, 5650], [4, 5800]],
    ),
    mk(
      { player: 'Justin Herbert', year: 2020, set: 'Panini Prizm', cardNumber: '325', condition: 'PSA 10', purchasePrice: 540, purchaseDate: '2023-01-10' },
      [[180, 410], [120, 380], [90, 340], [60, 310], [30, 285], [10, 270], [2, 260]],
    ),
    mk(
      { player: 'Victor Wembanyama', year: 2023, set: 'Panini Prizm', cardNumber: '136', condition: 'Raw', purchasePrice: 80, purchaseDate: '2023-12-04' },
      [[180, 95], [120, 110], [90, 130], [60, 165], [30, 195], [12, 230], [3, 245]],
    ),
    mk(
      { player: 'Patrick Mahomes', year: 2017, set: 'Panini Prizm', cardNumber: '269', condition: 'PSA 10', purchasePrice: 1200, purchaseDate: '2022-02-18' },
      [[180, 1750], [120, 1820], [90, 1900], [60, 1950], [30, 2050], [10, 2120], [2, 2180]],
    ),
    mk(
      { player: 'Connor Bedard', year: 2023, set: 'Upper Deck Young Guns', cardNumber: '451', condition: 'Raw', purchasePrice: 320, purchaseDate: '2023-11-08' },
      [[180, 290], [120, 260], [90, 235], [60, 215], [30, 195], [10, 180], [2, 170]],
    ),
  ];
};

// ---------- storage (localStorage version) ----------
const useCollection = () => {
  const [cards, setCards] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setCards(parsed.cards || []);
      }
    } catch (e) {
      console.error('Load failed', e);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ cards }));
    } catch (e) {
      console.error('Save failed', e);
    }
  }, [cards, loaded]);

  return { cards, setCards, loaded };
};

// ---------- UI primitives ----------
const SectionLabel = ({ children, accent }) => (
  <div className="flex items-center gap-3 mb-4">
    <div
      className="text-xs uppercase tracking-[0.25em]"
      style={{ color: accent || COLORS.gold, fontFamily: 'Fraunces, serif', fontWeight: 600 }}
    >
      {children}
    </div>
    <div className="flex-1 h-px" style={{ background: COLORS.borderSoft }} />
  </div>
);

const Pill = ({ children, tone = 'neutral', size = 'sm' }) => {
  const tones = {
    up: { bg: 'rgba(123,168,122,0.12)', fg: COLORS.green, br: 'rgba(123,168,122,0.3)' },
    down: { bg: 'rgba(204,107,92,0.12)', fg: COLORS.red, br: 'rgba(204,107,92,0.3)' },
    gold: { bg: 'rgba(212,160,76,0.1)', fg: COLORS.gold, br: 'rgba(212,160,76,0.3)' },
    neutral: { bg: 'rgba(168,159,140,0.08)', fg: COLORS.textDim, br: COLORS.borderSoft },
  };
  const t = tones[tone];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${size === 'xs' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-0.5'}`}
      style={{ background: t.bg, color: t.fg, border: `1px solid ${t.br}`, fontFamily: 'JetBrains Mono, monospace' }}
    >
      {children}
    </span>
  );
};

const ChangeBadge = ({ pct, period, size = 'sm' }) => {
  if (pct == null) {
    return <span className="text-xs" style={{ color: COLORS.textMute, fontFamily: 'JetBrains Mono' }}>{period} —</span>;
  }
  const tone = pct >= 0 ? 'up' : 'down';
  return (
    <Pill tone={tone} size={size}>
      {pct >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
      {fmtPct(pct)}
      {period && <span style={{ opacity: 0.6, marginLeft: 2 }}>{period}</span>}
    </Pill>
  );
};

const Button = ({ children, onClick, variant = 'primary', size = 'md', type = 'button', disabled }) => {
  const styles = {
    primary: { bg: COLORS.gold, fg: COLORS.ink, br: COLORS.gold },
    ghost: { bg: 'transparent', fg: COLORS.text, br: COLORS.border },
    danger: { bg: 'transparent', fg: COLORS.red, br: 'rgba(204,107,92,0.4)' },
  };
  const s = styles[variant];
  const sz = size === 'sm' ? 'text-xs px-3 py-1.5' : 'text-sm px-4 py-2.5';
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${sz} rounded-md font-medium transition active:scale-[0.98] disabled:opacity-40`}
      style={{ background: s.bg, color: s.fg, border: `1px solid ${s.br}`, fontFamily: 'IBM Plex Sans, sans-serif', letterSpacing: '0.02em' }}
    >
      {children}
    </button>
  );
};

const Input = ({ label, value, onChange, type = 'text', placeholder, required, step }) => (
  <label className="block">
    <div className="text-[10px] uppercase tracking-[0.2em] mb-1.5" style={{ color: COLORS.textDim, fontFamily: 'IBM Plex Sans' }}>
      {label}
    </div>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      required={required}
      step={step}
      className="w-full px-3 py-2 rounded-md outline-none transition"
      style={{ background: COLORS.bg, color: COLORS.text, border: `1px solid ${COLORS.border}`, fontFamily: type === 'number' ? 'JetBrains Mono' : 'IBM Plex Sans', fontSize: '14px' }}
    />
  </label>
);

const Modal = ({ open, onClose, children, title }) => {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[92vh] overflow-y-auto"
        style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, boxShadow: '0 -10px 40px rgba(0,0,0,0.5)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between px-5 py-4 z-10" style={{ background: COLORS.surface, borderBottom: `1px solid ${COLORS.borderSoft}` }}>
          <div style={{ fontFamily: 'Fraunces, serif', fontSize: '20px', fontWeight: 600, color: COLORS.text, letterSpacing: '-0.01em' }}>
            {title}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:opacity-70" style={{ color: COLORS.textDim }}>
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-5">{children}</div>
      </div>
    </div>
  );
};

const AddCardForm = ({ onSubmit, onCancel }) => {
  const [f, setF] = useState({
    player: '', year: '', set: '', cardNumber: '', condition: 'Raw', parallel: '',
    purchasePrice: '', purchaseDate: todayISO(), currentValue: '', notes: '',
  });

  const submit = (e) => {
    e.preventDefault();
    if (!f.player.trim() || !f.set.trim()) return;
    const card = {
      id: uid(),
      player: f.player.trim(),
      year: f.year ? parseInt(f.year) : null,
      set: f.set.trim(),
      cardNumber: f.cardNumber.trim(),
      condition: f.condition,
      parallel: f.parallel.trim(),
      purchasePrice: f.purchasePrice ? parseFloat(f.purchasePrice) : 0,
      purchaseDate: f.purchaseDate,
      notes: f.notes.trim(),
      pricePoints: f.currentValue ? [{ id: uid(), date: todayISO(), price: parseFloat(f.currentValue), source: 'Initial' }] : [],
    };
    onSubmit(card);
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <Input label="Player" value={f.player} onChange={(v) => setF({ ...f, player: v })} placeholder="e.g. Shohei Ohtani" required />
      <div className="grid grid-cols-2 gap-3">
        <Input label="Year" value={f.year} onChange={(v) => setF({ ...f, year: v })} type="number" placeholder="2018" />
        <Input label="Card #" value={f.cardNumber} onChange={(v) => setF({ ...f, cardNumber: v })} placeholder="150" />
      </div>
      <Input label="Set / Brand" value={f.set} onChange={(v) => setF({ ...f, set: v })} placeholder="Topps Chrome" required />
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <div className="text-[10px] uppercase tracking-[0.2em] mb-1.5" style={{ color: COLORS.textDim, fontFamily: 'IBM Plex Sans' }}>Condition</div>
          <select
            value={f.condition}
            onChange={(e) => setF({ ...f, condition: e.target.value })}
            className="w-full px-3 py-2 rounded-md outline-none"
            style={{ background: COLORS.bg, color: COLORS.text, border: `1px solid ${COLORS.border}`, fontFamily: 'IBM Plex Sans', fontSize: '14px' }}
          >
            {['Raw', 'PSA 10', 'PSA 9', 'PSA 8', 'BGS 10', 'BGS 9.5', 'BGS 9', 'SGC 10', 'SGC 9.5', 'CGC 10', 'Other'].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <Input label="Parallel (opt.)" value={f.parallel} onChange={(v) => setF({ ...f, parallel: v })} placeholder="Refractor" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Bought For" value={f.purchasePrice} onChange={(v) => setF({ ...f, purchasePrice: v })} type="number" step="0.01" placeholder="0.00" />
        <Input label="Bought On" value={f.purchaseDate} onChange={(v) => setF({ ...f, purchaseDate: v })} type="date" />
      </div>
      <Input label="Current Value (opt., starts price history)" value={f.currentValue} onChange={(v) => setF({ ...f, currentValue: v })} type="number" step="0.01" placeholder="0.00" />
      <div className="flex gap-2 pt-2">
        <Button type="submit" variant="primary">Add to collection</Button>
        <Button onClick={onCancel} variant="ghost">Cancel</Button>
      </div>
    </form>
  );
};

const AddPricePointForm = ({ onSubmit, onCancel }) => {
  const [price, setPrice] = useState('');
  const [date, setDate] = useState(todayISO());
  const [source, setSource] = useState('eBay');

  const submit = (e) => {
    e.preventDefault();
    if (!price) return;
    onSubmit({ id: uid(), date, price: parseFloat(price), source });
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <Input label="Sale / Comp Price" value={price} onChange={setPrice} type="number" step="0.01" placeholder="0.00" required />
      <div className="grid grid-cols-2 gap-3">
        <Input label="Date" value={date} onChange={setDate} type="date" />
        <label className="block">
          <div className="text-[10px] uppercase tracking-[0.2em] mb-1.5" style={{ color: COLORS.textDim, fontFamily: 'IBM Plex Sans' }}>Source</div>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="w-full px-3 py-2 rounded-md outline-none"
            style={{ background: COLORS.bg, color: COLORS.text, border: `1px solid ${COLORS.border}`, fontFamily: 'IBM Plex Sans', fontSize: '14px' }}
          >
            {['eBay', 'COMC', 'PWCC', 'Goldin', 'Heritage', 'Other'].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex gap-2 pt-2">
        <Button type="submit" variant="primary">Log price</Button>
        <Button onClick={onCancel} variant="ghost">Cancel</Button>
      </div>
    </form>
  );
};

const CardDetail = ({ card, onAddPricePoint, onDeletePricePoint, onDeleteCard, onClose }) => {
  const m = useMemo(() => computeMetrics(card), [card]);
  const [showAdd, setShowAdd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const chartData = useMemo(() => {
    return (card.pricePoints || [])
      .slice()
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .map((p) => ({ date: p.date, price: p.price, label: fmtDate(p.date) }));
  }, [card.pricePoints]);

  return (
    <div className="space-y-5">
      <div>
        <div className="text-xs uppercase tracking-[0.2em] mb-1" style={{ color: COLORS.gold, fontFamily: 'Fraunces' }}>
          {card.year} {card.set} {card.cardNumber && '· #' + card.cardNumber}
        </div>
        <div style={{ fontFamily: 'Fraunces, serif', fontSize: '26px', fontWeight: 700, color: COLORS.text, lineHeight: 1.1, letterSpacing: '-0.02em' }}>
          {card.player}
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          <Pill tone="neutral" size="xs">{card.condition}</Pill>
          {card.parallel && <Pill tone="gold" size="xs">{card.parallel}</Pill>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded-md" style={{ background: COLORS.bg, border: `1px solid ${COLORS.borderSoft}` }}>
          <div className="text-[10px] uppercase tracking-[0.2em]" style={{ color: COLORS.textDim }}>Current</div>
          <div style={{ fontFamily: 'JetBrains Mono', fontSize: '22px', fontWeight: 600, color: COLORS.gold, marginTop: 2 }}>
            {fmtMoney(m.currentValue)}
          </div>
          <div className="text-[10px]" style={{ color: COLORS.textMute, fontFamily: 'IBM Plex Sans', marginTop: 2 }}>
            {m.lastUpdate ? 'as of ' + fmtRelDate(m.lastUpdate) : 'no comps logged'}
          </div>
        </div>
        <div className="p-3 rounded-md" style={{ background: COLORS.bg, border: `1px solid ${COLORS.borderSoft}` }}>
          <div className="text-[10px] uppercase tracking-[0.2em]" style={{ color: COLORS.textDim }}>P / L</div>
          <div style={{ fontFamily: 'JetBrains Mono', fontSize: '22px', fontWeight: 600, color: m.gainLoss > 0 ? COLORS.green : m.gainLoss < 0 ? COLORS.red : COLORS.text, marginTop: 2 }}>
            {m.gainLoss >= 0 ? '+' : ''}{fmtMoney(m.gainLoss)}
          </div>
          <div className="text-[10px]" style={{ color: COLORS.textMute, fontFamily: 'JetBrains Mono', marginTop: 2 }}>
            {fmtPct(m.gainLossPct)} from cost
          </div>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <ChangeBadge pct={m.change7dPct} period="7d" />
        <ChangeBadge pct={m.change30dPct} period="30d" />
        <ChangeBadge pct={m.changeAllPct} period="all" />
      </div>

      {chartData.length > 1 ? (
        <div className="p-3 rounded-md" style={{ background: COLORS.bg, border: `1px solid ${COLORS.borderSoft}`, height: 200 }}>
          <ResponsiveContainer>
            <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 0, left: -10 }}>
              <CartesianGrid stroke={COLORS.borderSoft} strokeDasharray="2 4" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fill: COLORS.textMute, fontSize: 10, fontFamily: 'JetBrains Mono' }}
                axisLine={{ stroke: COLORS.borderSoft }}
                tickLine={false}
                tickFormatter={(d) => {
                  const dt = new Date(d);
                  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                }}
              />
              <YAxis
                tick={{ fill: COLORS.textMute, fontSize: 10, fontFamily: 'JetBrains Mono' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => '$' + (v >= 1000 ? Math.round(v / 1000) + 'k' : v)}
                width={45}
              />
              <Tooltip
                contentStyle={{ background: COLORS.surface2, border: `1px solid ${COLORS.border}`, borderRadius: 6, fontFamily: 'JetBrains Mono', fontSize: 12, color: COLORS.text }}
                labelFormatter={(d) => fmtDate(d)}
                formatter={(v) => [fmtMoney(v), 'Price']}
              />
              <Line type="monotone" dataKey="price" stroke={COLORS.gold} strokeWidth={2} dot={{ r: 3, fill: COLORS.gold, strokeWidth: 0 }} activeDot={{ r: 5, fill: COLORS.gold }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="p-4 rounded-md text-center text-sm" style={{ background: COLORS.bg, border: `1px solid ${COLORS.borderSoft}`, color: COLORS.textDim, fontFamily: 'IBM Plex Sans' }}>
          Log at least 2 sale prices to see a trend chart.
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-2">
          <SectionLabel>Sale History</SectionLabel>
        </div>
        {chartData.length === 0 && (
          <div className="text-sm" style={{ color: COLORS.textDim, fontFamily: 'IBM Plex Sans' }}>
            No price points yet. Log a recent comp to start tracking value.
          </div>
        )}
        <div className="space-y-1">
          {(card.pricePoints || []).slice().sort((a, b) => new Date(b.date) - new Date(a.date)).map((p) => (
            <div key={p.id} className="flex items-center justify-between px-3 py-2 rounded-md" style={{ background: COLORS.bg, border: `1px solid ${COLORS.borderSoft}` }}>
              <div>
                <div style={{ fontFamily: 'JetBrains Mono', fontSize: 14, fontWeight: 600, color: COLORS.text }}>
                  {fmtMoney(p.price)}
                </div>
                <div className="text-[11px]" style={{ color: COLORS.textDim, fontFamily: 'IBM Plex Sans' }}>
                  {fmtDate(p.date)} · {p.source}
                </div>
              </div>
              <button onClick={() => onDeletePricePoint(p.id)} className="p-1.5 rounded hover:opacity-70" style={{ color: COLORS.textMute }}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {showAdd && (
        <div className="p-3 rounded-md" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}` }}>
          <AddPricePointForm onSubmit={(pp) => { onAddPricePoint(pp); setShowAdd(false); }} onCancel={() => setShowAdd(false)} />
        </div>
      )}

      {!showAdd && (
        <div className="flex gap-2 pt-1">
          <Button onClick={() => setShowAdd(true)} variant="primary">
            <Plus size={14} className="inline mr-1" /> Log new sale price
          </Button>
        </div>
      )}

      {card.purchasePrice > 0 && (
        <div className="text-xs pt-2" style={{ color: COLORS.textMute, fontFamily: 'IBM Plex Sans' }}>
          Bought for {fmtMoney(card.purchasePrice)} on {fmtDate(card.purchaseDate)}
        </div>
      )}

      <div className="pt-3" style={{ borderTop: `1px solid ${COLORS.borderSoft}` }}>
        {!showConfirm ? (
          <Button onClick={() => setShowConfirm(true)} variant="danger" size="sm">
            <Trash2 size={12} className="inline mr-1" /> Remove from collection
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: COLORS.textDim }}>Sure?</span>
            <Button onClick={() => { onDeleteCard(); onClose(); }} variant="danger" size="sm">Yes, delete</Button>
            <Button onClick={() => setShowConfirm(false)} variant="ghost" size="sm">Cancel</Button>
          </div>
        )}
      </div>
    </div>
  );
};

const CardRow = ({ card, onClick, accent }) => {
  const m = computeMetrics(card);
  return (
    <button
      onClick={onClick}
      className="w-full text-left p-3 rounded-lg transition active:scale-[0.99] hover:opacity-95"
      style={{ background: COLORS.surface, border: `1px solid ${accent ? COLORS.goldDim : COLORS.borderSoft}`, boxShadow: accent ? 'inset 0 0 0 1px rgba(212,160,76,0.08)' : 'none' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-[0.18em] truncate" style={{ color: COLORS.textDim, fontFamily: 'Fraunces' }}>
            {card.year} {card.set}
          </div>
          <div className="truncate" style={{ fontFamily: 'Fraunces, serif', fontSize: 17, fontWeight: 600, color: COLORS.text, letterSpacing: '-0.01em', marginTop: 1 }}>
            {card.player}
          </div>
          <div className="flex gap-1.5 mt-1.5 flex-wrap">
            <Pill tone="neutral" size="xs">{card.condition}</Pill>
            {card.parallel && <Pill tone="gold" size="xs">{card.parallel}</Pill>}
            {card.cardNumber && (
              <span className="text-[10px]" style={{ color: COLORS.textMute, fontFamily: 'JetBrains Mono', alignSelf: 'center' }}>
                #{card.cardNumber}
              </span>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div style={{ fontFamily: 'JetBrains Mono', fontSize: 18, fontWeight: 600, color: accent ? COLORS.gold : COLORS.text }}>
            {fmtMoney(m.currentValue, { compact: true })}
          </div>
          <div className="mt-1 flex justify-end">
            <ChangeBadge pct={m.change30dPct} period="30d" size="xs" />
          </div>
        </div>
      </div>
    </button>
  );
};

export default function CardLedger() {
  const { cards, setCards, loaded } = useCollection();
  const [tab, setTab] = useState('overview');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('value');
  const [openCardId, setOpenCardId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);

  const totals = useMemo(() => {
    let value = 0;
    let cost = 0;
    let movers = [];
    cards.forEach((c) => {
      const m = computeMetrics(c);
      value += m.currentValue;
      cost += c.purchasePrice || 0;
      if (m.change30dPct != null) movers.push({ card: c, pct: m.change30dPct, m });
    });
    movers.sort((a, b) => b.pct - a.pct);
    return {
      value, cost,
      gain: value - cost,
      gainPct: cost > 0 ? ((value - cost) / cost) * 100 : null,
      gainers: movers.filter((x) => x.pct > 0).slice(0, 5),
      decliners: movers.filter((x) => x.pct < 0).slice(-5).reverse(),
      count: cards.length,
    };
  }, [cards]);

  const sortedCards = useMemo(() => {
    let list = cards.map((c) => ({ c, m: computeMetrics(c) }));
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(({ c }) => c.player.toLowerCase().includes(q) || c.set.toLowerCase().includes(q) || (c.cardNumber || '').toLowerCase().includes(q));
    }
    list.sort((a, b) => {
      if (sort === 'value') return b.m.currentValue - a.m.currentValue;
      if (sort === 'recent') return new Date(b.m.lastUpdate || 0) - new Date(a.m.lastUpdate || 0);
      if (sort === 'gain') return (b.m.change30dPct ?? -Infinity) - (a.m.change30dPct ?? -Infinity);
      if (sort === 'player') return a.c.player.localeCompare(b.c.player);
      return 0;
    });
    return list.map(({ c }) => c);
  }, [cards, search, sort]);

  const highValue = useMemo(() => {
    return cards.map((c) => ({ c, m: computeMetrics(c) })).sort((a, b) => b.m.currentValue - a.m.currentValue).slice(0, 5).map(({ c }) => c);
  }, [cards]);

  const openCard = openCardId ? cards.find((c) => c.id === openCardId) : null;

  const addCard = (card) => setCards((prev) => [...prev, card]);
  const deleteCard = (id) => setCards((prev) => prev.filter((c) => c.id !== id));
  const addPricePoint = (cardId, pp) => setCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, pricePoints: [...(c.pricePoints || []), pp] } : c)));
  const deletePricePoint = (cardId, ppId) => setCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, pricePoints: (c.pricePoints || []).filter((p) => p.id !== ppId) } : c)));
  const loadDemo = () => setCards(buildDemoCards());

  return (
    <div className="min-h-screen" style={{ background: COLORS.bg, color: COLORS.text, fontFamily: 'IBM Plex Sans, sans-serif' }}>
      <style>{FONTS}</style>
      <style>{`
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${COLORS.border}; border-radius: 3px; }
        input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(0.6); cursor: pointer; }
        select { appearance: none; -webkit-appearance: none; background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23a89f8c' stroke-width='2'><polyline points='6 9 12 15 18 9'/></svg>"); background-repeat: no-repeat; background-position: right 10px center; padding-right: 28px !important; }
      `}</style>

      <div className="px-5 pt-6 pb-5" style={{ borderBottom: `1px solid ${COLORS.borderSoft}`, background: `linear-gradient(180deg, ${COLORS.surface} 0%, ${COLORS.bg} 100%)` }}>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded flex items-center justify-center" style={{ background: COLORS.gold, color: COLORS.ink }}>
              <Database size={14} strokeWidth={2.5} />
            </div>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 18, fontWeight: 700, letterSpacing: '0.02em', color: COLORS.text }}>
              CARD<span style={{ color: COLORS.gold }}>LEDGER</span>
            </div>
          </div>
          <div className="text-[10px] uppercase tracking-[0.2em]" style={{ color: COLORS.textMute, fontFamily: 'Fraunces' }}>
            est. {new Date().getFullYear()}
          </div>
        </div>

        <div className="text-[10px] uppercase tracking-[0.25em] mb-1" style={{ color: COLORS.textDim, fontFamily: 'Fraunces' }}>
          Collection Value
        </div>
        <div style={{ fontFamily: 'Fraunces, serif', fontSize: 44, fontWeight: 700, color: COLORS.text, letterSpacing: '-0.03em', lineHeight: 1 }}>
          {fmtMoney(totals.value)}
        </div>
        <div className="flex items-center gap-3 mt-2">
          {totals.cost > 0 && (
            <>
              <span style={{ fontFamily: 'JetBrains Mono', fontSize: 13, color: totals.gain >= 0 ? COLORS.green : COLORS.red, fontWeight: 600 }}>
                {totals.gain >= 0 ? '+' : ''}{fmtMoney(totals.gain)} {fmtPct(totals.gainPct)}
              </span>
              <span style={{ color: COLORS.textMute, fontSize: 11, fontFamily: 'IBM Plex Sans' }}>
                from cost {fmtMoney(totals.cost, { compact: true })}
              </span>
            </>
          )}
          {totals.cost === 0 && totals.count > 0 && (
            <span style={{ color: COLORS.textMute, fontSize: 11 }}>{totals.count} {totals.count === 1 ? 'card' : 'cards'}</span>
          )}
        </div>
      </div>

      <div className="px-5 pt-4 sticky top-0 z-20" style={{ background: COLORS.bg, borderBottom: `1px solid ${COLORS.borderSoft}` }}>
        <div className="flex gap-5">
          {[
            { id: 'overview', label: 'Overview', icon: Sparkles },
            { id: 'all', label: 'All Cards', icon: BarChart3 },
            { id: 'movers', label: 'Movers', icon: Activity },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className="pb-3 flex items-center gap-1.5 transition"
              style={{ color: tab === id ? COLORS.gold : COLORS.textDim, borderBottom: tab === id ? `2px solid ${COLORS.gold}` : '2px solid transparent', fontFamily: 'Fraunces, serif', fontSize: 13, fontWeight: 600, letterSpacing: '0.02em', marginBottom: -1 }}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 py-5 pb-32">
        {!loaded && (
          <div className="text-center py-12" style={{ color: COLORS.textDim }}>Loading collection...</div>
        )}

        {loaded && cards.length === 0 && (
          <div className="text-center py-12">
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 24, fontWeight: 600, color: COLORS.text, marginBottom: 8 }}>
              An empty ledger.
            </div>
            <div className="mb-6 text-sm" style={{ color: COLORS.textDim, maxWidth: 320, margin: '0 auto 24px' }}>
              Add your first card or load a demo collection to see how value tracking works.
            </div>
            <div className="flex gap-2 justify-center">
              <Button onClick={() => setShowAdd(true)} variant="primary">
                <Plus size={14} className="inline mr-1" /> Add a card
              </Button>
              <Button onClick={loadDemo} variant="ghost">Load demo</Button>
            </div>
          </div>
        )}

        {loaded && cards.length > 0 && tab === 'overview' && (
          <>
            <div className="grid grid-cols-3 gap-2 mb-6">
              {[
                { label: 'Cards', val: totals.count, mono: true },
                { label: 'Cost Basis', val: fmtMoney(totals.cost, { compact: true }), mono: true },
                { label: 'Top Value', val: highValue[0] ? fmtMoney(computeMetrics(highValue[0]).currentValue, { compact: true }) : '—', mono: true, gold: true },
              ].map((s) => (
                <div key={s.label} className="p-3 rounded-md" style={{ background: COLORS.surface, border: `1px solid ${COLORS.borderSoft}` }}>
                  <div className="text-[9px] uppercase tracking-[0.2em]" style={{ color: COLORS.textDim }}>{s.label}</div>
                  <div style={{ fontFamily: s.mono ? 'JetBrains Mono' : 'Fraunces', fontSize: 18, fontWeight: 600, color: s.gold ? COLORS.gold : COLORS.text, marginTop: 2 }}>
                    {s.val}
                  </div>
                </div>
              ))}
            </div>

            {totals.gainers.length > 0 && (
              <div className="mb-7">
                <SectionLabel accent={COLORS.green}>↗ Trending Up · 30d</SectionLabel>
                <div className="space-y-2">
                  {totals.gainers.slice(0, 3).map(({ card }) => (
                    <CardRow key={card.id} card={card} onClick={() => setOpenCardId(card.id)} />
                  ))}
                </div>
              </div>
            )}

            {totals.decliners.length > 0 && (
              <div className="mb-7">
                <SectionLabel accent={COLORS.red}>↘ Trending Down · 30d</SectionLabel>
                <div className="space-y-2">
                  {totals.decliners.slice(0, 3).map(({ card }) => (
                    <CardRow key={card.id} card={card} onClick={() => setOpenCardId(card.id)} />
                  ))}
                </div>
              </div>
            )}

            <div className="mb-7">
              <SectionLabel accent={COLORS.gold}>★ Highest Value</SectionLabel>
              <div className="space-y-2">
                {highValue.map((c) => (
                  <CardRow key={c.id} card={c} onClick={() => setOpenCardId(c.id)} accent />
                ))}
              </div>
            </div>
          </>
        )}

        {loaded && cards.length > 0 && tab === 'all' && (
          <>
            <div className="mb-4 space-y-2">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: COLORS.textMute }} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by player, set, or #"
                  className="w-full pl-9 pr-3 py-2 rounded-md outline-none"
                  style={{ background: COLORS.surface, color: COLORS.text, border: `1px solid ${COLORS.borderSoft}`, fontSize: 14 }}
                />
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {[
                  { id: 'value', label: 'Value' },
                  { id: 'gain', label: '30d %' },
                  { id: 'recent', label: 'Recent' },
                  { id: 'player', label: 'Player' },
                ].map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSort(s.id)}
                    className="text-xs px-3 py-1.5 rounded-full transition"
                    style={{ background: sort === s.id ? COLORS.gold : 'transparent', color: sort === s.id ? COLORS.ink : COLORS.textDim, border: `1px solid ${sort === s.id ? COLORS.gold : COLORS.borderSoft}`, fontFamily: 'IBM Plex Sans', fontWeight: 500 }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              {sortedCards.map((c) => (
                <CardRow key={c.id} card={c} onClick={() => setOpenCardId(c.id)} />
              ))}
              {sortedCards.length === 0 && (
                <div className="text-center py-8 text-sm" style={{ color: COLORS.textDim }}>
                  No cards match your search.
                </div>
              )}
            </div>
          </>
        )}

        {loaded && cards.length > 0 && tab === 'movers' && (
          <>
            <div className="mb-7">
              <SectionLabel accent={COLORS.green}>Gainers · last 30 days</SectionLabel>
              {totals.gainers.length === 0 ? (
                <div className="text-sm" style={{ color: COLORS.textDim }}>No upward movers yet — log more recent comps to see trends.</div>
              ) : (
                <div className="space-y-2">
                  {totals.gainers.map(({ card }) => (
                    <CardRow key={card.id} card={card} onClick={() => setOpenCardId(card.id)} />
                  ))}
                </div>
              )}
            </div>
            <div>
              <SectionLabel accent={COLORS.red}>Decliners · last 30 days</SectionLabel>
              {totals.decliners.length === 0 ? (
                <div className="text-sm" style={{ color: COLORS.textDim }}>No declines tracked. Log more comps to detect price drops.</div>
              ) : (
                <div className="space-y-2">
                  {totals.decliners.map(({ card }) => (
                    <CardRow key={card.id} card={card} onClick={() => setOpenCardId(card.id)} />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {loaded && (
        <button
          onClick={() => setShowAdd(true)}
          className="fixed bottom-6 right-5 w-14 h-14 rounded-full flex items-center justify-center transition active:scale-95 z-30"
          style={{ background: COLORS.gold, color: COLORS.ink, boxShadow: '0 6px 20px rgba(212,160,76,0.35), 0 2px 6px rgba(0,0,0,0.3)' }}
          aria-label="Add card"
        >
          <Plus size={24} strokeWidth={2.5} />
        </button>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add a card">
        <AddCardForm onSubmit={(c) => { addCard(c); setShowAdd(false); }} onCancel={() => setShowAdd(false)} />
      </Modal>

      <Modal open={!!openCard} onClose={() => setOpenCardId(null)} title="Card detail">
        {openCard && (
          <CardDetail
            card={openCard}
            onAddPricePoint={(pp) => addPricePoint(openCard.id, pp)}
            onDeletePricePoint={(ppId) => deletePricePoint(openCard.id, ppId)}
            onDeleteCard={() => deleteCard(openCard.id)}
            onClose={() => setOpenCardId(null)}
          />
        )}
      </Modal>
    </div>
  );
}
