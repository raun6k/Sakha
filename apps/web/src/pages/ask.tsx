import type { Role } from "@sakha/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { Mic, Send } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { AnswerCard } from "../components/answer-card";
import { FieldArt } from "../components/field-art";
import { ErrorNotice, Field, State } from "../components/ui";
import { t } from "../copy";
import { useLang } from "../language";
import {
  executeCommand,
  useCommand,
  useFarmId,
  useRead,
  useService,
} from "../services/context";
import { commandKey, errorMessage } from "../services/http";
import { emptyStream, reconcileEvent } from "../state/stream";
import { useUi } from "../state/ui";
import { cardFromAnswer, type TeamId } from "../team/adapter";

function canChat(role?: Role) {
  return Boolean(
    role?.capabilities.some(
      (cap) =>
        cap.key === "chat" && ["enabled", "degraded"].includes(cap.status),
    ),
  );
}

interface SpeechResultEvent {
  results: ArrayLike<{ 0: { transcript: string } }>;
}
interface SpeechRec {
  lang: string;
  interimResults: boolean;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: (() => void) | null;
  start: () => void;
}

function speechRecognizer() {
  if (typeof window === "undefined") return undefined;
  const host = window as Window & {
    SpeechRecognition?: new () => SpeechRec;
    webkitSpeechRecognition?: new () => SpeechRec;
  };
  const Ctor = host.SpeechRecognition ?? host.webkitSpeechRecognition;
  return Ctor ? new Ctor() : undefined;
}

export function AskPage() {
  const { lang } = useLang();
  const farmId = useFarmId();
  const roleQuery = useRead(
    "getAgent",
    { params: { farmId, roleKey: "sakha" }, input: {} },
    Boolean(farmId),
  );
  const role = roleQuery.data;
  if (roleQuery.isPending)
    return <p className="loading-line">{t(lang, "loading")}</p>;
  if (roleQuery.error || !role)
    return (
      <div className="route-content">
        <State
          title={t(lang, "startFailed")}
          retry={() => void roleQuery.refetch()}
        >
          {errorMessage(roleQuery.error)}
        </State>
      </div>
    );
  return <Thread role={role} />;
}

export function Thread({
  role,
  mate = "sakha",
  embedded = false,
}: {
  role: Role;
  mate?: TeamId;
  embedded?: boolean;
}) {
  const { lang } = useLang();
  const farmId = useFarmId();
  const { service } = useService();
  const client = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const ready = canChat(role);
  const chat = role.capabilities.find((cap) => cap.key === "chat");
  const conversations = useRead(
    "listConversations",
    { params: { farmId }, input: { role_key: role.key } },
    Boolean(farmId),
  );
  const [createdId, setCreatedId] = useState("");
  const conversationId = createdId || conversations.data?.items[0]?.id || "";
  const messages = useRead(
    "listMessages",
    { params: { farmId, conversationId }, input: {} },
    Boolean(conversationId),
  );
  const [selectedRunId, setRunId] = useState("");
  const storedRuns = useRead(
    "listRuns",
    { params: { farmId }, input: { conversation_id: conversationId } },
    Boolean(conversationId),
  );
  const runId =
    selectedRunId ||
    storedRuns.data?.items.find((run) =>
      [
        "queued",
        "running",
        "waiting_clarification",
        "waiting_approval",
        "interrupted",
      ].includes(run.state),
    )?.id ||
    "";
  const run = useRead(
    "getRun",
    { params: { farmId, runId }, input: {} },
    Boolean(runId),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [stream, setStream] = useState(emptyStream);
  const text = useUi((s) => s.composer[role.key] ?? "");
  const setText = useUi((s) => s.setComposer);
  const submission = useRef(false);
  const homeConsumed = useRef(false);
  const pendingCommand = useRef<
    { key: string; text: string; conversationId: string } | undefined
  >(undefined);
  const active =
    run.data &&
    ["queued", "running", "waiting_clarification", "waiting_approval"].includes(
      run.data.state,
    );
  const cancel = useCommand("cancelRun", { farmId, runId });
  useEffect(() => {
    if (!farmId || !ready) return;
    return service.subscribe(
      farmId,
      undefined,
      (event) => {
        setStream((current) => reconcileEvent(current, event));
        if (event.type !== "text_batch")
          void client.invalidateQueries({ queryKey: ["sakha", farmId] });
      },
      () => undefined,
      (state) => {
        if (state === "connected")
          void client.invalidateQueries({ queryKey: ["sakha", farmId] });
      },
    );
  }, [farmId, ready, service, client]);
  const send = useCallback(
    async (value: string) => {
      if (submission.current || !value.trim() || !ready) return;
      if (active || (conversationId && storedRuns.isPending)) {
        setText(role.key, value);
        return;
      }
      submission.current = true;
      setBusy(true);
      setError(undefined);
      try {
        let id = conversationId;
        if (!id) {
          const created = await executeCommand(service, "createConversation", {
            params: { farmId },
            input: { role_key: role.key, title: value.slice(0, 80) },
          });
          id = created.id;
          setCreatedId(id);
        }
        const old = pendingCommand.current;
        const command =
          old && old.text === value && old.conversationId === id
            ? old
            : { key: commandKey(), text: value, conversationId: id };
        pendingCommand.current = command;
        const result = await executeCommand(
          service,
          "submitTurn",
          {
            params: { farmId, conversationId: id },
            input: { text: value, evidence: [] },
          },
          command.key,
        );
        pendingCommand.current = undefined;
        setRunId(result.id);
        setText(role.key, "");
        await client.invalidateQueries({ queryKey: ["sakha", farmId] });
      } catch (caught) {
        setError(caught);
        setText(role.key, value);
      } finally {
        submission.current = false;
        setBusy(false);
      }
    },
    [
      ready,
      active,
      conversationId,
      storedRuns.isPending,
      setText,
      role.key,
      service,
      farmId,
      client,
    ],
  );
  useEffect(() => {
    const state = location.state as { question?: string } | null;
    if (
      state?.question &&
      ready &&
      !homeConsumed.current &&
      conversations.isSuccess &&
      (!conversationId || storedRuns.isSuccess)
    ) {
      homeConsumed.current = true;
      navigate(location.pathname, { replace: true, state: null });
      void send(state.question);
    }
  }, [
    ready,
    conversations.isSuccess,
    conversationId,
    storedRuns.isSuccess,
    location.state,
    location.pathname,
    navigate,
    send,
  ]);
  const partial = runId ? stream.partial[runId]?.trim() : "";
  const partialAlreadyShown = messages.data?.items.some(
    (message) =>
      message.id === stream.partialMessageIds[runId] && message.text.trim(),
  );
  const thinking =
    Boolean(active) &&
    !partial &&
    !messages.data?.items.some(
      (message) =>
        message.status === "partial" &&
        message.text.trim() &&
        message.created_at >= (run.data?.created_at ?? ""),
    );
  const speak = () => {
    const recognizer = speechRecognizer();
    if (!recognizer) return;
    recognizer.lang = lang === "hi" ? "hi-IN" : "en-IN";
    recognizer.interimResults = false;
    recognizer.onresult = (event) => {
      const heard = event.results[0]?.[0]?.transcript;
      if (heard) setText(role.key, heard);
    };
    recognizer.onerror = () => undefined;
    recognizer.start();
  };
  const voiceReady = speechRecognizer() !== undefined;
  const history =
    messages.data?.items.filter(
      (message) =>
        message.author === "farmer" || message.text.trim().length > 0,
    ) ?? [];
  const body = (
    <>
      {!ready && history.length === 0 ? (
        <section className="card setup-note">
          <FieldArt mood="calm" />
          <p>
            {chat?.status === "disabled"
              ? t(lang, "assistantNeedsYes")
              : t(lang, "assistantOff")}
          </p>
          <Link className="button" to="/farm">
            {t(lang, "farm")}
          </Link>
        </section>
      ) : null}
      {ready || history.length > 0 ? (
        <>
          {ready ? (
            <div className="suggestions">
              {(
                [
                  "suggestionsRain",
                  "suggestionsCrop",
                  "suggestionsWater",
                ] as const
              ).map((key) => (
                <button
                  type="button"
                  className="button secondary"
                  key={key}
                  onClick={() => setText(role.key, t(lang, key))}
                >
                  {t(lang, key)}
                </button>
              ))}
            </div>
          ) : null}
          <div className="transcript">
            {history.map((message) =>
              message.author === "farmer" ? (
                <article className="message farmer" key={message.id}>
                  <strong>{t(lang, "you")}</strong>
                  <p>{message.text}</p>
                </article>
              ) : (
                <AnswerCard
                  key={message.id}
                  card={cardFromAnswer({
                    text:
                      message.id === stream.partialMessageIds[runId] &&
                      (stream.partial[runId]?.length ?? 0) > message.text.length
                        ? (stream.partial[runId] ?? message.text)
                        : message.text,
                    agent: mate,
                    evidence: message.context.evidence,
                    createdAt: message.created_at,
                    consulted: message.context.consulted,
                    citations: message.context.citations?.map((item) => ({
                      title: item.title,
                      url: item.url,
                      adapter: item.source,
                      fetched_at: item.fetched_at,
                    })),
                    stored: message.context.card ?? message.card,
                    lang,
                  })}
                />
              ),
            )}
            {partial && !partialAlreadyShown ? (
              <article className="message agent partial">
                <strong>{t(lang, "sakha")}</strong>
                <p>{partial}</p>
              </article>
            ) : null}
          </div>
          {ready ? (
            <>
              {thinking ? (
                <p className="thinking" role="status">
                  {t(lang, "thinking")}
                </p>
              ) : null}
              {run.data?.pending
                .filter((item) => item.status === "pending")
                .map((item) => (
                  <Pending
                    key={item.id}
                    farmId={farmId}
                    runId={run.data?.id ?? ""}
                    item={item}
                  />
                ))}
              {run.data?.failure ? (
                <ErrorNotice error={new Error(run.data.failure.message)} />
              ) : null}
              {active &&
              run.data?.capabilities.some(
                (cap) => cap.key === "cancel" && cap.status === "enabled",
              ) ? (
                <button
                  type="button"
                  className="button secondary"
                  disabled={cancel.isPending}
                  onClick={() =>
                    cancel.mutate({ expected_version: run.data?.version ?? 1 })
                  }
                >
                  {t(lang, "stop")}
                </button>
              ) : null}
              <form
                className="composer"
                onSubmit={(event) => {
                  event.preventDefault();
                  void send(text);
                }}
              >
                <textarea
                  aria-label={t(lang, "yourQuestion")}
                  value={text}
                  rows={2}
                  placeholder={t(lang, "questionPlaceholder")}
                  onChange={(event) => setText(role.key, event.target.value)}
                />
                {voiceReady ? (
                  <button
                    type="button"
                    className="button secondary icon-button"
                    aria-label={t(lang, "speak")}
                    onClick={speak}
                  >
                    <Mic size={22} />
                  </button>
                ) : null}
                <button
                  className="button icon-button"
                  type="submit"
                  aria-label={t(lang, "send")}
                  disabled={busy || Boolean(active) || !text.trim()}
                >
                  <Send size={22} />
                </button>
              </form>
            </>
          ) : (
            <p className="quiet">{t(lang, "savedAnswers")}</p>
          )}
          <ErrorNotice error={error ?? messages.error} />
        </>
      ) : null}
    </>
  );
  if (embedded) return body;
  return <div className="route-content">{body}</div>;
}

function Pending({
  farmId,
  runId,
  item,
}: {
  farmId: string;
  runId: string;
  item: {
    id: string;
    version: number;
    kind: "clarification" | "runtime_approval";
    question: string;
    options: string[];
  };
}) {
  const { lang } = useLang();
  const [answer, setAnswer] = useState("");
  const clarify = useCommand("answerClarification", {
    farmId,
    runId,
    clarificationId: item.kind === "clarification" ? item.id : "unused",
  });
  const approval = useCommand("respondApproval", {
    farmId,
    runId,
    approvalId: item.kind === "runtime_approval" ? item.id : "unused",
  });
  if (item.kind === "clarification")
    return (
      <section className="card">
        <h2>{t(lang, "oneDetail")}</h2>
        <p>{item.question}</p>
        <Field label={t(lang, "yourAnswer")}>
          <input
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
          />
        </Field>
        <div className="suggestions">
          {item.options.map((option) => (
            <button
              type="button"
              className="button secondary"
              key={option}
              onClick={() => setAnswer(option)}
            >
              {option}
            </button>
          ))}
          <button
            type="button"
            className="button secondary"
            onClick={() => setAnswer(t(lang, "notSure"))}
          >
            {t(lang, "notSure")}
          </button>
        </div>
        <button
          type="button"
          className="button"
          disabled={!answer.trim() || clarify.isPending}
          onClick={() =>
            void clarify.mutateAsync({
              expected_version: item.version,
              answer,
            })
          }
        >
          {t(lang, "saveAnswer")}
        </button>
        <ErrorNotice error={clarify.error} />
      </section>
    );
  return (
    <section className="card">
      <h2>{t(lang, "lookupAsk")}</h2>
      <p>{item.question}</p>
      <div className="actions">
        <button
          type="button"
          className="button"
          disabled={approval.isPending}
          onClick={() =>
            approval.mutate({
              expected_version: item.version,
              decision: "allow",
            })
          }
        >
          {t(lang, "allow")}
        </button>
        <button
          type="button"
          className="button secondary"
          disabled={approval.isPending}
          onClick={() =>
            approval.mutate({
              expected_version: item.version,
              decision: "deny",
            })
          }
        >
          {t(lang, "no")}
        </button>
      </div>
      <ErrorNotice error={approval.error} />
    </section>
  );
}

export function setupMessageFor(status: string | undefined, lang: "en" | "hi") {
  return status === "disabled"
    ? t(lang, "assistantNeedsYes")
    : t(lang, "assistantOff");
}
