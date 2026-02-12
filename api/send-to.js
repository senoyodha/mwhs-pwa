// /api/send-to.js
import webpush from "web-push";

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VITE_VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try { resolve(JSON.parse(data || "{}")); } catch { reject(); }
    });
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { subscription, title = "MWHS", body = "", data = {} } = await readJson(req);
  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ ok: false, error: "missing-subscription" });
  }

  try {
    await webpush.sendNotification(subscription, JSON.stringify({ title, body, data }));
    return res.status(200).json({ ok: true, sent: 1 });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
}