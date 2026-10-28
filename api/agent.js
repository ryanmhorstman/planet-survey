// Field-researcher proxy. The browser runs the agent loop and executes the
// tools (lib/agent-tools.js); this handler only forwards model turns. It owns
// the system prompt, tool definitions, model and limits, accepts nothing but
// the operator's brief plus tool results, and signs a submitted field note
// only after recomputing the physics and checking the note against it.
import {
  AGENT_TOOLS,
  AGENT_TOOL_NAMES,
  MAX_AGENT_TURNS,
  MAX_TOOL_RESULT_CHARS,
  worldFromToolInput,
} from "../lib/agent-tools.js";
import { agentRequest, anthropicHeaders } from "../lib/prompts.js";
import {
  InputError,
  calculate,
  narrativeFromSections,
  PHYSICS_VERSION,
} from "../lib/planet.js";
import { verifiedCatalog, signNarrative } from "../lib/provenance.js";
import { checkNarrative } from "../lib/narrative-checks.js";
import {
  body,
  method,
  fail,
  reserve,
  providerJSON,
  ServiceError,
} from "../lib/server.js";

const ASSISTANT_BLOCKS = new Set([
  "text",
  "thinking",
  "redacted_thinking",
  "tool_use",
  "fallback",
]);

/**
 * The only shape a client may continue: a brief, then alternating model turns
 * (passed back unchanged, as thinking blocks require) and tool results.
 * @param {unknown} messages
 */
export function validateConversation(messages) {
  if (
    !Array.isArray(messages) ||
    messages.length < 1 ||
    messages.length > MAX_AGENT_TURNS * 2 - 1 ||
    messages.length % 2 === 0
  )
    throw new InputError(
      "Continue the survey with its brief and tool results.",
    );
  const [first] = messages;
  if (
    first?.role !== "user" ||
    typeof first.content !== "string" ||
    first.content.trim().length < 3 ||
    first.content.length > 600
  )
    throw new InputError("Describe the survey in 3 to 600 characters.");
  const clean = [{ role: "user", content: first.content.trim() }];
  for (let i = 1; i < messages.length; i += 2) {
    const assistant = messages[i],
      user = messages[i + 1];
    if (
      assistant?.role !== "assistant" ||
      !Array.isArray(assistant.content) ||
      assistant.content.length > 40 ||
      assistant.content.some(
        (block) =>
          !ASSISTANT_BLOCKS.has(block?.type) ||
          (block.type === "tool_use" &&
            (!AGENT_TOOL_NAMES.includes(block.name) ||
              typeof block.id !== "string")),
      )
    )
      throw new InputError("The survey history is not a model turn.");
    const ids = assistant.content
      .filter((block) => block.type === "tool_use")
      .map((block) => block.id);
    if (
      user?.role !== "user" ||
      !Array.isArray(user.content) ||
      user.content.length !== ids.length ||
      !ids.length
    )
      throw new InputError("Return one result for each tool call.");
    const results = user.content.map((block, index) => {
      if (
        block?.type !== "tool_result" ||
        block.tool_use_id !== ids[index] ||
        typeof block.content !== "string" ||
        block.content.length > MAX_TOOL_RESULT_CHARS
      )
        throw new InputError("Tool results must answer the model's calls.");
      return {
        type: "tool_result",
        tool_use_id: block.tool_use_id,
        content: block.content,
        ...(block.is_error === true ? { is_error: true } : {}),
      };
    });
    clean.push(
      { role: "assistant", content: assistant.content },
      { role: "user", content: results },
    );
  }
  return clean;
}

/**
 * Validate a submit_field_report call against recomputed physics.
 * @returns {{report?: any, error?: string}}
 */
export function acceptSubmission(input, catalogs) {
  try {
    const { params, catalog } = worldFromToolInput(input.world, (name) =>
      catalogs.find((record) => record.pl_name === name),
    );
    const narrative = narrativeFromSections(
      input.sections.map((section) => ({
        kind: section.kind,
        text: String(section.text).trim(),
      })),
      input.surface_features,
    );
    const physics = calculate(params, catalog);
    const problems = checkNarrative({ params, physics, narrative }).filter(
      (result) => !result.pass,
    );
    if (problems.length)
      return {
        error: `The note disagrees with the model: ${problems.map((p) => `${p.id}${p.detail ? ` (${p.detail})` : ""}`).join("; ")}. Revise and submit again.`,
      };
    const name =
      catalog?.pl_name ||
      String(input.world_name || "")
        .trim()
        .slice(0, 60) ||
      "Field survey";
    return {
      report: {
        name,
        params,
        catalog,
        physicsVersion: PHYSICS_VERSION,
        narrative: signNarrative(params, catalog, PHYSICS_VERSION, narrative),
      },
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export function createAgentHandler({
  request = providerJSON,
  quota = reserve,
} = {}) {
  return async function handler(req, res) {
    if (!method(req, res, "POST")) return;
    let release;
    try {
      const input = body(req, 64000);
      if (
        Object.keys(input).some(
          (key) => !["messages", "catalogs"].includes(key),
        )
      )
        throw new InputError("Send the survey conversation only.");
      const messages = validateConversation(input.messages);
      const catalogs = (Array.isArray(input.catalogs) ? input.catalogs : [])
        .slice(0, 8)
        .map((record) => verifiedCatalog(record))
        .filter(Boolean);
      if (!process.env.ANTHROPIC_API_KEY)
        throw new ServiceError(
          503,
          "The field researcher is unavailable. Surveys and the model report still work.",
        );
      release = await quota(req, "analyze");
      const response = await request(
        "https://api.anthropic.com/v1/messages",
        {
          method: "POST",
          headers: anthropicHeaders(process.env.ANTHROPIC_API_KEY),
          body: JSON.stringify(agentRequest(messages, AGENT_TOOLS)),
        },
        50000,
      );
      if (!Array.isArray(response.content))
        throw new ServiceError(
          502,
          "The field researcher returned an unreadable turn. Please retry.",
          "INVALID_RESPONSE",
        );
      const message = {
        role: "assistant",
        content: response.content,
        stop_reason: response.stop_reason,
      };
      const submission = response.content.find(
        (block) =>
          block.type === "tool_use" && block.name === "submit_field_report",
      );
      if (!submission) return res.status(200).json({ message });
      const { report, error } = acceptSubmission(submission.input, catalogs);
      return res
        .status(200)
        .json(report ? { message, report } : { message, submitError: error });
    } catch (error) {
      return fail(res, error);
    } finally {
      if (release) await release();
    }
  };
}
export default createAgentHandler();
