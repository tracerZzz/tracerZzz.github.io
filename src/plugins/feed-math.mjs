/**
 * RSS / Atom 订阅里的数学公式
 *
 * 网页上的公式由 KaTeX 渲染，每个公式里有两份：给读屏软件的 MathML（<math>），
 * 和真正显示用的一大堆带 class / style 的 <span>。feed 正文经过 sanitize-html 后，
 * <math> 被删掉只剩文字，<span> 的样式也没了，阅读器里会把公式文字、TeX 源码、
 * 显示用的文字全拼在一起。
 *
 * 只保留 MathML 的话，Safari 内核的阅读器能显示，但不少网页版阅读器会把 <math> 删掉。
 * 所以生成 feed 时用 MathJax 把每个公式的 TeX 源码渲染成 SVG 文件，正文里换成 <img>
 * （alt 是 TeX 源码），所有阅读器都能显示。万一 MathJax 渲染失败，退回只保留 MathML。
 */
import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import { AllPackages } from "mathjax-full/js/input/tex/AllPackages.js";
import { mathjax } from "mathjax-full/js/mathjax.js";
import { SVG } from "mathjax-full/js/output/svg.js";
import { saveFeedDiagram } from "./feed-diagrams.mjs";

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const mathDocument = mathjax.document("", {
	InputJax: new TeX({
		packages: AllPackages,
		// 语法错误直接抛出，由调用方退回 MathML，而不是渲染出一个红色的错误框
		formatError: (_jax, err) => {
			throw err;
		},
	}),
	// 不共用字形缓存：每个 SVG 都是独立文件
	OutputJax: new SVG({ fontCache: "none" }),
});

const decodeEntities = (s) =>
	s
		.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
		.replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&amp;/g, "&");

const escapeAttr = (s) =>
	s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/**
 * 用 MathJax 把 TeX 渲染成独立 SVG 文件，返回 <img> 标记
 * @returns {string}
 */
function texToImage(tex, display) {
	const svg = adaptor.innerHTML(mathDocument.convert(tex, { display }));
	// 网页上用 ex 单位的宽高和 vertical-align 跟文字对齐，挪到 <img> 的 style 上，
	// 文件里换成白底黑字（暗色主题的阅读器里黑字也看得清）
	const height = svg.match(/ height="([\d.]+ex)"/)?.[1];
	const valign = svg.match(/vertical-align: ?(-?[\d.]+ex)/)?.[1];
	const file = svg
		.replace(/^<svg style="[^"]*"/, '<svg style="background-color: #ffffff; color: #000000;"')
		.replace(/currentColor/g, "#000000");
	const src = saveFeedDiagram(file);
	const style = [height && `height: ${height}`, valign && `vertical-align: ${valign}`]
		.filter(Boolean)
		.join("; ");
	return `<img src="${src}" alt="${escapeAttr(tex)}"${style ? ` style="${style}"` : ""}>`;
}

/** 从 start 处的 <tag 开始，找到与之配对的 </tag> 之后的位置；找不到返回 -1 */
function findTagEnd(html, start, tagName) {
	const tag = new RegExp(`<${tagName}\\b|</${tagName}>`, "g");
	tag.lastIndex = start;
	let depth = 0;
	for (let m = tag.exec(html); m; m = tag.exec(html)) {
		depth += m[0] === `</${tagName}>` ? -1 : 1;
		if (depth === 0) return m.index + m[0].length;
	}
	return -1;
}

/**
 * 把每个 KaTeX 公式（行内 .katex，或独立成行的 .katex-display）换成它自带的 <math>，
 * 并去掉 <annotation>（TeX 源码；不认识 MathML 的阅读器会把它当文字显示出来）。
 *
 * @param {string} html
 * @returns {{ html: string, converted: number, failed: number }}
 */
export function katexToMathml(html) {
	const marker = /<span class="katex(?:-display)?">/g;
	let out = "";
	let rest = html;
	let converted = 0;
	let failed = 0;
	for (let m = marker.exec(rest); m; m = marker.exec(rest)) {
		const start = m.index;
		const end = findTagEnd(rest, start, "span");
		const block = end === -1 ? "" : rest.slice(start, end);
		const math = block.match(/<math[\s\S]*?<\/math>/)?.[0];
		if (!math) {
			failed++;
			marker.lastIndex = start + m[0].length;
			continue;
		}
		converted++;
		out += rest.slice(0, start) + math.replace(/<annotation[\s\S]*?<\/annotation>/g, "");
		rest = rest.slice(end);
		marker.lastIndex = 0;
	}
	return { html: out + rest, converted, failed };
}

/**
 * 把每个 KaTeX 公式换成 MathJax 渲染的 SVG 图片；独立成行的公式单独成段。
 * 取不到 TeX 源码或渲染失败的，退回 katexToMathml() 的结果（只保留 MathML）。
 *
 * @param {string} html
 * @returns {{ html: string, converted: number, fallback: number, failed: number }}
 */
export function katexToImages(html) {
	const marker = /<span class="katex(?:-display)?">/g;
	let out = "";
	let rest = html;
	let converted = 0;
	let fallback = 0;
	for (let m = marker.exec(rest); m; m = marker.exec(rest)) {
		const start = m.index;
		const end = findTagEnd(rest, start, "span");
		if (end === -1) {
			marker.lastIndex = start + m[0].length;
			continue;
		}
		const block = rest.slice(start, end);
		const display = m[0].includes("katex-display");
		const tex = block.match(
			/<annotation encoding="application\/x-tex">([\s\S]*?)<\/annotation>/,
		)?.[1];
		let img = null;
		if (tex) {
			try {
				img = texToImage(decodeEntities(tex), display);
			} catch {
				img = null;
			}
		}
		if (img === null) {
			// 留给下面的 katexToMathml() 处理
			fallback++;
			out += rest.slice(0, end);
		} else {
			converted++;
			out += rest.slice(0, start) + (display ? `<div>${img}</div>` : img);
		}
		rest = rest.slice(end);
		marker.lastIndex = 0;
	}
	const mathml = katexToMathml(out + rest);
	return { html: mathml.html, converted, fallback, failed: mathml.failed };
}

/** KaTeX 会用到的 MathML 标签 */
export const MATHML_TAGS = [
	"math", "semantics", "mrow", "mi", "mn", "mo", "ms", "mtext", "mspace",
	"msub", "msup", "msubsup", "mfrac", "msqrt", "mroot", "mover", "munder",
	"munderover", "mtable", "mtr", "mtd", "mstyle", "mpadded", "mphantom",
	"menclose", "merror", "mglyph", "mlabeledtr", "mprescripts", "mmultiscripts", "none",
];

/** 这些标签上需要保留的属性（影响排版） */
export const MATHML_ATTRIBUTES = {
	math: ["xmlns", "display"],
	mo: ["stretchy", "fence", "separator", "lspace", "rspace", "minsize", "maxsize", "largeop", "movablelimits", "accent", "form"],
	mi: ["mathvariant"],
	mn: ["mathvariant"],
	mtext: ["mathvariant"],
	mstyle: ["scriptlevel", "displaystyle", "mathvariant", "mathcolor", "mathbackground"],
	mspace: ["width", "height", "depth", "linebreak"],
	mpadded: ["width", "height", "depth", "lspace", "voffset"],
	mfrac: ["linethickness"],
	mover: ["accent"],
	munder: ["accentunder"],
	munderover: ["accent", "accentunder"],
	mtable: ["columnalign", "rowalign", "rowspacing", "columnspacing", "rowlines", "columnlines", "frame", "width"],
	mtr: ["columnalign", "rowalign"],
	mtd: ["columnalign", "rowalign", "columnspan", "rowspan"],
	menclose: ["notation"],
};
