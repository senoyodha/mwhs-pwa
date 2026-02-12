import webpush from "web-push";
import { getAllSubs, removeSub } from "./_store.js";

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VITE_VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { title = "MWHS", body = "It's time for prayer.", data = {} } = await readJson(req);

  const subs = getAllSubs();
  const payload = JSON.stringify({ title, body, data });

  // send in parallel; remove invalid subs
  await Promise.all(
    subs.map(async (sub) => {
      try { await webpush.sendNotification(sub, payload); }
      catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) removeSub(sub);
      }
    })
  );

  return res.status(200).json({ ok: true, sent: subs.length });
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try { resolve(JSON.parse(data || "{}")); } catch { reject(); }
    });
  });
}