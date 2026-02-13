import React, { useEffect, useMemo, useRef, useState } from "react";
import timetable from "./data/timetable.json";
import logoUrl from "./assets/logo.png";

// ---- Settings ----
const TZ = "Europe/London";
const PRAYER_ORDER = ["fajr", "dhuhr", "asr", "maghrib", "isha"];
const SOUND_STORAGE_KEY = "mwhs_sound_enabled";
const THEME_STORAGE_KEY = "mwhs_theme"; // "system" | "light" | "dark"

// ---- Time helpers ----
function normalizeTime(t) {
  if (!t) return null;
  return t.replace(/[;\.\-]/g, ":").replace(/\s+/g, "");
}

function parseHMToDate(hm, refDate = new Date()) {
  hm = normalizeTime(hm);
  if (!hm) return null;
  const [H, M] = hm.split(":").map((n) => parseInt(n, 10));
  if (Number.isNaN(H) || Number.isNaN(M)) return null;

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(refDate);

  const y = parts.find((p) => p.type === "year").value;
  const m = parts.find((p) => p.type === "month").value;
  const d = parts.find((p) => p.type === "day").value;

  const dt = new Date(`${y}-${m}-${d}T00:00:00`);
  dt.setHours(H, M, 0, 0);
  return dt;
}

function getTodayISO() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
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
    year: "numeric",
  }).format(date);
}

function formatHijri(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-GB-u-ca-islamic", {
    timeZone: TZ,
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return fmt.format(date);
}

function formatClock(date = new Date()) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function formatTime(t) {
  if (!t) return "-";
  const norm = normalizeTime(t);
  const [h = "", m = ""] = (norm || "").split(":");
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function getNextPrayer(todayTimes, now = new Date()) {
  for (const key of PRAYER_ORDER) {
    const t = todayTimes[key];
    const dt = parseHMToDate(t, now);
    if (dt && dt > now) {
      return { key, time: t };
    }
  }
  return null;
}

function getPreviousPrayerTime(todayTimes, now = new Date()) {
  let prev = null;
  for (const key of PRAYER_ORDER) {
    const dt = parseHMToDate(todayTimes[key], now);
    if (dt && dt <= now) prev = dt;
  }
  return prev;
}

function getCurrentPrayer(todayTimes, now = new Date()) {
  let current = null;
  for (const key of PRAYER_ORDER) {
    const adhan = todayTimes[key];
    const dt = parseHMToDate(adhan, now);
    if (dt && dt <= now) current = key;
  }
  // Special rule: Fajr ends at Shurooq
  const shurooqDt = parseHMToDate(todayTimes.shurooq, now);
  if (current === "fajr" && shurooqDt && now > shurooqDt) {
    current = null;
  }
  return current;
}

function getCountdown(targetTime, now) {
  const diffMs = targetTime - now;
  if (diffMs <= 0) return "00:00:00";
  const totalSec = Math.floor(diffMs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

// ---- Flip Clock Component ----
// ---- Flip Clock Component ----
function FlipDigit({ value, label }) {
  const [prev, setPrev] = useState(value);
  const [flip, setFlip] = useState(false);

  useEffect(() => {
    if (value !== prev) {
      setFlip(true);
      const id = setTimeout(() => {
        setFlip(false);
        setPrev(value);
      }, 550);
      return () => clearTimeout(id);
    }
  }, [value, prev]);

  return (
    <div className="flip-digit" aria-label={label}>
      <div className={`flip-card ${flip ? "flip" : ""}`}>
        <div className="top">{prev}</div>
        <div className="bottom">{value}</div>
      </div>
    </div>
  );
}

function FlipClock({ time }) {
  const [h1, h2, , m1, m2, , s1, s2] = time.split("");
  return (
    <div className="flip-clock" aria-label="Clock">
      <FlipDigit value={h1} label="Hour tens" />
      <FlipDigit value={h2} label="Hour ones" />
      <span className="flip-sep">:</span>
      <FlipDigit value={m1} label="Minute tens" />
      <FlipDigit value={m2} label="Minute ones" />
      <span className="flip-sep">:</span>
      <FlipDigit value={s1} label="Second tens" />
      <FlipDigit value={s2} label="Second ones" />
    </div>
  );
}

// ---- WebAudio beep fallback ----
async function playBeepFallback() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 880;
    g.gain.value = 0.001; // quiet
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    await new Promise((r) => setTimeout(r, 300));
    o.stop();
    ctx.close();
  } catch {}
}

// ---- Audio selection ----
function pickAdhanSource(prayerKey) {
  if (prayerKey === "fajr") return "/audio/adhan_1.m4a";
  const pick = Math.random() < 0.5 ? 1 : 2;
  return pick === 1 ? "/audio/adhan_1.m4a" : "/audio/adhan_2.mp4";
}

// ---- Install (PWA) helpers ----
function isStandalonePWA() {
  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    // iOS Safari
    window.navigator.standalone === true
  );
}

export default function App() {
  const [now, setNow] = useState(new Date());

  // Settings (persisted)
  const [soundEnabled, setSoundEnabled] = useState(() => {
    const saved = localStorage.getItem(SOUND_STORAGE_KEY);
    return saved === null ? true : saved === "true";
  });
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem(THEME_STORAGE_KEY) || "system";
  });

  // Adhan banner state
  const [showBanner, setShowBanner] = useState(false);
  const [bannerInfo, setBannerInfo] = useState(null); // {prayerKey, timeStr}
  const currentAudioRef = useRef(null);

  // PWA install button / prompt
  const [installEvt, setInstallEvt] = useState(null);
  const [standalone, setStandalone] = useState(isStandalonePWA());
  const [isIOS, setIsIOS] = useState(false);

  // Update clock every second
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Detect iOS
  useEffect(() => {
    const ua = window.navigator.userAgent || "";
    setIsIOS(/iPad|iPhone|iPod/.test(ua) && !window.MSStream);
  }, []);

  // Apply theme override to <html>
  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    const root = document.documentElement;
    if (theme === "dark") {
      root.setAttribute("data-theme", "dark");
    } else if (theme === "light") {
      root.setAttribute("data-theme", "light");
    } else {
      root.removeAttribute("data-theme");
    }
  }, [theme]);

  // Persist sound toggle
  useEffect(() => {
    localStorage.setItem(SOUND_STORAGE_KEY, String(soundEnabled));
  }, [soundEnabled]);

  // PWA install prompt listener (Android/Chrome)
  useEffect(() => {
    function onBeforeInstallPrompt(e) {
      e.preventDefault();
      setInstallEvt(e);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, []);

  // Track standalone mode changes
  useEffect(() => {
    const mq = window.matchMedia?.("(display-mode: standalone)");
    const handler = () => setStandalone(isStandalonePWA());
    mq?.addEventListener?.("change", handler);
    return () => mq?.removeEventListener?.("change", handler);
  }, []);

  // Data lookups
  const todayISO = getTodayISO();
  const todayEntry = useMemo(
    () => timetable.days.find((d) => d.date === todayISO),
    [todayISO]
  );

  const nextPrayer = todayEntry ? getNextPrayer(todayEntry, now) : null;
  const currentPrayer = todayEntry ? getCurrentPrayer(todayEntry, now) : null;

  const nextPrayerTime =
    todayEntry && nextPrayer ? parseHMToDate(nextPrayer.time, now) : null;

  const previousPrayerTime =
    todayEntry && nextPrayer ? getPreviousPrayerTime(todayEntry, now) : null;

  const countdown = nextPrayerTime ? getCountdown(nextPrayerTime, now) : null;

  // Progress percent from previous → next prayer
  let progressPercent = 0;
  if (previousPrayerTime && nextPrayerTime && nextPrayerTime > previousPrayerTime) {
    const total = nextPrayerTime - previousPrayerTime;
    const passed = now - previousPrayerTime;
    progressPercent = Math.min(100, Math.max(0, (passed / total) * 100));
  }

  // Trigger Adhan at 00:00:00
  useEffect(() => {
    if (!countdown || !todayEntry || !nextPrayer) return;

    if (countdown === "00:00:00") {
      // Show banner
      setBannerInfo({ prayerKey: nextPrayer.key, timeStr: nextPrayer.time });
      setShowBanner(true);

      // Vibrate
      try {
        navigator.vibrate?.([250, 120, 250]);
      } catch {}

      // Play audio if allowed
      if (soundEnabled) {
        const src = pickAdhanSource(nextPrayer.key);
        const audio = new Audio(src);
        audio.crossOrigin = "anonymous";
        audio.preload = "auto";
        audio.play().catch(() => {
          // If blocked, try a quiet beep fallback and show "Tap to Play"
          playBeepFallback();
        });
        currentAudioRef.current = audio;
      } else {
        playBeepFallback();
      }
    }
  }, [countdown, nextPrayer, soundEnabled, todayEntry]);

  function stopAudioAndClose() {
    if (currentAudioRef.current) {
      try {
        currentAudioRef.current.pause();
        currentAudioRef.current.currentTime = 0;
      } catch {}
      currentAudioRef.current = null;
    }
    setShowBanner(false);
  }

  function tryPlayIfBlocked() {
    if (!currentAudioRef.current && bannerInfo) {
      const src = pickAdhanSource(bannerInfo.prayerKey);
      const audio = new Audio(src);
      audio.crossOrigin = "anonymous";
      audio.preload = "auto";
      audio.play().catch(() => playBeepFallback());
      currentAudioRef.current = audio;
    } else if (currentAudioRef.current?.paused) {
      currentAudioRef.current.play().catch(() => playBeepFallback());
    }
  }

  async function handleInstallClick() {
    if (installEvt) {
      installEvt.prompt();
      const choice = await installEvt.userChoice.catch(() => null);
      setInstallEvt(null);
      return;
    }
    if (isIOS) {
      alert(
        "To install on iPhone/iPad:\n\n1) Tap the Share icon in Safari\n2) Choose 'Add to Home Screen'\n3) Tap Add"
      );
    }
  }

  // Current Prayer small label logic:
  // If in a prayer window and before Iqamah, countdown to Iqamah.
  // Else, countdown to next prayer (or hide if Fajr past Shurooq).
  let currentLabel = null;
  if (todayEntry && currentPrayer) {
    const adhanStr = todayEntry[currentPrayer];
    const iqamahStr = todayEntry["iqamah_" + currentPrayer];
    const iqamahDt = iqamahStr ? parseHMToDate(iqamahStr, now) : null;

    if (iqamahDt && iqamahDt > now) {
      // countdown to Iqamah
      currentLabel = {
        text: `CURRENT: ${currentPrayer.toUpperCase()} — Iqamah in ${getCountdown(iqamahDt, now)}`,
        aria: `Current ${currentPrayer}, Iqamah in ${getCountdown(iqamahDt, now)}`,
      };
    } else if (nextPrayerTime) {
      // countdown to end of prayer window (next adhan)
      currentLabel = {
        text: `CURRENT: ${currentPrayer.toUpperCase()} — Ends in ${getCountdown(nextPrayerTime, now)}`,
        aria: `Current ${currentPrayer}, ends in ${getCountdown(nextPrayerTime, now)}`,
      };
    }
    // Special Fajr rule — if past Shurooq, hide current label entirely (already handled in getCurrentPrayer)
  }

  const clockStr = formatClock(now);

  return (
    <div className="app-shell">
      <div className="app-container">
        {/* Header (brand on left, controls on right; stacks on mobile) */}
        <header className="app-header">
          <div className="brand">
            <img src={logoUrl} alt="MWHS Logo" className="logo" />
            <div>
              <h1 className="title">MWHS</h1>
              <div className="subtitle">Prayer Times</div>
            </div>
          </div>

          <div className="header-right">
            {/* One row: Theme + Sound */}
            <div className="controls-row">
              <div className="toggle-group-wrap">
                <span className="toggle-label">Theme</span>
                <div className="toggle-group">
                  <button
                    className={`toggle-btn ${theme === "system" ? "active" : ""}`}
                    onClick={() => setTheme("system")}
                    title="Follow system"
                  >
                    System
                  </button>
                  <button
                    className={`toggle-btn ${theme === "light" ? "active" : ""}`}
                    onClick={() => setTheme("light")}
                    title="Light mode"
                  >
                    Light
                  </button>
                  <button
                    className={`toggle-btn ${theme === "dark" ? "active" : ""}`}
                    onClick={() => setTheme("dark")}
                    title="Dark mode"
                  >
                    Dark
                  </button>
                </div>
              </div>

              <div className="toggle-group-wrap">
                <span className="toggle-label">Sound</span>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={soundEnabled}
                    onChange={(e) => setSoundEnabled(e.target.checked)}
                  />
                  <span className="slider" />
                </label>
              </div>
            </div>

            {/* Date + Flip Clock */}
            <div className="date-time">
              <div className="date-line">
                {formatGregorian(now)} / {formatHijri(now)}
              </div>
              <FlipClock time={clockStr} />
            </div>
          </div>
        </header>

        {/* Next Prayer card */}
        {todayEntry && nextPrayer && (
          <section className="card next-card" role="status" aria-live="polite">
            <div className="next-lines">
              <div className="next-label">Next prayer</div>
              <div className="next-value">
                <span className="next-name">
                  {nextPrayer.key.charAt(0).toUpperCase() + nextPrayer.key.slice(1)}
                </span>{" "}
                at <b>{formatTime(nextPrayer.time)}</b>
              </div>
              {countdown && (
                <div className="countdown">
                  <span>in </span>
                  <span className="countdown-value">{countdown}</span>
                </div>
              )}
              <div className="progress-wrapper" aria-label="Progress toward next prayer">
                <div className="progress-bar" style={{ width: progressPercent + "%" }} />
              </div>
            </div>
          </section>
        )}

        {/* Small Current Prayer label (above the table) */}
        {todayEntry && currentLabel && (
          <div className="current-label" aria-label={currentLabel.aria}>
            {currentLabel.text}
          </div>
        )}

        {/* Table of times */}
        {!todayEntry ? (
          <div className="card">
            No timetable entry for today. Check your <code>timetable.json</code>.
          </div>
        ) : (
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
                    const isNext = nextPrayer && key === nextPrayer.key;
                    const adhan = todayEntry[key];
                    const iqKey = `iqamah_${key}`;
                    const iqamah = todayEntry[iqKey];

                    return (
                      <tr
                        key={key}
                        className={[
                          isCurrent ? "highlight" : "",
                          isNext ? "next-row" : "",
                        ].join(" ").trim()}
                      >
                        <td className="prayer-name">
                          {pretty}
                          {isCurrent && <span className="chip chip-current">Now</span>}
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
                <div><b>Shurooq</b>: {formatTime(todayEntry.shurooq)}</div>
                {todayEntry.jumma && <div><b>Jummah</b>: {todayEntry.jumma}</div>}
              </div>
            </div>
          </section>
        )}

        {/* Install PWA button (hidden when installed) */}
        {!standalone && (
          <div className="install-wrap">
            <button className="btn install-btn" onClick={handleInstallClick}>
              Install MWHS App
            </button>
          </div>
        )}

        <footer className="footer">
          {/* Keep footer minimal; CTA moved to button above */}
        </footer>

        {/* Full-screen Adhan Banner */}
        {showBanner && bannerInfo && (
          <div className="adhan-banner" role="dialog" aria-modal="true">
            <div className="banner-content">
              <h2>
                Adhan — {bannerInfo.prayerKey.charAt(0).toUpperCase() + bannerInfo.prayerKey.slice(1)}
              </h2>
              <p className="banner-time">Time: {formatTime(bannerInfo.timeStr)}</p>

              <div className="banner-actions">
                <button className="btn" onClick={tryPlayIfBlocked}>
                  {soundEnabled ? "Play / Unmute" : "Play (sound was off)"}
                </button>
                <button className="btn btn-primary" onClick={stopAudioAndClose}>
                  Stop & Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}