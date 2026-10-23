/**
 * 欢迎页的挂载 / 卸载（由 astro.config.mjs 注入到每个页面）。
 *
 * 欢迎页套在博客的页面框架里，swup 切换页面时只替换内容区域，所以播放器不销毁、音乐不中断。
 * 但这样欢迎页的脚本不会随页面重新执行，于是由这里负责：
 * - 页面里出现 #welcome-root 时：把它移到 <body> 下（避免内容区域的 transform 影响全屏定位），启动动画；
 * - 离开欢迎页时：先淡出，新内容换上后停掉动画、移除欢迎页。
 */

type Cleanup = () => void
let cleanup: Cleanup | null = null

async function mountIfPresent() {
  const root = document.getElementById('welcome-root')
  if (!root || cleanup)
    return
  document.body.append(root)
  cleanup = () => {} // 占位，防止重复挂载
  const { mountWelcome } = await import('./index')
  cleanup = mountWelcome()
}

function unmount() {
  cleanup?.()
  cleanup = null
  document.getElementById('welcome-root')?.remove()
}

type SwupHooks = { on: (name: string, fn: (visit: { to: { url: string } }) => void, opts?: { before?: boolean }) => void }

function hookSwup(swup: { hooks: SwupHooks }) {
  // 离开欢迎页：开始切换时淡出
  swup.hooks.on('visit:start', (visit) => {
    const root = document.getElementById('welcome-root')
    if (root && !new URL(visit.to.url, location.href).pathname.startsWith('/welcome'))
      root.classList.add('leaving')
  })
  // 新内容换上之后：移除旧的欢迎页；如果新页面就是欢迎页，再挂载
  swup.hooks.on('content:replace', () => {
    const fresh = document.querySelector('#swup-container #welcome-root')
    if (cleanup && !fresh)
      unmount()
    void mountIfPresent()
  })
}

void mountIfPresent()

const w = window as unknown as { swup?: { hooks: SwupHooks } }
if (w.swup)
  hookSwup(w.swup)
else
  document.addEventListener('swup:enable', () => w.swup && hookSwup(w.swup), { once: true })
