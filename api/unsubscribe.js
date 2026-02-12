import { removeSub } from "./_store.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  try {
    const body = await readJson(req);
    removeSub(body);
    return res.status(200).json({ ok: true });
  } catch {
    return res.status(400).json({ ok: false });
  }
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