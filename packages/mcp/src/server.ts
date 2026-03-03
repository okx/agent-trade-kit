import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import {
  OkxRestClient,
  buildTools,
  MODULES,
  OkxApiError,
  toToolErrorPayload,
  toMcpTool,
} from "@okx-hub/core";
import type { OkxConfig, ModuleId, ToolSpec } from "@okx-hub/core";
import type { TradeLogger } from "@okx-hub/core";
import { SERVER_NAME, SERVER_VERSION } from "./constants.js";

const SYSTEM_CAPABILITIES_TOOL_NAME = "system_get_capabilities";
const SYSTEM_CAPABILITIES_TOOL: Tool = {
  name: SYSTEM_CAPABILITIES_TOOL_NAME,
  description:
    "Return machine-readable server capabilities and module availability for agent planning.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

type ModuleCapabilityStatus = "enabled" | "disabled" | "requires_auth";

interface CapabilitySnapshot {
  readOnly: boolean;
  hasAuth: boolean;
  demo: boolean;
  moduleAvailability: Record<
    ModuleId,
    {
      status: ModuleCapabilityStatus;
      reasonCode?: string;
    }
  >;
}

function buildCapabilitySnapshot(config: OkxConfig): CapabilitySnapshot {
  const enabledModules = new Set(config.modules);
  const moduleAvailability = {} as CapabilitySnapshot["moduleAvailability"];

  for (const moduleId of MODULES) {
    if (!enabledModules.has(moduleId)) {
      moduleAvailability[moduleId] = {
        status: "disabled",
        reasonCode: "MODULE_FILTERED",
      };
      continue;
    }

    if (moduleId === "market") {
      moduleAvailability[moduleId] = { status: "enabled" };
      continue;
    }

    if (!config.hasAuth) {
      moduleAvailability[moduleId] = {
        status: "requires_auth",
        reasonCode: "AUTH_MISSING",
      };
      continue;
    }

    moduleAvailability[moduleId] = { status: "enabled" };
  }

  return {
    readOnly: config.readOnly,
    hasAuth: config.hasAuth,
    demo: config.demo,
    moduleAvailability,
  };
}

function successResult(
  toolName: string,
  data: unknown,
  capabilitySnapshot: CapabilitySnapshot,
): CallToolResult {
  const payload: Record<string, unknown> = {
    tool: toolName,
    ok: true,
    data,
    capabilities: capabilitySnapshot,
    timestamp: new Date().toISOString(),
  };
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  };
}

function errorResult(
  toolName: string,
  error: unknown,
  capabilitySnapshot: CapabilitySnapshot,
): CallToolResult {
  const payload = toToolErrorPayload(error);
  const structured: Record<string, unknown> = {
    tool: toolName,
    ...payload,
    serverVersion: SERVER_VERSION,
    capabilities: capabilitySnapshot,
  };
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify(structured, null, 2) }],
    structuredContent: structured,
  };
}

function unknownToolResult(
  toolName: string,
  capabilitySnapshot: CapabilitySnapshot,
): CallToolResult {
  return errorResult(
    toolName,
    new OkxApiError(`Tool "${toolName}" is not available in this server session.`, {
      code: "TOOL_NOT_AVAILABLE",
      suggestion: "Call list_tools again and choose from currently available tools.",
    }),
    capabilitySnapshot,
  );
}

export function createServer(config: OkxConfig, logger?: TradeLogger): Server {
  const client = new OkxRestClient(config);
  const tools = buildTools(config);
  const toolMap = new Map<string, ToolSpec>(tools.map((tool) => [tool.name, tool]));

  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [...tools.map(toMcpTool), SYSTEM_CAPABILITIES_TOOL],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name;

    if (toolName === SYSTEM_CAPABILITIES_TOOL_NAME) {
      const snapshot = buildCapabilitySnapshot(config);
      return successResult(
        toolName,
        {
          server: {
            name: SERVER_NAME,
            version: SERVER_VERSION,
          },
          capabilities: snapshot,
        },
        snapshot,
      );
    }

    const tool = toolMap.get(toolName);

    if (!tool) {
      return unknownToolResult(toolName, buildCapabilitySnapshot(config));
    }

    const startTime = Date.now();
    try {
      const response = await tool.handler(request.params.arguments ?? {}, {
        config,
        client,
      });
      logger?.log("info", toolName, request.params.arguments ?? {}, response, Date.now() - startTime);
      return successResult(toolName, response, buildCapabilitySnapshot(config));
    } catch (error) {
      const level = error instanceof OkxApiError ? "warn" : "error";
      logger?.log(level, toolName, request.params.arguments ?? {}, error, Date.now() - startTime);
      return errorResult(toolName, error, buildCapabilitySnapshot(config));
    }
  });

  return server;
}
