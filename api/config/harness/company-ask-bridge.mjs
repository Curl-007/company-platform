// Sprint 5.1 ask-user / user-approval interaction bridge — child-runtime side.
//
// Bridges the dsh interaction seams to the platform user over the SAME
// loopback HTTP server as the execution gateway (DSH_EXECUTION_GATEWAY_URL +
// DSH_EXECUTION_TOKEN), so no harnessRuntime environment change is required:
//
//   ctx.userQuestions  -> provider ask(): POST /v1/interaction {kind:"question"}
//                         then long-polls GET /v1/interaction/:id/wait and
//                         returns the platform user's structured answer.
//   ctx.approval       -> the terminal `approval/request` waterfall answerer:
//                         same channel with {kind:"approval"}; approve maps to
//                         "allowed-once", reject to "rejected", user cancel or
//                         timeout to "cancelled".
//
// Fail-closed semantics (the channel is the platform's authority):
//   - unreachable/failed channel: questions throw; approvals resolve
//     "unavailable" (the seam's missing-answerer default).
//   - user cancel / expiry: questions throw; approvals resolve "cancelled".
// - Without a complete execution-gateway environment the plugin stays inert
//   (plain chat runs never load a platform interaction channel).
// - stdout belongs to the SDK JSON-RPC transport: no logging of any kind.

export const name = "company-ask-bridge";
export const inject = ["userQuestions", "approval"];

const CREATE_ROUTE = "/v1/interaction";
const WAIT_POLL_MARGIN_MS = 10_000;

function bridgeError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function readRuntimeConfig() {
  const token = String(process.env.DSH_EXECUTION_TOKEN || "").trim();
  const gatewayBaseUrl = String(process.env.DSH_EXECUTION_GATEWAY_URL || "").trim();
  const configured = [token, gatewayBaseUrl].filter(Boolean).length;
  if (configured === 0) return null;
  if (configured !== 2) throw bridgeError("company-ask-bridge: incomplete execution gateway environment", "AI_INTERACTION_ENV_INCOMPLETE");
  let baseUrl;
  try {
    baseUrl = new URL(gatewayBaseUrl);
  } catch {
    throw bridgeError("company-ask-bridge: invalid execution gateway URL", "AI_INTERACTION_URL_INVALID");
  }
  if (baseUrl.protocol !== "http:" || baseUrl.hostname !== "127.0.0.1" || baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) {
    throw bridgeError("company-ask-bridge: execution gateway must be an unauthenticated IPv4 loopback URL", "AI_INTERACTION_URL_INVALID");
  }
  return { baseUrl, token };
}

function combineSignals(signal, timeoutMs) {
  const signals = [];
  if (signal && !signal.aborted) signals.push(signal);
  if (Number.isFinite(timeoutMs) && timeoutMs > 0) signals.push(AbortSignal.timeout(timeoutMs));
  if (!signals.length) return undefined;
  if (typeof AbortSignal.any === "function") return AbortSignal.any(signals);
  return signals[0];
}

function isAbortFailure(error) {
  return Boolean(error && (error.name === "AbortError" || error.name === "TimeoutError"));
}

async function parseJsonResponse(response) {
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw bridgeError("company-ask-bridge: interaction channel returned invalid JSON", "AI_INTERACTION_CHANNEL_INVALID");
  }
  if (!response.ok) {
    throw bridgeError(
      payload?.error?.message || "company-ask-bridge: interaction channel rejected the request",
      payload?.error?.code || "AI_INTERACTION_CHANNEL_REJECTED",
    );
  }
  return payload;
}

async function createInteraction(runtime, body, signal) {
  const response = await fetch(new URL(CREATE_ROUTE, runtime.baseUrl), {
    body: JSON.stringify(body),
    headers: {
      Authorization: `Bearer ${runtime.token}`,
      "Content-Type": "application/json",
    },
    method: "POST",
    redirect: "error",
    signal,
  });
  const payload = await parseJsonResponse(response);
  const data = payload?.data;
  if (!data?.interactionId || !data?.waitToken || !Number.isFinite(Number(data.waitMs))) {
    throw bridgeError("company-ask-bridge: interaction channel returned an invalid interaction handle", "AI_INTERACTION_CHANNEL_INVALID");
  }
  return { interactionId: String(data.interactionId), waitMs: Number(data.waitMs), waitToken: String(data.waitToken) };
}

// Long-poll loop: the server answers each poll within waitMs (either a
// terminal outcome or `continue` for an immediate reconnect), so the total
// wait is bounded only by the server-side interaction TTL.
async function waitForOutcome(runtime, created, signal) {
  const url = new URL(`${CREATE_ROUTE}/${encodeURIComponent(created.interactionId)}/wait`, runtime.baseUrl);
  for (;;) {
    const response = await fetch(url, {
      headers: { "x-wait-token": created.waitToken },
      method: "GET",
      redirect: "error",
      signal: combineSignals(signal, created.waitMs + WAIT_POLL_MARGIN_MS),
    });
    const payload = await parseJsonResponse(response);
    const status = String(payload?.data?.status || "");
    if (status === "continue") continue;
    if (status === "answered") {
      const responsePayload = payload?.data?.response;
      if (!responsePayload || typeof responsePayload !== "object" || Array.isArray(responsePayload)) {
        throw bridgeError("company-ask-bridge: interaction channel returned an invalid answer", "AI_INTERACTION_CHANNEL_INVALID");
      }
      return { response: responsePayload, status };
    }
    if (status === "cancelled" || status === "timed_out") return { status };
    throw bridgeError("company-ask-bridge: interaction channel returned an unknown wait status", "AI_INTERACTION_CHANNEL_INVALID");
  }
}

// Question payloads cross the model/tool JSON boundary: bound every field
// locally so a runaway model value never leaves the runtime.
function questionPayload(questions) {
  if (!Array.isArray(questions) || questions.length === 0 || questions.length > 8) {
    throw bridgeError("company-ask-bridge: ask requires 1..8 questions", "AI_INTERACTION_PAYLOAD_INVALID");
  }
  return {
    questions: questions.map((question) => {
      const item = {
        id: String(question?.id || "").trim().slice(0, 128),
        question: String(question?.question || "").trim().slice(0, 2000),
      };
      if (!item.id || !item.question) {
        throw bridgeError("company-ask-bridge: ask requires question ids and texts", "AI_INTERACTION_PAYLOAD_INVALID");
      }
      if (question?.header) item.header = String(question.header).trim().slice(0, 200);
      if (question?.detail) item.detail = String(question.detail).slice(0, 4000);
      if (Array.isArray(question?.options)) {
        item.options = question.options.slice(0, 12).map((option) => {
          const normalized = { label: String(option?.label || "").trim().slice(0, 200) };
          if (!normalized.label) {
            throw bridgeError("company-ask-bridge: ask requires option labels", "AI_INTERACTION_PAYLOAD_INVALID");
          }
          if (option?.description) normalized.description = String(option.description).trim().slice(0, 500);
          return normalized;
        });
      }
      if (typeof question?.multiSelect === "boolean") item.multiSelect = question.multiSelect;
      return item;
    }),
  };
}

async function askPlatformQuestion(runtime, request) {
  let outcome;
  try {
    const created = await createInteraction(runtime, { kind: "question", payload: questionPayload(request.questions) }, request.signal);
    outcome = await waitForOutcome(runtime, created, request.signal);
  } catch (error) {
    if (isAbortFailure(error)) {
      throw bridgeError("ask_user_question was aborted before the user answered", "AI_INTERACTION_ABORTED");
    }
    throw error;
  }
  if (outcome.status !== "answered") {
    throw bridgeError(
      outcome.status === "cancelled"
        ? "ask_user_question was cancelled by the user"
        : "ask_user_question timed out before the user answered",
      outcome.status === "cancelled" ? "AI_INTERACTION_CANCELLED" : "AI_INTERACTION_TIMED_OUT",
    );
  }
  const answers = outcome.response.answers;
  if (!Array.isArray(answers)) {
    throw bridgeError("company-ask-bridge: interaction channel returned an invalid answer", "AI_INTERACTION_CHANNEL_INVALID");
  }
  return { answers };
}

async function decidePlatformApproval(runtime, req) {
  const payload = {
    toolName: String(req?.toolName || "").trim().slice(0, 128) || "unknown-tool",
  };
  if (req?.reason) payload.reason = String(req.reason).trim().slice(0, 2000);
  if (req?.callId) payload.callId = String(req.callId).trim().slice(0, 128);
  let outcome;
  try {
    const created = await createInteraction(runtime, { kind: "approval", payload }, req?.signal);
    outcome = await waitForOutcome(runtime, created, req?.signal);
  } catch (error) {
    // Fail closed exactly like a missing answerer: the approval seam's
    // vocabulary has no "channel error", only the closed outcome.
    return isAbortFailure(error) ? "cancelled" : "unavailable";
  }
  if (outcome.status === "answered") {
    return outcome.response.decision === "approve" ? "allowed-once" : "rejected";
  }
  return "cancelled";
}

export function apply(ctx) {
  const runtime = readRuntimeConfig();
  if (!runtime) return;

  ctx.userQuestions.registerProvider({
    async ask(request) {
      return askPlatformQuestion(runtime, request);
    },
  });

  // The single terminal answerer of this composition: platform users decide
  // through the interaction channel, and an unreachable channel fails closed
  // (`unavailable`) instead of letting the ask fall through the waterfall.
  ctx.on("approval/request", (req) => decidePlatformApproval(runtime, req));
}
