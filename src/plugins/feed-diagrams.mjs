/**
 * RSS / Atom 订阅里的流程图
 *
 * 网页上的 Mermaid 流程图是内嵌的 <svg>（浅色、深色两份，用 CSS 切换），
 * 但 feed 正文会被 sanitize-html 清洗，<svg> 不在白名单里，图会整个丢掉；
 * 阅读器也不执行 CSS / JS。所以生成 feed 时把浅色那份另存成独立的 .svg 文件，
 * 正文里换成 <img> 引用，所有阅读器都能显示。
 *
 * - saveFeedDiagram()：feed 生成时调用，把 SVG 写进暂存目录，返回网址路径
 * - feedDiagrams()：Astro 集成，构建结束时把暂存目录复制到输出目录的 /diagrams/
 *
 * 文件名是 SVG 内容的哈希，内容不变网址就不变，阅读器的缓存能命中。
 */
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** 发布后的目录，即 https://站点/diagrams/xxx.svg */
export const FEED_DIAGRAM_DIR = "diagrams";

const STAGING_DIR = path.resolve(
	process.cwd(),
	"node_modules/.cache/feed-diagrams",
);

/**
 * @param {string} svg - 完整的 <svg>…</svg> 标记（需带 xmlns）
 * @returns {string} 以 / 开头的网址路径
 */
export function saveFeedDiagram(svg) {
	const name = `${createHash("sha256").update(svg).digest("hex").slice(0, 16)}.svg`;
	mkdirSync(STAGING_DIR, { recursive: true });
	writeFileSync(
		path.join(STAGING_DIR, name),
		`<?xml version="1.0" encoding="UTF-8"?>\n${svg}\n`,
	);
	return `/${FEED_DIAGRAM_DIR}/${name}`;
}

export function feedDiagrams() {
	return {
		name: "feed-diagrams",
		hooks: {
			// 清掉上次构建留下的文件，避免已删除的图表一直被发布
			"astro:build:start": () => {
				rmSync(STAGING_DIR, { recursive: true, force: true });
			},
			"astro:build:done": ({ dir, logger }) => {
				if (!existsSync(STAGING_DIR)) return;
				const out = fileURLToPath(new URL(`${FEED_DIAGRAM_DIR}/`, dir));
				mkdirSync(out, { recursive: true });
				cpSync(STAGING_DIR, out, { recursive: true });
				logger.info(
					`copied ${readdirSync(STAGING_DIR).length} feed diagram(s) to /${FEED_DIAGRAM_DIR}/`,
				);
			},
		},
	};
}
