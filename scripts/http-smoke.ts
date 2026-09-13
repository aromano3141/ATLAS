import assert from "node:assert/strict";
const base = "http://localhost:5173/api";
const response = await fetch(base + "/session");
assert.equal(response.status, 200);
const cookie = response.headers.get("set-cookie")!.split(";")[0];
const { csrf } = (await response.json()) as any;
const call = async (path: string, body?: unknown, mode = "fixture") => {
  const r = await fetch(base + path, {
    method: body ? "POST" : "GET",
    headers: {
      cookie,
      Origin: "http://localhost:5173",
      "Content-Type": "application/json",
      "x-csrf-token": csrf,
      "x-reality-mode": mode,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data: any = await r.json();
  assert.ok(r.ok, data.error || path);
  return data;
};
await call("/scan", {});
let state: any;
for (let i = 0; i < 30; i++) {
  await new Promise((resolve) => setTimeout(resolve, 500));
  state = await call("/state");
  if (state.plans.length === 2) break;
}
assert.equal(state.mode, "fixture");
assert.equal(state.plans.length, 2);
const plan = state.plans.find((p: any) => p.entityId === "meeting");
if (!state.approvals.some((a: any) => a.planId === plan.id)) {
  await call("/plans/" + plan.id + "/decision", { decision: "approved" });
}
for (let i = 0; i < 30; i++) {
  await new Promise((resolve) => setTimeout(resolve, 500));
  state = await call("/state");
  if (
    state.runs.some((r: any) => r.planId === plan.id && r.state === "verified")
  )
    break;
}
assert.ok(
  state.runs.some((r: any) => r.planId === plan.id && r.state === "verified"),
);
const live = await call("/state", undefined, "live");
assert.equal(live.mode, "live");
assert.ok(!live.plans.some((p: any) => p.mode === "fixture"));
console.log(
  JSON.stringify(
    {
      fixturePlans: state.plans.length,
      meetingRepair: "verified fixture",
      apiProxy: "passed",
      liveModeIsolation: "passed",
    },
    null,
    2,
  ),
);
