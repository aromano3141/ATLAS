"use client";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  Code2,
  GitCompareArrows,
  LockKeyhole,
  Maximize2,
  Pause,
  Play,
  Radio,
  RotateCcw,
  ShieldCheck,
  SkipForward,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { api } from "@/lib/api";
import {
  BEATS,
  STAGES,
  replayData,
  nextBeat,
  operations,
  liveStage,
  expectedReply,
} from "@/lib/mission";
import type { MissionData } from "../../../server/mission";
import {
  SourceCards,
  Timeline,
  AgentCards,
  ChangePreview,
  Adapt,
  short,
  stamp,
} from "./panels";
import { useLive } from "./use-live";
import "./mission-control.css";

export default function MissionControl() {
  const [mode, setMode] = useState("replay"),
    [beat, setBeat] = useState(0),
    [playing, setPlaying] = useState(false),
    [elapsed, setElapsed] = useState(0);
  const [recovery, setRecovery] = useState(false),
    [notes, setNotes] = useState(false),
    [compact, setCompact] = useState(true),
    [selected, setSelected] = useState("");
  const [inspector, setInspector] = useState<string | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [review, setReview] = useState<{
    data: MissionData;
    recover: boolean;
  }>();
  const replay = mode === "replay";
  const live = useLive(!replay);
  const data = useMemo(
    () => (replay ? replayData(beat, recovery) : live.data),
    [replay, beat, recovery, live.data],
  );
  const reading =
    !replay &&
    (live.waiting || !data?.snapshot || data.progress?.state === "reading");
  const stage = replay
    ? BEATS[beat].stage
    : liveStage(reading ? undefined : data);
  const gate = replay && (beat === 10 || (recovery && beat === 12)),
    complete = replay && beat === BEATS.length - 1;
  const ops = data ? operations(data) : [],
    verified =
      ops.length > 0 &&
      ops.every((o) => o.verified) &&
      data?.run?.state === "verified";
  const visible = reading ? undefined : data;
  const failure = error || (!replay ? live.error || data?.progress?.error : "");
  const title = replay
    ? recovery && beat === 12
      ? "The write may have landed. The reply didn’t."
      : BEATS[beat].title
    : failure
      ? "Live investigation needs attention."
      : reading
        ? "Reading your actual launch resources."
        : verified
          ? "External state matches the approved decision."
          : data?.run?.error
            ? "An incomplete result needs a careful recovery."
            : data?.plan?.status === "unchanged"
              ? "Records match the supported decision."
              : data?.plan?.status === "abstained"
                ? "The evidence does not yet establish a repair."
                : stage === 3
                  ? "Review the exact live repair."
                  : "Building a timeline from real evidence.";
  function reset() {
    setBeat(0);
    setElapsed(0);
    setPlaying(false);
    setSelected("");
  }
  function advance(action: "next" | "approve" | "recover" = "next") {
    setBeat((b) => nextBeat(b, recovery, action));
    setElapsed(0);
  }
  useEffect(() => {
    if (!replay || !playing || gate || complete || inspector) return;
    const timer = setInterval(() => setElapsed((e) => e + 0.1), 100);
    return () => clearInterval(timer);
  }, [replay, playing, gate, complete, inspector]);
  useEffect(() => {
    if (!replay) return;
    if (gate || complete) setPlaying(false);
    else if (elapsed >= BEATS[beat].seconds) advance();
  }, [elapsed, beat, replay, gate, complete]);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (
        !replay ||
        inspector ||
        review ||
        /INPUT|TEXTAREA|BUTTON|A|SELECT/.test((e.target as HTMLElement).tagName)
      )
        return;
      if (e.code === "Space" && !gate && !complete) {
        e.preventDefault();
        setPlaying((p) => !p);
      }
      if (e.code === "ArrowRight" && !gate) {
        e.preventDefault();
        setPlaying(false);
        advance();
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  async function fullScreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      setError(
        "Full screen is unavailable here; presentation layout remains active.",
      );
    }
  }
  async function act() {
    if (!review?.data.plan) return;
    setBusy(true);
    setError("");
    try {
      await api(
        `/plans/${review.data.plan.id}/${review.recover ? "resume" : "decision"}`,
        "live",
        review.recover ? {} : { decision: "approved" },
      );
      setReview(undefined);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const current =
    !reading &&
    !failure &&
    live.connected &&
    data?.plan?.id === data?.currentPlanId;
  const canApprove =
    current && data?.plan?.status === "review" && !data.approval;
  const canRecover =
    current &&
    data?.approval?.decision === "approved" &&
    ["partial", "uncertain", "failed"].includes(data.run?.state ?? "");
  const inspected =
    inspector === "sources"
      ? { bindings: data?.entity, snapshot: data?.snapshot }
      : inspector === "assessments"
        ? {
            model: data?.model,
            initial: data?.progress?.initial ?? data?.plan?.assessments,
            followup: data?.progress?.followup ?? data?.plan?.followup,
            claims: data?.progress?.claims ?? data?.plan?.claims,
          }
        : inspector === "approval"
          ? {
              currentPlanId: data?.currentPlanId,
              plan: data?.plan,
              approval: data?.approval,
            }
          : inspector === "operations"
            ? { run: data?.run, effects: data?.effects, comparisons: ops }
            : {
                credentialsPresent: data?.credentials,
                connectionChecks: data?.connections,
                progress: data?.progress,
              };
  return (
    <main className={`mission ${compact ? "mc-compact" : ""}`}>
      <header className="mc-header">
        <a className="mc-brand" href="/">
          <span className="mc-logo">
            <GitCompareArrows />
          </span>
          Reality Sync
          <span className="mc-brand-divider" />
          Mission Control
        </a>
        <div className="mc-header-right">
          <span className="mc-chip">
            <span className="mc-dot" /> LOCAL WORKSPACE
          </span>
          <a href="/" className="mc-back">
            <ArrowLeft size={14} /> Workspace
          </a>
        </div>
      </header>
      <div className="mc-shell">
        <div className="mc-hero">
          <div>
            <p className="mc-eyebrow">
              ONE DECISION. THREE SOURCES. A SHARED REALITY.
            </p>
            <h1>
              {data?.entity.title ?? "Atlas Demo Launch"}
              <span className="mc-title-dot">.</span>
            </h1>
          </div>
          <div className="mc-mode-controls">
            <Tabs
              value={mode}
              onValueChange={(v) => {
                setMode(v);
                setPlaying(false);
                setReview(undefined);
                setInspector(null);
                setSelected("");
                setError("");
              }}
            >
              <TabsList className="mc-mode-tabs">
                <TabsTrigger value="replay">
                  <Play size={13} />
                  Demo Replay
                </TabsTrigger>
                <TabsTrigger value="live">
                  <Radio size={13} />
                  Live
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <span className="mc-mode-caption">
              {replay
                ? "Simulated operations · no provider activity"
                : "Live backend events · actual provider state"}
            </span>
          </div>
        </div>
        <nav className="mc-stages" aria-label="Reconciliation sequence">
          {STAGES.map((s, i) => (
            <div
              className={`mc-stage ${i === stage ? "active" : ""} ${i < stage ? "passed" : ""}`}
              aria-current={i === stage ? "step" : undefined}
              key={s}
            >
              <span className="mc-stage-number">
                {i < stage ? <Check size={13} /> : "0" + (i + 1)}
              </span>
              <span>{s}</span>
              {i < 6 && <ArrowRight size={14} />}
            </div>
          ))}
        </nav>
        <div className="mc-stage-heading">
          <div>
            <span className="mc-eyebrow">
              0{stage + 1} / {STAGES[stage].toUpperCase()}
              {replay && recovery ? " · RECOVERY REPLAY" : ""}
            </span>
            <h2 aria-live="polite">{title}</h2>
          </div>
          <div className="mc-view-tools">
            <Button
              className="mc-ghost"
              onClick={() => setInspector("sources")}
            >
              <Code2 size={15} /> Technical details
            </Button>
            <Button
              className="mc-icon-button"
              aria-label="Toggle full screen"
              onClick={fullScreen}
            >
              <Maximize2 size={16} />
            </Button>
          </div>
        </div>
        {failure && (
          <div className="mc-notice mc-error" role="alert">
            <TriangleAlert size={18} />
            {failure}
          </div>
        )}
        {!replay && !reading && data?.snapshot && (
          <div className="mc-live-facts">
            <span>
              <span className="mc-dot" /> Read{" "}
              {stamp(data.snapshot.retrievedAt)}
            </span>
            <span>
              {data.plan?.operatorDate
                ? "Operator-requested October 2 repair · agents are presentation-only"
                : expectedReply(data)
                  ? `October 2 reply found · ${data.entity.authorityUserIds.includes(expectedReply(data)!.authorId) ? "configured owner matches" : "author is not an owner"}`
                  : "Requested October 2 reply not found in this thread read"}
            </span>
            {data.progress?.reused && !data.plan?.operatorDate && (
              <span>Prior assessments reused · evidence unchanged</span>
            )}
          </div>
        )}
        <div className="mc-network">
          <svg
            className={`mc-wires ${stage > 0 ? "mc-wires-active" : ""}`}
            viewBox="0 0 1200 440"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path d="M220 80 C290 80 280 160 340 160 M220 220 H340 M220 360 C290 360 280 280 340 280 M860 160 C920 160 900 80 980 80 M860 220 H980 M860 280 C920 280 900 360 980 360" />
          </svg>
          <SourceCards
            data={visible}
            reading={reading}
            highlight={selected ? "slack" : ""}
            onInspect={() => setInspector("sources")}
          />
          <section className="mc-board">
            <div className="mc-board-header">
              <span>
                <Sparkles size={16} /> Evidence blackboard
              </span>
              <span className="mc-chip">
                {stage >= 3 ? "DECISION → ACTION" : "BUILDING THE TIMELINE"}
              </span>
            </div>
            <div className="mc-board-body">
              {stage < 3 && (
                <>
                  <div className="mc-board-caption">
                    {stage === 0
                      ? "SOURCE EVENTS KEEP THEIR HISTORY"
                      : replay && beat === 9
                        ? "ONE DECISION · TWO PRECISE REPAIRS"
                        : "AGENTS ADD TIME, AUTHORITY, AND QUALIFICATIONS"}
                  </div>
                  {replay && beat === 9 && data?.plan ? (
                    <ChangePreview data={data} />
                  ) : (
                    <Timeline
                      data={visible}
                      replay={replay}
                      beat={beat}
                      selected={selected}
                      select={setSelected}
                    />
                  )}
                </>
              )}
              {stage >= 3 && data?.plan && (
                <>
                  <div className="mc-board-caption">
                    {stage >= 5
                      ? "REQUESTED → INDEPENDENTLY REREAD"
                      : "EXACT CHANGES · IMMUTABLE REVISION"}
                  </div>
                  {stage === 3 && replay && (
                    <div className="mc-date-transition">
                      <span>
                        SEP <strong>30</strong>
                      </span>
                      <ArrowRight size={30} />
                      <span>
                        OCT <strong>02</strong>
                      </span>
                      <small>2026 · All-day launch milestone</small>
                    </div>
                  )}
                  <ChangePreview data={data} verify={stage >= 4} />
                </>
              )}
              <div className="mc-board-conclusion">
                <ShieldCheck size={20} />
                <div>
                  <strong>
                    {verified
                      ? "Verified by comparison, not by assumption."
                      : stage === 3
                        ? "Approval binds to this exact revision."
                        : data?.plan
                          ? data.plan.status === "abstained"
                            ? "Abstain until missing facts are resolved."
                            : "A grounded decision, ready for review."
                          : stage === 0
                            ? "The system starts with evidence."
                            : "Build the timeline. Preserve the provenance."}
                  </strong>
                  <p>
                    {stage === 3
                      ? "Before every write: recheck evidence, authority, revision, and target state."
                      : (data?.plan?.explanation ??
                        "Independent assessments commit before comparison. Source text and IDs stay attached.")}
                  </p>
                </div>
              </div>
              {stage === 3 && (
                <div className="mc-approval-action">
                  <LockKeyhole size={15} />
                  <span>Paused for human approval</span>
                  {replay ? (
                    <Button
                      className="mc-approve"
                      onClick={() => {
                        advance("approve");
                        setPlaying(true);
                      }}
                    >
                      Approve replay repair <ArrowRight size={15} />
                    </Button>
                  ) : (
                    <Button
                      className="mc-approve"
                      disabled={!canApprove}
                      onClick={() =>
                        data && setReview({ data, recover: false })
                      }
                    >
                      {data?.approval
                        ? "Decision: " + data.approval.decision
                        : "Review live approval"}
                    </Button>
                  )}
                </div>
              )}
              {replay && recovery && beat === 12 && (
                <div className="mc-recovery">
                  <TriangleAlert size={18} />
                  <div>
                    <strong>Uncertain Calendar write · Jira pending</strong>
                    <p>
                      The journal survived. Reread before deciding whether a
                      retry is necessary.
                    </p>
                    <Button
                      className="mc-approve"
                      onClick={() => {
                        advance("recover");
                        setPlaying(true);
                      }}
                    >
                      Simulate restart & reread
                    </Button>
                  </div>
                </div>
              )}
              {!replay && data?.run?.error && (
                <div className="mc-recovery">
                  <TriangleAlert size={18} />
                  <div>
                    <p>{data.run.error}</p>
                    <Button
                      className="mc-approve"
                      disabled={!canRecover}
                      onClick={() => data && setReview({ data, recover: true })}
                    >
                      Review recovery
                    </Button>
                  </div>
                </div>
              )}
            </div>
            <div className="mc-board-footer">
              <span className="mc-dot" />
              {verified ? "Verification complete" : "Provenance preserved"}
              <button onClick={() => setInspector("approval")}>
                {data?.plan
                  ? "Revision " + short(data.plan.id)
                  : "Awaiting revision"}
              </button>
            </div>
          </section>
          <AgentCards
            data={visible}
            selected={selected}
            onSelect={setSelected}
            onInspect={() => setInspector("assessments")}
          />
        </div>
        {stage === 6 && data && (
          <section className="mc-adapt-section">
            <div className="mc-adapt-title">
              <span>
                <CheckCircle2 size={18} />{" "}
                {ops.filter((o) => o.verified).length} / {ops.length} resource
                repairs verified
              </span>
              <span>Detect → decision → verified reality</span>
            </div>
            <Adapt data={data} />
          </section>
        )}
        <footer className="mc-controls">
          <div className="mc-control-story">
            <span className="mc-orbit">
              {gate ? (
                <LockKeyhole size={19} />
              ) : verified ? (
                <CheckCircle2 size={20} />
              ) : (
                <Radio size={20} />
              )}
            </span>
            <div>
              <strong>
                {gate
                  ? "The system waits for you."
                  : verified
                    ? "The decision and the records agree."
                    : "A decision is only useful when reality catches up."}
              </strong>
              <p>
                {replay
                  ? `Demo Replay · ${String(beat + 1).padStart(2, "0")} / ${BEATS.length} · ${playing ? "Playing" : gate ? "Awaiting action" : "Paused"}`
                  : `Live · ${live.connected ? "Event stream connected" : "Stream offline"} · ${data?.progress?.state ?? "Waiting"}`}
              </p>
            </div>
          </div>
          <div className="mc-transport">
            {replay ? (
              <>
                <Button
                  className="mc-icon-button"
                  onClick={reset}
                  aria-label="Reset replay"
                >
                  <RotateCcw size={16} />
                </Button>
                <Button
                  className="mc-ghost"
                  disabled={gate || complete}
                  onClick={() => {
                    setPlaying(false);
                    advance();
                  }}
                >
                  Next step <SkipForward size={15} />
                </Button>
                <Button
                  className="mc-primary"
                  disabled={gate}
                  onClick={() => {
                    if (complete) {
                      reset();
                      setPlaying(true);
                    } else setPlaying((p) => !p);
                  }}
                >
                  {playing ? <Pause size={16} /> : <Play size={16} />}{" "}
                  {complete
                    ? "Replay story"
                    : playing
                      ? "Pause"
                      : beat === 0
                        ? "Play walkthrough"
                        : "Play"}
                </Button>
              </>
            ) : (
              <Button
                className="mc-primary"
                disabled={
                  live.waiting ||
                  data?.progress?.state === "reading" ||
                  data?.progress?.state === "investigating"
                }
                onClick={live.scan}
              >
                <Radio size={15} /> Read-only launch scan
              </Button>
            )}
          </div>
          {replay && (
            <Progress
              className="mc-progress"
              aria-label="Replay progress"
              value={
                ((beat +
                  (gate || complete
                    ? 0
                    : Math.min(elapsed / BEATS[beat].seconds, 1))) /
                  (BEATS.length - 1)) *
                100
              }
            />
          )}
        </footer>
        <div className="mc-options">
          <div className="mc-option">
            <Switch id="mc-notes" checked={notes} onCheckedChange={setNotes} />
            <label htmlFor="mc-notes">Presenter notes</label>
          </div>
          <div className="mc-option">
            <Switch
              id="mc-compact"
              checked={compact}
              onCheckedChange={setCompact}
            />
            <label htmlFor="mc-compact">Presentation layout</label>
          </div>
          {replay && (
            <div className="mc-option">
              <Switch
                id="mc-recovery"
                checked={recovery}
                onCheckedChange={(checked) => {
                  setRecovery(checked);
                  reset();
                }}
              />
              <label htmlFor="mc-recovery">Recovery branch</label>
            </div>
          )}
          <span className="mc-footnote">
            {replay
              ? "2–3 minute story · Space to play / pause · → to advance"
              : "Credentials ≠ successful connection checks"}
          </span>
        </div>
        {notes && (
          <aside className="mc-presenter-notes">
            <BookOpen size={18} />
            <div>
              <strong>Presenter cue · {STAGES[stage]}</strong>
              <p>
                {replay
                  ? BEATS[beat].note
                  : "Describe only results on screen. The October 2 reply is checked against the actual thread. Scans read providers and may run the configured model; they do not approve repairs or send messages."}
              </p>
            </div>
          </aside>
        )}
        <p className="mc-method-note">
          Three isolated contexts · one configured model · shared evidence · one
          optional follow-up.{" "}
          <button onClick={() => setInspector("events")}>
            Inspect runtime
          </button>
        </p>
      </div>
      <Dialog
        open={inspector !== null}
        onOpenChange={(open) => {
          if (!open) setInspector(null);
        }}
      >
        <DialogContent className="mc-dialog">
          <DialogHeader>
            <DialogTitle>Inside the reconciliation</DialogTitle>
            <DialogDescription>
              {replay
                ? "Demo Replay · simulated records and operations."
                : "Live records from the local backend."}{" "}
              Structured assessment summaries, not private chain-of-thought.
            </DialogDescription>
          </DialogHeader>
          <Tabs value={inspector ?? "sources"} onValueChange={setInspector}>
            <TabsList className="mc-inspector-tabs">
              {[
                "sources",
                "assessments",
                "approval",
                "operations",
                "events",
              ].map((tab) => (
                <TabsTrigger key={tab} value={tab}>
                  {tab[0].toUpperCase() + tab.slice(1)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="mc-inspector-explainer">
            {inspector === "sources"
              ? "All-day Calendar end.date is exclusive: October 2 → October 3 represents one day. Only dates change; title, all-day status, reminders, unrelated fields, release name and status are preserved."
              : inspector === "assessments"
                ? "Initial contexts cannot see peer conclusions. They commit before one optional follow-up. Confidence is an assessment, not a calibrated probability."
                : inspector === "approval"
                  ? "Approval binds to planId → snapshotId → exact actions. The executor rechecks current revision, authority configuration, evidence, Calendar ETag, and Jira preflight."
                  : inspector === "operations"
                    ? "Prepared → sending → reread → verified. A timeout remains uncertain until reread. A Calendar success is preserved if Jira fails."
                    : "Credential presence is separate from dated connection checks. Events record actual backend lifecycle boundaries."}
          </div>
          <pre tabIndex={0}>{JSON.stringify(inspected, null, 2)}</pre>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!review}
        onOpenChange={(open) => {
          if (!open && !busy) setReview(undefined);
        }}
      >
        <DialogContent className="mc-dialog">
          <DialogHeader>
            <DialogTitle>
              {review?.recover
                ? "Resume approved live repair"
                : "Approve live provider changes"}
            </DialogTitle>
            <DialogDescription>
              This changes the configured Calendar event and/or Jira version. It
              does not send a Slack message. The backend rechecks authorization
              and current state.
            </DialogDescription>
          </DialogHeader>
          {review && (
            <>
              <ChangePreview data={review.data} />
              <p className="mc-small">Revision {review.data.plan?.id}</p>
              {data?.plan?.id !== review.data.plan?.id && (
                <p className="mc-amber">
                  This revision was superseded. Close this preview and review
                  current evidence.
                </p>
              )}
              <Button
                className="mc-approve"
                disabled={
                  busy ||
                  !!failure ||
                  !current ||
                  data?.plan?.id !== review.data.plan?.id
                }
                onClick={act}
              >
                {busy
                  ? "Submitting…"
                  : review.recover
                    ? "Resume approved live repair"
                    : "Approve & apply live changes"}
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
