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
