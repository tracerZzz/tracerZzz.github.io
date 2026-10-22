#!/usr/bin/env python3
"""One-off migration of the old Hexo blog (tracerZzz/hexoWorkspace) into this Astro project.

Usage: python3 scripts/migrate-hexo.py <hexo-source-dir> <images-dir> <astro-project-dir>

- Converts front matter to the Retypeset schema (title, published, description, tags, draft, abbrlink).
- Copies every image a post uses into "<slug>.assets/" next to the post (Typora's convention)
  and rewrites the old Qiniu URLs to relative paths.
- Writes redirect pages under public/ so the old Hexo URLs keep working.
"""
import datetime as dt
import html
import os
import re
import shutil
import sys

import yaml

HEXO, IMAGES, ASTRO = sys.argv[1:4]
POSTS_OUT = os.path.join(ASTRO, "src/content/posts")
PUBLIC = os.path.join(ASTRO, "public")
TZ = dt.timezone(dt.timedelta(hours=8))
IMG_URL = re.compile(r"https?://tracerzzz\.(?:ltd|cn)/([^)\s\"'<>]+)")

# Published posts: hexo path -> (new slug, old URL date). Old URLs were /YYYY/MM/DD/<hexo path>/
POSTS = {
    "workRecord.md": ("pickup-delivery-rate-page", "2017/11/02"),
    "docker/dokcer常用命令.md": ("docker-commands", "2018/06/17"),
    "git/gitlab和github同时使用.md": ("gitlab-and-github", "2017/07/12"),
    "git/git常用命令.md": ("git-commands", "2018/04/15"),
    "iterm2/iterm2自定义命令.md": ("iterm2-custom-commands", "2018/01/14"),
    "java/Java数据结构文档.md": ("java-data-structures", "2016/12/06"),
    "java/java注解.md": ("java-meta-annotations", "2016/12/06"),
    "js/webpack快速入门.md": ("webpack-quick-start", "2018/03/08"),
    "js/深入理解javaScript笔记-编写高质量JavaScript代码的基本要点.md": ("high-quality-javascript-basics", "2018/01/17"),
    "nginx/nginx使用.md": ("nginx-usage", "2018/01/15"),
    "python/scrapy.md": ("scrapy-netease-music-playlist", "2018/05/02"),
    "数据库/数据库面试资料.md": ("database-basics", "2016/11/05"),
    "架构/压力测试工具webbench压测nginx.md": ("webbench-nginx-stress-test", "2018/06/16"),
    "架构/通过keepalived搭建mysql双主模式的高可用集群系统.md": ("keepalived-mysql-dual-master", "2018/03/23"),
}
# Drafts get a folder of their own and stay unpublished.
DRAFTS = {
    "django ldap认证和基于jwt的单点登陆任认证.md": "django-ldap-jwt-sso",
    "infoCheck.md": "capacity-info-review-page",
    "js指南-promise.md": "js-guide-promise",
    "js指南-函数.md": "js-guide-functions",
    "js指南-流程控制与错误处理.md": "js-guide-control-flow",
    "js指南-语法和数据类型.md": "js-guide-grammar-types",
    "js指南-闭包.md": "js-guide-closures",
    "luarocket.md": "luarocks",
    "lua调试工具ZeroBraneStudio.md": "lua-zerobrane-studio",
    "nginx https配置.md": "nginx-https",
    "rabbitmq.md": "rabbitmq",
    "使用sentry进行vue项目监控.md": "sentry-vue-monitoring",
    "深入python.md": "deep-python",
    "通过freeeipa jsonrpc调用浅谈使用nginx代理解决跨域身份认证问题..md": "freeipa-jsonrpc-nginx-proxy",
}

report = []


def split_front_matter(text):
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n?(.*)$", text, re.S)
    if not m:
        return {}, text
    raw = m.group(1)
    try:
        data = yaml.safe_load(raw) or {}
    except yaml.YAMLError:
        # Hexo excerpts often hold unquoted HTML; drop the excerpt and retry.
        cleaned = re.sub(r"^excerpt:.*?(?=^\w+:|\Z)", "", raw, flags=re.S | re.M)
        data = yaml.safe_load(cleaned) or {}
    return data, m.group(2)


def parse_date(value, fallback_day):
    if isinstance(value, dt.datetime):
        d = value
    elif isinstance(value, dt.date):
        d = dt.datetime(value.year, value.month, value.day)
    elif isinstance(value, str) and value.strip():
        m = re.match(r"(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?", value.strip())
        d = dt.datetime(*[int(x) for x in m.groups(default="0")]) if m else None
    else:
        d = None
    if d is None:
        y, mo, da = (int(x) for x in fallback_day.split("/"))
        d = dt.datetime(y, mo, da)
    return d.replace(tzinfo=TZ) if d.tzinfo is None else d


def to_text(excerpt):
    if not excerpt:
        return ""
    t = re.sub(r"<[^>]+>", " ", str(excerpt))
    t = html.unescape(re.sub(r"\s+", " ", t)).strip()
    return t


def as_list(v):
    if v is None:
        return []
    if isinstance(v, str):
        return [v.strip()] if v.strip() else []
    return [str(x).strip() for x in v if str(x).strip()]


def convert(src_path, out_dir, slug, published_fallback, draft):
    with open(src_path, encoding="utf-8") as f:
        fm, body = split_front_matter(f.read())

    title = str(fm.get("title") or slug).strip()
    published = parse_date(fm.get("date"), published_fallback)
    description = to_text(fm.get("excerpt"))
    tags = as_list(fm.get("tags"))

    # Raw <img src="..."> tags -> Markdown, so Astro can process the image.
    body = re.sub(r"<img\s[^>]*?src=\"([^\"]+)\"[^>]*>", r"![](\1)", body)

    assets_dir = os.path.join(out_dir, f"{slug}.assets")
    used = []

    def repl(m):
        key = m.group(1)
        src = os.path.join(IMAGES, key)
        if not os.path.isfile(src):
            report.append(f"  missing image {key} in {src_path}")
            return m.group(0)
        name = os.path.basename(key)
        os.makedirs(assets_dir, exist_ok=True)
        shutil.copy2(src, os.path.join(assets_dir, name))
        used.append(name)
        return f"./{slug}.assets/{name}"

    # Only rewrite URLs inside Markdown image syntax: ![alt](url)
    def img_repl(m):
        alt, url = m.group(1), m.group(2)
        new_url = IMG_URL.sub(repl, url)
        if IMG_URL.fullmatch(alt or ""):
            alt = ""  # alt text that was just the URL
        return f"![{alt}]({new_url})"

    body = re.sub(r"!\[([^\]]*)\]\(([^)\s]+)\)", img_repl, body)

    leftovers = IMG_URL.findall(body)
    if leftovers:
        report.append(f"  old image URLs left in {src_path}: {leftovers}")

    front = {
        "title": title,
        "published": published.isoformat(),
        "description": description,
        "tags": tags,
        "draft": draft,
        "abbrlink": slug,
    }
    lines = ["---"]
    for k, v in front.items():
        if isinstance(v, list):
            lines.append(f"{k}:" if v else f"{k}: []")
            lines += [f"  - {yaml.safe_dump(x, allow_unicode=True).strip().removesuffix('...').strip()}" for x in v]
        elif isinstance(v, bool):
            lines.append(f"{k}: {'true' if v else 'false'}")
        elif k == "published":
            lines.append(f"{k}: {v}")
        else:
            lines.append(f"{k}: {yaml.safe_dump(v, allow_unicode=True, width=10**6).strip().removesuffix('...').strip()}")
    lines.append("---")

    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, f"{slug}.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n\n" + body.lstrip("\n"))
    return title, len(used)


def redirect_page(old_path, new_path, title):
    target = os.path.join(PUBLIC, old_path.strip("/"), "index.html")
    os.makedirs(os.path.dirname(target), exist_ok=True)
    t = html.escape(title)
    with open(target, "w", encoding="utf-8") as f:
        f.write(f"""<!doctype html>
<html lang="zh"><head><meta charset="utf-8">
<title>{t}</title>
<link rel="canonical" href="{new_path}">
<meta name="robots" content="noindex">
<meta http-equiv="refresh" content="0; url={new_path}">
</head><body><p>文章已搬到新地址：<a href="{new_path}">{t}</a></p></body></html>
""")


def main():
    for rel, (slug, day) in POSTS.items():
        folder = os.path.dirname(rel)
        out_dir = os.path.join(POSTS_OUT, folder) if folder else POSTS_OUT
        title, n = convert(os.path.join(HEXO, "_posts", rel), out_dir, slug, day, draft=False)
        old_url = f"/{day}/{rel[:-3]}/"
        redirect_page(old_url, f"/posts/{slug}/", title)
        report.append(f"post  {old_url} -> /posts/{slug}/  ({n} images)")
    for rel, slug in DRAFTS.items():
        title, n = convert(os.path.join(HEXO, "_draft", rel), os.path.join(POSTS_OUT, "drafts"), slug, "2019/01/01", draft=True)
        report.append(f"draft {rel} -> drafts/{slug}.md  ({n} images)")
    print("\n".join(report))


if __name__ == "__main__":
    main()
