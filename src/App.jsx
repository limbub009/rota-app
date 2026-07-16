import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

/* ---------- Supabase (cloud storage — synced across devices) ---------- */
const SUPABASE_URL = 'https://kuyejwrvxktwynnrlryu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1eWVqd3J2eGt0d3lubnJscnl1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQxNTE0MTgsImV4cCI6MjA5OTcyNzQxOH0.BwUiPJvznz1PzpHK3vKNVKIAvcXCqzk8bXPXQ0zWVNs';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const monthId = (m, y) => `${y}-${String(m).padStart(2, '0')}`;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const SHIFT_META = {
  '1':  { label: 'Regular',        color: '#6EFBCE' },
  'E':  { label: 'Early',          color: '#35D6A7' },
  'SE': { label: 'Sat Early',      color: '#35D6A7' },
  'L':  { label: 'Late',           color: '#12B389' },
  'SL': { label: 'Sat Late',       color: '#12B389' },
  'SN': { label: 'Sat Normal',     color: '#6EFBCE' },
  'W':  { label: 'Sunday',         color: '#A8B3AE' },
  'H':  { label: 'Holiday',        color: '#8B8FF0' },
  'HD': { label: 'Half-day',       color: '#D9D9D9' },
  'S':  { label: 'Sick',           color: '#FF6B5E' },
  'MA': { label: 'Medical',        color: '#4FB8FF' },
  'T':  { label: 'Training',       color: '#FFA94F' },
  'M':  { label: 'Mat/Pat',        color: '#8FD8FF' },
  'CL': { label: 'Comp. Leave',    color: '#6FD9EA' },
  'DL': { label: 'Dep. Leave',     color: '#6FD9EA' }
};

const STORAGE_KEY = 'vf-rota-months';
const THEME_KEY = 'vf-theme';

function getDaysInMonth(month, year) { return new Date(year, month, 0).getDate(); }
function getFirstDayOfMonth(month, year) { return new Date(year, month - 1, 1).getDay(); }
function getDayLetter(dow) { return ['S', 'M', 'T', 'W', 'T', 'F', 'S'][dow]; }

function formatUpdated(iso) {
  if (!iso) return 'unknown';
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch (e) { return 'unknown'; }
}

function parseHTMLTable(htmlText, month, year) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlText, 'text/html');
  const table = doc.querySelector('table');
  if (!table) throw new Error('No table found in the pasted HTML.');

  const rows = Array.from(table.querySelectorAll('tbody tr'));
  if (rows.length === 0) throw new Error('No data rows found in the table.');

  const employees = [];
  const shifts = [];
  let employeeId = 1;
  const employeeMap = {};

  rows.forEach((row) => {
    const cells = Array.from(row.querySelectorAll('td'));
    if (cells.length < 5) return;

    const team = cells[0]?.textContent?.trim() || '';
    const name = cells[1]?.textContent?.trim() || '';
    if (!name || name === '—' || !name.match(/[a-zA-Z]/)) return;

    if (!employeeMap[name]) {
      employeeMap[name] = employeeId;
      employees.push({ id: employeeId, name, team: team || 'L1', active: true });
      employeeId++;
    }

    const empId = employeeMap[name];
    let dayCounter = 1;

    for (let i = 2; i < cells.length; i++) {
      const cellText = cells[i]?.textContent?.trim() || '';
      if (!cellText || cellText === '—') { dayCounter++; continue; }

      const codes = cellText.split(/[\s,/\n]+/).map(c => c.trim()).filter(c => c.length > 0 && c !== '—');
      codes.forEach(code => {
        if (code.length <= 3 && /^[A-Z0-9]+$/.test(code)) {
          const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(dayCounter).padStart(2, '0')}`;
          shifts.push({ empId, workDate: dateStr, code, note: '' });
        }
      });
      dayCounter++;
    }
  });

  if (employees.length === 0) throw new Error('No employees found. Make sure you copied the full <table> element.');
  return { month, year, employees, shifts };
}

/* ---------- Verifone logo mark — traced from the brand reference ----------
   Layout: two dots stacked top-left, one dot lower-centre,
   connected hourglass top-right (larger top lobe, smooth waist). */
function VerifoneMark({ size = 34 }) {
  return (
    <svg className="vf-mark" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <circle className="vf-dot" cx="10" cy="10.5" r="9.5" />
      <circle className="vf-dot" cx="10" cy="35.5" r="9.5" />
      <circle className="vf-dot" cx="31" cy="54.5" r="9" />
      <path
        className="vf-dot"
        d="M 49.8 13
           C 49.8 19.5, 51.4 20.8, 51.4 23.5
           C 51.4 26.2, 49.8 27.5, 49.8 33
           L 56.2 33
           C 56.2 27.5, 54.6 26.2, 54.6 23.5
           C 54.6 20.8, 56.2 19.5, 56.2 13
           Z"
      />
      <circle className="vf-dot" cx="53" cy="11" r="10" />
      <circle className="vf-dot" cx="53" cy="36" r="9" />
    </svg>
  );
}

function MonthCalendar({ data, month, year, onUpdate, filteredName, index, canEdit, isMobile }) {
  const [editingCell, setEditingCell] = useState(null);
  const [editValue, setEditValue] = useState('');

  const daysInMonth = getDaysInMonth(month, year);
  const firstDay = getFirstDayOfMonth(month, year);

  /* Monday-aligned weeks for the mobile view */
  const mondayOffset = (firstDay + 6) % 7;
  const weeks = [];
  {
    let s = 1;
    let e = Math.min(daysInMonth, 7 - mondayOffset === 0 ? 7 : 7 - mondayOffset);
    while (s <= daysInMonth) {
      weeks.push([s, e]);
      s = e + 1;
      e = Math.min(daysInMonth, s + 6);
    }
  }
  const today = new Date();
  const isCurrentMonth = today.getMonth() + 1 === month && today.getFullYear() === year;
  const initialWeek = isCurrentMonth
    ? Math.max(0, weeks.findIndex(([a, b]) => today.getDate() >= a && today.getDate() <= b))
    : 0;
  const [weekIdx, setWeekIdx] = useState(initialWeek);

  const effWeek = Math.min(weekIdx, weeks.length - 1);
  const [dayStart, dayEnd] = isMobile ? weeks[effWeek] : [1, daysInMonth];

  const getShift = (empId, day) => {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return data.shifts.find(s => s.empId === empId && s.workDate === dateStr);
  };

  const updateShift = (empId, day, code) => {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const idx = data.shifts.findIndex(s => s.empId === empId && s.workDate === dateStr);
    const newShifts = [...data.shifts];
    if (idx >= 0) {
      if (code) newShifts[idx] = { ...newShifts[idx], code };
      else newShifts.splice(idx, 1);
    } else if (code) {
      newShifts.push({ empId, workDate: dateStr, code, note: '' });
    }
    onUpdate({ ...data, shifts: newShifts });
  };

  const employees = filteredName
    ? data.employees.filter(e => e.name === filteredName)
    : data.employees;

  const days = [];
  for (let d = dayStart; d <= dayEnd; d++) days.push(d);

  return (
    <section className="month-card rise" style={{ animationDelay: `${0.08 * index}s` }}>
      <header className="month-head">
        <span className="month-dot" />
        <h2>{MONTHS[month - 1]} <span className="year">{year}</span></h2>
        <span className="month-meta">{employees.length} {employees.length === 1 ? 'person' : 'people'} · {daysInMonth} days</span>
      </header>

      <div className="month-note">
        Last updated <strong>{formatUpdated(data.updatedAt)}</strong> — may not reflect the latest rota changes.
      </div>

      {isMobile && weeks.length > 1 && (
        <div className="week-nav">
          <button
            className="week-btn"
            disabled={effWeek <= 0}
            onClick={() => setWeekIdx(Math.max(0, effWeek - 1))}
            aria-label="Previous week"
          >‹</button>
          <span className="week-label">
            Week {effWeek + 1} of {weeks.length} · {dayStart}–{dayEnd} {MONTHS_SHORT[month - 1]}
          </span>
          <button
            className="week-btn"
            disabled={effWeek >= weeks.length - 1}
            onClick={() => setWeekIdx(Math.min(weeks.length - 1, effWeek + 1))}
            aria-label="Next week"
          >›</button>
        </div>
      )}

      <div className="grid-wrap">
        <table className="rota-grid">
          <thead>
            <tr>
              <th className="name-col">Name</th>
              {days.map((day) => {
                const dow = (firstDay + day - 1) % 7;
                const weekend = dow === 0 || dow === 6;
                return (
                  <th key={day} className={weekend ? 'wknd' : ''}>
                    <span className="dnum">{day}</span>
                    <span className="dltr">{getDayLetter(dow)}</span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {employees.map((emp) => (
              <tr key={emp.id}>
                <td className="name-col">
                  <span className="emp-name">{emp.name}</span>
                  <span className="emp-team">{emp.team}</span>
                </td>
                {days.map((day) => {
                  const dow = (firstDay + day - 1) % 7;
                  const weekend = dow === 0 || dow === 6;
                  const shift = getShift(emp.id, day);
                  const cellKey = `${emp.id}-${day}`;
                  const isEditing = editingCell === cellKey;
                  const meta = shift ? SHIFT_META[shift.code] : null;

                  return (
                    <td
                      key={day}
                      className={`cell ${weekend ? 'wknd' : ''} ${canEdit ? '' : 'readonly'}`}
                      onClick={() => {
                        if (!canEdit) return;
                        setEditingCell(cellKey);
                        setEditValue(shift?.code || '');
                      }}
                    >
                      {isEditing ? (
                        <input
                          autoFocus
                          className="cell-input"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value.toUpperCase())}
                          onBlur={() => { updateShift(emp.id, day, editValue); setEditingCell(null); }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') { updateShift(emp.id, day, editValue); setEditingCell(null); }
                            if (e.key === 'Escape') setEditingCell(null);
                          }}
                        />
                      ) : shift ? (
                        <span
                          className="chip"
                          style={{ background: meta ? meta.color : 'var(--chip-fallback)' }}
                          title={meta ? meta.label : shift.code}
                        >
                          {shift.code}
                        </span>
                      ) : (
                        <span className="empty">·</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function RotaApp() {
  /* localStorage acts as an offline cache; Supabase is the source of truth */
  const [months, setMonths] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) { return []; }
  });
  const [theme, setTheme] = useState(() => {
    const t = localStorage.getItem(THEME_KEY);
    return t === 'light' || t === 'dark' ? t : 'dark';
  });
  const [htmlInput, setHtmlInput] = useState('');
  const [view, setView] = useState('view'); // 'view' | 'add'
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [filteredName, setFilteredName] = useState('');
  const [sync, setSync] = useState('loading'); // loading | synced | saving | offline
  const saveTimers = useRef({});

  /* ---------- Admin auth (client-side gate) ---------- */
  const [isAdmin, setIsAdmin] = useState(() => localStorage.getItem('vf-admin') === '1');
  const [showLogin, setShowLogin] = useState(false);
  const [loginU, setLoginU] = useState('');
  const [loginP, setLoginP] = useState('');
  const [loginErr, setLoginErr] = useState('');

  const doLogin = () => {
    if (loginU.trim().toLowerCase() === 'admin' && loginP === 'bisheslimbu') {
      setIsAdmin(true);
      localStorage.setItem('vf-admin', '1');
      setShowLogin(false); setLoginU(''); setLoginP(''); setLoginErr('');
      showToast('Signed in as admin');
    } else {
      setLoginErr('Incorrect username or password.');
    }
  };
  const doLogout = () => {
    setIsAdmin(false);
    localStorage.removeItem('vf-admin');
    if (view === 'add') setView('view');
    showToast('Signed out');
  };

  /* ---------- Mobile detection: week view under 768px ---------- */
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const onChange = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  /* ---------- Import backup file (admin only) ---------- */
  const fileRef = useRef(null);
  const handleImportFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed) || parsed.some(m =>
        !m.month || !m.year || !Array.isArray(m.employees) || !Array.isArray(m.shifts)
      )) throw new Error('Not a valid rota backup file.');

      const stamped = parsed.map(m => ({ ...m, updatedAt: m.updatedAt || new Date().toISOString() }));

      /* merge: imported months overwrite same-id months, others kept */
      setMonths(prev => {
        const map = new Map(prev.map(m => [monthId(m.month, m.year), m]));
        stamped.forEach(m => map.set(monthId(m.month, m.year), m));
        return Array.from(map.values());
      });

      setSync('saving');
      const { error: err } = await supabase.from('rota_months').upsert(
        stamped.map(m => ({
          id: monthId(m.month, m.year),
          month: m.month,
          year: m.year,
          data: { employees: m.employees, shifts: m.shifts },
          updated_at: m.updatedAt
        }))
      );
      if (err) throw err;
      setSync('synced');
      showToast(`Imported ${stamped.length} month${stamped.length === 1 ? '' : 's'}`);
    } catch (e2) {
      console.error('Import failed:', e2);
      showToast('Import failed — check the file');
      setSync('offline');
    }
  };

  useEffect(() => { document.title = 'Verifone Rota'; }, []);

  /* ---------- Initial load from Supabase (with one-time migration) ---------- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: rows, error: err } = await supabase
          .from('rota_months')
          .select('*')
          .order('year', { ascending: true })
          .order('month', { ascending: true });
        if (err) throw err;
        if (cancelled) return;

        if (rows.length === 0) {
          /* Cloud is empty — migrate whatever this browser already has */
          const local = (() => {
            try {
              const saved = localStorage.getItem(STORAGE_KEY);
              const parsed = saved ? JSON.parse(saved) : [];
              return Array.isArray(parsed) ? parsed : [];
            } catch (e) { return []; }
          })();
          if (local.length > 0) {
            const { error: upErr } = await supabase.from('rota_months').upsert(
              local.map(m => ({
                id: monthId(m.month, m.year),
                month: m.month,
                year: m.year,
                data: { employees: m.employees, shifts: m.shifts },
                updated_at: new Date().toISOString()
              }))
            );
            if (upErr) throw upErr;
            if (!cancelled) { setMonths(local); setSync('synced'); setToast('Local months uploaded to cloud'); setTimeout(() => setToast(''), 2600); }
          } else {
            setSync('synced');
          }
        } else {
          const loaded = rows.map(r => ({
            month: r.month,
            year: r.year,
            employees: r.data.employees || [],
            shifts: r.data.shifts || [],
            updatedAt: r.updated_at
          }));
          setMonths(loaded);
          setSync('synced');
        }
      } catch (e) {
        console.error('Supabase load failed, using local cache:', e);
        if (!cancelled) setSync('offline');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /* ---------- Cache locally on every change ---------- */
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(months)); } catch (e) {}
  }, [months]);

  useEffect(() => {
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  /* ---------- Cloud writes ---------- */
  const pushMonth = async (m) => {
    setSync('saving');
    try {
      const { error: err } = await supabase.from('rota_months').upsert({
        id: monthId(m.month, m.year),
        month: m.month,
        year: m.year,
        data: { employees: m.employees, shifts: m.shifts },
        updated_at: m.updatedAt || new Date().toISOString()
      });
      if (err) throw err;
      setSync('synced');
    } catch (e) {
      console.error('Cloud save failed:', e);
      setSync('offline');
    }
  };

  const pushMonthDebounced = (m) => {
    const id = monthId(m.month, m.year);
    clearTimeout(saveTimers.current[id]);
    saveTimers.current[id] = setTimeout(() => pushMonth(m), 700);
  };

  const removeMonthCloud = async (m, y) => {
    setSync('saving');
    try {
      const { error: err } = await supabase.from('rota_months').delete().eq('id', monthId(m, y));
      if (err) throw err;
      setSync('synced');
    } catch (e) {
      console.error('Cloud delete failed:', e);
      setSync('offline');
    }
  };

  const sortedMonths = [...months].sort((a, b) =>
    a.year === b.year ? a.month - b.month : a.year - b.year
  );

  /* ---------- Only the month AFTER the latest loaded month can be added ---------- */
  const nextSlot = sortedMonths.length
    ? (() => {
        const latest = sortedMonths[sortedMonths.length - 1];
        return latest.month === 12
          ? { month: 1, year: latest.year + 1 }
          : { month: latest.month + 1, year: latest.year };
      })()
    : null;

  const addMonth = nextSlot ? nextSlot.month : month;
  const addYear = nextSlot ? nextSlot.year : year;

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2600); };

  const handleParse = () => {
    setError('');
    try {
      const parsed = { ...parseHTMLTable(htmlInput, addMonth, addYear), updatedAt: new Date().toISOString() };
      setMonths(prev => [...prev, parsed]);
      pushMonth(parsed);
      setHtmlInput('');
      setView('view');
      showToast(`${MONTHS[addMonth - 1]} ${addYear} added`);
    } catch (err) {
      setError(err.message);
    }
  };

  const deleteMonth = (m, y) => {
    setMonths(months.filter(d => !(d.month === m && d.year === y)));
    removeMonthCloud(m, y);
    showToast(`${MONTHS[m - 1]} ${y} deleted`);
  };

  const updateMonthData = (m, y, newData) => {
    const stamped = { ...newData, updatedAt: new Date().toISOString() };
    setMonths(months.map(d => (d.month === m && d.year === y ? stamped : d)));
    pushMonthDebounced(stamped);
  };

  const allNames = (() => {
    const set = new Set();
    months.forEach(m => m.employees.forEach(e => set.add(e.name)));
    return Array.from(set).sort();
  })();

  const usedCodes = (() => {
    const set = new Set();
    months.forEach(m => m.shifts.forEach(s => set.add(s.code)));
    return Object.keys(SHIFT_META).filter(c => set.has(c));
  })();

  return (
    <div className="vf-root" data-theme={theme}>
      <style>{css}</style>

      <div className="ambient" aria-hidden="true">
        <span className="orb o1" /><span className="orb o2" /><span className="orb o3" />
      </div>

      {/* ---------- Header ---------- */}
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <VerifoneMark />
            <span className="wordmark">verifone</span>
            <span className="divider" />
            <span className="app-name">Rota</span>
          </div>

          <div className="top-actions">
            <span className={`sync-pill ${sync}`} title={
              sync === 'synced' ? 'All changes saved to cloud' :
              sync === 'saving' ? 'Saving to cloud…' :
              sync === 'loading' ? 'Loading from cloud…' :
              'Offline — changes saved on this device only'
            }>
              <span className="sync-dot" />
              {sync === 'synced' ? 'Synced' : sync === 'saving' ? 'Saving…' : sync === 'loading' ? 'Loading…' : 'Offline'}
            </span>
            <button
              className="icon-btn"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label="Toggle dark or light mode"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
              )}
            </button>
            {isAdmin && months.length > 0 && view === 'view' && (
              <button className="btn-primary" onClick={() => { setError(''); setView('add'); }}>
                Add {MONTHS_SHORT[addMonth - 1]} {addYear}
              </button>
            )}
            {isAdmin ? (
              <button className="btn-ghost" onClick={doLogout}>Sign out</button>
            ) : (
              <button className="btn-ghost" onClick={() => { setLoginErr(''); setShowLogin(true); }}>Admin</button>
            )}
          </div>
        </div>
      </header>

      {/* ---------- Empty state hero ---------- */}
      {months.length === 0 && view === 'view' && (
        <main className="page">
          <div className="hero rise">
            <VerifoneMark size={72} />
            <h1>Your rota,<br />beautifully simple.</h1>
            <p>Paste your schedule once. View every month, filter to your name — synced to every device.</p>
            {isAdmin ? (
              <button className="btn-primary lg" onClick={() => setView('add')}>Add your first month</button>
            ) : (
              <p className="hero-hint">No rota loaded yet. Sign in as admin (top right) to add months.</p>
            )}
          </div>
        </main>
      )}

      {/* ---------- Add month ---------- */}
      {view === 'add' && isAdmin && (
        <main className="page">
          <div className="panel rise">
            <div className="panel-head">
              <h2>Add {MONTHS[addMonth - 1]} {addYear}</h2>
              {months.length > 0 && (
                <button className="btn-ghost" onClick={() => { setError(''); setView('view'); }}>Back to rota</button>
              )}
            </div>

            {nextSlot ? (
              <div className="notice info">
                Months are added in order. {MONTHS[addMonth - 1]} {addYear} is the next month after your latest loaded month.
                To reload an earlier month, delete it from the rota view first.
              </div>
            ) : (
              <div className="field-row">
                <div className="field">
                  <label>Month</label>
                  <select value={month} onChange={(e) => setMonth(parseInt(e.target.value))}>
                    {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Year</label>
                  <input type="number" value={year} onChange={(e) => setYear(parseInt(e.target.value))} />
                </div>
              </div>
            )}

            <div className="field">
              <label>Rota table HTML</label>
              <p className="hint">On the rota website: right-click the table → Inspect → right-click the <code>&lt;table&gt;</code> element → Copy → Copy element, then paste here.</p>
              <textarea
                value={htmlInput}
                onChange={(e) => setHtmlInput(e.target.value)}
                placeholder="<table> … </table>"
                spellCheck={false}
              />
            </div>

            <div className="panel-actions">
              <button className="btn-primary" onClick={handleParse} disabled={!htmlInput.trim()}>
                Parse and save
              </button>
            </div>

            {error && <div className="notice error">{error}</div>}
          </div>
        </main>
      )}

      {/* ---------- Rota view: snap-scrolls one month at a time ---------- */}
      {view === 'view' && months.length > 0 && (
        <main className="snap-container">
          <div className="page in-snap">
            <div className="controls rise">
              <div className="filter">
                <label htmlFor="empfilter">Show</label>
                <div className="select-wrap">
                  <select id="empfilter" value={filteredName} onChange={(e) => setFilteredName(e.target.value)}>
                    <option value="">Everyone</option>
                    {allNames.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                {filteredName && (
                  <button className="btn-ghost sm" onClick={() => setFilteredName('')}>Clear</button>
                )}
              </div>

              {isAdmin && (
                <div className="import-wrap">
                  <button className="btn-ghost sm" onClick={() => fileRef.current && fileRef.current.click()}>
                    ⬆ Import backup
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".json,.txt,application/json,text/plain"
                    style={{ display: 'none' }}
                    onChange={handleImportFile}
                  />
                </div>
              )}

              {usedCodes.length > 0 && (
                <div className="legend">
                  {usedCodes.map(code => (
                    <span className="legend-item" key={code}>
                      <span className="swatch" style={{ background: SHIFT_META[code].color }} />
                      {code} <em>{SHIFT_META[code].label}</em>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {sortedMonths.map((data, i) => (
              <div className="month-block" key={`${data.year}-${data.month}`}>
                {isAdmin && (
                  <div className="month-tools">
                    <button
                      className="btn-danger sm"
                      onClick={() => deleteMonth(data.month, data.year)}
                    >
                      Delete {MONTHS_SHORT[data.month - 1]} {data.year}
                    </button>
                  </div>
                )}
                <MonthCalendar
                  data={data}
                  month={data.month}
                  year={data.year}
                  index={i}
                  onUpdate={(updated) => updateMonthData(data.month, data.year, updated)}
                  filteredName={filteredName}
                  canEdit={isAdmin}
                  isMobile={isMobile}
                />
              </div>
            ))}

            <p className="footnote">
              {isAdmin
                ? 'Click any cell to edit a shift. Changes sync to the cloud automatically.'
                : 'Read-only view — sign in as admin to edit shifts.'}
            </p>
          </div>
        </main>
      )}

      {showLogin && (
        <div className="modal-backdrop" onClick={() => setShowLogin(false)}>
          <div className="modal rise" onClick={(e) => e.stopPropagation()}>
            <h3>Admin sign in</h3>
            <div className="field">
              <label>Username</label>
              <input autoFocus value={loginU} onChange={(e) => setLoginU(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') doLogin(); }} />
            </div>
            <div className="field">
              <label>Password</label>
              <input type="password" value={loginP} onChange={(e) => setLoginP(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') doLogin(); }} />
            </div>
            {loginErr && <div className="notice error">{loginErr}</div>}
            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setShowLogin(false)}>Cancel</button>
              <button className="btn-primary" onClick={doLogin}>Sign in</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

/* ================================================================
   Verifone design system — pure CSS, no framework required
   ================================================================ */
const css = `
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');

.vf-root {
  --mint: #6EFBCE;
  --mint-strong: #2FE3A5;
  --ink: #0B0F0D;
  --topbar-h: 67px;
  font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  min-height: 100vh;
  transition: background .35s ease, color .35s ease;
  letter-spacing: 0.01em;
}

.vf-root[data-theme='dark'] {
  --bg: #0A0E0D;
  --bg-soft: #0F1513;
  --surface: #121917;
  --surface-2: #17201D;
  --text: #F2F7F5;
  --text-dim: #93A39C;
  --line: rgba(255,255,255,0.07);
  --line-strong: rgba(255,255,255,0.13);
  --chip-fallback: #3A4642;
  --shadow: 0 12px 40px rgba(0,0,0,0.45);
  --glass: rgba(10,14,13,0.72);
}

.vf-root[data-theme='light'] {
  --bg: #F7FAF9;
  --bg-soft: #EFF5F2;
  --surface: #FFFFFF;
  --surface-2: #F2F7F5;
  --text: #0B0F0D;
  --text-dim: #5E6B66;
  --line: rgba(11,15,13,0.08);
  --line-strong: rgba(11,15,13,0.16);
  --chip-fallback: #D5DEDA;
  --shadow: 0 12px 36px rgba(11,15,13,0.08);
  --glass: rgba(255,255,255,0.78);
}

.vf-root { background: var(--bg); color: var(--text); }

*, *::before, *::after { box-sizing: border-box; }

/* ---------- ambient orbs ---------- */
.ambient { position: fixed; inset: 0; pointer-events: none; z-index: 0; overflow: hidden; }
.orb { position: absolute; border-radius: 50%; filter: blur(90px); opacity: .16; background: var(--mint); }
.o1 { width: 480px; height: 480px; top: -180px; right: -120px; animation: drift 16s ease-in-out infinite; }
.o2 { width: 380px; height: 380px; bottom: -160px; left: -140px; animation: drift 22s ease-in-out infinite reverse; }
.o3 { width: 220px; height: 220px; top: 40%; left: 55%; opacity: .08; animation: drift 28s ease-in-out infinite; }
@keyframes drift {
  0%, 100% { transform: translate(0,0) scale(1); }
  50% { transform: translate(-36px, 28px) scale(1.06); }
}

/* ---------- logo ---------- */
.vf-mark .vf-dot { fill: currentColor; }
.vf-mark { color: var(--text); display: block; }
.hero .vf-mark { color: var(--mint-strong); margin: 0 auto; animation: breathe 4.5s ease-in-out infinite; }
@keyframes breathe {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.06); }
}

/* ---------- header ---------- */
.topbar {
  position: sticky; top: 0; z-index: 50;
  backdrop-filter: blur(18px) saturate(1.4);
  -webkit-backdrop-filter: blur(18px) saturate(1.4);
  background: var(--glass);
  border-bottom: 1px solid var(--line);
}
.topbar-inner {
  max-width: 1440px; margin: 0 auto; padding: 14px 28px;
  display: flex; align-items: center; justify-content: space-between;
}
.brand { display: flex; align-items: center; gap: 12px; }
.wordmark { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; }
.divider { width: 1px; height: 22px; background: var(--line-strong); }
.app-name { font-size: 15px; font-weight: 500; color: var(--text-dim); letter-spacing: .14em; text-transform: uppercase; }
.top-actions { display: flex; align-items: center; gap: 10px; }

/* ---------- sync status ---------- */
.sync-pill {
  display: inline-flex; align-items: center; gap: 7px;
  font-size: 12px; font-weight: 600; color: var(--text-dim);
  padding: 7px 14px; border: 1px solid var(--line-strong); border-radius: 999px;
  user-select: none;
}
.sync-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--text-dim); }
.sync-pill.synced .sync-dot { background: var(--mint-strong); box-shadow: 0 0 8px rgba(46,227,165,0.7); }
.sync-pill.saving .sync-dot { background: #FFA94F; animation: blink 1s ease-in-out infinite; }
.sync-pill.loading .sync-dot { background: #4FB8FF; animation: blink 1s ease-in-out infinite; }
.sync-pill.offline .sync-dot { background: #FF6B5E; }
@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }

/* ---------- buttons ---------- */
.btn-primary {
  font-family: inherit; font-size: 14px; font-weight: 600;
  color: var(--ink); background: var(--mint);
  border: none; border-radius: 999px; padding: 10px 22px; cursor: pointer;
  transition: transform .18s ease, box-shadow .18s ease, background .18s ease;
  box-shadow: 0 4px 20px rgba(46,227,165,0.25);
}
.btn-primary:hover:not(:disabled) { transform: translateY(-1px); background: var(--mint-strong); box-shadow: 0 8px 28px rgba(46,227,165,0.35); }
.btn-primary:active:not(:disabled) { transform: translateY(0); }
.btn-primary:disabled { opacity: .4; cursor: not-allowed; box-shadow: none; }
.btn-primary.lg { padding: 14px 32px; font-size: 16px; }

.btn-ghost {
  font-family: inherit; font-size: 14px; font-weight: 500;
  color: var(--text-dim); background: transparent;
  border: 1px solid var(--line-strong); border-radius: 999px;
  padding: 9px 18px; cursor: pointer; transition: all .18s ease;
}
.btn-ghost:hover { color: var(--text); border-color: var(--text-dim); }
.btn-ghost.sm { padding: 6px 14px; font-size: 13px; }

.btn-danger {
  font-family: inherit; font-weight: 500; cursor: pointer;
  color: #FF6B5E; background: transparent;
  border: 1px solid rgba(255,107,94,0.35); border-radius: 999px;
  transition: all .18s ease;
}
.btn-danger:hover { background: rgba(255,107,94,0.1); border-color: #FF6B5E; }
.btn-danger.sm { padding: 6px 14px; font-size: 13px; }

.icon-btn {
  width: 38px; height: 38px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: transparent; color: var(--text);
  border: 1px solid var(--line-strong); cursor: pointer;
  transition: all .18s ease;
}
.icon-btn:hover { border-color: var(--mint-strong); color: var(--mint-strong); transform: rotate(12deg); }

/* ---------- layout ---------- */
.page { max-width: 1440px; margin: 0 auto; padding: 36px 28px 80px; position: relative; z-index: 1; }

/* ---------- snap scrolling: one month per scroll stop ---------- */
.snap-container {
  height: calc(100vh - var(--topbar-h));
  overflow-y: auto;
  scroll-snap-type: y proximity;
  scroll-padding-top: 12px;
  position: relative; z-index: 1;
}
.page.in-snap { padding-bottom: 40px; }
.controls {
  scroll-snap-align: start;
}
.month-block {
  scroll-snap-align: start;
  padding-top: 12px;
}

/* ---------- hero ---------- */
.hero { text-align: center; padding: 100px 20px 60px; }
.hero h1 {
  font-size: clamp(40px, 6vw, 68px); font-weight: 800;
  letter-spacing: -0.03em; line-height: 1.05; margin: 28px 0 18px;
}
.hero p { font-size: 17px; color: var(--text-dim); max-width: 460px; margin: 0 auto 36px; line-height: 1.6; font-weight: 400; }

/* ---------- panels ---------- */
.panel {
  background: var(--surface); border: 1px solid var(--line);
  border-radius: 20px; padding: 32px; max-width: 760px; margin: 0 auto;
  box-shadow: var(--shadow);
}
.panel-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; }
.panel-head h2 { margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.02em; }
.panel-actions { margin-top: 20px; }

.field { margin-bottom: 18px; }
.field-row { display: flex; gap: 16px; margin-bottom: 4px; }
.field-row .field { flex: 1; }
.field label { display: block; font-size: 13px; font-weight: 600; color: var(--text-dim); margin-bottom: 8px; letter-spacing: .04em; text-transform: uppercase; }
.hint { font-size: 13px; color: var(--text-dim); margin: 0 0 10px; line-height: 1.5; }
.hint code { background: var(--surface-2); padding: 1px 6px; border-radius: 5px; font-size: 12px; }

.field select, .field input, .field textarea {
  width: 100%; font-family: inherit; font-size: 15px;
  color: var(--text); background: var(--surface-2);
  border: 1px solid var(--line-strong); border-radius: 12px;
  padding: 12px 14px; outline: none; transition: border .18s ease, box-shadow .18s ease;
}
.field select:focus, .field input:focus, .field textarea:focus {
  border-color: var(--mint-strong); box-shadow: 0 0 0 3px rgba(46,227,165,0.18);
}
.field textarea { min-height: 170px; font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 12.5px; resize: vertical; line-height: 1.5; }

.notice { margin-top: 16px; padding: 13px 16px; border-radius: 12px; font-size: 14px; line-height: 1.5; }
.notice.error { background: rgba(255,107,94,0.1); border: 1px solid rgba(255,107,94,0.3); color: #FF8A80; }
.notice.warn { background: rgba(255,169,79,0.1); border: 1px solid rgba(255,169,79,0.3); color: #FFB870; margin-bottom: 16px; }
.notice.info { background: rgba(46,227,165,0.08); border: 1px solid rgba(46,227,165,0.25); color: var(--text-dim); margin: 0 0 20px; }

/* ---------- controls ---------- */
.controls {
  display: flex; flex-wrap: wrap; align-items: center; gap: 18px;
  background: var(--surface); border: 1px solid var(--line);
  border-radius: 16px; padding: 16px 20px; margin-bottom: 28px;
  box-shadow: var(--shadow);
}
.filter { display: flex; align-items: center; gap: 12px; }
.filter label { font-size: 13px; font-weight: 600; color: var(--text-dim); text-transform: uppercase; letter-spacing: .06em; }
.select-wrap select {
  font-family: inherit; font-size: 14px; font-weight: 500;
  color: var(--text); background: var(--surface-2);
  border: 1px solid var(--line-strong); border-radius: 999px;
  padding: 9px 36px 9px 16px; cursor: pointer; outline: none;
  appearance: none; -webkit-appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%2393A39C' stroke-width='1.6' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat; background-position: right 14px center;
  transition: border .18s ease;
}
.select-wrap select:focus { border-color: var(--mint-strong); }

.legend { display: flex; flex-wrap: wrap; gap: 10px 16px; margin-left: auto; }
.legend-item { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: var(--text-dim); }
.legend-item em { font-style: normal; font-weight: 400; }
.swatch { width: 12px; height: 12px; border-radius: 4px; display: inline-block; }

/* ---------- month cards ---------- */
.month-tools { display: flex; justify-content: flex-end; margin-bottom: 8px; }

.month-card {
  background: var(--surface); border: 1px solid var(--line);
  border-radius: 20px; overflow: hidden; margin-bottom: 40px;
  box-shadow: var(--shadow);
  transition: transform .25s ease, box-shadow .25s ease;
}
.month-card:hover { transform: translateY(-2px); }

.month-head {
  display: flex; align-items: baseline; gap: 14px;
  padding: 20px 24px 16px; border-bottom: 1px solid var(--line);
}
.month-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--mint-strong); align-self: center; box-shadow: 0 0 12px rgba(46,227,165,0.6); }
.month-head h2 { margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.02em; }
.month-head .year { color: var(--text-dim); font-weight: 400; }
.month-meta { margin-left: auto; font-size: 13px; color: var(--text-dim); }

.grid-wrap { overflow-x: auto; }

.rota-grid { width: 100%; border-collapse: collapse; table-layout: fixed; }
.rota-grid th, .rota-grid td { text-align: center; }

.rota-grid thead th {
  padding: 10px 0 8px; font-size: 11px; font-weight: 600; color: var(--text-dim);
  border-bottom: 1px solid var(--line); background: var(--surface-2);
}
.rota-grid thead th .dnum { display: block; font-size: 12px; font-weight: 700; color: var(--text); }
.rota-grid thead th .dltr { display: block; font-size: 9px; margin-top: 1px; letter-spacing: .05em; }

.name-col {
  width: 148px; min-width: 148px; text-align: left !important;
  padding: 8px 14px !important; position: sticky; left: 0; z-index: 2;
  background: var(--surface);
}
thead .name-col { background: var(--surface-2); font-size: 11px; text-transform: uppercase; letter-spacing: .08em; }
.emp-name { display: block; font-size: 12.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.emp-team { display: block; font-size: 10px; color: var(--text-dim); margin-top: 1px; }

.rota-grid tbody tr { border-bottom: 1px solid var(--line); transition: background .12s ease; }
.rota-grid tbody tr:hover { background: var(--surface-2); }
.rota-grid tbody tr:hover .name-col { background: var(--surface-2); }
.rota-grid tbody tr:last-child { border-bottom: none; }

.cell { padding: 5px 1px; cursor: pointer; }
.cell.wknd, thead th.wknd { background: var(--bg-soft); }
tr:hover .cell.wknd { background: var(--surface-2); }

.chip {
  display: inline-block; min-width: 24px; padding: 3px 5px;
  border-radius: 7px; font-size: 10.5px; font-weight: 700; color: var(--ink);
  transition: transform .14s ease, box-shadow .14s ease;
}
.cell:hover .chip { transform: scale(1.14); box-shadow: 0 3px 10px rgba(0,0,0,0.25); }

.empty { color: var(--line-strong); font-size: 12px; }

.cell-input {
  width: 34px; padding: 3px 2px; text-align: center;
  font-family: inherit; font-size: 11px; font-weight: 700;
  color: var(--text); background: var(--surface-2);
  border: 1.5px solid var(--mint-strong); border-radius: 7px; outline: none;
}

.footnote { text-align: center; font-size: 13px; color: var(--text-dim); margin-top: 8px; }

/* ---------- month note (disclaimer) ---------- */
.month-note {
  padding: 9px 24px; font-size: 12px; color: var(--text-dim);
  background: var(--surface-2); border-bottom: 1px solid var(--line);
}
.month-note strong { color: var(--text); font-weight: 600; }

/* ---------- week navigation (mobile) ---------- */
.week-nav {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 10px 16px; border-bottom: 1px solid var(--line);
}
.week-label { font-size: 13px; font-weight: 600; color: var(--text-dim); }
.week-btn {
  width: 34px; height: 34px; border-radius: 50%;
  font-size: 20px; line-height: 1; font-family: inherit;
  display: flex; align-items: center; justify-content: center;
  background: var(--surface-2); color: var(--text);
  border: 1px solid var(--line-strong); cursor: pointer;
  transition: all .18s ease;
}
.week-btn:hover:not(:disabled) { border-color: var(--mint-strong); color: var(--mint-strong); }
.week-btn:disabled { opacity: .3; cursor: default; }

/* ---------- login modal ---------- */
.modal-backdrop {
  position: fixed; inset: 0; z-index: 80;
  background: rgba(0,0,0,0.5);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  display: flex; align-items: center; justify-content: center; padding: 20px;
}
.modal {
  background: var(--surface); border: 1px solid var(--line);
  border-radius: 20px; padding: 28px; width: 100%; max-width: 380px;
  box-shadow: var(--shadow);
}
.modal h3 { margin: 0 0 20px; font-size: 20px; font-weight: 700; letter-spacing: -0.02em; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }

.hero-hint { font-size: 14px !important; opacity: .85; }

.cell.readonly { cursor: default; }

/* ---------- toast ---------- */
.toast {
  position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%);
  background: var(--text); color: var(--bg);
  font-size: 14px; font-weight: 600; padding: 12px 24px; border-radius: 999px;
  box-shadow: 0 10px 36px rgba(0,0,0,0.3); z-index: 100;
  animation: toast-in .3s cubic-bezier(.2,.9,.3,1.2);
}
@keyframes toast-in {
  from { opacity: 0; transform: translate(-50%, 14px); }
  to   { opacity: 1; transform: translate(-50%, 0); }
}

/* ---------- entrance animation ---------- */
.rise { animation: rise .55s cubic-bezier(.2,.7,.3,1) both; }
@keyframes rise {
  from { opacity: 0; transform: translateY(18px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* ---------- responsive ---------- */
@media (max-width: 900px) {
  .page { padding: 24px 14px 60px; }
  .topbar-inner { padding: 12px 16px; }
  .wordmark { font-size: 19px; }
  .legend { margin-left: 0; }
  .name-col { width: 110px; min-width: 110px; }
  .rota-grid { table-layout: auto; }
  .cell { min-width: 30px; }
}

@media (max-width: 768px) {
  .app-name { display: none; }
  .divider { display: none; }
  .sync-pill { padding: 7px 10px; }
  .btn-primary { padding: 9px 14px; font-size: 13px; }
  .btn-ghost { padding: 8px 12px; font-size: 13px; }
  .month-head { padding: 16px 16px 12px; flex-wrap: wrap; }
  .month-meta { width: 100%; margin-left: 24px; }
  .month-note { padding: 8px 16px; }
  .name-col { width: 96px; min-width: 96px; }
  .cell { min-width: 36px; padding: 6px 2px; }
  .chip { font-size: 11px; min-width: 26px; padding: 3px 5px; }
  .rota-grid { table-layout: fixed; }
  .legend-item em { display: none; }
  .hero { padding: 60px 12px 40px; }
  .controls { padding: 12px 14px; gap: 12px; }
  .import-wrap { margin-left: auto; }
}

/* ---------- reduced motion ---------- */
@media (prefers-reduced-motion: reduce) {
  .rise, .orb, .hero .vf-mark, .toast { animation: none !important; }
  .month-card, .btn-primary, .icon-btn, .chip { transition: none !important; }
  .snap-container { scroll-snap-type: none; }
}
`;
