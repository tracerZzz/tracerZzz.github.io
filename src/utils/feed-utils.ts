import { loadRenderers } from "astro:container";
import type { CollectionEntry } from "astro:content";
import { render } from "astro:content";
import { getContainerRenderer as getMDXRenderer } from "@astrojs/mdx/container-renderer";
import { getContainerRenderer as getSvelteRenderer } from "@astrojs/svelte/container-renderer";
import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/translation";
import { url } from "@utils/url-utils";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import sanitizeHtml from "sanitize-html";
// 自己加的：feed 里的流程图换成独立 SVG 文件（见 src/plugins/feed-diagrams.mjs）
// 自己加的：feed 里的代码块换回朴素的 <pre><code>（见 src/plugins/feed-code-blocks.mjs）
import { simplifyCodeBlocks } from "../plugins/feed-code-blocks.mjs";
import { saveFeedDiagram } from "../plugins/feed-diagrams.mjs";
import {
	DIAGRAM_CONTAINER,
	DIAGRAM_WRAPPER,
	MERMAID_CONTAINER,
	MERMAID_SVG_DARK,
	MERMAID_SVG_LIGHT,
	MERMAID_WRAPPER,
} from "../plugins/utils/diagramConstants.js";

/**
 * 归一化后的 feed 条目，供 RSS 与 Atom 共用。
 */
export type FeedEntry = {
	post: CollectionEntry<"posts">;
	title: string;
	/** BASE_URL 感知的相对路径，如 "/posts/foo/" */
	link: string;
	published: Date;
	updated: Date;
	description: string;
	/** 已 sanitize 的 HTML 正文，或加密文章提示文案 */
	content: string;
	isPasswordProtected: boolean;
};

/**
 * 移除 XML 非法字符（W3C 字符集规定外），避免 feed 文件解析失败。
 */
export function stripInvalidXmlChars(str: string): string {
	return str.replace(
		// biome-ignore lint/suspicious/noControlCharactersInRegex: https://www.w3.org/TR/xml/#charsets
		/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F\uFDD0-\uFDEF\uFFFE\uFFFF]/g,
		"",
	);
}

/**
 * XML 文本转义；先剥离非法字符再转义 5 个 XML 特殊字符。
 */
export function escapeXml(str: string): string {
	return stripInvalidXmlChars(str)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

/**
 * 用 CDATA 包裹 HTML 内容，并安全处理内容中可能出现的 "]]>"（如代码块），
 * 使正文原样保留、不被二次转义。
 */
export function cdataWrapped(text: string): string {
	return `<![CDATA[${text.replace(/\]\]>/g, "]]]]><![CDATA[>")}]]>`;
}

/**
 * 折叠正文里超长的连续空白换行，使 feed 源码更整洁；同时保护 <pre>/<code>
 * 内的空白（代码缩进/空行有语义），避免被破坏。空行在 HTML 渲染中会被浏览器折叠，
 */
function collapseFeedWhitespace(html: string): string {
	const protectedBlocks: string[] = [];
	const masked = html.replace(
		/<pre[\s\S]*?<\/pre>|<code[\s\S]*?<\/code>/gi,
		(match) => {
			protectedBlocks.push(match);
			return `@@PRE_BLOCK_${protectedBlocks.length - 1}@@`;
		},
	);
	// 3+ 个连续换行（即 2+ 个空行）折叠为一个空行，保留单个空行作为段落分隔
	const collapsed = masked.replace(/\n[ \t]*\n[ \t]*\n+/g, "\n\n");
	return collapsed.replace(/@@PRE_BLOCK_(\d+)@@/g, (_, index) => {
		return protectedBlocks[Number(index)];
	});
}

/**
 * 自己加的：把正文里的 Mermaid 流程图换成 <img>，指向构建时另存的浅色 SVG 文件。
 *
 * 网页上的流程图是内嵌 <svg>（浅色 + 深色两份，靠 CSS 切换），下面的 sanitize-html
 * 会把 <svg> 整个删掉，阅读器也不执行 CSS，所以只取浅色那份存成文件再引用。
 * 结构对应 src/plugins/rehype-mermaid.mjs 的输出，主题改了输出结构要跟着改。
 */
const MERMAID_BLOCK_RE = new RegExp(
	`<div class="${DIAGRAM_CONTAINER} ${MERMAID_CONTAINER}"><div class="${DIAGRAM_WRAPPER} ${MERMAID_WRAPPER}">` +
		`<div class="${MERMAID_SVG_LIGHT}">(<svg[\\s\\S]*?</svg>)\\s*</div>` +
		`<div class="${MERMAID_SVG_DARK}"><svg[\\s\\S]*?</svg>\\s*</div></div></div>`,
	"g",
);

function replaceMermaidWithImages(html: string, postTitle: string): string {
	const site = import.meta.env.SITE;
	const replaced = html.replace(MERMAID_BLOCK_RE, (_, svg: string) => {
		const src = new URL(url(saveFeedDiagram(svg)), site).href;
		return `<p><img src="${src}" alt="流程图"></p>`;
	});
	// 只认图表容器本身；正文末尾的 pan-zoom 脚本里也有这个类名，不能直接搜类名
	if (replaced.includes(`<div class="${MERMAID_SVG_LIGHT}">`)) {
		console.warn(
			`[feed] 《${postTitle}》里有流程图没能转成图片，feed 里会缺图（rehype-mermaid 的输出结构可能变了）`,
		);
	}
	return replaced;
}

/**
 * 把路径解析成绝对 URL（Atom 规范强制要求绝对 IRI）。
 * path 为相对路径时直接相对 site 求绝对。
 */
export function toAbsoluteUrl(site: URL, path: string): string {
	return new URL(path.startsWith("/") ? path : `/${path}`, site).href;
}

/**
 * 渲染全部文章正文为 feed 条目。
 *
 * 复用 AstroContainer + 渲染器（MDX/Svelte），密码文章跳过渲染改用提示文案。
 * 保持「先剥离 XML 非法字符、后 sanitize」的顺序，确保 RSS 输出与旧版逐字节一致。
 */
export async function renderFeedEntries(
	posts: CollectionEntry<"posts">[],
	opts: { includeContent?: boolean } = {},
): Promise<FeedEntry[]> {
	const { includeContent = true } = opts;
	const renderers = await loadRenderers([
		getMDXRenderer(),
		getSvelteRenderer(),
	]);
	const container = await AstroContainer.create({ renderers });
	const entries: FeedEntry[] = [];
	for (const post of posts) {
		const link = url(`/posts/${post.id}/`);
		const updated = post.data.updated ?? post.data.published;
		const base: Omit<FeedEntry, "content" | "isPasswordProtected"> = {
			post,
			title: post.data.title,
			link,
			published: post.data.published,
			updated,
			description: post.data.description || "",
		};
		if (post.data.password) {
			entries.push({
				...base,
				content: includeContent ? i18n(I18nKey.passwordProtectedRss) : "",
				isPasswordProtected: true,
			});
			continue;
		}
		// 摘要模式跳过正文渲染，仅保留描述，避免昂贵的 AstroContainer 开销
		if (!includeContent) {
			entries.push({ ...base, content: "", isPasswordProtected: false });
			continue;
		}
		const { Content } = await render(post);
		const rawContent = await container.renderToString(Content);
		const withDiagrams = replaceMermaidWithImages(
			stripInvalidXmlChars(rawContent),
			post.data.title,
		);
		// 自己加的：Expressive Code 代码块换成朴素的 <pre><code>
		const { html: cleanedContent, failed } = simplifyCodeBlocks(withDiagrams);
		if (failed > 0) {
			console.warn(
				`[feed] 《${post.data.title}》里有 ${failed} 个代码块没能简化，feed 里会显示错乱（Expressive Code 的输出结构可能变了）`,
			);
		}
		entries.push({
			...base,
			content: collapseFeedWhitespace(
				sanitizeHtml(cleanedContent, {
					allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img"]),
					// 自己加的：保留代码块的语言标记，支持的阅读器可以据此高亮
					allowedClasses: { code: ["language-*"] },
				}),
			),
			isPasswordProtected: false,
		});
	}
	return entries;
}

/**
 * 构建 Atom 1.0（RFC 4287）feed 字符串。
 */
export function buildAtomFeed(opts: {
	site: URL;
	title: string;
	subtitle: string;
	entries: FeedEntry[];
	authorName: string;
	generator: string;
	includeContent?: boolean;
}): string {
	const {
		site,
		title,
		subtitle,
		entries,
		authorName,
		generator,
		includeContent = true,
	} = opts;
	const siteRoot = toAbsoluteUrl(site, "/");
	const selfLink = toAbsoluteUrl(site, "atom.xml");
	const feedUpdated =
		entries.reduce<Date | null>(
			(latest, e) =>
				latest === null || e.updated > latest ? e.updated : latest,
			null,
		) ?? new Date();

	const entryXml = entries
		.map((e) => {
			const entryUrl = toAbsoluteUrl(site, e.link);
			const entryAuthor = e.post.data.author?.trim() || authorName;
			const contentXml = includeContent
				? `\n      <content type="html">${cdataWrapped(e.content)}</content>`
				: "";
			return `    <entry>
      <id>${escapeXml(entryUrl)}</id>
      <title type="text">${escapeXml(e.title)}</title>
      <published>${e.published.toISOString()}</published>
      <updated>${e.updated.toISOString()}</updated>
      <author><name>${escapeXml(entryAuthor)}</name></author>
      <link rel="alternate" href="${escapeXml(entryUrl)}"/>
      <summary type="text">${escapeXml(e.description)}</summary>${contentXml}
    </entry>`;
		})
		.join("\n");

	return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>${escapeXml(siteRoot)}</id>
  <title type="text">${escapeXml(title)}</title>
  <subtitle type="text">${escapeXml(subtitle)}</subtitle>
  <updated>${feedUpdated.toISOString()}</updated>
  <author><name>${escapeXml(authorName)}</name></author>
  <link rel="alternate" href="${escapeXml(siteRoot)}"/>
  <link rel="self" href="${escapeXml(selfLink)}"/>
  <generator uri="https://github.com/CuteLeaf/Firefly">${escapeXml(generator)}</generator>
${entryXml}
</feed>
`;
}
