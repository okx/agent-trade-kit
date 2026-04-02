import type { ToolRunner } from "@agent-tradekit/core";
import { printJson, printTable, printKv, outputLine } from "../formatter.js";

function getData(result: unknown): unknown {
  return (result as Record<string, unknown>).data;
}

function formatTime(ts: unknown): string {
  if (!ts) return "-";
  return new Date(Number(ts)).toLocaleString();
}


export async function cmdNewsLatest(
  run: ToolRunner,
  opts: {
    coins?: string;
    importance?: string;
    begin?: number;
    end?: number;
    language?: string;
    detailLvl?: string;
    limit?: number;
    after?: string;
    json: boolean;
  },
): Promise<void> {
  const result = await run("news_get_latest", {
    coins: opts.coins,
    importance: opts.importance,
    begin: opts.begin,
    end: opts.end,
    language: opts.language,
    detailLvl: opts.detailLvl,
    limit: opts.limit,
    after: opts.after,
  });
  const raw = getData(result) as Record<string, unknown>[] | null;
  const pageData = raw?.[0] as Record<string, unknown> | undefined;
  if (opts.json) return printJson(pageData ?? null);
  const items = (pageData?.["details"] ?? []) as Record<string, unknown>[];
  printTable(
    items.map((n) => ({
      id: n["id"],
      time: formatTime(n["cTime"] ?? n["createTime"]),
      platforms: (n["platformList"] as string[] | undefined)?.join(",") ?? "-",
      title: String(n["title"] ?? "").slice(0, 80),
    })),
  );
  const cursor = pageData?.["nextCursor"];
  if (cursor) outputLine(`[next] --after ${cursor}`);
}

export async function cmdNewsImportant(
  run: ToolRunner,
  opts: {
    coins?: string;
    begin?: number;
    end?: number;
    language?: string;
    detailLvl?: string;
    limit?: number;
    json: boolean;
  },
): Promise<void> {
  const result = await run("news_get_latest", {
    coins: opts.coins,
    importance: "high",
    begin: opts.begin,
    end: opts.end,
    language: opts.language,
    detailLvl: opts.detailLvl,
    limit: opts.limit,
  });
  const raw = getData(result) as Record<string, unknown>[] | null;
  const pageData = raw?.[0] as Record<string, unknown> | undefined;
  if (opts.json) return printJson(pageData ?? null);
  const items = (pageData?.["details"] ?? []) as Record<string, unknown>[];
  printTable(
    items.map((n) => ({
      id: n["id"],
      time: formatTime(n["cTime"] ?? n["createTime"]),
      importance: n["importance"] ?? "-",
      platforms: (n["platformList"] as string[] | undefined)?.join(",") ?? "-",
      title: String(n["title"] ?? "").slice(0, 80),
    })),
  );
}

export async function cmdNewsByCoin(
  run: ToolRunner,
  coins: string,
  opts: {
    importance?: string;
    begin?: number;
    end?: number;
    language?: string;
    detailLvl?: string;
    limit?: number;
    json: boolean;
  },
): Promise<void> {
  const result = await run("news_get_by_coin", {
    coins,
    importance: opts.importance,
    begin: opts.begin,
    end: opts.end,
    language: opts.language,
    detailLvl: opts.detailLvl,
    limit: opts.limit,
  });
  const raw = getData(result) as Record<string, unknown>[] | null;
  const pageData = raw?.[0] as Record<string, unknown> | undefined;
  if (opts.json) return printJson(pageData ?? null);
  const items = (pageData?.["details"] ?? []) as Record<string, unknown>[];
  printTable(
    items.map((n) => ({
      id: n["id"],
      time: formatTime(n["cTime"] ?? n["createTime"]),
      coins: (n["ccyList"] as string[] | undefined)?.join(",") ?? "-",
      platforms: (n["platformList"] as string[] | undefined)?.join(",") ?? "-",
      title: String(n["title"] ?? "").slice(0, 80),
    })),
  );
}

export async function cmdNewsSearch(
  run: ToolRunner,
  keyword: string,
  opts: {
    coins?: string;
    importance?: string;
    sentiment?: string;
    sortBy?: string;
    begin?: number;
    end?: number;
    language?: string;
    detailLvl?: string;
    limit?: number;
    after?: string;
    json: boolean;
  },
): Promise<void> {
  const result = await run("news_search", {
    keyword: keyword || undefined,
    coins: opts.coins,
    importance: opts.importance,
    sentiment: opts.sentiment,
    sortBy: opts.sortBy,
    begin: opts.begin,
    end: opts.end,
    language: opts.language,
    detailLvl: opts.detailLvl,
    limit: opts.limit,
    after: opts.after,
  });
  const raw = getData(result) as Record<string, unknown>[] | null;
  const pageData = raw?.[0] as Record<string, unknown> | undefined;
  if (opts.json) return printJson(pageData ?? null);
  const items = (pageData?.["details"] ?? []) as Record<string, unknown>[];
  printTable(
    items.map((n) => ({
      id: n["id"],
      time: formatTime(n["cTime"] ?? n["createTime"]),
      platforms: (n["platformList"] as string[] | undefined)?.join(",") ?? "-",
      title: String(n["title"] ?? "").slice(0, 80),
    })),
  );
  const cursor = pageData?.["nextCursor"];
  if (cursor) outputLine(`[next] --after ${cursor}`);
}

export async function cmdNewsDetail(
  run: ToolRunner,
  id: string,
  opts: { language?: string; json: boolean },
): Promise<void> {
  const result = await run("news_get_detail", { id, language: opts.language });
  const items = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(items);
  const article = items?.[0];
  if (!article) { outputLine("Article not found."); return; }
  const rawContent = article["content"] ? String(article["content"]) : undefined;
  const content = rawContent ? (rawContent.length > 500 ? rawContent.slice(0, 500) + "... (use --json for full text)" : rawContent) : undefined;
  printKv({
    id: article["id"],
    title: article["title"],
    platforms: (article["platformList"] as string[] | undefined)?.join(", ") ?? "-",
    time: formatTime(article["cTime"] ?? article["createTime"]),
    sourceUrl: article["sourceUrl"],
    coins: (article["ccyList"] as string[] | undefined)?.join(", ") ?? "-",
    importance: article["importance"] ?? "-",
    summary: article["summary"] ?? "(see content)",
    content,
  });
}

export async function cmdNewsDomains(
  run: ToolRunner,
  opts: { json: boolean },
): Promise<void> {
  const result = await run("news_get_domains", {});
  const raw = getData(result) as Record<string, unknown>[] | null;
  const items = ((raw?.[0] as Record<string, unknown>)?.["platform"] ?? []) as string[];
  if (opts.json) return printJson(items);
  outputLine("Available news source domains:");
  (items ?? []).forEach((d) => outputLine(`  ${d}`));
}

export async function cmdNewsCoinSentiment(
  run: ToolRunner,
  coins: string,
  opts: { period?: string; json: boolean },
): Promise<void> {
  const result = await run("news_get_coin_sentiment", {
    coins,
    period: opts.period,
  });
  const raw = getData(result) as Record<string, unknown>[] | null;
  if (opts.json) return printJson(raw);
  const items = ((raw?.[0] as Record<string, unknown>)?.["details"] ?? []) as Record<string, unknown>[];
  printTable(
    items.map((c) => {
      const snt = c["sentiment"] as Record<string, unknown> | undefined;
      return {
        symbol: c["ccy"],
        label: snt?.["label"] ?? "-",
        bullish: snt?.["bullishRatio"] ?? "-",
        bearish: snt?.["bearishRatio"] ?? "-",
        mentions: c["mentionCnt"],
      };
    }),
  );
}

export async function cmdNewsCoinTrend(
  run: ToolRunner,
  coin: string,
  opts: { period?: string; points: number; json: boolean },
): Promise<void> {
  const result = await run("news_get_coin_sentiment", {
    coins: coin,
    period: opts.period,
    trendPoints: opts.points,
  });
  const raw = getData(result) as Record<string, unknown>[] | null;
  if (opts.json) return printJson(raw);
  const items = ((raw?.[0] as Record<string, unknown>)?.["details"] ?? []) as Record<string, unknown>[];
  const coinData = items?.[0];
  if (!coinData) { outputLine("No trend data."); return; }
  const trend = (coinData["trend"] ?? []) as Record<string, unknown>[];
  outputLine(`Sentiment trend for ${coin} (period: ${opts.period ?? "1h"}):`);
  printTable(
    trend.map((t) => ({
      time: formatTime(t["ts"]),
      bullish: t["bullishRatio"],
      bearish: t["bearishRatio"],
      mentions: t["mentionCnt"],
    })),
  );
}

export async function cmdNewsSentimentRank(
  run: ToolRunner,
  opts: { period?: string; sortBy?: string; limit?: number; json: boolean },
): Promise<void> {
  const result = await run("news_get_sentiment_ranking", {
    period: opts.period,
    sortBy: opts.sortBy,
    limit: opts.limit,
  });
  const raw = getData(result) as Record<string, unknown>[] | null;
  if (opts.json) return printJson(raw);
  const items = ((raw?.[0] as Record<string, unknown>)?.["details"] ?? []) as Record<string, unknown>[];
  printTable(
    items.map((c, i) => {
      const snt = c["sentiment"] as Record<string, unknown> | undefined;
      return {
        rank: i + 1,
        symbol: c["ccy"],
        label: snt?.["label"] ?? "-",
        bullish: snt?.["bullishRatio"] ?? "-",
        bearish: snt?.["bearishRatio"] ?? "-",
        mentions: c["mentionCnt"],
      };
    }),
  );
}
