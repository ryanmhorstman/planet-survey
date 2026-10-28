// @ts-check
// The field-researcher loop, run in the browser: ask the proxy for a model
// turn, execute any tool calls locally, send the results back, and stop when a
// signed report arrives. Conversation history is append-only and model turns
// are returned unchanged, as the API requires for thinking blocks.
import { runAgentTool, MAX_AGENT_TURNS } from "./agent-tools.js";

/**
 * @typedef {{type: "log", text: string}
 *   | {type: "tool", name: string, input: any}
 *   | {type: "result", name: string, content: string, isError: boolean}
 *   | {type: "rejected", reason: string}} ResearchEvent
 */

/**
 * @param {{
 *   brief: string,
 *   post: (url: string, body: any) => Promise<any>,
 *   searchCatalogue: (query: string, filter: string) => Promise<any[]>,
 *   onEvent?: (event: ResearchEvent) => void,
 *   signal?: AbortSignal,
 * }} options
 * @returns {Promise<{report: any | null, reply: string}>}
 */
export async function runFieldResearcher({
  brief,
  post,
  searchCatalogue,
  onEvent = () => {},
  signal,
}) {
  /** @type {any[]} */
  const messages = [{ role: "user", content: brief }];
  /** @type {Map<string, any>} */
  const catalogs = new Map();
  for (let turn = 0; turn < MAX_AGENT_TURNS; turn++) {
    if (signal?.aborted) throw new Error("The survey was stopped.");
    const data = await post("/api/agent", {
      messages,
      catalogs: [...catalogs.values()].slice(-8),
    });
    const { content, stop_reason: stopReason } = data.message;
    messages.push({ role: "assistant", content });
    const reply = content
      .filter((/** @type {any} */ block) => block.type === "text")
      .map((/** @type {any} */ block) => block.text.trim())
      .filter(Boolean)
      .join(" ");
    if (reply) onEvent({ type: "log", text: reply });
    if (data.report) return { report: data.report, reply };
    if (stopReason === "refusal")
      throw new Error("The field researcher declined this brief.");
    const calls = content.filter(
      (/** @type {any} */ block) => block.type === "tool_use",
    );
    if (stopReason !== "tool_use" || !calls.length)
      return { report: null, reply };
    const results = [];
    for (const call of calls) {
      onEvent({ type: "tool", name: call.name, input: call.input });
      const outcome =
        call.name === "submit_field_report"
          ? {
              content: data.submitError || "Submission was not accepted.",
              is_error: /** @type {const} */ (true),
            }
          : await runAgentTool(call, { searchCatalogue, catalogs });
      if (call.name === "submit_field_report")
        onEvent({ type: "rejected", reason: outcome.content });
      else
        onEvent({
          type: "result",
          name: call.name,
          content: outcome.content,
          isError: Boolean(outcome.is_error),
        });
      results.push({ type: "tool_result", tool_use_id: call.id, ...outcome });
    }
    messages.push({ role: "user", content: results });
  }
  throw new Error(
    `The field researcher used its ${MAX_AGENT_TURNS} turns without submitting a report.`,
  );
}
