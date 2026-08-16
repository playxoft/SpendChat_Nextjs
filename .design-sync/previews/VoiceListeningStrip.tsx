import { VoiceListeningStrip } from "spendchat";

// The status strip shown above the composer while dictation is live.
// `state="idle"` renders nothing, which is why no idle cell exists.
export function Listening() {
  return (
    <div className="w-full max-w-md">
      <VoiceListeningStrip state="recording" interim="" level={0.5} liveSupported={false} />
    </div>
  );
}

export function WithLiveTranscript() {
  return (
    <div className="w-full max-w-md">
      <VoiceListeningStrip
        state="recording"
        interim="twelve hundred forty rupees groceries at Big Bazaar"
        level={0.8}
        liveSupported
      />
    </div>
  );
}

export function Transcribing() {
  return (
    <div className="w-full max-w-md">
      <VoiceListeningStrip state="transcribing" interim="" level={0} liveSupported />
    </div>
  );
}

export function Starting() {
  return (
    <div className="w-full max-w-md">
      <VoiceListeningStrip state="starting" interim="" level={0} liveSupported={false} />
    </div>
  );
}
