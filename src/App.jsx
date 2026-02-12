import React, { useEffect, useMemo, useRef, useState } from "react";
import timetable from "./data/timetable.json";
import logoUrl from "./assets/logo.png";

// ----------------------------------------
// SETTINGS
// ----------------------------------------
const TZ = "Europe/London";
const PRAYER_ORDER = ["fajr", "dhuhr", "asr", "maghrib", "isha"];

const ALERT_MODE_STORAGE_KEY = "mwhs_alert_mode"; // "adhan" | "notif" | "off"
const THEME_STORAGE_KEY = "mwhs_theme";          // "system" | "light" | "dark"

// Persisted key to remember if user installed from the browser previously
const INSTALLED_KNOWN_KEY = "mwhs_installed_known";

// ----------------------------------------
// TIME HELPERS
// ----------------------------------------
function normalizeTime(t) {
  if (!t) return null;
  return t.replace(/[;.\-]/g, ":").replace(/\s+/g, "");
}

function parseHMToDate(hm, refDate = new Date()) {
  hm = normalizeTime(hm);
  if (!hm) return null;

  const [H, M] = hm.split(":").map(Number);
  if (Number.isNaN(H) || Number.isNaN(M)) return null;

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(refDate);

  const y = parts.find((p) => p.type === "year").value;
  const m = parts.find((p) => p.type === "month").value;
  const d = parts.find((p) => p.type === "day").value;

  const dt = new Date(`${y}-${m}-${d}T00:00`);
  dt.setHours(H, M, 0, 0);
  return dt;
}

function getTodayISO() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);

  const y = parts.find((p) => p.type === "year").value;
  const m = parts.find((p) => p.type === "month").value;
  const d = parts.find((p) => p.type === "day").value;
  return `${y}-${m}-${d}`;
}

function formatGregorian(date = new Date()) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(date);
}

function formatHijri(date = new Date()) {
  return getHijriDate(date);
}

function formatClock(date = new Date()) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date);
}

function formatTime(t) {
  if (!t) return "-";
  const [h = "", m = ""] = normalizeTime(t).split(":");
  return `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
}

function getNextPrayer(todayTimes, now) {
  for (const key of PRAYER_ORDER) {
    const dt = parseHMToDate(todayTimes[key], now);
    if (dt && dt > now) return { key, time: todayTimes[key] };
  }
  return null;
}

function getPreviousPrayerTime(todayTimes, now) {
  let prev = null;
  for (const key of PRAYER_ORDER) {
    const dt = parseHMToDate(todayTimes[key], now);
    if (dt && dt <= now) prev = dt;
  }
  return prev;
}

function getCurrentPrayer(todayTimes, now) {
  let current = null;
  for (const key of PRAYER_ORDER) {
    const dt = parseHMToDate(todayTimes[key], now);
    if (dt && dt <= now) current = key;
  }
  // Fajr ends at shurooq
  const sh = parseHMToDate(todayTimes.shurooq, now);
  if (current === "fajr" && sh && now > sh) current = null;
  return current;
}

function getCountdown(target, now) {
  const diff = target - now;
  if (diff <= 0) return "00:00:00";
  const s = Math.floor(diff / 1000);
  return [
    String(Math.floor(s / 3600)).padStart(2, "0"),
    String(Math.floor((s % 3600) / 60)).padStart(2, "0"),
    String(s % 60).padStart(2, "0")
  ].join(":");
}

// Build an ISO date (YYYY-MM-DD) for TZ local date + offset days
function getISOInTZ(baseDate = new Date(), daysOffset = 0) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(baseDate);

  let y = parseInt(parts.find(p => p.type === "year").value, 10);
  let m = parseInt(parts.find(p => p.type === "month").value, 10);
  let d = parseInt(parts.find(p => p.type === "day").value, 10);

  const dt = new Date(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T00:00:00`);
  dt.setDate(dt.getDate() + daysOffset);

  const y2 = dt.getFullYear();
  const m2 = String(dt.getMonth() + 1).padStart(2, "0");
  const d2 = String(dt.getDate()).padStart(2, "0");
  return `${y2}-${m2}-${d2}`;
}

function parseHMToDateOnISO(hm, iso) {
  const norm = normalizeTime(hm);
  if (!norm) return null;
  const [H, M] = norm.split(":").map(Number);
  if (Number.isNaN(H) || Number.isNaN(M)) return null;
  return new Date(`${iso}T${String(H).padStart(2, "0")}:${String(M).padStart(2, "0")}:00`);
}

// ----------------------------------------
// AUDIO HELPERS
// ----------------------------------------
async function playBeepFallback() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();

    o.type = "sine";
    o.frequency.value = 880;
    g.gain.value = 0.001;

    o.connect(g);
    g.connect(ctx.destination);
    o.start();

    await new Promise((r) => setTimeout(r, 300));

    o.stop();
    ctx.close();
  } catch { }
}

function pickAdhanSource(prayerKey) {
  if (prayerKey === "fajr") return "/audio/adhan_1.m4a";
  return Math.random() < 0.5 ? "/audio/adhan_1.m4a" : "/audio/adhan_2.m4a";
}

function isStandalonePWA() {
  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    window.navigator.standalone === true
  );
}

// ----------------------------------------
// SIMPLE HIJRI FIX (Chrome/Edge safe)
// ----------------------------------------
function getHijriDate(date = new Date()) {
  // Convert Gregorian → Julian Day Number
  const GY = date.getFullYear();
  const GM = date.getMonth() + 1;
  const GD = date.getDate();

  let a = Math.floor((14 - GM) / 12);
  let y = GY + 4800 - a;
  let m = GM + 12 * a - 3;

  let JDN =
    GD +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045;

  // Convert JDN → Hijri
  const L = JDN - 1948440 + 10632;
  const N = Math.floor((L - 1) / 10631);
  const K = L - 10631 * N;
  const J = Math.floor((K - 1) / 354.3666667);

  let HYear = 30 * N + J;
  let temp = K - Math.floor(J * 354.3666667);
  let HMonth = Math.ceil(temp / 29.5);
  let HDay = Math.floor(temp - (HMonth - 1) * 29.5);

  if (HDay === 0) HDay = 1;

  const monthNames = [
    "Muharram",
    "Safar",
    "Rabi’ al-Awwal",
    "Rabi’ al-Thani",
    "Jumada al-Awwal",
    "Jumada al-Thani",
    "Rajab",
    "Sha'ban",
    "Ramadan",
    "Shawwal",
    "Dhu al-Qa‘dah",
    "Dhu al-Hijjah"
  ];

  return `${HDay} ${monthNames[HMonth - 1]} ${HYear} AH`;
}

async function getVapidPublicKey() {
  // You’ll expose this via Vercel env var; we’ll also add a /api/vapid endpoint if you prefer.
  // For now, paste it directly once generated (step 4).
  return import.meta.env.VITE_VAPID_PUBLIC_KEY;
}

async function subscribeUserToPush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    alert("Push not supported on this browser.");
    return null;
  }
  const reg = await navigator.serviceWorker.ready;
  const vapidKey = await getVapidPublicKey();
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidKey),
  });
  // Send to backend
  await fetch("/api/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(sub),
  });
  return sub;
}

async function unsubscribeUserFromPush() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await fetch("/api/unsubscribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(sub),
    });
    await sub.unsubscribe();
  }
}

// helper for VAPID public key conversion
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const b64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i);
  return output;
}

// ================================
// MAIN COMPONENT
// ================================
export default function App() {
  const [now, setNow] = useState(new Date());

  // Settings
  const [alertMode, setAlertMode] = useState(() => {
    return localStorage.getItem(ALERT_MODE_STORAGE_KEY) || "notif";
  });

  const [theme, setTheme] = useState(() => {
    return localStorage.getItem(THEME_STORAGE_KEY) || "system";
  });

  // For notifications and audio
  const currentAudioRef = useRef(null);
  const [adhanPlayed, setAdhanPlayed] = useState(false);
  const [notifSent, setNotifSent] = useState(false);

  // Banner
  const [showBanner, setShowBanner] = useState(false);
  const [bannerInfo, setBannerInfo] = useState(null);

  // Install-PWA UI
  const [installEvt, setInstallEvt] = useState(null);
  const [standalone, setStandalone] = useState(isStandalonePWA());
  const [isIOS, setIsIOS] = useState(false);

  const [installedKnown, setInstalledKnown] = useState(
    () => localStorage.getItem(INSTALLED_KNOWN_KEY) === "1"
  );

  // -----------------------------
  // CLOCK TICK
  // -----------------------------
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Detect iOS
  useEffect(() => {
    const ua = navigator.userAgent || "";
    setIsIOS(/iPhone|iPad|iPod/.test(ua));
  }, []);

  // Theme persistence
  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    const root = document.documentElement;
    if (theme === "dark") root.setAttribute("data-theme", "dark");
    else if (theme === "light") root.setAttribute("data-theme", "light");
    else root.removeAttribute("data-theme");
  }, [theme]);

  // Alert mode persistence
  useEffect(() => {
    localStorage.setItem(ALERT_MODE_STORAGE_KEY, alertMode);
  }, [alertMode]);

  // Ask permission when selecting Adhan/Notif
  // Request permission and keep the browser subscription in sync with Alert mode
  useEffect(() => {
    let cancelled = false;

    async function syncPermissionAndSubscription() {
      // If user chose Off → ensure unsubscribed and exit
      if (alertMode === "off") {
        await unsubscribeUserFromPush().catch(() => { });
        return;
      }

      // Only proceed for "notif" or "adhan"
      if (!("Notification" in window)) return;

      // If permission not yet granted, request it
      if (Notification.permission !== "granted") {
        const perm = await Notification.requestPermission();
        if (cancelled) return;

        // User denied → switch back to Off
        if (perm !== "granted") {
          setAlertMode("off");
          // Also try to clean up any previous subscription just in case
          await unsubscribeUserFromPush().catch(() => { });
          return;
        }
      }

      // Permission is granted → ensure we are subscribed
      await subscribeUserToPush().catch(() => { });
    }

    syncPermissionAndSubscription();

    // Cleanup flag to avoid setting state after unmount
    return () => { cancelled = true; };
  }, [alertMode]);

  // PWA install prompt capture
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setInstallEvt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  // Watch standalone mode
  useEffect(() => {
    const mq = window.matchMedia("(display-mode: standalone)");
    const handler = () => setStandalone(isStandalonePWA());
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, []);

  // Mark installed when the PWA fires 'appinstalled' (Chrome/Edge)
  useEffect(() => {
    function onAppInstalled() {
      localStorage.setItem(INSTALLED_KNOWN_KEY, "1");
      setInstalledKnown(true);
    }
    window.addEventListener("appinstalled", onAppInstalled);
    return () => window.removeEventListener("appinstalled", onAppInstalled);
  }, []);

  // Best-effort probe (Chrome/Android): detect if a related web app is installed
  useEffect(() => {
    async function probeInstalled() {
      if (!('getInstalledRelatedApps' in navigator)) return;
      try {
        const related = await navigator.getInstalledRelatedApps();
        if (Array.isArray(related) && related.length > 0) {
          localStorage.setItem(INSTALLED_KNOWN_KEY, "1");
          setInstalledKnown(true);
        }
      } catch { }
    }
    if (!standalone && !installedKnown) probeInstalled();
  }, [standalone, installedKnown]);

  // -----------------------------
  // TIMETABLE LOOKUPS
  // -----------------------------
  const todayISO = getTodayISO();
  const todayEntry = useMemo(
    () => timetable.days.find((d) => d.date === todayISO),
    [todayISO]
  );

  // Next within today
  const nextWithinToday = todayEntry ? getNextPrayer(todayEntry, now) : null;

  // If no next within today, use tomorrow's Fajr
  let nextPrayer = nextWithinToday;
  let nextIsTomorrow = false;
  if (!nextWithinToday && todayEntry) {
    const tomorrowISO = getISOInTZ(now, 1);
    const tomorrowEntry = timetable.days.find((d) => d.date === tomorrowISO);
    if (tomorrowEntry && tomorrowEntry.fajr) {
      nextPrayer = { key: "fajr", time: tomorrowEntry.fajr, iso: tomorrowISO };
      nextIsTomorrow = true;
    }
  }

  // Current prayer (with fajr-after-shurooq rule in getCurrentPrayer)
  const currentPrayer = todayEntry ? getCurrentPrayer(todayEntry, now) : null;

  // Build nextPrayerTime (today or tomorrow)
  let nextPrayerTime = null;
  if (nextPrayer) {
    if (nextPrayer.iso) {
      nextPrayerTime = parseHMToDateOnISO(nextPrayer.time, nextPrayer.iso);
    } else {
      nextPrayerTime = parseHMToDate(nextPrayer.time, now);
    }
  }

  const previousPrayerTime =
    todayEntry && nextWithinToday ? getPreviousPrayerTime(todayEntry, now) : null;

  const countdown =
    nextPrayerTime != null ? getCountdown(nextPrayerTime, now) : null;

  // Progress bar
  let progressPercent = 0;
  if (previousPrayerTime && nextPrayerTime && !nextIsTomorrow) {
    const total = nextPrayerTime - previousPrayerTime;
    const passed = now - previousPrayerTime;
    progressPercent = Math.min(100, Math.max(0, (passed / total) * 100));
  } else if (previousPrayerTime && nextIsTomorrow) {
    // Last window of the day – keep at 100%
    progressPercent = 100;
  }

  // Build a single stable key that encodes both "who is next" and "is it tomorrow?"
  const nextKeyStable = `${nextIsTomorrow ? 'tomorrow' : 'today'}:${nextPrayer?.key ?? ''}`;

  // Reset guards when the next prayer changes
  useEffect(() => {
    setAdhanPlayed(false);
    setNotifSent(false);

    if (currentAudioRef.current) {
      try {
        currentAudioRef.current.pause();
        currentAudioRef.current.currentTime = 0;
      } catch { }
      currentAudioRef.current = null;
    }
  }, [nextKeyStable]);

  // ---------------------------------------------------
  // MAIN ALERT TRIGGER (00:00:00 logic)
  // ---------------------------------------------------
  useEffect(() => {
    if (!nextPrayer || !countdown) return;
    if (countdown !== "00:00:00") return;

    // prevent double-trigger
    if (adhanPlayed && notifSent) return;
    setAdhanPlayed(true);

    // 1. Show banner for ALL MODES (Adhan | Notif | Off)
    if (!showBanner) {
      setBannerInfo({
        prayerKey: nextPrayer.key,
        timeStr: nextPrayer.time
      });
      setShowBanner(true);
    }

    // 2. PUSH NOTIFICATION first (Adhan + Notif)
    if (!notifSent && alertMode !== "off") {
      setNotifSent(true);

      if (Notification.permission === "granted") {
        navigator.serviceWorker?.ready.then((reg) => {
          reg.showNotification(
            `Adhan — ${nextPrayer.key.toUpperCase()}`,
            {
              body: `It's time for ${nextPrayer.key.toUpperCase()}.`,
              icon: "/icons/icon-192.png",
              badge: "/icons/icon-192.png"
            }
          );
        });
      }
    }

    // 3. ADHAN AUDIO after 1500ms (only if alertMode === adhan)
    if (alertMode === "adhan") {
      setTimeout(() => {
        try {
          navigator.vibrate?.([250, 120, 250]);
        } catch { }

        const src = pickAdhanSource(nextPrayer.key);
        const audio = new Audio(src);
        audio.play().catch(() => playBeepFallback());
        currentAudioRef.current = audio;
      }, 1500);
    }
  }, [countdown, nextKeyStable, alertMode, adhanPlayed, notifSent, showBanner])

  // Close banner by clicking background
  function dismissBanner(e) {
    if (e.target.classList.contains("adhan-banner")) {
      stopAudioAndClose();
    }
  }

  function stopAudioAndClose() {
    if (currentAudioRef.current) {
      try {
        currentAudioRef.current.pause();
        currentAudioRef.current.currentTime = 0;
      } catch { }
      currentAudioRef.current = null;
    }
    setShowBanner(false);
  }

  async function handleInstallClick() {
    if (standalone) return; // safety: should be hidden anyway

    if (installEvt) {
      installEvt.prompt();
      const choice = await installEvt.userChoice;
      setInstallEvt(null);

      if (choice && choice.outcome === "accepted") {
        localStorage.setItem(INSTALLED_KNOWN_KEY, "1");
        setInstalledKnown(true);
      }
      return;
    }

    if (isIOS) {
      alert(
        "To install on iPhone/iPad:\n\n1) Tap the Share icon in Safari\n2) Choose 'Add to Home Screen'\n3) Tap Add"
      );
    }
  }

  // Current label (supports Fajr special cases and overnight after midnight)
  let currentLabel = null;
  if (todayEntry) {
    const fajrAdhan = parseHMToDate(todayEntry.fajr, now);
    const fajrIqamah = todayEntry["iqamah_fajr"]
      ? parseHMToDate(todayEntry["iqamah_fajr"], now)
      : null;
    const shurooqDt = parseHMToDate(todayEntry.shurooq, now);

    if (currentPrayer === "fajr") {
      if (fajrIqamah && now < fajrIqamah) {
        currentLabel = `CURRENT: FAJR — Iqamah in ${getCountdown(fajrIqamah, now)}`;
      } else if (shurooqDt && now < shurooqDt) {
        currentLabel = `CURRENT: FAJR — Shurooq in ${getCountdown(shurooqDt, now)}`;
      } else {
        // Past Shurooq → no current label (and "Now" is removed by getCurrentPrayer)
        currentLabel = null;
      }
    } else if (currentPrayer) {
      // Non-Fajr current prayers: Iqamah → Ends
      const iqStr = todayEntry["iqamah_" + currentPrayer];
      const iqDt = iqStr ? parseHMToDate(iqStr, now) : null;

      if (iqDt && now < iqDt) {
        currentLabel = `CURRENT: ${currentPrayer.toUpperCase()} — Iqamah in ${getCountdown(iqDt, now)}`;
      } else if (nextPrayerTime) {
        currentLabel = `CURRENT: ${currentPrayer.toUpperCase()} — Ends in ${getCountdown(nextPrayerTime, now)}`;
      }
    } else {
      // After midnight before Fajr: show overnight label to Fajr
      if (nextPrayer && !nextIsTomorrow && nextPrayer.key === "fajr" && nextPrayerTime) {
        currentLabel = `NIGHT — Fajr in ${getCountdown(nextPrayerTime, now)}`;
      }
    }
  }

  const clockStr = formatClock(now);

  if (!todayEntry) {
    return (
      <div style={{ padding: 20 }}>
        <h1>No timetable entry for today.</h1>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="app-container">

        {/* HEADER */}
        <header className="app-header">
          <div className="brand">
            <img src={logoUrl} alt="MWHS Logo" className="logo" />
            <div>
              <h1 className="title">MWHS</h1>
              <div className="subtitle">Prayer Times</div>
            </div>
          </div>

          <div className="date-time centered">
            <div className="date-line">
              {formatGregorian(now)} / {formatHijri(now)}
            </div>
            <div className="clock-area">{clockStr}</div>
          </div>

          {/* SETTINGS */}
          <div className="controls-row centered">

            {/* THEME */}
            <div className="toggle-group-wrap">
              <span className="toggle-label">Theme</span>
              <div className="toggle-group">
                <button
                  className={`toggle-btn ${theme === "system" ? "active" : ""}`}
                  onClick={() => setTheme("system")}
                >
                  System
                </button>
                <button
                  className={`toggle-btn ${theme === "light" ? "active" : ""}`}
                  onClick={() => setTheme("light")}
                >
                  Light
                </button>
                <button
                  className={`toggle-btn ${theme === "dark" ? "active" : ""}`}
                  onClick={() => setTheme("dark")}
                >
                  Dark
                </button>
              </div>
            </div>

            {/* ALERT */}
            <div className="toggle-group-wrap">
              <span className="toggle-label">Alert</span>
              <div className="toggle-group">
                <button
                  className={`toggle-btn ${alertMode === "adhan" ? "active" : ""}`}
                  onClick={() => setAlertMode("adhan")}
                >
                  Adhan
                </button>
                <button
                  className={`toggle-btn ${alertMode === "notif" ? "active" : ""}`}
                  onClick={() => setAlertMode("notif")}
                >
                  Notif
                </button>
                <button
                  className={`toggle-btn ${alertMode === "off" ? "active" : ""}`}
                  onClick={() => setAlertMode("off")}
                >
                  Off
                </button>
              </div>
            </div>

          </div>
        </header>

        {/* NEXT PRAYER */}
        {nextPrayer && (
          <section className="card next-card">
            <div className="next-label">Next prayer</div>
            <div className="next-value">
              {nextPrayer.key.toUpperCase()} at {formatTime(nextPrayer.time)}
              {nextIsTomorrow && (
                <span style={{ marginLeft: 6, opacity: 0.8 }}>(tomorrow)</span>
              )}
            </div>
            {countdown && (
              <div className="countdown">
                in <b>{countdown}</b>
              </div>
            )}
            <div className="progress-wrapper">
              <div
                className="progress-bar"
                style={{ width: progressPercent + "%" }}
              />
            </div>
          </section>
        )}

        {/* CURRENT LABEL */}
        {currentLabel && (
          <div className="current-label">{currentLabel}</div>
        )}

        {/* TABLE */}
        <section className="card">
          <h2 className="section-title">Today’s Times</h2>
          <div className="times">
            <table className="times-table">
              <thead>
                <tr>
                  <th>Prayer</th>
                  <th>Adhan</th>
                  <th>Iqamah</th>
                </tr>
              </thead>
              <tbody>
                {PRAYER_ORDER.map((key) => {
                  const pretty = key.charAt(0).toUpperCase() + key.slice(1);
                  const isCurrent = key === currentPrayer;
                  // Only mark "next-row" when the next prayer is still TODAY
                  const isNext = nextPrayer && !nextIsTomorrow && key === nextPrayer.key;
                  const adhan = todayEntry[key];
                  const iqamah = todayEntry[`iqamah_${key}`];

                  return (
                    <tr
                      key={key}
                      className={[
                        isCurrent ? "highlight" : "",
                        isNext ? "next-row" : ""
                      ].join(" ")}
                    >
                      <td className="prayer-name">
                        {pretty}
                        {isCurrent && (
                          <span className="chip chip-current">Now</span>
                        )}
                        {isNext && !isCurrent && (
                          <span className="chip chip-next">Next</span>
                        )}
                      </td>
                      <td>{formatTime(adhan)}</td>
                      <td>{formatTime(iqamah)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="extras">
              <div>
                <b>Shurooq</b>: {formatTime(todayEntry.shurooq)}
              </div>
              {todayEntry.jumma && (
                <div>
                  <b>Jummah</b>: {todayEntry.jumma}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* INSTALL / INSTALLED STATE */}
        {!standalone && (
          <div className="install-wrap">
            {installedKnown ? (
              // Already installed (as far as we can tell) → show disabled helper
              <button
                className="btn install-btn installed"
                type="button"
                disabled
                aria-disabled="true"
                title="App is installed. Open it from your Home Screen / App Launcher."
              >
                App is installed. Open from Home Screen
              </button>
            ) : (
              // Not installed → show the usual install action
              <button className="btn install-btn" onClick={handleInstallClick}>
                Install MWHS App
              </button>
            )}
          </div>
        )}

        {/* FULL-SCREEN BANNER */}
        {showBanner && bannerInfo && (
          <div className="adhan-banner" onClick={dismissBanner}>
            <div className="banner-content">
              <h2>
                Adhan — {bannerInfo.prayerKey.toUpperCase()}
              </h2>

              <p className="banner-time">
                Time: {formatTime(bannerInfo.timeStr)}
              </p>

              <div className="banner-actions">
                {alertMode === "adhan" && (
                  <button
                    className="btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!currentAudioRef.current) {
                        const src = pickAdhanSource(bannerInfo.prayerKey);
                        const audio = new Audio(src);
                        audio.play().catch(() => playBeepFallback());
                        currentAudioRef.current = audio;
                      } else {
                        currentAudioRef.current.play().catch(() => playBeepFallback());
                      }
                    }}
                  >
                    Play / Unmute
                  </button>
                )}

                <button
                  className="btn btn-primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    stopAudioAndClose();
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}