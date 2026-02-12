// TEMP MEMORY STORE (per serverless instance); replace with DB later.
let SUBS = []; // array of { endpoint, keys, expirationTime }

export function addSub(sub) {
  if (!sub || !sub.endpoint) return;
  if (!SUBS.find((s) => s.endpoint === sub.endpoint)) SUBS.push(sub);
}

export function removeSub(sub) {
  if (!sub || !sub.endpoint) return;
  SUBS = SUBS.filter((s) => s.endpoint !== sub.endpoint);
}

export function getAllSubs() {
  return SUBS.slice(); // copy
}