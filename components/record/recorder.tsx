"use client";

import type { PlanId } from "@/lib/plans";
import { modeInfo } from "@/lib/recorder/types";
import { useRecorder } from "@/lib/recorder/use-recorder";
import { Controls } from "./controls";
import { ModeSelect } from "./mode-select";
import { PreviewStage } from "./preview-stage";
import { ReviewPanel } from "./review-panel";
import { StepIndicator } from "./step-indicator";
import { UploadMeter } from "./upload-meter";

function Banner({
  tone,
  title,
  message,
}: {
  tone: "error" | "notice";
  title: string;
  message: string;
}) {
  const isError = tone === "error";

  return (
    <div
      role={isError ? "alert" : "status"}
      className={`rounded-[var(--radius-sm)] border px-4 py-3 ${
        isError
          ? "border-[var(--danger)]/25 bg-[var(--danger-soft)]"
          : "border-[var(--line)] bg-[var(--panel)]"
      }`}
    >
      <p className={`text-sm font-medium ${isError ? "text-[var(--danger)]" : ""}`}>{title}</p>
      <p className="mt-1 text-sm leading-relaxed text-[var(--ink-muted)]">{message}</p>
    </div>
  );
}

export function Recorder({
  plan,
  creditsDetail,
  outOfCredits = false,
}: {
  plan: PlanId;
  creditsDetail: string;
  outOfCredits?: boolean;
}) {
  const recorder = useRecorder(plan);
  const { phase, mode } = recorder;

  const inSession =
    mode !== null &&
    (phase === "ready" ||
      phase === "starting" ||
      phase === "recording" ||
      phase === "finalizing");

  const choosing = phase === "idle" || phase === "preparing";
  const step: 1 | 2 | 3 =
    phase === "preparing" ? 2 : choosing ? 1 : phase === "review" ? 3 : 3;

  const heading =
    phase === "recording" || phase === "finalizing"
      ? "Recording"
      : phase === "review"
        ? "Ready to share"
        : inSession
          ? modeInfo(mode).label
          : "New recording";

  const subline =
    phase === "recording"
      ? "Uploading as you go — mute your mic or drop the camera at any time."
      : phase === "finalizing"
        ? "Sending the last of it to storage…"
        : phase === "review"
          ? "The link below is live. Anyone you send it to can watch — no account needed."
          : phase === "starting"
            ? "Opening the upload…"
            : phase === "preparing"
              ? "Approve the browser permission prompt to continue."
              : inSession
                ? "Check the framing, then start when you're ready."
                : outOfCredits
                  ? creditsDetail
                  : `${creditsDetail} Choose a capture mode.`;

  return (
    <section className="flex flex-1 flex-col gap-7">
      <header className="animate-rise flex flex-col gap-4">
        {(choosing || inSession) && !outOfCredits && <StepIndicator current={step} />}
        <div>
          <h1 className="page-title">{heading}</h1>
          <p className="page-sub max-w-xl">{subline}</p>
        </div>
      </header>

      {outOfCredits && choosing && (
        <Banner
          tone="error"
          title="No credits left"
          message={creditsDetail}
        />
      )}

      {recorder.error && (
        <Banner tone="error" title={recorder.error.title} message={recorder.error.message} />
      )}
      {recorder.notice && !recorder.error && (
        <Banner tone="notice" title={recorder.notice.title} message={recorder.notice.message} />
      )}

      {choosing && !outOfCredits ? (
        <ModeSelect
          onSelect={recorder.chooseMode}
          disabled={phase === "preparing"}
          pending={phase === "preparing" ? mode : null}
        />
      ) : null}

      {inSession && (
        <div className="animate-rise flex flex-col gap-4">
          <PreviewStage
            mode={mode}
            phase={phase}
            previewStream={recorder.previewStream}
            previewCanvas={recorder.previewCanvas}
            elapsedMs={recorder.elapsedMs}
            maxDurationMs={recorder.maxDurationMs}
            nearLimit={recorder.nearLimit}
            micEnabled={recorder.micEnabled}
            cameraEnabled={recorder.cameraEnabled}
            hasCamera={recorder.hasCamera}
            hasMic={recorder.hasMic}
            compositeActive={recorder.compositeActive}
            bubbleLayout={recorder.bubbleLayout}
            onBubbleLayoutChange={recorder.setBubbleLayout}
          />

          {(phase === "recording" || phase === "finalizing") && (
            <UploadMeter
              uploadedBytes={recorder.upload.uploadedBytes}
              capturedBytes={recorder.upload.capturedBytes}
              bufferedBytes={recorder.upload.bufferedBytes}
              partBytes={recorder.upload.partBytes}
              deferredParts={recorder.upload.partsDeferred}
              finalizing={phase === "finalizing"}
            />
          )}

          <Controls
            phase={phase}
            micEnabled={recorder.micEnabled}
            cameraEnabled={recorder.cameraEnabled}
            hasMic={recorder.hasMic}
            hasCamera={recorder.hasCamera}
            onToggleMic={recorder.toggleMic}
            onToggleCamera={recorder.toggleCamera}
            onStart={() => void recorder.start()}
            onStop={recorder.stop}
            onCancel={recorder.reset}
          />
        </div>
      )}

      {phase === "review" && recorder.result && (
        <ReviewPanel
          result={recorder.result}
          autoStopped={recorder.autoStopped}
          onRestart={recorder.reset}
        />
      )}
    </section>
  );
}
