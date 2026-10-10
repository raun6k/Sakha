import type { Event, Message } from "@sakha/contracts";
export interface StreamState {
  cursors: Set<string>;
  sequences: Record<string, number>;
  partial: Record<string, string>;
  messages: Message[];
  progress: Record<string, string>;
  resync: boolean;
}
export const emptyStream = (): StreamState => ({
  cursors: new Set(),
  sequences: {},
  partial: {},
  messages: [],
  progress: {},
  resync: false,
});
export function reconcileEvent(state: StreamState, event: Event): StreamState {
  if (state.cursors.has(event.cursor)) return state;
  const next = {
    ...state,
    cursors: new Set(state.cursors).add(event.cursor),
    sequences: { ...state.sequences },
    partial: { ...state.partial },
    progress: { ...state.progress },
  };
  if (next.cursors.size > 3000)
    next.cursors = new Set([...next.cursors].slice(-2000));
  const id = event.run_id ?? event.record_id ?? "";
  if (event.type === "text_batch" && event.payload.text) {
    const sequence = event.payload.sequence ?? 0;
    if (sequence > (next.sequences[id] ?? -1)) {
      next.sequences[id] = sequence;
      next.partial[id] = (next.partial[id] ?? "") + event.payload.text;
    }
  }
  if (event.type === "message_final" && event.payload.message) {
    const message = event.payload.message;
    next.messages = [
      ...state.messages.filter((m) => m.id !== message.id),
      message,
    ];
    delete next.partial[id];
  }
  if (event.type === "run_progress" && event.payload.text)
    next.progress[id] = event.payload.text;
  if (event.type === "resync_required") {
    next.resync = true;
    next.partial = {};
    next.sequences = {};
  }
  if (
    event.type === "run_state" &&
    ["failed", "cancelled", "interrupted", "completed"].includes(
      event.payload.state ?? "",
    )
  )
    delete next.partial[id];
  return next;
}
