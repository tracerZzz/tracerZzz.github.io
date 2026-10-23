#!/bin/bash
# Post-build checks for the migrated blog. Exits non-zero on any problem.
set -u
fail=0
err() { echo "::error::$*"; fail=1; }

# every published post has a page, and its local images were bundled
for f in $(grep -rl '^draft: false' src/content/posts --include='*.md'); do
  slug=$(sed -n 's/^abbrlink: //p' "$f")
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
for f in $(grep -rl '^draft: true' src/content/posts --include='*.md'); do
  slug=$(sed -n 's/^abbrlink: //p' "$f")
  [ -e "dist/posts/$slug/index.html" ] && err "draft published: $slug"
done

# old Hexo URLs redirect to existing pages
for r in $(find public -mindepth 4 -name index.html -path 'public/20*'); do
  target=$(sed -n 's/.*url=\(\/posts\/[^"]*\)".*/\1/p' "$r" | head -1)
  d="dist${r#public}"
  [ -f "$d" ] || err "redirect page not in dist: $d"
  [ -f "dist${target}index.html" ] || err "redirect target missing: $target (from $r)"
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

[ $fail -eq 0 ] && echo "all checks passed"
exit $fail
