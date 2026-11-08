/**
 * RSS / Atom 订阅里的链接和图片地址
 *
 * 正文里的图片、站内链接都是相对路径（/_astro/xxx.webp、/posts/xxx/、#某个标题），
 * 有的阅读器不会帮着补全，图片会裂、链接点不开；标题旁边的「#」锚点链接在阅读器里
 * 只会显示成一个多余的「#」。所以生成 feed 时：
 * - 去掉标题锚点；
 * - 把 src / srcset / href 都补成完整网址，页内跳转（#标题）指向网页上的对应位置。
 */

/** 去掉标题后面的「#」锚点链接（rehype-autolink-headings 生成的） */
export function removeHeadingAnchors(html) {
	return html.replace(
		/<a class="anchor" href="#[^"]*"><span class="anchor-icon"[^>]*>#<\/span><\/a>/g,
		"",
	);
}

function absolute(url, base) {
	try {
		return new URL(url, base).href;
	} catch {
		return url;
	}
}

/**
 * sanitize-html 的 transformTags：把 a / img 的地址补全成以 pageUrl 为基准的完整网址
 * @param {string} pageUrl - 这篇文章在网站上的完整网址
 */
export function absoluteUrlTransforms(pageUrl) {
	return {
		a: (tagName, attribs) => ({
			tagName,
			attribs: attribs.href
				? { ...attribs, href: absolute(attribs.href, pageUrl) }
				: attribs,
		}),
		img: (tagName, attribs) => {
			const out = { ...attribs };
			if (out.src) out.src = absolute(out.src, pageUrl);
			if (out.srcset) {
				out.srcset = out.srcset
					.split(",")
					.map((part) => {
						const [u, ...rest] = part.trim().split(/\s+/);
						return [absolute(u, pageUrl), ...rest].join(" ");
					})
					.join(", ");
			}
			return { tagName, attribs: out };
		},
	};
}
