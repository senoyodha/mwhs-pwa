// /api/debug-subs.js
import { getAllSubs } from "./_store.js";

export default async function handler(req, res) {
  const subs = getAllSubs() || [];
  // Only return endpoints for privacy (mask keys)
  const endpoints = subs.map((s) => s.endpoint);
  res.status(200).json({ count: endpoints.length, endpoints });
}