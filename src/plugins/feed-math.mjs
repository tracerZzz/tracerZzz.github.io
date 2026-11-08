/**
 * RSS / Atom 订阅里的数学公式
 *
 * 网页上的公式由 KaTeX 渲染，每个公式里有两份：给读屏软件的 MathML（<math>），
 * 和真正显示用的一大堆带 class / style 的 <span>。feed 正文经过 sanitize-html 后，
 * <math> 被删掉只剩文字，<span> 的样式也没了，阅读器里会把公式文字、TeX 源码、
 * 显示用的文字全拼在一起。所以生成 feed 时每个公式只保留 MathML，
 * 并在 sanitize 里放行 MathML 标签；WebKit / Chromium 内核的阅读器都能直接显示。
 */

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
