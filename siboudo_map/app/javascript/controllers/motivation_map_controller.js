import { Controller } from "@hotwired/stimulus"

// 赤系パレット。company.color_index (サーバー側で作成順に割り当て) と
// インデックスを揃えている。app/models/company.rb の PALETTE と対応。
const PALETTE = [
  { main: "#C0392B", soft: "#F7DAD5" },
  { main: "#E4573F", soft: "#FBE2DC" },
  { main: "#A93226", soft: "#F3D7D1" },
  { main: "#D96E5B", soft: "#F8E2DB" },
  { main: "#8E2E23", soft: "#EFD5CF" },
  { main: "#E28F7C", soft: "#FBEAE5" },
  { main: "#B33F32", soft: "#F5DBD5" },
  { main: "#C97A63", soft: "#F6E4DC" }
]

const COMPANIES_URL = "/companies"
const POINTS_URL = "/points"
const SVG_NS = "http://www.w3.org/2000/svg"
const W = 1000
const H = 520
const MARGIN = { top: 24, right: 30, bottom: 36, left: 50 }
const PLOT_W = W - MARGIN.left - MARGIN.right
const PLOT_H = H - MARGIN.top - MARGIN.bottom

const ZOOM_MIN = 0.5
const ZOOM_MAX = 3
const ZOOM_STEP = 0.25
// ズーム100%の状態でも常に横スクロールできるよう、実際の描画幅は
// 画面幅の BASE_WIDTH_RATIO 倍を基準にし、そこからさらに xZoom を掛ける
const BASE_WIDTH_RATIO = 2

export default class extends Controller {
  static targets = ["graph", "graphScroll", "graphStage", "bubbleLayer", "companyBar", "panel", "saveState", "zoomLabel"]
  static values = { companies: Array, points: Array }

  connect(){
    this.companies = this.companiesValue.map(c => ({ ...c }))
    this.points = this.pointsValue.map(p => ({ ...p }))
    this.selectedId = null
    this.hoveredId = null
    this.activeCompanyId = this.companies[0] ? this.companies[0].id : null
    this.dragMoved = false
    this.xZoom = 1

    this.onResize = () => this.renderGraph()
    window.addEventListener("resize", this.onResize)

    // 横に伸びたグラフは、縦方向のホイール操作でも横スクロールできるようにする
    this.onGraphWheel = (e) => {
      // 縦方向優勢のホイール操作は横スクロールに変換せず、ページ全体の縦スクロールに任せる
      if(Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return
      const el = this.graphScrollTarget
      if(el.scrollWidth <= el.clientWidth) return
      el.scrollLeft += e.deltaX
      e.preventDefault()
    }
    this.graphScrollTarget.addEventListener("wheel", this.onGraphWheel, { passive: false })

    this.renderCompanyBar()
    this.updateZoomLabel()
    this.renderGraph()
    this.renderPanel()
  }

  disconnect(){
    window.removeEventListener("resize", this.onResize)
    this.graphScrollTarget.removeEventListener("wheel", this.onGraphWheel)
  }

  // ---------- api helpers ----------

  csrfToken(){
    const meta = document.querySelector('meta[name="csrf-token"]')
    return meta ? meta.content : ""
  }

  async apiFetch(url, options = {}){
    const headers = Object.assign(
      { "Content-Type": "application/json", "Accept": "application/json", "X-CSRF-Token": this.csrfToken() },
      options.headers || {}
    )
    const res = await fetch(url, { ...options, headers })
    if(!res.ok){
      const body = await res.json().catch(() => ({}))
      throw new Error((body.errors || []).join(", ") || ("Request failed: " + res.status))
    }
    if(res.status === 204) return null
    return res.json()
  }

  setSaveState(text){
    if(!this.hasSaveStateTarget) return
    const el = this.saveStateTarget
    const label = el.querySelector("span:last-child")
    if(label) label.textContent = text
    el.classList.toggle("is-saving", text === "保存中…")
    el.classList.toggle("is-error", text.includes("失敗"))
  }

  // ---------- geometry ----------

  toPx(x, y){
    return { px: MARGIN.left + x * PLOT_W, py: MARGIN.top + (1 - y) * PLOT_H }
  }
  fromPx(px, py){
    let x = (px - MARGIN.left) / PLOT_W
    let y = 1 - (py - MARGIN.top) / PLOT_H
    return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) }
  }
  clientToSvgPoint(evt){
    const rect = this.graphTarget.getBoundingClientRect()
    return {
      px: (evt.clientX - rect.left) * (W / rect.width),
      py: (evt.clientY - rect.top) * (H / rect.height)
    }
  }
  svgEl(tag, attrs){
    const el = document.createElementNS(SVG_NS, tag)
    for(const k in attrs) el.setAttribute(k, attrs[k])
    return el
  }
  escapeHtml(s){
    return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  }
  colorFor(company){
    return PALETTE[company.color_index % PALETTE.length]
  }
  // グラフ上では、選択中（activeCompanyId）の企業だけ本来の色で表示し、
  // それ以外の企業の線・点・企業名はグレー(#5B403C)で控えめに表示する
  graphColorFor(company){
    if(company.id === this.activeCompanyId) return { main: "#B51D13", soft: "#B51D131a" }
    return { main: "#5B403C", soft: "#5B403C1a" }
  }
  companyOf(pt){
    return this.companies.find(c => c.id === pt.company_id)
  }
  completeness(pt){
    let n = 0
    if((pt.what || "").trim()) n++
    if((pt.info || "").trim()) n++
    if((pt.emotion || "").trim()) n++
    if((pt.meaning || "").trim()) n++
    return n / 4
  }

  // ---------- companies ----------

  renderCompanyBar(){
    const bar = this.companyBarTarget
    bar.innerHTML = ""

    this.companies.forEach(c => {
      const color = this.colorFor(c)
      const chip = document.createElement("div")
      chip.className = "company-chip" + (this.activeCompanyId === c.id ? " active" : "")
      chip.innerHTML = `<span class="dot" style="background:${color.main}"></span><span>${this.escapeHtml(c.name)}</span>`
      chip.addEventListener("click", () => {
        this.activeCompanyId = c.id
        this.renderCompanyBar()
        this.renderGraph()
      })
      const del = document.createElement("button")
      del.className = "del"
      del.textContent = "×"
      del.title = "この企業を削除"
      del.addEventListener("click", (e) => {
        e.stopPropagation()
        if(!confirm(`「${c.name}」とその企業のポイントをすべて削除しますか？`)) return
        this.deleteCompany(c.id)
      })
      chip.appendChild(del)
      bar.appendChild(chip)
    })

    const addWrap = document.createElement("div")
    addWrap.className = "company-add"
    addWrap.innerHTML = `<input type="text" placeholder="企業名を追加" /><button type="button">＋企業を追加</button>`
    const input = addWrap.querySelector("input")
    const button = addWrap.querySelector("button")
    const submit = () => {
      const name = input.value.trim()
      if(!name) return
      this.addCompany(name)
      input.value = ""
    }
    button.addEventListener("click", submit)
    input.addEventListener("keydown", (e) => { if(e.key === "Enter"){ e.preventDefault(); submit() } })
    bar.appendChild(addWrap)
  }

  async addCompany(name){
    try{
      const company = await this.apiFetch(COMPANIES_URL, {
        method: "POST",
        body: JSON.stringify({ company: { name } })
      })
      this.companies.push(company)
      this.activeCompanyId = company.id
      this.renderCompanyBar()
      this.renderGraph()
      this.renderPanel()
      this.setSaveState("保存済み")
    }catch(err){
      console.error(err)
      alert("企業の追加に失敗しました。")
    }
  }

  async deleteCompany(id){
    try{
      await this.apiFetch(`${COMPANIES_URL}/${id}`, { method: "DELETE" })
      this.companies = this.companies.filter(c => c.id !== id)
      this.points = this.points.filter(p => p.company_id !== id)
      if(this.activeCompanyId === id) this.activeCompanyId = this.companies[0] ? this.companies[0].id : null
      if(this.selectedId && !this.points.find(p => p.id === this.selectedId)) this.selectedId = null
      this.renderCompanyBar()
      this.renderGraph()
      this.renderPanel()
      this.setSaveState("保存済み")
    }catch(err){
      console.error(err)
      alert("企業の削除に失敗しました。")
    }
  }

  async clearAll(){
    if(!confirm("すべての企業・ポイントを削除します。よろしいですか？")) return
    try{
      await Promise.all(this.companies.map(c => this.apiFetch(`${COMPANIES_URL}/${c.id}`, { method: "DELETE" })))
      this.companies = []
      this.points = []
      this.activeCompanyId = null
      this.selectedId = null
      this.renderCompanyBar()
      this.renderGraph()
      this.renderPanel()
      this.setSaveState("保存済み")
    }catch(err){
      console.error(err)
      alert("削除に失敗しました。")
    }
  }

  // ---------- points / graph ----------

  zoomIn(){ this.setZoom(this.xZoom + ZOOM_STEP) }
  zoomOut(){ this.setZoom(this.xZoom - ZOOM_STEP) }

  setZoom(z){
    this.xZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 4) / 4))
    this.updateZoomLabel()
    this.renderGraph()
  }

  updateZoomLabel(){
    if(this.hasZoomLabelTarget) this.zoomLabelTarget.textContent = Math.round(this.xZoom * 100) + "%"
  }

  // 横方向にどれだけ引き伸ばされているか（縦方向の縮尺との比率）
  stretchRatio(){
    return BASE_WIDTH_RATIO * this.xZoom
  }

  applyGraphSize(){
    const containerWidth = this.graphScrollTarget.clientWidth || this.graphScrollTarget.getBoundingClientRect().width
    const width = Math.round(containerWidth * this.stretchRatio())
    const height = Math.round(containerWidth * (H / W))
    this.graphTarget.setAttribute("width", width)
    this.graphTarget.setAttribute("height", height)
    this.graphStageTarget.style.width = width + "px"
    this.graphStageTarget.style.height = height + "px"
  }

  // preserveAspectRatio="none" による横方向の非一様な拡大縮小を打ち消す変形。
  // 軸ラベルの文字や太字の軸線など「引き伸ばしたくない要素」に付与する。
  unstretchTransform(px, py, stretch){
    return `translate(${px} ${py}) scale(${1 / stretch} 1) translate(${-px} ${-py})`
  }

  renderGraph(){
    this.applyGraphSize()
    const svg = this.graphTarget
    svg.innerHTML = ""
    const rendered = []
    const stretch = this.stretchRatio()

    // ---- 細いグリッド（グラフ本体と一緒に伸縮する） ----
    const V_LINES = 40
    const H_LINES = 10
    for(let i = 1; i < V_LINES; i++){
      const gx = MARGIN.left + (PLOT_W * i) / (V_LINES - 1)
      svg.appendChild(this.svgEl("line", {
        x1: gx, y1: MARGIN.top, x2: gx, y2: H - MARGIN.bottom,
        stroke: "var(--border)", "stroke-width": 1
      }))
    }
    for(let i = 0; i < H_LINES - 1; i++){
      const gy = MARGIN.top + (PLOT_H * i) / (H_LINES - 1)
      svg.appendChild(this.svgEl("line", {
        x1: MARGIN.left, y1: gy, x2: W - MARGIN.right, y2: gy,
        stroke: "var(--border)", "stroke-width": 1
      }))
    }

    // ---- 太字の軸線（左の縦軸・下の横軸）は伸縮の影響を受けないよう管理する ----
    // vector-effect="non-scaling-stroke" で、線の太さが横方向の伸縮で変わらないようにする
    svg.appendChild(this.svgEl("line", {
      x1: MARGIN.left, y1: MARGIN.top, x2: MARGIN.left, y2: H - MARGIN.bottom,
      stroke: "var(--ink-faint)", "stroke-width": 2, "vector-effect": "non-scaling-stroke"
    }))
    svg.appendChild(this.svgEl("line", {
      x1: MARGIN.left, y1: H - MARGIN.bottom, x2: W - MARGIN.right, y2: H - MARGIN.bottom,
      stroke: "var(--ink-faint)", "stroke-width": 2, "vector-effect": "non-scaling-stroke"
    }))

    // ---- 軸ラベルの文字も伸縮の影響を受けないよう補正する ----
    const topX = MARGIN.left - 8, topY = MARGIN.top + 10
    const top = this.svgEl("text", { x: topX, y: topY, "text-anchor": "end", class: "point-tagline", transform: this.unstretchTransform(topX, topY, stretch) })
    top.textContent = "高"; svg.appendChild(top)

    const bottomX = MARGIN.left - 8, bottomY = H - MARGIN.bottom
    const bottom = this.svgEl("text", { x: bottomX, y: bottomY, "text-anchor": "end", class: "point-tagline", transform: this.unstretchTransform(bottomX, bottomY, stretch) })
    bottom.textContent = "低"; svg.appendChild(bottom)

    const timeX = W - MARGIN.right, timeY = H - MARGIN.bottom + 22
    const timeLabel = this.svgEl("text", { x: timeX, y: timeY, "text-anchor": "end", class: "point-tagline", transform: this.unstretchTransform(timeX, timeY, stretch) })
    timeLabel.textContent = "時間の流れ →"; svg.appendChild(timeLabel)

    this.companies.forEach(company => {
      const color = this.graphColorFor(company)
      const sorted = this.points.filter(p => p.company_id === company.id).sort((a, b) => a.x - b.x)

      if(sorted.length > 1){
        const d = sorted.map((pt, i) => {
          const { px, py } = this.toPx(pt.x, pt.y)
          return (i === 0 ? "M" : "L") + px.toFixed(1) + "," + py.toFixed(1)
        }).join(" ")
        svg.appendChild(this.svgEl("path", { d, fill: "none", stroke: color.main, "stroke-width": "2.2", "stroke-linecap": "round" }))
      }

      sorted.forEach((pt, i) => {
        const { px, py } = this.toPx(pt.x, pt.y)
        const c = this.completeness(pt)
        let fill = "#fff"
        if(c >= 1) fill = color.main
        else if(c > 0) fill = color.soft

        // preserveAspectRatio="none" で横方向だけ縮尺が変わるため、
        // 円が横に伸びて見えないよう rx を横方向の伸縮率で逆補正した楕円で描く
        if(this.selectedId === pt.id){
          svg.appendChild(this.svgEl("ellipse", {
            cx: px, cy: py, rx: 20 / stretch, ry: 20, class: "point-halo",
            fill: color.main, "fill-opacity": 0.12
          }))
        }

        const circle = this.svgEl("ellipse", {
          cx: px, cy: py, rx: 12 / stretch, ry: 12,
          class: "point-circle" + (this.selectedId === pt.id ? " selected" : ""),
          fill, stroke: color.main
        })
        circle.dataset.id = pt.id
        circle.addEventListener("pointerdown", (e) => this.onPointDown(e, pt.id))
        circle.addEventListener("pointerenter", () => this.onPointHover(pt.id, true))
        circle.addEventListener("pointerleave", () => this.onPointHover(pt.id, false))
        svg.appendChild(circle)

        const num = this.svgEl("text", {
          x: px, y: py + 0.5, class: "point-num", fill: c >= 1 ? "#fff" : color.main,
          transform: this.unstretchTransform(px, py, stretch)
        })
        num.textContent = i + 1
        num.style.pointerEvents = "none"
        svg.appendChild(num)

        rendered.push({ pt, company, color, px, py, order: i })
      })

      // 企業名を、その企業の線の一番右（最新）の点の少し上に表示する
      if(sorted.length > 0){
        const last = sorted[sorted.length - 1]
        const { px: lastPx, py: lastPy } = this.toPx(last.x, last.y)
        const labelX = lastPx
        const labelY = Math.max(MARGIN.top - 6, lastPy - 22)
        const nameLabel = this.svgEl("text", {
          x: labelX, y: labelY, "text-anchor": "middle", class: "company-name-label",
          fill: color.main,
          transform: this.unstretchTransform(labelX, labelY, stretch)
        })
        nameLabel.textContent = company.name
        svg.appendChild(nameLabel)
      }
    })

    svg.onclick = (evt) => {
      if(evt.target.closest && evt.target.closest(".point-circle")) return
      if(this.dragMoved){ this.dragMoved = false; return }
      if(!this.activeCompanyId){
        alert(this.companies.length ? "グラフ上部で、ポイントを追加したい企業を選んでください。" : "先に企業を追加してください。")
        return
      }
      const { px, py } = this.clientToSvgPoint(evt)
      if(px < MARGIN.left || px > W - MARGIN.right || py < MARGIN.top || py > H - MARGIN.bottom) return
      const { x, y } = this.fromPx(px, py)
      this.addPoint(x, y)
    }

    this.renderBubbles(rendered)
  }

  onPointHover(id, isOver){
    this.hoveredId = isOver ? id : (this.hoveredId === id ? null : this.hoveredId)
    const el = this.bubbleLayerTarget.querySelector(`[data-point-id="${id}"]`)
    if(!el) return
    const isActive = this.hoveredId === id || this.selectedId === id
    this.applyBubbleState(el, isActive)
  }

  applyBubbleState(el, isActive){
    const mini = el.dataset.miniHtml || ""
    const full = el.dataset.fullHtml || ""
    el.innerHTML = isActive ? full : mini
    el.classList.toggle("state-full", isActive)
    el.classList.toggle("state-mini", !isActive)
    el.classList.toggle("hidden", !isActive && !mini)
  }

  renderBubbles(rendered){
    const layer = this.bubbleLayerTarget
    layer.innerHTML = ""
    const rect = this.graphTarget.getBoundingClientRect()
    const scaleX = rect.width / W
    const scaleY = rect.height / H
    const bubbleWidth = 184
    const edgeMargin = 70 // px。この範囲より上/下に近い場合は向きを反転する

    rendered.forEach(({ pt, color, px, py, order }) => {
      const meaning = (pt.meaning || "").trim()
      const miniHtml = meaning
        ? `<div class="flag-body">${this.escapeHtml(meaning)}</div><div class="flag-tail"></div>`
        : ""

      const rows = []
      if((pt.what || "").trim()) rows.push(`<div class="b-row"><b>②</b>${this.escapeHtml(pt.what)}</div>`)
      if((pt.info || "").trim()) rows.push(`<div class="b-row"><b>③</b>${this.escapeHtml(pt.info)}</div>`)
      if((pt.emotion || "").trim()) rows.push(`<div class="b-row"><b>④</b>${this.escapeHtml(pt.emotion)}</div>`)
      const fullHtml = rows.join("")

      if(!miniHtml && !fullHtml) return

      const screenX = px * scaleX
      const screenY = py * scaleY

      // image2 を参考に、点の並び順で上下を交互に配置する
      let placeAbove = order % 2 === 0
      if(placeAbove && screenY < edgeMargin) placeAbove = false
      if(!placeAbove && screenY > rect.height - edgeMargin) placeAbove = true

      const bubble = document.createElement("div")
      bubble.className = "bubble " + (placeAbove ? "dir-up" : "dir-down")
      bubble.dataset.pointId = pt.id
      bubble.dataset.miniHtml = miniHtml
      bubble.dataset.fullHtml = fullHtml
      bubble.style.setProperty("--flag-color", color.main)

      const halfW = bubbleWidth / 2
      const left = Math.max(halfW + 4, Math.min(rect.width - halfW - 4, screenX))
      bubble.style.left = `${left}px`
      bubble.style.top = `${screenY}px`

      const isActive = this.hoveredId === pt.id || this.selectedId === pt.id
      this.applyBubbleState(bubble, isActive)

      layer.appendChild(bubble)
    })
  }

  onPointDown(evt, id){
    evt.stopPropagation()
    this.selectedId = id
    this.dragMoved = false
    this.renderGraph()
    this.renderPanel()

    const onMove = (mv) => {
      const { px, py } = this.clientToSvgPoint(mv)
      const { x, y } = this.fromPx(px, py)
      const pt = this.points.find(p => p.id === id)
      if(pt){ pt.x = x; pt.y = y; this.dragMoved = true; this.renderGraph() }
    }
    const onUp = () => {
      document.removeEventListener("pointermove", onMove)
      document.removeEventListener("pointerup", onUp)
      const pt = this.points.find(p => p.id === id)
      if(pt) this.persistPoint(pt.id, { x: pt.x, y: pt.y })
      setTimeout(() => { this.dragMoved = false }, 0)
    }
    document.addEventListener("pointermove", onMove)
    document.addEventListener("pointerup", onUp)
  }

  async addPoint(x, y){
    try{
      const point = await this.apiFetch(POINTS_URL, {
        method: "POST",
        body: JSON.stringify({ company_id: this.activeCompanyId, x, y })
      })
      this.points.push(point)
      this.selectedId = point.id
      this.renderGraph()
      this.renderPanel()
      this.setSaveState("保存済み")
    }catch(err){
      console.error(err)
      alert("ポイントの追加に失敗しました。")
    }
  }

  async deletePoint(id){
    try{
      await this.apiFetch(`${POINTS_URL}/${id}`, { method: "DELETE" })
      this.points = this.points.filter(p => p.id !== id)
      if(this.selectedId === id) this.selectedId = null
      this.renderGraph()
      this.renderPanel()
      this.setSaveState("保存済み")
    }catch(err){
      console.error(err)
      alert("ポイントの削除に失敗しました。")
    }
  }

  async persistPoint(id, fields){
    try{
      await this.apiFetch(`${POINTS_URL}/${id}`, { method: "PATCH", body: JSON.stringify(fields) })
      this.setSaveState("保存済み")
    }catch(err){
      console.error(err)
      this.setSaveState("保存に失敗しました")
    }
  }

  // ---------- panel ----------

  renderPanel(){
    const panel = this.panelTarget
    const pt = this.points.find(p => p.id === this.selectedId)

    // if(!pt){
    //   panel.innerHTML = this.companies.length
    //     ? `<div class="panel"><div class="panel-empty">
    //          上の企業チップを選び、グラフをクリックするとその企業の線にポイントが追加されます。<br><br>
    //          追加したポイントをクリックすると、ここに②〜⑤の質問が表示されます（②〜④はグラフ上の付箋にも反映されます）。
    //        </div></div>`
    //     : `<div class="panel"><div class="panel-empty">
    //          まだ企業がありません。<br><br>
    //          上の「＋企業を追加」から、比較したい企業を追加してください。企業ごとに色分けされた線で、順位や魅力度の推移を描けます。<br><br>
    //          「今の第一志望群でなくても、魅力を感じていたが辞退した会社」を追加しても構いません。
    //        </div></div>`
    //   return
    // }

    const company = this.companyOf(pt)
    const color = company ? this.colorFor(company) : { main: "#B51D13" }
    const sorted = this.points.filter(p => p.company_id === pt.company_id).sort((a, b) => a.x - b.x)
    const idx = sorted.findIndex(p => p.id === pt.id) + 1

    panel.innerHTML = `
      <div class="panel">
        <div class="panel-head">
          <div class="panel-head-left">
            <span class="focus-badge">FOCUS</span>
            <h2><span class="idx" style="background:${color.main}">${idx}</span>${this.escapeHtml(company ? company.name : "")}</h2>
          </div>
          <button type="button" class="close-btn" data-role="close">閉じる</button>
        </div>

        <div class="field field-select-row">
          <label>企業</label>
          <select data-role="company">
            ${this.companies.map(c => `<option value="${c.id}" ${c.id === pt.company_id ? "selected" : ""}>${this.escapeHtml(c.name)}</option>`).join("")}
          </select>
        </div>

        <div class="field">
          <div class="field-head">
            <span class="q-num">②</span>
            <label>何があったか
              <span class="sub">説明会、面談、口コミを見た、友人と話した、など</span>
            </label>
          </div>
          <div class="field-box"><textarea data-role="what" placeholder="何があったか">${this.escapeHtml(pt.what)}</textarea></div>
        </div>

        <div class="field">
          <div class="field-head">
            <span class="q-num">③</span>
            <label>どんな情報を受け取ったか</label>
          </div>
          <div class="field-box"><textarea data-role="info" placeholder="受け取った情報の内容">${this.escapeHtml(pt.info)}</textarea></div>
        </div>

        <div class="field">
          <div class="field-head">
            <span class="q-num">④</span>
            <label>その情報を受け取った時、どう感じたか
              <span class="sub">綺麗に言葉にしなくてOK。ふわっとした言葉で自由に。</span>
            </label>
          </div>
          <div class="field-box"><textarea data-role="emotion" placeholder="例：もやもや、なんとなく安心、等">${this.escapeHtml(pt.emotion)}</textarea></div>
        </div>

        <div class="field">
          <div class="field-head">
            <span class="q-num">⑤</span>
            <label>今振り返ると、その感情は何を意味していたと思いますか
              <span class="sub">正解はありません。あなた自身の言葉で意味づけしてください。</span>
            </label>
          </div>
          <div class="field-box"><textarea class="meaning" data-role="meaning" placeholder="つまり自分には◯◯という欲求があり、◯◯という意思決定の軸がある／自分は〇〇を大切にしている。">${this.escapeHtml(pt.meaning)}</textarea></div>
        </div>

        <div class="panel-save">
          <button type="button" class="btn primary" data-role="save-entry">
            <span class="material-symbols-outlined">check</span>
            <span>記入内容を保存する</span>
          </button>
        </div>

        <div class="panel-footer">
          <button type="button" class="btn danger" data-role="delete">このポイントを削除</button>
        </div>
      </div>
    `

    panel.querySelector('[data-role="close"]').addEventListener("click", () => {
      this.selectedId = null
      this.renderGraph()
      this.renderPanel()
    })
    panel.querySelector('[data-role="delete"]').addEventListener("click", () => {
      if(confirm("このポイントを削除しますか？")) this.deletePoint(pt.id)
    })
    panel.querySelector('[data-role="company"]').addEventListener("change", (e) => {
      pt.company_id = Number(e.target.value)
      this.renderGraph()
      this.renderPanel()
      this.persistPoint(pt.id, { company_id: pt.company_id })
    })
    panel.querySelector('[data-role="what"]').addEventListener("input", (e) => {
      pt.what = e.target.value
    })
    panel.querySelector('[data-role="info"]').addEventListener("input", (e) => {
      pt.info = e.target.value
    })
    panel.querySelector('[data-role="emotion"]').addEventListener("input", (e) => {
      pt.emotion = e.target.value
    })
    panel.querySelector('[data-role="meaning"]').addEventListener("input", (e) => {
      pt.meaning = e.target.value
    })
    panel.querySelector('[data-role="save-entry"]').addEventListener("click", (e) => {
      this.saveEntry(pt, e.currentTarget)
    })
  }

  saveEntry(pt, btn){
    this.renderGraph()
    this.persistPoint(pt.id, { what: pt.what, info: pt.info, emotion: pt.emotion, meaning: pt.meaning })

    const original = btn.innerHTML
    btn.classList.add("success")
    btn.disabled = true
    btn.innerHTML = '<span class="material-symbols-outlined">done_all</span><span>保存しました</span>'
    clearTimeout(this.saveEntryResetTimer)
    this.saveEntryResetTimer = setTimeout(() => {
      btn.classList.remove("success")
      btn.disabled = false
      btn.innerHTML = original
    }, 1800)
  }
}