/**
 * 欢迎页动画（由原 Hexo 欢迎页的 GSAP 版本改写）
 * 时间线上的数字都是秒，可以直接改。
 */
import { drawSvg, drawToTimeline, ease, els, set, Timeline, tween } from './tween'

// ---------- 上方：插画动画（循环播放，可用滑块拖动进度） ----------
const tl = new Timeline()

tl.fromTo('#gflower', 9, { opacity: 0 }, { opacity: 1 }, 0)
tl.to('#grightcircle', 2, { opacity: 1, scale: 1 }, 0)
tl.to('#gflower', 9, { fill: 'black' }, 0)
tl.to('#gflower', 9, { fill: '#c9b83c' }, 9)
// 中心花纹：白色描边逐渐画出，填充由黑变紫红
drawToTimeline(tl, '#grightcenter', { duration: 7, position: 7, stroke: 'white', strokeWidth: 3, fill: 'black', fillTo: '#a31b66' })
tl.fromTo('#grightcenter', 5, { opacity: 0 }, { opacity: 1 }, 10, ease.power3InOut)
// 外圈：黑色描边逐渐画出，填充由浅灰变灰
drawToTimeline(tl, '#rightcircle', { duration: 15, position: 1.5, stroke: 'black', strokeWidth: 3, fill: 'lightgray', fillTo: 'gray' })
tl.fromTo('#grightcircle', 3, { scale: 1 }, { rotation: 720, opacity: 0.5, scale: 0.5 }, 18, ease.power3InOut)
// 两侧图案缩小并向两边移开，给文字让位
tl.to(['#grightcircle', '#grightcenter'].flatMap(s => els(s)), 5, { x: 270, scale: 0.7, opacity: 0.8 }, 21, ease.power3In)
tl.to('#gflower', 5, { x: -100, opacity: 0.8, fill: 'green', scale: 0.7 }, 21, ease.power3In)
// 文字逐行出现
tl.fromTo('.describeleft', 2, { y: -50, opacity: 0 }, { y: 0, opacity: 1 }, 29, ease.power1Out, 4.5)
tl.fromTo('.describeright', 2, { y: -50, opacity: 0 }, { y: 0, opacity: 1 }, 31, ease.power1Out, 4.5)
tl.to('#grightcircle', 5, { rotation: -720 }, 48, ease.power3InOut)
tl.to('#grightcenter', 5, { fill: '#1e7bcc' }, 48, ease.power3InOut)
tl.to('#gflower', 5, { fill: '#65107c' }, 48)
// 全部淡出，然后从头循环
tl.to(['.describeleft', '.describeright', '#gflower', '#grightcircle', '#grightcenter'].flatMap(s => els(s)), 3, { opacity: 0 }, 54)

const slider = document.querySelector<HTMLInputElement>('#slider')!
let dragging = false
slider.addEventListener('pointerdown', () => (dragging = true))
window.addEventListener('pointerup', () => (dragging = false))
slider.addEventListener('input', () => tl.seek((Number(slider.value) / 100) * tl.duration))
tl.onUpdate = (time) => {
  if (!dragging)
    slider.value = String((time / tl.duration) * 100)
}
tl.play(1)

// ---------- 下方：彩色圆点背景，每 10 秒随机变化一次（透明度保持 0.22，见 CSS） ----------
function randomDarkColor() {
  const h = Math.random() * 360
  const s = 50 + Math.random() * 50
  const l = 30 + Math.random() * 25
  return `hsl(${h.toFixed(0)} ${s.toFixed(0)}% ${l.toFixed(0)}%)`
}
function setBg() {
  for (const c of document.querySelectorAll<HTMLElement>('.bgcircle')) {
    c.style.transform = `scale(${(Math.random() * 3).toFixed(2)})`
    c.style.backgroundColor = randomDarkColor()
  }
}
requestAnimationFrame(() => requestAnimationFrame(setBg))
setInterval(setBg, 10000)

// ---------- 菜单 ----------
const menuSvg = document.querySelector<SVGSVGElement>('#menusvg')!
const button = document.querySelector<SVGGElement>('#menubutton')!
let open = false

// 中心按钮悬停
button.addEventListener('mouseenter', () => {
  tween('#menurect', 0.5, { scale: 1.1, fill: 'none' })
  tween('.menuline', 0.5, { scale: 1.2, stroke: 'white' })
})
button.addEventListener('mouseleave', () => {
  tween('#menurect', 0.5, { scale: 1, fill: 'black' })
  tween('.menuline', 0.5, { scale: 1, stroke: '#d3d3d3' })
})

// 子菜单悬停：方块变成圆形并放大
for (const item of document.querySelectorAll('.gmenulist')) {
  const rect = item.querySelector('.menulist')!
  item.addEventListener('mouseenter', () => tween(rect, 0.5, { rx: 100, ry: 100, scale: 1.4, stroke: '#d3d3d3' }, { ease: ease.backInOut(1.5) }))
  item.addEventListener('mouseleave', () => tween(rect, 0.5, { rx: 15, ry: 15, scale: 1, stroke: 'gray' }, { ease: ease.backInOut(1.4) }))
}

// 子菜单：博客、关于、GitHub、网易云音乐（链接在 welcome.astro 里）
const items = [
  { id: '#lefttop', x: -400, y: -200 },
  { id: '#leftbottom', x: -400, y: 200 },
  { id: '#righttop', x: 400, y: -200 },
  { id: '#rightbottom', x: 400, y: 200 },
]

function toggleMenu() {
  open = !open
  menuSvg.classList.toggle('open', open)
  button.setAttribute('aria-expanded', String(open))
  if (open) {
    drawSvg('#profilesvg', 2000)
    drawSvg('#musicsvg', 5000)
    drawSvg('#gitsvg', 5000)
    drawSvg('#notesvg', 5000)
    tween('#path4816', 3, { fill: '#3a3939' }, { delay: 2 }) // 头发
    tween('#menurect', 0.5, { rotation: 720, fill: 'none' })
    tween('#menutop', 0.5, { rotation: 45, y: 15 })
    tween('#menumid', 0.5, { opacity: 0 })
    tween('#menubottom', 0.5, { rotation: -45, y: -15 })
    for (const it of items)
      tween(it.id, 1, { rotation: 360, opacity: 1, x: it.x, y: it.y })
  }
  else {
    tween('#path4816', 0.5, { fill: 'white' })
    tween('#menurect', 0.5, { rotation: -720, fill: 'none' })
    tween('#menutop', 0.5, { stroke: 'white', rotation: 0, y: 0 })
    tween('#menumid', 0.5, { opacity: 1 })
    tween('#menubottom', 0.5, { stroke: 'white', rotation: 0, y: 0 })
    for (const it of items)
      tween(it.id, 1, { rotation: -360, opacity: 0, x: -it.x / 2, y: -it.y / 2 })
  }
}
button.addEventListener('click', toggleMenu)
button.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    toggleMenu()
  }
})

set('.gmenulist', { opacity: 0 })

// ---------- 网易云音乐歌单：在页面内弹出外链播放器 ----------
const musicLink = document.querySelector<SVGAElement>('#musiclink')! // SVG 里的 <a>
const musicModal = document.querySelector<HTMLElement>('#musicmodal')!
const musicFrame = document.querySelector<HTMLElement>('#musicframe')!

function openMusic() {
  const id = musicLink.dataset.playlist
  const iframe = document.createElement('iframe')
  iframe.title = '网易云音乐歌单'
  iframe.allow = 'autoplay'
  // 网易云官方外链播放器：type=0 表示歌单，auto=1 自动播放，height 是播放器内容高度
  iframe.src = `https://music.163.com/outchain/player?type=0&id=${id}&auto=1&height=430`
  musicFrame.replaceChildren(iframe)
  musicModal.hidden = false
  document.querySelector<HTMLButtonElement>('#musicclose')!.focus()
}

function closeMusic() {
  musicModal.hidden = true
  musicFrame.replaceChildren() // 移除播放器，音乐随之停止
}

musicLink.addEventListener('click', (e) => {
  // 按住 Cmd/Ctrl 或中键点击时，照常在新标签页打开歌单
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0)
    return
  e.preventDefault()
  openMusic()
})
document.querySelector('#musicclose')!.addEventListener('click', closeMusic)
musicModal.addEventListener('click', (e) => {
  if (e.target === musicModal)
    closeMusic()
})
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !musicModal.hidden)
    closeMusic()
})
