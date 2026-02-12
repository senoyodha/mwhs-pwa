# 🕌 MWHS Prayer Times — Progressive Web App (PWA)

A modern, fast, mobile‑first **Prayer Times PWA** for MWHS (Manchester Welfare House Society).  
Built with **React + Vite**, installable on Android, iOS, and Desktop, with offline support and a polished alert experience.

---

## 🔗 Live Demo

**https://mwhs-pwa.vercel.app/**

---

## 📸 Screenshot

![Screenshot: the screenshot shows the main page.](https://lh3.googleusercontent.com/d/1nsLO60v9BJdAJVu9ZWZ_OJKCHITGgwOq)

*Screenshot: the screenshot shows the main page.*

---

## ✨ Why We Use a PWA (instead of a native app)

A **Progressive Web App** gives MWHS a modern experience at a fraction of the cost and complexity of native apps.

- **Single codebase, all platforms** — Works on Android, iOS, and Desktop via the browser. No separate iOS/Android builds.
- **No App Store delays** — Install directly from the website; ship updates instantly without review queues.
- **Automatic updates** — Users always get the latest version (service worker handles caching + updates).
- **Offline-friendly** — Timetable, assets, and shell are cached to keep the app usable with poor/zero signal.
- **Lower cost** — Build once, maintain once, deploy everywhere.
- **SEO discoverability** — Unlike native apps, PWAs are indexable and can be found via search engines.
- **Fast, lightweight** — Optimized for low bandwidth and quick startup—ideal for congregants on the go.

> If we later need deep OS integration (e.g., background audio, scheduled alarms, widgets), we can wrap the same app with a **native shell** (e.g., Capacitor) while preserving most of the code.

---

## ✅ Feature List

### 📅 Daily Timetable
- Fajr, Dhuhr, Asr, Maghrib, Isha
- Iqamah times
- Shurooq time
- Jummah time

### ⌛ Prayer Logic & UX
- **Current prayer** highlighting (`Now`)
- **Countdown** to next prayer (Adhan)
- **Iqamah countdown** (during current prayer window)
- **Progress bar** from the previous prayer to the next

**Special rules implemented:**

- **Fajr**
  - Before Iqamah → **“Iqamah in …”**
  - After Iqamah & before Shurooq → **“Shurooq in …”**
  - After Shurooq → **no** “Now” and **no** current label
- **Isha (crossing midnight)**
  - **Before midnight**: table does **not** highlight “Next” for Fajr (since Fajr belongs to the next day); the **Next card** shows **tomorrow’s Fajr** with countdown
  - **After midnight**: **no** “Now” for Isha; shows **“Night — Fajr in …”**; **Next card** shows **today’s** Fajr as usual

### 🕰️ Clock & Dates
- Flip‑digit digital clock (HH:MM:SS)
- Gregorian date (weekday, dd mmm yyyy)
- Hijri date (Chrome/Edge‑safe algorithm for consistent display)

### 🎨 Appearance
- Theme settings: **Light**, **Dark**, **System**
- Mobile‑first layout, large readable typography

### 🔔 Alerts (unified “Alert” module)
All modes show the **full‑screen banner** at Adhan time; differences are in sound/notification:

| Mode  | Behavior                                                                     |
|------:|-------------------------------------------------------------------------------|
| Adhan | **Push notification first**, then **Adhan audio after 1500 ms**, with banner |
| Notif | **Push notification only**, with banner                                      |
| Off   | **Banner only**, no sound, no push                                           |

**Banner behavior**
- Tap **outside** to dismiss
- **Close** button
- **Play / Unmute** button (shown only in Adhan mode)

### 📱 PWA Capabilities
- Installable on Android & Desktop (native‑like standalone window)
- Installable on iOS via “Add to Home Screen”
- Full offline support (pre‑cached shell, data, icons, audio)

### 🔧 Reliability / Performance
- Cached timetable & assets for instant loads
- Graceful behavior in poor‑network conditions

### 🧭 Install Button UX
- **Web (not installed)**: shows **Install MWHS App** (enabled)
- **Web (installed)**: shows **disabled** button with caption: *“App is installed. Open from Home Screen”*
- **App (standalone)**: hides the install button entirely

---

## ⚠️ Known Limitations of PWAs

These are **platform/browser constraints** that apply to all PWAs:

- **No background Adhan audio**  
  Browsers block autoplay audio in the background. Adhan audio plays only when the app is open/foreground.
- **Notifications are less capable than native**  
  No custom notification sound, no OS‑level scheduled alarms, and delivery characteristics may vary by device/browser.
- **No background tasks / scheduled alarms**  
  PWAs cannot run continuous background jobs or schedule system alarms.
- **Limited hardware & OS integration**  
  Some APIs (Bluetooth/NFC, advanced sensors, lock‑screen widgets, etc.) are limited or unavailable.

> These are the trade‑offs for a zero‑install, cross‑platform web app. If we require background Adhan or OS‑level alarms, see the “Next Steps” below.

---

## 🚀 Next Steps (To‑Do)

### 1) **DB‑Backed Push Subscriptions (Recommended Next)**
Move from in‑memory storage to a real database for reliability and scale:
- Store push subscriptions (endpoint, keys, timestamp)
- Add unsubscribe cleanup & dead endpoint pruning
- Optional: per‑user preferences (Alert mode, mosque selection)
- Options: Supabase / Postgres, PlanetScale / MySQL, or a KV store

### 2) **Native Alert Capability (Background Adhan)**
Wrap this PWA with **Capacitor** to deliver full native features:
- Background Adhan audio (even when the app is closed)
- OS‑level scheduled alarms & custom sounds
- Lock‑screen controls & widgets
- Publish to Play Store / App Store

### 3) (Optional) Admin Panel
- Web dashboard to edit timetable
- One‑click push announcements (Ramadan updates, Jumu’ah notices)
- Multi‑mosque support

---

## 🧱 Project Structure

    public/
      audio/
        adhan_1.m4a
        adhan_2.m4a
      icons/
        icon-192.png
        icon-512.png
        icon-192-maskable.png
        icon-512-maskable.png
        apple-icon-180.png
      manifest.json
      service-worker.js

    src/
      assets/
        logo.png
      data/
        timetable.json
      App.jsx
      index.css
      main.jsx

    index.html
    vite.config.js

---

## 🛠 Local Development

```bash
# Install
npm install

# Dev server
npm run dev

# Build (dist/)
npm run build

# Preview production build
npm run preview
````

The service worker is registered in `src/main.jsx`.  
Manifest + icons live in `/public`.  
Audio and timetable are pre‑cached for offline use.

> **Serverless functions locally:**  
> Vite’s dev server does not run Vercel Functions. Use `vercel dev` or test against the deployed endpoints.

***

## 🌐 Deploying to Vercel

1.  Push the repo to **GitHub**
2.  Go to **<https://vercel.com/new>**
3.  Import the repo → framework: **Vite**
4.  Build settings:
    *   **Build Command**: `npm run build`
    *   **Output Directory**: `dist`
    *   **Install Command**: `npm install`
5.  Deploy 🎉

**Cron Jobs (Vercel)**

*   Add `vercel.json` with:
    ```json
    {
      "crons": [
        { "path": "/api/send-today", "schedule": "*/1 * * * *" }
      ]
    }
    ```
*   Add `CRON_SECRET` in Vercel Env Variables and check it in `/api/send-today.js`.

***

## 🔔 About Alerts & Audio

*   At Adhan time, **notification fires first**, then **Adhan audio starts 1500 ms later** (prevents the OS notification sound from clipping the Adhan).
*   In **Notif** mode: only push + banner (no audio).
*   In **Off** mode: banner only (no push, no audio).
*   **Background Adhan** is not possible in PWA; requires a native wrapper.

***

## ❤️ Credits

Made for **MWHS — Muslim Welfare House Sheffield**  
Designed to assist the community with reliable daily prayer‑time reminders.