/**
 * 文章里指向本站 /files/ 下附件（CSV、脚本、PDF 等）的链接：
 *
 * 1. 加上 download 属性：点击后浏览器直接保存文件，不会先尝试打开；
 * 2. 加上 data-no-swup：不让 swup 把文件当成网页去加载
 *    （否则地址栏会变成文件地址、页面卡在切换动画里，浏览器后退也会错乱）；
 * 3. 在链接后面补一个「在 GitHub 上查看」：链到 GitHub 仓库里的同一个文件。
 *    能不能预览交给 GitHub 判断（CSV 显示成表格、代码高亮、PDF 预览；
 *    压缩包这类预览不了的，GitHub 页面上也有下载按钮）。插件里不存任何文件类型清单，
 *    GitHub 以后支持了新类型，这里不用改。
 *
 * 写文章时照常用 Markdown 链接 [名字](/files/...) 即可，构建时自动处理。
 * 某个附件不想要「在 GitHub 上查看」，就把链接标题写成 no-view：
 *   [数据.zip](/files/数据.zip "no-view")
 * no-view 只是开关，不会显示成鼠标悬停提示。
 * 不依赖其他包，自己遍历语法树。
 *
 * @param {Object} options
 * @param {string} options.repo - GitHub 仓库，如 "tracerZzz/tracerZzz.github.io"
 * @param {string} [options.branch="master"] - 分支
 * @param {string} [options.prefix="/files/"] - 附件链接的前缀
 * @param {string} [options.publicDir="public"] - 附件在仓库里所在的目录
 * @param {string} [options.viewText="在 GitHub 上查看"] - 查看链接的文字
 * @param {string} [options.noViewTitle="no-view"] - 链接标题写成这个值时，不加查看链接
 */
export default function rehypeFileLinks(options = {}) {
	const {
		repo,
		branch = "master",
		prefix = "/files/",
		publicDir = "public",
		viewText = "在 GitHub 上查看",
		noViewTitle = "no-view",
	} = options;

	const isFileLink = (node) =>
		node.type === "element" &&
		node.tagName === "a" &&
		typeof node.properties?.href === "string" &&
		node.properties.href.startsWith(prefix);

	const viewLink = (href) => {
		const path = href.split(/[?#]/)[0];
		return {
			type: "element",
			tagName: "a",
			properties: {
				href: `https://github.com/${repo}/blob/${branch}/${publicDir}${path}`,
				target: "_blank",
				rel: ["noopener", "noreferrer"],
				className: ["file-view-link"],
				style: "margin-left:0.3em;font-size:0.85em;opacity:0.8",
			},
			children: [{ type: "text", value: `${viewText} ↗` }],
		};
	};

	const walk = (parent) => {
		if (!Array.isArray(parent.children)) return;
		for (let i = 0; i < parent.children.length; i++) {
			const node = parent.children[i];
			if (isFileLink(node)) {
				const href = node.properties.href;
				const name = decodeURIComponent(href.split(/[?#]/)[0].split("/").pop() || "");
				node.properties.download = name || true;
				node.properties.dataNoSwup = "";
				const noView = node.properties.title === noViewTitle;
				if (noView) delete node.properties.title; // 只是开关，不当悬停提示显示
				if (repo && !noView) {
					parent.children.splice(i + 1, 0, viewLink(href));
					i++; // 跳过刚插入的查看链接
				}
				continue; // 链接里面不会再有附件链接
			}
			walk(node);
		}
	};

	return (tree) => walk(tree);
}
