import { createClient } from "@supabase/supabase-js";

// ── IndexedDB: 写真専用ストレージ（容量無制限）──
const IDB_NAME = "np3";
const IDB_STORE = "photos";
function openIDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = e => {
      if (!e.target.result.objectStoreNames.contains(IDB_STORE))
        e.target.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = e => res(e.target.result);
    req.onerror = () => rej(req.error);
  });
}
export async function idbPut(id, data) {
  try {
    const db = await openIDB();
    await new Promise((res, rej) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(data, String(id));
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
    return true;
  } catch { return false; }
}
export async function idbGet(id) {
  try {
    const db = await openIDB();
    return await new Promise((res, rej) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(String(id));
      req.onsuccess = () => res(req.result || null);
      req.onerror = () => rej(req.error);
    });
  } catch { return null; }
}
export async function idbDel(id) {
  try {
    const db = await openIDB();
    await new Promise((res, rej) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).delete(String(id));
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
    return true;
  } catch { return false; }
}

const SUPABASE_URL = "https://vmmdwnysvkwufyvixxbs.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_GgsFQg22NYOgtVtgzKgsDw_RlT9B0b4";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false },
});

const KEYS = ["np3-ent", "np3-todos", "np3-slogan", "np3-fpages", "np3-ipages", "np3-paid", "np3-vboard"];

export function makeSyncCode() {
  const r = (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID().replace(/-/g, "")
    : Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  const s = r.slice(0, 16).toLowerCase();
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}`;
}

export function readLocalData() {
  const data = {};
  KEYS.forEach(k => {
    const v = localStorage.getItem(k);
    if (v !== null) data[k] = v;
  });
  return data;
}

export function writeLocalData(data) {
  KEYS.forEach(k => {
    if (data[k] != null) localStorage.setItem(k, data[k]);
  });
}

// クラウド送信用：IndexedDBから写真データを含めたフルデータを返す
export async function readLocalDataFull() {
  const data = readLocalData();
  try {
    const ent = JSON.parse(data["np3-ent"] || "{}");
    let changed = false;
    for (const date of Object.keys(ent)) {
      for (const m of (ent[date].media || [])) {
        if (m.type === "image" && !m.data) {
          const d = await idbGet(String(m.id));
          if (d) { m.data = d; changed = true; }
        }
      }
    }
    if (changed) data["np3-ent"] = JSON.stringify(ent);
  } catch {}
  return data;
}

// クラウドから受け取ったデータの写真をIndexedDBに保存し、localStorageには写真なしで書き込む
export async function writeDataWithPhotos(data) {
  try {
    const ent = JSON.parse(data["np3-ent"] || "{}");
    for (const date of Object.keys(ent)) {
      const media = ent[date].media || [];
      for (const m of media) {
        if (m.type === "image" && m.data) {
          await idbPut(String(m.id), m.data);
          delete m.data; // localStorageには画像データを入れない
        }
      }
    }
    data["np3-ent"] = JSON.stringify(ent);
  } catch {}
  writeLocalData(data);
}

// Merge cloud and local data without losing entries.
// - ent (object keyed by date): union, prefer the side with more content per date
// - fpages/ipages/todos (arrays with id): union by id
// - slogan/paid (primitives): prefer non-empty local, else cloud
export function mergeData(local, cloud) {
  const merged = {};
  const safeParse = (s, fallback) => { try { return s == null ? fallback : JSON.parse(s); } catch { return fallback; } };

  // Union two media arrays by id (preserve photos from both sides)
  const unionMedia = (a, b) => {
    const m = new Map();
    for (const x of (a || [])) if (x && x.id != null) m.set(String(x.id), x);
    for (const x of (b || [])) if (x && x.id != null) m.set(String(x.id), x);
    return [...m.values()];
  };
  // Union todos by id, prefer item with more text or done state
  const unionTodos = (a, b) => {
    const m = new Map();
    const put = (x) => {
      if (!x || x.id == null) return;
      const k = String(x.id);
      const prev = m.get(k);
      if (!prev) { m.set(k, x); return; }
      const lt = (x.t || "").length, pt = (prev.t || "").length;
      m.set(k, lt >= pt ? { ...x, d: x.d || prev.d } : { ...prev, d: prev.d || x.d });
    };
    for (const x of (a || [])) put(x);
    for (const x of (b || [])) put(x);
    return [...m.values()];
  };

  // ent: merge per-date, picking winner by content score BUT unioning media + todos
  const le = safeParse(local["np3-ent"], {});
  const ce = safeParse(cloud["np3-ent"], {});
  const ent = {};
  const dates = new Set([...Object.keys(le), ...Object.keys(ce)]);
  const score = e => (e.diary || "").length + (e.note || "").length + ((e.todos || []).length * 30) + ((e.media || []).length * 50) + (e.weather ? 5 : 0);
  for (const k of dates) {
    const lv = le[k], cv = ce[k];
    if (!lv) { ent[k] = cv; continue; }
    if (!cv) { ent[k] = lv; continue; }
    const winner = score(lv) >= score(cv) ? lv : cv;
    ent[k] = {
      ...winner,
      media: unionMedia(lv.media, cv.media),
      todos: unionTodos(lv.todos, cv.todos),
    };
  }
  merged["np3-ent"] = JSON.stringify(ent);

  // arrays of pages by id (text wins by length; media unioned)
  const mergeArr = (key) => {
    const la = safeParse(local[key], []);
    const ca = safeParse(cloud[key], []);
    const map = new Map();
    const put = (x) => {
      if (!x || x.id == null) return;
      const k = String(x.id);
      const prev = map.get(k);
      if (!prev) { map.set(k, x); return; }
      const lt = (x.text || "").length;
      const pt = (prev.text || "").length;
      const winner = lt >= pt ? x : prev;
      map.set(k, { ...winner, media: unionMedia(x.media, prev.media) });
    };
    for (const it of ca) put(it);
    for (const it of la) put(it);
    merged[key] = JSON.stringify([...map.values()]);
  };
  mergeArr("np3-fpages");
  mergeArr("np3-ipages");
  mergeArr("np3-vboard");

  // todos array (top-level, separate from per-day todos)
  merged["np3-todos"] = JSON.stringify(unionTodos(safeParse(local["np3-todos"], []), safeParse(cloud["np3-todos"], [])));

  // slogan: prefer non-empty local
  const ls = local["np3-slogan"];
  const cs = cloud["np3-slogan"];
  merged["np3-slogan"] = (ls && ls.length) ? ls : (cs || "");

  // paid: prefer larger value (assume user counts down; safer to keep larger)
  const lp = local["np3-paid"];
  const cp = cloud["np3-paid"];
  if (lp != null || cp != null) {
    const lv = lp != null ? parseInt(lp) : null;
    const cv = cp != null ? parseInt(cp) : null;
    merged["np3-paid"] = String(lv != null && cv != null ? Math.max(lv, cv) : (lv != null ? lv : cv));
  }

  return merged;
}

export async function pullFromCloud(code) {
  if (!code) return { ok: false, reason: "no-code" };
  try {
    const { data, error } = await supabase
      .from("sync")
      .select("data, updated_at")
      .eq("code", code)
      .maybeSingle();
    if (error) return { ok: false, reason: error.message };
    if (!data) return { ok: true, empty: true };
    return { ok: true, data: data.data, updatedAt: data.updated_at };
  } catch (e) {
    return { ok: false, reason: String(e) };
  }
}

export async function pushToCloud(code, data) {
  if (!code) return { ok: false, reason: "no-code" };
  try {
    const { error } = await supabase
      .from("sync")
      .upsert({ code, data, updated_at: new Date().toISOString() }, { onConflict: "code" });
    if (error) return { ok: false, reason: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: String(e) };
  }
}
