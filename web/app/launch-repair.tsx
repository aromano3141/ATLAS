"use client";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  GitCompareArrows,
  Loader2,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, date } from "@/lib/api";
import type { RepairPlan } from "../../server/contracts";

export default function LaunchRepair() {
  const [data, setData] = useState<any>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const plan: RepairPlan | undefined = data?.plan;
  async function prepare() {
    setBusy(true);
    setError("");
    try {
      setData(await api("/atlas-launch/prepare", "live", {}));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void prepare();
  }, []);
  useEffect(() => {
    if (!plan) return;
    let disposed = false;
    const timer = setInterval(() => {
      void api(`/plans/${plan.id}`, "live")
        .then((next) => {
          if (!disposed) setData(next);
        })
        .catch((e) => {
          if (!disposed) setError(e.message);
        });
    }, 1500);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [plan?.id]);
  async function apply() {
    if (!plan) return;
    setBusy(true);
    setError("");
    try {
      const resume = data.approval?.decision === "approved";
      await api(
        `/plans/${plan.id}/${resume ? "resume" : "decision"}`,
        "live",
        resume ? {} : { decision: "approved" },
      );
      setData(await api(`/plans/${plan.id}`, "live"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const verified = data?.run?.state === "verified";
  const aligned = plan?.status === "unchanged";
  const running = ["approved", "executing"].includes(data?.run?.state);
  return (
    <section
      className="panel"
      style={{
        marginBottom: 24,
        borderColor: verified || aligned ? "#9bd4b8" : "#ebc787",
      }}
    >
      <div className="panel-heading">
        <div>
          <p className="eyebrow">ATLAS DEMO LAUNCH / DATE REPAIR</p>
          <h2>
            {verified
              ? "Launch date updated and verified"
              : aligned
                ? "Launch date is October 2"
                : "Timing issue: launch date needs updating"}
          </h2>
        </div>
        {verified || aligned ? (
          <CheckCircle2 size={24} className="text-emerald-600" />
        ) : (
          <TriangleAlert size={24} className="text-amber-600" />
        )}
      </div>
      <div className="panel-body">
        <p className="explanation">
          {verified
            ? "Calendar and Jira were independently reread and match October 2, 2026."
            : "Atlas Demo Launch should be October 2, 2026. Update the all-day Calendar milestone and Jira release to match."}
        </p>
        <div className="grid gap-3 md:grid-cols-2 my-5">
          {(["calendar", "jira"] as const).map((provider) => {
            const effect = data?.effects?.find(
              (e: any) => e?.request?.action?.provider === provider,
            );
            const before =
              provider === "calendar"
                ? data?.snapshot?.calendar?.start?.date
                : data?.snapshot?.jira?.releaseDate;
            const observed = effect?.observations?.at(-1)?.value;
            const observedDate =
              provider === "calendar"
                ? observed?.start?.date
                : observed?.releaseDate;
            const confirmed =
              effect?.state === "verified" && observedDate === "2026-10-02";
            return (
              <div
                key={provider}
                className="rounded-lg border border-slate-200 bg-slate-50 p-4"
              >
                <div className="flex items-center gap-2 font-semibold text-slate-700">
                  {provider === "calendar" ? (
                    <CalendarDays size={18} />
                  ) : (
                    <GitCompareArrows size={18} />
                  )}{" "}
                  {provider === "calendar" ? "Google Calendar" : "Jira release"}
                  <span className="ml-auto text-xs font-normal">
                    {confirmed
                      ? "Verified"
                      : effect?.state ||
                        (aligned ? "Already aligned" : "Proposed")}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-3">
                  <span className="text-slate-500">
                    {before ? date(before) : "Reading…"}
                  </span>
                  <ArrowRight size={17} className="text-slate-400" />
                  <strong className="text-teal-700">Oct 2, 2026</strong>
                </div>
                {provider === "calendar" && (
                  <p className="text-xs text-slate-500 mt-2">
                    All-day: start Oct 2 · exclusive end Oct 3
                  </p>
                )}
                {effect && (
                  <p className="text-xs mt-2 text-slate-600">
                    Readback:{" "}
                    {observedDate
                      ? date(observedDate)
                      : "Awaiting confirmation"}
                    {effect.error ? " · " + effect.error : ""}
                  </p>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-sm text-slate-500 mb-4">
          Operator-requested date correction. Agent panels are presentation-only
          for this repair. Titles, unrelated fields, and the release’s
          unreleased status are preserved.
        </p>
        {(error || data?.run?.error) && (
          <p role="alert" className="text-sm text-red-700 mb-3">
            {error || data.run.error}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={() => void apply()}
            disabled={
              busy ||
              !plan ||
              verified ||
              aligned ||
              running ||
              (!!data?.approval && data.approval.decision !== "approved")
            }
          >
            {busy || running ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <CheckCircle2 size={16} />
            )}{" "}
            {verified
              ? "Calendar & Jira verified"
              : aligned
                ? "Already October 2"
                : running
                  ? "Updating and verifying…"
                  : data?.approval?.decision === "approved"
                    ? "Resume approved date repair"
                    : "Change Calendar & Jira to October 2"}
          </Button>
          <Button
            variant="outline"
            disabled={busy || running}
            onClick={() => void prepare()}
          >
            <RefreshCw size={15} />
            Refresh preview
          </Button>
          <span className="text-xs text-slate-500">
            This button approves real Calendar and Jira changes. No Slack
            message is sent.
          </span>
        </div>
      </div>
    </section>
  );
}
