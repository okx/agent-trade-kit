/** zip 包内 _meta.json 的结构（后端打包时注入） */
export interface SkillMeta {
  name: string;
  version: string;
  title: string;
  description: string;
}

/** registry.json 中每个 skill 的记录 */
export interface SkillRecord {
  name: string;
  version: string;
  description: string;
  installedAt: string;
  updatedAt: string;
  source: "marketplace";
}

/** registry.json 顶层结构 */
export interface SkillRegistry {
  version: number;
  skills: Record<string, SkillRecord>;
}

/** Search API 返回的 skill 条目 */
export interface SkillSearchItem {
  title: string;
  name: string;
  description: string;
  categories: string[];
  latestVersion: string;
  downloadCount: string;
  cTime: string;
  uTime: string;
  skillURL: string;
}

/** Categories API 返回的分类条目 */
export interface SkillCategory {
  categoryId: string;
  name: string;
}
