#!/bin/bash
# Post-build checks for the migrated blog. Exits non-zero on any problem.
set -u
fail=0
err() { echo "::error::$*"; fail=1; }
# 只读文章开头的 front matter（两行 --- 之间），正文里举例用的 yaml 不算
fm() { awk 'NR==1 && /^---$/ {f=1; next} f && /^---$/ {exit} f' "$1"; }
field() { fm "$1" | sed -n "s/^$2: *//p" | head -1; }
posts() { find src/content/posts -name '*.md' | while read -r f; do
  if [ "$(field "$f" draft)" = "true" ]; then [ "$1" = drafts ] && echo "$f"; else [ "$1" = published ] && echo "$f"; fi
done; }

# every published post has a page, and its local images were bundled
for f in $(posts published); do
  slug=$(field "$f" slug)
  page="dist/posts/$slug/index.html"
  [ -f "$page" ] || { err "missing page for $f ($page)"; continue; }
  # 只数正文里真正的图片：去掉代码块和行内代码里的示例写法
  want=$(perl -0777 -ne 's/^```.*?^```//gms; s/`[^`\n]*`//g; $n = () = /!\[[^\]]*\]\(\.\/[^)]*\.assets\//g; print $n' "$f")
  got=$(grep -o '<img[^>]*src="/_astro/[^"]*"' "$page" | wc -l)
  [ "$got" -ge "$want" ] || err "$slug: expected $want images, page has $got"
  grep -q 'tracerzzz\.ltd' "$page" && err "$slug still references tracerzzz.ltd"
  echo "ok  $slug ($got images)"
done

# drafts are not published
for f in $(posts drafts); do
  slug=$(field "$f" slug)
  [ -e "dist/posts/$slug/index.html" ] && err "draft published: $slug"
done

# old Hexo URLs redirect to existing pages
for r in $(find public -mindepth 4 -name index.html -path 'public/20*'); do
  target=$(sed -n 's/.*url=\(\/[^"]*\)".*/\1/p' "$r" | head -1)
  d="dist${r#public}"
  [ -f "$d" ] || err "redirect page not in dist: $d"
  [ -n "$target" ] && [ -f "dist${target}index.html" ] || err "redirect target missing: $target (from $r)"
done

# welcome page: markup, menu links and bundled script
w=dist/welcome/index.html
if [ -f "$w" ]; then
  for needle in 'id="?gflower' 'id="?menusvg' 'github\.com/tracerZzz' 'href="?/about/' '<script[^>]*module'; do
    grep -Eq "$needle" "$w" || err "welcome page lacks $needle"
  done
  echo "::notice::welcome scripts: $(grep -Eo '<script[^>]*>' "$w" | tr '\n' ' ')"
  echo "ok  welcome"
else
  err "missing $w"
fi

# feed 里的流程图和公式：都换成了 /diagrams/ 下的图片，且文件已发布
mermaid=$(for f in $(posts published); do grep -c '^```mermaid' "$f"; done | awk '{s+=$1} END {print s+0}')
formulas=$(grep -o 'class="katex"' dist/posts/*/index.html | wc -l)
want=$((mermaid + formulas))
for feed in dist/rss.xml dist/atom.xml; do
  # rss.xml 的正文是转义过的（src=&quot;…），atom.xml 用 CDATA（src="…"），两种都认
  got=$(grep -oE 'src=("|&quot;)https?://[^"&]*/diagrams/[0-9a-f]+\.svg' "$feed" | wc -l)
  [ "$got" -eq "$want" ] || err "$feed: expected $want diagram/formula images ($mermaid + $formulas), found $got"
done
for svg in $(grep -o '/diagrams/[0-9a-f]*\.svg' dist/rss.xml | sort -u); do
  [ -s "dist$svg" ] || err "feed diagram missing: dist$svg"
done
echo "ok  feed diagrams ($mermaid) and formula images ($formulas)"

# feed 里的代码块：已换成朴素的 <pre><code>，不再有 Expressive Code 的逐行结构（行号会单独占一行）
for feed in dist/rss.xml dist/atom.xml; do
  grep -qE '<pre><code><div><div><div>|&lt;pre&gt;&lt;code&gt;&lt;div&gt;' "$feed" && err "$feed has unsimplified code blocks"
done
echo "ok  feed code blocks"

# feed 里的公式：全部是图片（上面已数过），没有退回 MathML 的
for feed in dist/rss.xml dist/atom.xml; do
  grep -qE '(<|&lt;)math xmlns=' "$feed" && err "$feed has formulas that fell back to MathML (MathJax failed, see build log)"
  grep -qE '(<|&lt;)annotation' "$feed" && err "$feed still has TeX annotations"
done
echo "ok  feed math"

# feed 里的地址：图片和链接都是完整网址；标题旁的「#」锚点已去掉
# （rss.xml 正文是转义过的 &lt;a href=&quot;…，atom.xml 是原样的 <a href="…）
for feed in dist/rss.xml dist/atom.xml; do
  grep -qE '<(a|img) [^>]*(href|src)="(/|#|\./)|&lt;(a|img) ([^&]|&quot;[^&]*&quot;)*(href|src)=&quot;(/|#|\./)' "$feed" && err "$feed has relative links or images"
  grep -qE '(<|&lt;)span(>|&gt;)#(<|&lt;)/span' "$feed" && err "$feed still has heading anchors"
done
echo "ok  feed links"

[ $fail -eq 0 ] && echo "all checks passed"
exit $fail
