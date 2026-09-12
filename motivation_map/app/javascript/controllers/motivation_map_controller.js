import { Controller } from "@hotwired/stimulus"

// 緑系パレット。company.color_index (サーバー側で作成順に割り当て) と
// インデックスを揃えている。app/models/company.rb の PALETTE と対応。
const PALETTE = [
  { main: "#1F6D45", soft: "#DCEEE1" },
  { main: "#2E8B57", soft: "#E1F0E5" },
  { main: "#146356", soft: "#DAEAE7" },
  { main: "#6B8E23", soft: "#EBEEDA" },
  { main: "#0F5132", soft: "#D9E7DF" },
  { main: "#3E8E7E", soft: "#DDEEEA" },
  { main: "#5C7A29", soft: "#E7EBD9" },
  { main: "#2F6F4E", soft: "#DEECE3" }
]

const COMPANIES_URL = "/companies"
const POINTS_URL = "/points"
const SVG_NS = "http://www.w3.org/2000/svg"
const W = 1000
const H = 520
const MARGIN = { top: 24, right: 30, bottom: 36, left: 50 }
const PLOT_W = W - MARGIN.left - MARGIN.right
const PLOT_H = H - MARGIN.top - MARGIN.bottom

export default class extends Controller {
  static targets = ["graph", "bubbleLayer", "companyBar", "panel", "saveState"]
  static values = { companies: Array, points: Array }

  connect(){
    this.companies = this.companiesValue.map(c => ({ ...c }))
    this.points = this.pointsValue.map(p => ({ ...p }))
    this.selectedId = null
    this.hoveredId = null
    this.activeCompanyId = this.companies[0] ? this.companies[0].id : null
    this.dragMoved = false
    this.saveTimers = {}

    this.onResize = () => this.renderGraph()
    window.addEventListener("resize", this.onResize)

    this.renderCompanyBar()
    this.renderGraph()
    this.renderPanel()
  }

  disconnect(){
    window.removeEventListener("resize", this.onResize)
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
    if(this.hasSaveStateTarget) this.saveStateTarget.textContent = text
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

  renderGraph(){
    const svg = this.graphTarget
    svg.innerHTML = ""
    const rendered = []

    const gridStep = 40
    for(let gx = MARGIN.left; gx <= W - MARGIN.right + 0.5; gx += gridStep){
      svg.appendChild(this.svgEl("line", { x1: gx, y1: MARGIN.top, x2: gx, y2: H - MARGIN.bottom, stroke: "var(--border)", "stroke-width": 1 }))
    }
    for(let gy = MARGIN.top; gy <= H - MARGIN.bottom + 0.5; gy += gridStep){
      svg.appendChild(this.svgEl("line", { x1: MARGIN.left, y1: gy, x2: W - MARGIN.right, y2: gy, stroke: "var(--border)", "stroke-width": 1 }))
    }
    svg.appendChild(this.svgEl("line", { x1: MARGIN.left, y1: MARGIN.top, x2: MARGIN.left, y2: H - MARGIN.bottom, stroke: "var(--ink-faint)", "stroke-width": 1.4 }))
    svg.appendChild(this.svgEl("line", { x1: MARGIN.left, y1: H - MARGIN.bottom, x2: W - MARGIN.right, y2: H - MARGIN.bottom, stroke: "var(--ink-faint)", "stroke-width": 1.4 }))

    const top = this.svgEl("text", { x: MARGIN.left - 8, y: MARGIN.top + 10, "text-anchor": "end", class: "point-tagline" })
    top.textContent = "高"; svg.appendChild(top)
    const bottom = this.svgEl("text", { x: MARGIN.left - 8, y: H - MARGIN.bottom, "text-anchor": "end", class: "point-tagline" })
    bottom.textContent = "低"; svg.appendChild(bottom)
    const timeLabel = this.svgEl("text", { x: W - MARGIN.right, y: H - MARGIN.bottom + 22, "text-anchor": "end", class: "point-tagline" })
    timeLabel.textContent = "時間の流れ →"; svg.appendChild(timeLabel)

    this.companies.forEach(company => {
      const color = this.colorFor(company)
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

        const circle = this.svgEl("circle", {
          cx: px, cy: py, r: 10,
          class: "point-circle" + (this.selectedId === pt.id ? " selected" : ""),
          fill, stroke: color.main
        })
        circle.dataset.id = pt.id
        circle.addEventListener("pointerdown", (e) => this.onPointDown(e, pt.id))
        circle.addEventListener("pointerenter", () => this.onPointHover(pt.id, true))
        circle.addEventListener("pointerleave", () => this.onPointHover(pt.id, false))
        svg.appendChild(circle)

        const num = this.svgEl("text", { x: px, y: py + 0.5, class: "point-num", fill: c >= 1 ? "#fff" : color.main })
        num.textContent = i + 1
        num.style.pointerEvents = "none"
        svg.appendChild(num)

        rendered.push({ pt, company, color, px, py })
      })
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
    const bubbleWidth = 180

    rendered.forEach(({ pt, color, px, py }) => {
      const miniHtml = (pt.meaning || "").trim() ? `<div class="b-mini">${this.escapeHtml(pt.meaning)}</div>` : ""
      const rows = []
      if((pt.what || "").trim()) rows.push(`<div class="b-row"><b>②</b>${this.escapeHtml(pt.what)}</div>`)
      if((pt.info || "").trim()) rows.push(`<div class="b-row"><b>③</b>${this.escapeHtml(pt.info)}</div>`)
      if((pt.emotion || "").trim()) rows.push(`<div class="b-row"><b>④</b>${this.escapeHtml(pt.emotion)}</div>`)
      const fullHtml = rows.join("")

      if(!miniHtml && !fullHtml) return

      const screenX = px * scaleX
      const screenY = py * scaleY

      const bubble = document.createElement("div")
      bubble.className = "bubble"
      bubble.dataset.pointId = pt.id
      bubble.dataset.miniHtml = miniHtml
      bubble.dataset.fullHtml = fullHtml
      bubble.style.borderLeft = `3px solid ${color.main}`

      const placeBelow = screenY < 110
      if(placeBelow) bubble.classList.add("below")

      const halfW = bubbleWidth / 2
      const left = Math.max(halfW + 4, Math.min(rect.width - halfW - 4, screenX))
      bubble.style.left = `${left}px`
      bubble.style.top = `${placeBelow ? screenY : screenY - 12}px`

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

  // フィールドの編集は 500ms のデバウンスをかけてから PATCH する
  scheduleSave(id, fields){
    clearTimeout(this.saveTimers[id])
    this.setSaveState("保存中…")
    this.saveTimers[id] = setTimeout(() => this.persistPoint(id, fields), 500)
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

    if(!pt){
      panel.innerHTML = this.companies.length
        ? `<div class="panel-empty">
             グラフ上部で企業を選び、グラフをクリックするとその企業の線にポイントが追加されます。<br><br>
             追加したポイントをクリックすると、ここに②〜⑤の質問が表示されます（②〜④はグラフ上の付箋にも反映されます）。
           </div>`
        : `<div class="panel-empty">
             まだ企業がありません。<br><br>
             左上の「＋企業を追加」から、比較したい企業を追加してください。企業ごとに色分けされた線で、順位や魅力度の推移を描けます。<br><br>
             「今の第一志望群でなくても、魅力を感じていたが辞退した会社」を追加しても構いません。
           </div>`
      return
    }

    const company = this.companyOf(pt)
    const color = company ? this.colorFor(company) : { main: "#1F6D45" }
    const sorted = this.points.filter(p => p.company_id === pt.company_id).sort((a, b) => a.x - b.x)
    const idx = sorted.findIndex(p => p.id === pt.id) + 1

    panel.innerHTML = `
      <div class="panel-head">
        <h2><span class="idx" style="background:${color.main}">${idx}</span>${this.escapeHtml(company ? company.name : "")}</h2>
        <button type="button" class="close-btn" data-role="close">閉じる</button>
      </div>

      <div class="field">
        <label>企業</label>
        <select data-role="company">
          ${this.companies.map(c => `<option value="${c.id}" ${c.id === pt.company_id ? "selected" : ""}>${this.escapeHtml(c.name)}</option>`).join("")}
        </select>
      </div>

      <div class="field">
        <label>② 何があったか
          <span class="sub">説明会、面談、口コミを見た、友人と話した、など</span>
        </label>
        <textarea data-role="what" placeholder="何があったか">${this.escapeHtml(pt.what)}</textarea>
      </div>

      <div class="field">
        <label>③ どんな情報を受け取ったか</label>
        <textarea data-role="info" placeholder="受け取った情報の内容">${this.escapeHtml(pt.info)}</textarea>
      </div>

      <div class="field">
        <label>④ その情報を受け取った時、どう感じたか
          <span class="sub">綺麗に言葉にしなくてOK。ふわっとした言葉で自由に。</span>
        </label>
        <textarea data-role="emotion" placeholder="例：もやもや、なんとなく安心、等">${this.escapeHtml(pt.emotion)}</textarea>
      </div>

      <div class="field">
        <label>⑤ 今振り返ると、その感情は何を意味していたと思いますか
          <span class="sub">正解はありません。あなた自身の言葉で意味づけしてください。</span>
        </label>
        <textarea class="meaning" data-role="meaning" placeholder="つまり自分には◯◯という欲求があり、◯◯という意思決定の軸がある、かもしれない。">${this.escapeHtml(pt.meaning)}</textarea>
      </div>

      <div class="panel-footer">
        <button type="button" class="btn danger" data-role="delete">このポイントを削除</button>
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
      this.renderGraph()
      this.scheduleSave(pt.id, { what: pt.what })
    })
    panel.querySelector('[data-role="info"]').addEventListener("input", (e) => {
      pt.info = e.target.value
      this.renderGraph()
      this.scheduleSave(pt.id, { info: pt.info })
    })
    panel.querySelector('[data-role="emotion"]').addEventListener("input", (e) => {
      pt.emotion = e.target.value
      this.renderGraph()
      this.scheduleSave(pt.id, { emotion: pt.emotion })
    })
    panel.querySelector('[data-role="meaning"]').addEventListener("input", (e) => {
      pt.meaning = e.target.value
      this.renderGraph()
      this.scheduleSave(pt.id, { meaning: pt.meaning })
    })
  }
}
