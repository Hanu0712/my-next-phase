import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://vmmdwnysvkwufyvixxbs.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_GgsFQg22NYOgtVtgzKgsDw_RlT9B0b4";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false },
});

const KEYS = ["np3-ent", "np3-todos", "np3-slogan", "np3-fpages", "np3-ipages", "np3-paid"];

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

// Merge cloud and local data without losing entries.
// - ent (object keyed by date): union, prefer the side with more content per date
// - fpages/ipages/todos (arrays with id): union by id
// - slogan/paid (primitives): prefer non-empty local, else cloud
export function mergeData(local, cloud) {
  const merged = {};
  const safeParse = (s, fallback) => { try { return s == null ? fallback : JSON.parse(s); } catch { return fallback; } };

  // ent
  const le = safeParse(local["np3-ent"], {});
  const ce = safeParse(cloud["np3-ent"], {});
  const ent = { ...ce };
  for (const k of Object.keys(le)) {
    const lv = le[k], cv = ce[k];
    if (!cv) { ent[k] = lv; continue; }
    // Score by sum of text length + todos count + media count
    const score = e => (e.diary || "").length + (e.note || "").length + ((e.todos || []).length * 30) + ((e.media || []).length * 50) + (e.weather ? 5 : 0);
    ent[k] = score(lv) >= score(cv) ? lv : cv;
  }
  merged["np3-ent"] = JSON.stringify(ent);

  // arrays by id
  const mergeArr = (key) => {
    const la = safeParse(local[key], []);
    const ca = safeParse(cloud[key], []);
    const map = new Map();
    for (const it of ca) if (it && it.id != null) map.set(it.id, it);
    for (const it of la) if (it && it.id != null) {
      const existing = map.get(it.id);
      if (!existing) { map.set(it.id, it); continue; }
      // Choose the one with more content
      const lt = (it.text || "").length + (it.t || "").length;
      const et = (existing.text || "").length + (existing.t || "").length;
      map.set(it.id, lt >= et ? it : existing);
    }
    merged[key] = JSON.stringify([...map.values()]);
  };
  mergeArr("np3-fpages");
  mergeArr("np3-ipages");
  mergeArr("np3-todos");

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
