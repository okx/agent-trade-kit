import type { ToolSpec, ToolArgs, ToolContext } from "./types.js";
import { downloadSkillZip } from "../skills/index.js";

export function registerSkillsTools(): ToolSpec[] {
  return [
    {
      name: "skills_get_categories",
      module: "skills",
      description:
        "List all available skill categories in OKX Skills Marketplace. " +
        "Use the returned categoryId as input to skills_search for category filtering. " +
        "Do NOT use for searching or downloading skills — use skills_search or skills_download.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      isWrite: false,
      handler: handleGetCategories,
    },
    {
      name: "skills_search",
      module: "skills",
      description:
        "Search for skills in OKX Skills Marketplace by keyword or category. " +
        "To get valid category IDs, call skills_get_categories first. " +
        "Returns skill names for use with skills_download. " +
        "Do NOT use for downloading — use skills_download.",
      inputSchema: {
        type: "object",
        properties: {
          keyword: {
            type: "string",
            description: "Search keyword (matches name, description, tags)",
          },
          categories: {
            type: "string",
            description: "Filter by category ID",
          },
          page: {
            type: "string",
            description: "Page number, starting from 1. Default: 1",
          },
          limit: {
            type: "string",
            description: "Results per page. Default: 20, max: 100",
          },
        },
        additionalProperties: false,
      },
      isWrite: false,
      handler: handleSearch,
    },
    {
      name: "skills_download",
      module: "skills",
      description:
        "Download a skill zip file from OKX Skills Marketplace to a local directory. " +
        "Always call skills_search first to confirm the skill name exists. " +
        "Downloads the latest approved version. " +
        "NOTE: This only downloads the zip — it does NOT install to agents. " +
        "For full installation use CLI: okx skill add <name>. " +
        "Use when the user wants to inspect or manually install a skill package.",
      inputSchema: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Skill name (unique identifier)",
          },
          targetDir: {
            type: "string",
            description: "Directory path where the zip file will be saved",
          },
        },
        required: ["name", "targetDir"],
        additionalProperties: false,
      },
      isWrite: true,
      handler: handleDownload,
    },
  ];
}

async function handleGetCategories(
  _args: ToolArgs,
  ctx: ToolContext,
): Promise<unknown> {
  const result = await ctx.client.privateGet(
    "/api/v5/skill/categories",
  );
  return result;
}

async function handleSearch(
  args: ToolArgs,
  ctx: ToolContext,
): Promise<unknown> {
  const query: Record<string, string> = {};
  if (args.keyword) query.keyword = String(args.keyword);
  if (args.categories) query.categories = String(args.categories);
  if (args.page) query.page = String(args.page);
  if (args.limit) query.limit = String(args.limit);

  const result = await ctx.client.privateGet(
    "/api/v5/skill/search",
    query,
  );
  // totalPage is returned at the top level of the API response (not inside data)
  const totalPage = result.raw?.totalPage as string | undefined;
  return { ...result, totalPage };
}

async function handleDownload(
  args: ToolArgs,
  ctx: ToolContext,
): Promise<unknown> {
  const name = String(args.name);
  const targetDir = String(args.targetDir);

  const filePath = await downloadSkillZip(ctx.client, name, targetDir);

  return {
    endpoint: "POST /api/v5/skill/download",
    requestTime: new Date().toISOString(),
    data: {
      name,
      filePath,
    },
  };
}
