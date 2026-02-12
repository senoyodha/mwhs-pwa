// /api/send-today.js
// Runs every minute via Vercel Cron to send Adhan push notifications at exact HH:MM (Europe/London)

import webpush from "web-push";
import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { getAllSubs, removeSub } from "./_store.js";

// ---- CONFIG ----
const TZ = "Europe/London";
const PRAYER_ORDER = ["fajr", "dhuhr", "asr", "maghrib", "isha"];

// Configure web-push from env
webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VITE_VAPID_PUBLIC_KEY, // public
  process.env.VAPID_PRIVATE_KEY      // private
);

// Resolve path to src/data/timetable.json regardless of where the function runs
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TIMETABLE_PATH = path.join(__dirname, "..", "src", "data", "timetable.json");

// ---- UTILITIES ----
function getTodayISO(base = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(base);
  const y = parts.find(p => p.type === "year").value;
  const m = parts.find(p => p.type === "month").value;
  const d = parts.find(p => p.type === "day").value;
  return `${y}-${m}-${d}`;
}

function getHHMM(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false
  }).formatToParts(date);
  const h = parts.find(p => p.type === "hour").value;
  const m = parts.find(p => p.type === "minute").value;
  return `${h}:${m}`;
}

function normalizeTime(t) {
  return String(t).replace(/[;.\-]/g, ":").replace(/\s+/g, "");
}

// Break into small chunks to avoid spikes
function chunk(arr, size = 1000) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ---- MAIN HANDLER ----
export default async function handler(req, res) {
  // 1) Authorize (Vercel Cron adds Authorization: Bearer <CRON_SECRET>)
  const headerAuth =
    (req.headers && (req.headers.authorization || req.headers.Authorization)) ||
    (typeof req.headers?.get === "function" ? req.headers.get("authorization") : null);

  if (!process.env.CRON_SECRET || headerAuth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).end("Unauthorized");
  }

  // 2) Load timetable
  let timetable;
  try {
    const raw = await readFile(TIMETABLE_PATH, "utf-8");
    timetable = JSON.parse(raw);
  } catch (e) {
    console.error("Failed to read timetable.json:", e);
    return res.status(500).json({ ok: false, error: "timetable-read-failed" });
  }

  // 3) Determine today's entry (Europe/London)
  const now = new Date();
  const todayISO = getTodayISO(now);
  const today = timetable?.days?.find?.((d) => d.date === todayISO);

  if (!today) {
    return res.status(200).json({ ok: false, error: "no-timetable-for-today", todayISO });
  }

  // 4) Compare current HH:MM to today's adhan times
  const nowHHMM = getHHMM(now);
  const matched = [];

  for (const key of PRAYER_ORDER) {
    const t = today[key];
    if (!t) continue;
    const norm = normalizeTime(t).slice(0, 5); // HH:MM
    if (norm === nowHHMM) matched.push(key);
  }

  // If no prayer at this minute, exit gracefully
  if (matched.length === 0) {
    return res.status(200).json({ ok: true, sent: 0, matched, at: nowHHMM, todayISO });
  }

  // 5) Build push payload and send to all subs
  const subs = getAllSubs();
  if (!subs || subs.length === 0) {
    return res.status(200).json({ ok: true, sent: 0, matched, at: nowHHMM, todayISO, note: "no-subs" });
  }

  // For multiple matches (edge case), send the first; or include all in title
  const primary = matched[0];
  const title = `Adhan — ${primary.charAt(0).toUpperCase() + primary.slice(1)}`;
  const body = `It's time for ${primary.charAt(0).toUpperCase() + primary.slice(1)}.`;

  const payload = JSON.stringify({
    title,
    body,
    data: { url: "/" } // you can deep-link later
  });

  let sent = 0;
  let removed = 0;

  try {
    for (const group of chunk(subs, 1000)) {
      const results = await Promise.allSettled(
        group.map((sub) => webpush.sendNotification(sub, payload))
      );

      results.forEach((r, idx) => {
        if (r.status === "fulfilled") {
          sent += 1;
        } else {
          const err = r.reason;
          // 404/410 => subscription is gone; remove it
          if (err && (err.statusCode === 404 || err.statusCode === 410)) {
            removeSub(group[idx]);
            removed += 1;
          } else {
            // Log others but keep subscription for now
            console.warn("push-failed", err?.statusCode || "", err?.body || "");
          }
        }
      });
    }
  } catch (e) {
    console.error("Batch push failed:", e);
  }

  return res.status(200).json({
    ok: true,
    sent,
    removed,
    matched,
    at: nowHHMM,
    todayISO
  });
}