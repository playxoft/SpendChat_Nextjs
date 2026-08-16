import { VoiceMicButton } from "spendchat";

// Hold-to-dictate button. `state` drives the halo and icon; `level` is the live
// 0–1 microphone amplitude that sizes the halo while recording.
export function States() {
  return (
    <div className="flex items-center gap-6">
      <div className="grid justify-items-center gap-2">
        <VoiceMicButton state="idle" level={0} onStart={() => {}} onStop={() => {}} hint="hold M" />
        <span className="text-xs text-muted-foreground">idle</span>
      </div>
      <div className="grid justify-items-center gap-2">
        <VoiceMicButton state="starting" level={0} onStart={() => {}} onStop={() => {}} />
        <span className="text-xs text-muted-foreground">starting</span>
      </div>
      <div className="grid justify-items-center gap-2">
        <VoiceMicButton state="recording" level={0.7} onStart={() => {}} onStop={() => {}} />
        <span className="text-xs text-muted-foreground">recording</span>
      </div>
      <div className="grid justify-items-center gap-2">
        <VoiceMicButton state="transcribing" level={0} onStart={() => {}} onStop={() => {}} />
        <span className="text-xs text-muted-foreground">transcribing</span>
      </div>
      <div className="grid justify-items-center gap-2">
        <VoiceMicButton state="idle" level={0} disabled onStart={() => {}} onStop={() => {}} />
        <span className="text-xs text-muted-foreground">disabled</span>
      </div>
    </div>
  );
}

export function Dense() {
  return (
    <div className="flex items-center gap-4">
      <VoiceMicButton state="idle" level={0} onStart={() => {}} onStop={() => {}} dense />
      <VoiceMicButton state="recording" level={0.4} onStart={() => {}} onStop={() => {}} dense />
    </div>
  );
}
