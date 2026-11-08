/**
 * RSS / Atom 订阅里的代码块
 *
 * 网页上的代码块由 Expressive Code 渲染：每行是一个 <div class="ec-line">，
 * 行号是单独的 <div>，外面还有复制按钮、「展开 / 收起」按钮。feed 正文经过
 * sanitize-html 后 class / style 都没了，阅读器里会变成「行号一行、代码一行」，
 * 还夹着「展开收起」字样。所以生成 feed 时把整个代码块换回朴素的
 * <pre><code class="language-xx">，只保留代码文本。
 */

/** 从 start 处的 <div 开始，找到与之配对的 </div> 之后的位置；找不到返回 -1 */
function findDivEnd(html, start) {
	const tag = /<div\b|<\/div>/g;
	tag.lastIndex = start;
	let depth = 0;
	for (let m = tag.exec(html); m; m = tag.exec(html)) {
		depth += m[0] === "</div>" ? -1 : 1;
		if (depth === 0) return m.index + m[0].length;
	}
	return -1;
}

const stripTags = (s) => s.replace(/<[^>]*>/g, "");

/** 把一个 Expressive Code 代码块的 HTML 转成朴素的 <pre><code> */
function toPlainCodeBlock(block) {
	const pre = block.match(
		/<pre(?: data-language="([^"]*)")?[^>]*><code>([\s\S]*?)<\/code><\/pre>/,
	);
	if (!pre) return null;
	const [, lang = "", body] = pre;
	// 每行的代码在 <div class="code">…</div> 里，里面只有 <span>，不会再有 <div>
	const lines = [...body.matchAll(/<div class="code">([\s\S]*?)<\/div><\/div>/g)].map(
		(m) => stripTags(m[1]).replace(/\n$/, ""),
	);
	const title = stripTags(
		block.match(/<span class="title">([\s\S]*?)<\/span>/)?.[1] ?? "",
	).trim();
	const cls = lang ? ` class="language-${lang}"` : "";
	return `${title ? `<p><strong>${title}</strong></p>` : ""}<pre><code${cls}>${lines.join("\n")}</code></pre>`;
}

/**
 * @param {string} html - 渲染后的文章正文
 * @returns {{ html: string, converted: number, failed: number }}
 */
export function simplifyCodeBlocks(html) {
	// 复制按钮的 data-code 属性里是原始代码，可能含 "<div"，先去掉，免得干扰配对
	let s = html.replace(/ data-code="[^"]*"/g, "");
	const marker = '<div class="expressive-code">';
	let out = "";
	let converted = 0;
	let failed = 0;
	for (let i = s.indexOf(marker); i !== -1; i = s.indexOf(marker)) {
		const end = findDivEnd(s, i);
		const plain = end === -1 ? null : toPlainCodeBlock(s.slice(i, end));
		if (plain === null) {
			failed++;
			out += s.slice(0, i + marker.length);
			s = s.slice(i + marker.length);
			continue;
		}
		converted++;
		out += s.slice(0, i) + plain;
		s = s.slice(end);
	}
	return { html: out + s, converted, failed };
}
