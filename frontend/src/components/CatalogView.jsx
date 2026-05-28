import { useState, useRef, useEffect, useCallback } from 'react'

const API = '/api'

// Internal canvas size — maps exactly to 13.33" × 7.50" at 100px/inch
const CW = 1333
const CH = 750

function imgUrl(path) {
  if (!path) return null
  return `${API}/${path.replace(/^storage\//, '')}`
}

// ── Default layouts — pixel dimensions match reference template TT AW26 SL ──
// 1 canvas pixel = 0.01 inch (e.g. 462px = 4.62", 662px = 6.62")
function defaultLayout(slide) {
  const hasFront  = !!slide.front_image_path
  const hasBack   = !!slide.back_image_path
  const hasDetail = !!slide.detail_image_path

  if (hasDetail) {
    return {
      front:  { left: 5,   top: 17, width: 462, height: 662, rotation: 0 },
      back:   { left: 471, top: 17, width: 460, height: 662, rotation: 0 },
      detail: { left: 934, top: 17, width: 395, height: 242, rotation: 0 },
      specs:  { left: 928, top: 517, width: 448 },
    }
  }
  if (hasFront && hasBack) {
    return {
      front: { left: 5,   top: 17, width: 462, height: 662, rotation: 0 },
      back:  { left: 471, top: 17, width: 460, height: 662, rotation: 0 },
      specs: { left: 928, top: 517, width: 448 },
    }
  }
  const imgKey = hasFront ? 'front' : 'back'
  return {
    [imgKey]: { left: 200, top: 50, width: 900, height: 650, rotation: 0 },
    specs:    { left: 928, top: 517, width: 448 },
  }
}

function resolveLayout(slide, overrides) {
  const def = defaultLayout(slide)
  if (!overrides) return def
  return { ...def, ...overrides }
}

// ── Resize handle dot ─────────────────────────────────────────────────────────
const HANDLE = 8
const H_POS = {
  nw: { top: -HANDLE/2, left: -HANDLE/2, cursor: 'nw-resize' },
  n:  { top: -HANDLE/2, left: '50%', transform: 'translateX(-50%)', cursor: 'n-resize' },
  ne: { top: -HANDLE/2, right: -HANDLE/2, cursor: 'ne-resize' },
  e:  { top: '50%',     right: -HANDLE/2, transform: 'translateY(-50%)', cursor: 'e-resize' },
  se: { bottom: -HANDLE/2, right: -HANDLE/2, cursor: 'se-resize' },
  s:  { bottom: -HANDLE/2, left: '50%', transform: 'translateX(-50%)', cursor: 's-resize' },
  sw: { bottom: -HANDLE/2, left: -HANDLE/2, cursor: 'sw-resize' },
  w:  { top: '50%', left: -HANDLE/2, transform: 'translateY(-50%)', cursor: 'w-resize' },
}

function ResizeHandle({ pos, onMouseDown }) {
  return (
    <div
      onMouseDown={onMouseDown}
      style={{
        position: 'absolute', width: HANDLE, height: HANDLE,
        background: '#fff', border: '1.5px solid rgba(196,150,106,1)',
        borderRadius: 1, zIndex: 50,
        ...H_POS[pos],
      }}
    />
  )
}

// ── Draggable + resizable element wrapper ─────────────────────────────────────
function EditableEl({ elKey, el, scale, zIndex, selected, onSelect, onLayoutChange, label, hasHeight, isEditing, onDoubleClick, children }) {
  if (!el) return null
  const rot = el.rotation || 0

  function startMove(e) {
    if (isEditing) return
    e.stopPropagation()
    e.preventDefault()
    onSelect(elKey)
    const startX = e.clientX, startY = e.clientY
    const origLeft = el.left, origTop = el.top
    const s = scale

    function onMove(ev) {
      const dx = (ev.clientX - startX) / s
      const dy = (ev.clientY - startY) / s
      onLayoutChange(elKey, { ...el, left: Math.round(origLeft + dx), top: Math.round(origTop + dy) })
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  function startResize(e, pos) {
    e.stopPropagation()
    e.preventDefault()
    const startX = e.clientX, startY = e.clientY
    const orig = { ...el }
    const s = scale

    function onMove(ev) {
      const dx = (ev.clientX - startX) / s
      const dy = (ev.clientY - startY) / s
      let { left, top, width, height } = orig

      if (pos.includes('e')) width = Math.max(40, orig.width + dx)
      if (pos.includes('w')) {
        const nw = Math.max(40, orig.width - dx)
        left = orig.left + orig.width - nw
        width = nw
      }
      if (hasHeight) {
        if (pos.includes('s') && height !== undefined) height = Math.max(40, orig.height + dy)
        if (pos.includes('n') && height !== undefined) {
          const nh = Math.max(40, orig.height - dy)
          top = orig.top + orig.height - nh
          height = nh
        }
      }
      onLayoutChange(elKey, {
        ...el,
        left: Math.round(left), top: Math.round(top),
        width: Math.round(width),
        ...(hasHeight && height !== undefined ? { height: Math.round(height) } : {}),
      })
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const isSel = selected === elKey
  const handles = hasHeight
    ? ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
    : ['w', 'e']

  return (
    <div
      onMouseDown={startMove}
      onDoubleClick={onDoubleClick}
      style={{
        position: 'absolute',
        left: el.left, top: el.top,
        width: el.width,
        ...(el.height !== undefined ? { height: el.height } : {}),
        transform: rot ? `rotate(${rot}deg)` : undefined,
        transformOrigin: 'center center',
        cursor: isEditing ? 'text' : 'move',
        zIndex: isSel ? 100 : zIndex,
        outline: isSel ? '2px solid rgba(196,150,106,0.9)' : '1.5px solid transparent',
        boxSizing: 'border-box',
        userSelect: 'none',
      }}
    >
      {children}

      {/* Label badge */}
      {isSel && (
        <div style={{
          position: 'absolute', top: -22, left: 0,
          background: 'rgba(196,150,106,0.95)', color: '#111',
          fontSize: 9, padding: '2px 7px',
          borderRadius: '2px 2px 0 0',
          fontFamily: '"DM Mono", monospace', letterSpacing: '0.06em',
          pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 50,
        }}>
          {label}
        </div>
      )}

      {/* Resize handles */}
      {isSel && handles.map(h => (
        <ResizeHandle key={h} pos={h} onMouseDown={e => startResize(e, h)} />
      ))}
    </div>
  )
}

// ── Slide canvas ──────────────────────────────────────────────────────────────
function SlideCanvas({ slide, compact, layout, onLayoutChange, selected, onSelect, logoUrl, logoLayout, onLogoLayoutChange, specsSize, onSpecsSave }) {
  const wrapRef       = useRef()
  const innerRef      = useRef()
  const [scale, setScale] = useState(0)
  const [editingSpecs, setEditingSpecs] = useState(false)
  const specsTextRef  = useRef('')

  useEffect(() => { setEditingSpecs(false) }, [slide?.id])
  useEffect(() => { if (selected !== 'specs') setEditingSpecs(false) }, [selected])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => setScale(el.offsetWidth / CW)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const innerH = CH * scale

  const front  = imgUrl(slide.front_image_path)
  const back   = imgUrl(slide.back_image_path)
  const detail = imgUrl(slide.detail_image_path)

  const specs = [
    slide.ref_number && `REF NO  : ${slide.ref_number}`,
    slide.afs        && `AFS     : ${slide.afs}`,
    slide.fabric     && `COMP    : ${slide.fabric}`,
    slide.gsm        && `GSM     : ${slide.gsm}`,
  ].filter(Boolean).join('\n')

  // Positioned box with image inside — used for compact thumbnails
  const ImgBox = ({ src, box, zIdx }) => {
    const rot = box.rotation || 0
    return (
      <div style={{
        position: 'absolute', left: box.left, top: box.top,
        width: box.width, height: box.height,
        zIndex: zIdx, overflow: 'hidden',
        transform: rot ? `rotate(${rot}deg)` : undefined,
        transformOrigin: 'center center',
      }}>
        <img src={src} alt="" loading="lazy" draggable={false}
          style={{ display: 'block', width: '100%', height: '100%', objectFit: box.fit || 'contain' }}
        />
      </div>
    )
  }

  const imgFill = { display: 'block', width: '100%', height: '100%', objectFit: 'contain' }

  // ── Compact (thumbnail) mode ─────────────────────────────────────────────────
  if (compact) {
    return (
      <div ref={wrapRef} style={{ width: '100%', height: innerH, overflow: 'hidden', position: 'relative', background: '#fff' }}>
        {scale > 0 && (
          <div style={{
            position: 'absolute', top: 0, left: 0,
            width: CW, height: CH,
            transform: `scale(${scale})`, transformOrigin: 'top left',
            background: '#fff', overflow: 'hidden',
          }}>
            {front  && layout.front  && <ImgBox src={front}  box={layout.front}  zIdx={1} />}
            {back   && layout.back   && <ImgBox src={back}   box={layout.back}   zIdx={2} />}
            {detail && layout.detail && <ImgBox src={detail} box={layout.detail} zIdx={3} />}
            {specs && layout.specs && (
              <div style={{
                position: 'absolute',
                left: layout.specs.left, top: layout.specs.top, width: layout.specs.width,
                fontSize: specsSize ?? 14, fontFamily: 'Calibri, "Segoe UI", sans-serif',
                color: '#1a1a1a', lineHeight: 1.4, whiteSpace: 'pre', zIndex: 5,
              }}>
                {specs}
              </div>
            )}
            {logoUrl && logoLayout && (
              <img src={logoUrl} alt="" draggable={false}
                style={{ position: 'absolute', left: logoLayout.left, top: logoLayout.top, width: logoLayout.width, height: logoLayout.height, objectFit: 'contain', zIndex: 6 }}
              />
            )}
          </div>
        )}
      </div>
    )
  }

  // ── Interactive edit mode ────────────────────────────────────────────────────
  const elProps = (key, zi, hH) => ({
    elKey: key, el: layout[key], scale,
    zIndex: zi, hasHeight: hH,
    selected, onSelect,
    onLayoutChange,
  })

  const imgStyle = (key) => ({
    display: 'block', width: '100%', height: '100%',
    objectFit: layout[key]?.fit || 'contain',
  })

  return (
    <div
      ref={wrapRef}
      style={{ width: '100%', height: innerH, overflow: 'hidden', position: 'relative', background: '#ccc' }}
      onMouseDown={() => onSelect?.(null)}
    >
      {scale > 0 && (
        <div
          ref={innerRef}
          style={{
            position: 'absolute', top: 0, left: 0,
            width: CW, height: CH,
            transform: `scale(${scale})`, transformOrigin: 'top left',
            background: '#fff',
          }}
          onMouseDown={e => { if (e.target === e.currentTarget) onSelect?.(null) }}
        >
          {front  && layout.front  && (
            <EditableEl {...elProps('front',  1, true)} label="FRONT">
              <img src={front}  alt="" draggable={false} style={imgStyle('front')} />
            </EditableEl>
          )}
          {back   && layout.back   && (
            <EditableEl {...elProps('back',   2, true)} label="BACK">
              <img src={back}   alt="" draggable={false} style={imgStyle('back')} />
            </EditableEl>
          )}
          {detail && layout.detail && (
            <EditableEl {...elProps('detail', 3, true)} label="DETAIL">
              <img src={detail} alt="" draggable={false} style={imgStyle('detail')} />
            </EditableEl>
          )}
          {specs && layout.specs && (
            <EditableEl {...elProps('specs', 4, false)} label="SPECS · dbl-click to edit"
              isEditing={editingSpecs}
              onDoubleClick={() => { specsTextRef.current = specs; setEditingSpecs(true) }}
            >
              {editingSpecs ? (
                <textarea
                  defaultValue={specs}
                  ref={el => {
                    if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px' }
                  }}
                  onChange={e => {
                    specsTextRef.current = e.target.value
                    e.target.style.height = 'auto'
                    e.target.style.height = e.target.scrollHeight + 'px'
                  }}
                  onBlur={() => { setEditingSpecs(false); onSpecsSave?.(specsTextRef.current) }}
                  onKeyDown={e => {
                    if (e.key === 'Escape') { specsTextRef.current = specs; setEditingSpecs(false) }
                    e.stopPropagation()
                  }}
                  onMouseDown={e => e.stopPropagation()}
                  autoFocus
                  style={{
                    width: '100%', resize: 'none', overflow: 'hidden',
                    border: 'none', outline: 'none', background: 'transparent',
                    fontSize: specsSize ?? 14, fontFamily: 'Calibri, "Segoe UI", sans-serif',
                    color: '#1a1a1a', lineHeight: 1.4, whiteSpace: 'pre',
                    letterSpacing: 0.3, padding: 0, cursor: 'text',
                  }}
                />
              ) : (
                <div style={{
                  width: '100%',
                  fontSize: specsSize ?? 14, fontFamily: 'Calibri, "Segoe UI", sans-serif',
                  color: '#1a1a1a', lineHeight: 1.4,
                  whiteSpace: 'pre', letterSpacing: 0.3,
                }}>
                  {specs}
                </div>
              )}
            </EditableEl>
          )}
          {logoUrl && logoLayout && (
            <EditableEl
              elKey="logo"
              el={logoLayout}
              scale={scale}
              zIndex={7}
              hasHeight={true}
              selected={selected}
              onSelect={onSelect}
              onLayoutChange={(_, newEl) => onLogoLayoutChange?.(newEl)}
              label="LOGO"
            >
              <img src={logoUrl} alt="" draggable={false}
                style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', pointerEvents: 'none' }}
              />
            </EditableEl>
          )}
        </div>
      )}
    </div>
  )
}

// ── Field editor ──────────────────────────────────────────────────────────────
function FieldEditor({ slide, onSave }) {
  const [form, setForm] = useState({
    style_name: slide.style_name ?? '',
    ref_number: slide.ref_number ?? '',
    afs:        slide.afs        ?? '',
    fabric:     slide.fabric     ?? '',
    gsm:        slide.gsm        ?? '',
    date:       slide.date       ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)

  useEffect(() => {
    setForm({
      style_name: slide.style_name ?? '',
      ref_number: slide.ref_number ?? '',
      afs:        slide.afs        ?? '',
      fabric:     slide.fabric     ?? '',
      gsm:        slide.gsm        ?? '',
      date:       slide.date       ?? '',
    })
    setSaved(false)
  }, [slide.id])

  const field = (key, lbl) => (
    <div key={key} style={{ marginBottom: 14 }}>
      <label style={labelSt}>{lbl}</label>
      <input
        value={form[key]}
        onChange={e => { setForm(p => ({ ...p, [key]: e.target.value })); setSaved(false) }}
        style={inputSt} spellCheck={false}
      />
    </div>
  )

  async function handleSave() {
    setSaving(true)
    try {
      const payload = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== ''))
      Object.keys(form).forEach(k => { if (!(k in payload)) payload[k] = null })
      await onSave(slide.id, payload)
      setSaved(true)
    } catch {}
    setSaving(false)
  }

  return (
    <div style={{ padding: '20px 18px', boxSizing: 'border-box' }}>
      <h3 style={{
        margin: '0 0 20px', fontSize: 11,
        fontFamily: '"DM Mono", monospace', letterSpacing: '0.12em',
        textTransform: 'uppercase', color: 'var(--text-muted)',
      }}>
        Edit Slide
      </h3>
      {field('style_name', 'Style Name')}
      {field('ref_number', 'Reference No.')}
      {field('afs',        'AFS')}
      {field('fabric',     'Composition')}
      {field('gsm',        'GSM')}
      {field('date',       'Date')}
      <button onClick={handleSave} disabled={saving} style={saveBtnSt(saving, saved)}>
        {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save Changes'}
      </button>
      {slide.is_edited && (
        <p style={{ margin: '10px 0 0', fontSize: 10, color: 'var(--text-faint)', fontFamily: '"DM Mono", monospace', textAlign: 'center' }}>
          manually edited
        </p>
      )}
    </div>
  )
}

const labelSt = {
  display: 'block', marginBottom: 5,
  fontSize: 10, fontFamily: '"DM Mono", monospace',
  letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)',
}
const inputSt = {
  width: '100%', boxSizing: 'border-box', padding: '7px 10px',
  background: 'var(--surface)', border: '1px solid var(--border)',
  borderRadius: 3, color: 'var(--text)', fontSize: 12,
  fontFamily: '"DM Mono", monospace', outline: 'none',
}
function saveBtnSt(saving, saved) {
  return {
    marginTop: 6, width: '100%', padding: '9px',
    borderRadius: 3, border: '1px solid',
    borderColor: saved ? 'rgba(100,200,100,0.4)' : 'var(--border)',
    background: saved ? 'rgba(100,200,100,0.08)' : 'rgba(196,150,106,0.08)',
    cursor: saving ? 'wait' : 'pointer',
    fontSize: 11, fontFamily: '"DM Mono", monospace',
    letterSpacing: '0.08em', textTransform: 'uppercase',
    color: saved ? 'rgb(100,200,100)' : 'var(--gold)',
    opacity: saving ? 0.6 : 1, transition: 'all 0.2s',
  }
}

// ── Toolbar button ────────────────────────────────────────────────────────────
function Btn({ label, disabled, onClick, muted }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: '6px 12px', borderRadius: 3,
      border: '1px solid var(--border)',
      background: disabled || muted ? 'transparent' : 'rgba(196,150,106,0.06)',
      color: disabled ? 'var(--text-faint)' : muted ? 'var(--text-muted)' : 'var(--gold)',
      fontSize: 10, fontFamily: '"DM Mono", monospace',
      letterSpacing: '0.08em', textTransform: 'uppercase',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.4 : 1,
    }}>
      {label}
    </button>
  )
}

// ── Export — POST with session slide IDs, pixel layouts, and rotations ────────
async function doExport(format, slideList, layouts, logoLayout, specsSize) {
  const slideIds = slideList.map(s => s.id)
  const layoutsBody = {}
  for (const slide of slideList) {
    const resolved = resolveLayout(slide, layouts[slide.id] || null)
    layoutsBody[slide.id] = {
      front:  resolved.front  || null,
      back:   resolved.back   || null,
      detail: resolved.detail || null,
      specs:  resolved.specs  || null,
    }
  }

  const res = await fetch(`${API}/export/${format}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      slide_ids: slideIds,
      layouts: layoutsBody,
      logo_layout: logoLayout ?? null,
      specs_font_pt: specsSize ? +(specsSize * 72 / 100).toFixed(2) : null,
    }),
  })
  if (!res.ok) throw new Error(`Export failed: ${res.status}`)

  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `catalog.${format}`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function parseSpecsText(text) {
  const fields = {}
  for (const line of text.split('\n')) {
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx).trim().toLowerCase()
    const val = line.slice(colonIdx + 1).trim() || null
    if (key.startsWith('ref'))                       fields.ref_number = val
    else if (key.startsWith('afs'))                  fields.afs = val
    else if (key.startsWith('comp') || key.startsWith('fab')) fields.fabric = val
    else if (key.startsWith('gsm'))                  fields.gsm = val
  }
  return fields
}

// ── Main CatalogView ──────────────────────────────────────────────────────────
export function CatalogView({ slides, onSave }) {
  const slideList = Object.values(slides).sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at)
  )
  const [selectedId, setSelectedId] = useState(null)
  const [layouts,    setLayouts]    = useState({})
  const [selectedEl, setSelectedEl] = useState(null)
  const [exporting,  setExporting]  = useState(null)
  const [logoUrl,    setLogoUrl]    = useState(null)
  const [logoLayout, setLogoLayout] = useState({ left: 1252, top: 681, width: 55, height: 50 })
  const [specsSize,  setSpecsSize]  = useState(14)

  useEffect(() => {
    fetch(`${API}/logo`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.exists) setLogoUrl(`${API}${d.url}`) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!selectedId && slideList.length > 0) setSelectedId(slideList[0].id)
  }, [slideList.length])

  const selected  = slides[selectedId] ?? slideList[0] ?? null
  const hasSlides = slideList.length > 0

  const getLayout = useCallback((slide) => {
    if (!slide) return {}
    return resolveLayout(slide, layouts[slide.id])
  }, [layouts])

  const handleLayoutChange = useCallback((elKey, elLayout) => {
    if (!selected) return
    setLayouts(prev => ({
      ...prev,
      [selected.id]: { ...(prev[selected.id] || defaultLayout(selected)), [elKey]: elLayout },
    }))
  }, [selected])

  function resetLayout() {
    if (!selected) return
    setLayouts(prev => { const n = { ...prev }; delete n[selected.id]; return n })
    setSelectedEl(null)
  }

  async function handleExport(fmt) {
    if (!hasSlides || exporting) return
    setExporting(fmt)
    try { await doExport(fmt, slideList, layouts, logoLayout, specsSize) } catch (e) { console.error(e) }
    setExporting(null)
  }

  async function handleSpecsSave(rawText) {
    if (!selected) return
    const fields = parseSpecsText(rawText)
    if (Object.keys(fields).length > 0) {
      try { await onSave(selected.id, fields) } catch {}
    }
  }

  const selLayout = (selected && selectedEl) ? (getLayout(selected)[selectedEl] ?? null) : null
  const selIsImg  = selLayout?.height !== undefined
  const selFit    = selLayout?.fit || 'contain'
  const selRot    = selLayout?.rotation || 0

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

      {/* ── Thumbnails ───────────────────────────────────────────── */}
      <div style={{
        width: 200, flexShrink: 0,
        borderRight: '1px solid var(--border)',
        overflowY: 'auto', overflowX: 'hidden',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '14px 12px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <p style={{ margin: 0, fontSize: 10, fontFamily: '"DM Mono", monospace', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            {slideList.length} slide{slideList.length !== 1 ? 's' : ''}
          </p>
        </div>
        {slideList.length === 0 ? (
          <div style={{ padding: '32px 12px', textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: 10, color: 'var(--text-faint)', fontFamily: '"DM Mono", monospace', lineHeight: 1.8 }}>
              Completed groups<br />appear here
            </p>
          </div>
        ) : (
          <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {slideList.map((slide, i) => (
              <button key={slide.id}
                onClick={() => { setSelectedId(slide.id); setSelectedEl(null) }}
                style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', outline: 'none' }}
              >
                <div style={{
                  borderRadius: 3, overflow: 'hidden',
                  border: `1px solid ${slide.id === selectedId ? 'var(--gold)' : 'var(--border)'}`,
                  boxShadow: slide.id === selectedId ? '0 0 0 1px rgba(196,150,106,0.3)' : 'none',
                  transition: 'border-color 0.15s',
                }}>
                  <SlideCanvas slide={slide} compact layout={getLayout(slide)} logoUrl={logoUrl} logoLayout={logoLayout} specsSize={specsSize} />
                </div>
                <p style={{
                  margin: '4px 0 0', fontSize: 9,
                  fontFamily: '"DM Mono", monospace', letterSpacing: '0.05em',
                  color: slide.id === selectedId ? 'var(--gold)' : 'var(--text-faint)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {String(i + 1).padStart(2, '0')} · {slide.ref_number || slide.style_name || 'Untitled'}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Editor ───────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#111' }}>
        <div style={{
          padding: '8px 16px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
          background: 'var(--bg)',
        }}>
          <span style={{ fontSize: 10, fontFamily: '"DM Mono", monospace', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginRight: 4 }}>
            Export
          </span>
          <Btn label={exporting === 'pptx' ? '↻ PPTX…' : '↓ PPTX'} disabled={!hasSlides || !!exporting} onClick={() => handleExport('pptx')} />
          <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 4px', flexShrink: 0 }} />
          <span style={{ fontSize: 9, fontFamily: '"DM Mono", monospace', color: 'var(--text-faint)', letterSpacing: '0.06em' }}>Aa</span>
          <Btn label="−" onClick={() => setSpecsSize(s => Math.max(8, s - 1))} disabled={specsSize <= 8} />
          <span style={{ fontSize: 10, fontFamily: '"DM Mono", monospace', color: 'var(--text-muted)', minWidth: 20, textAlign: 'center' }}>{specsSize}</span>
          <Btn label="+" onClick={() => setSpecsSize(s => Math.min(40, s + 1))} disabled={specsSize >= 40} />
          {selected && (
            <>
              <div style={{ flex: 1 }} />
              {selLayout ? (
                <>
                  <span style={{ fontSize: 9, fontFamily: '"DM Mono", monospace', color: 'var(--gold)', letterSpacing: '0.08em', textTransform: 'uppercase', marginRight: 2 }}>
                    {selectedEl}{selRot ? ` · ${selRot}°` : ''}
                  </span>
                  {selIsImg && (
                    <>
                      <Btn label="↺ -90°" onClick={() => handleLayoutChange(selectedEl, { ...selLayout, rotation: (((selRot - 90) % 360) + 360) % 360 })} />
                      <Btn label="↻ +90°" onClick={() => handleLayoutChange(selectedEl, { ...selLayout, rotation: (selRot + 90) % 360 })} />
                      <Btn label={selFit === 'contain' ? 'Fill' : 'Fit'} onClick={() => handleLayoutChange(selectedEl, { ...selLayout, fit: selFit === 'contain' ? 'cover' : 'contain' })} />
                    </>
                  )}
                </>
              ) : (
                <span style={{ fontSize: 9, fontFamily: '"DM Mono", monospace', color: 'var(--text-faint)', letterSpacing: '0.05em' }}>
                  click an element to select
                </span>
              )}
              <Btn label="Reset" onClick={resetLayout} muted />
            </>
          )}
        </div>

        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32, overflow: 'auto' }}>
          {selected ? (
            <div style={{ width: '100%', maxWidth: 1100, boxShadow: '0 8px 48px rgba(0,0,0,0.7)', borderRadius: 2, overflow: 'hidden' }}>
              <SlideCanvas
                slide={selected}
                compact={false}
                layout={getLayout(selected)}
                onLayoutChange={handleLayoutChange}
                selected={selectedEl}
                onSelect={setSelectedEl}
                logoUrl={logoUrl}
                logoLayout={logoLayout}
                onLogoLayoutChange={setLogoLayout}
                specsSize={specsSize}
                onSpecsSave={handleSpecsSave}
              />
            </div>
          ) : (
            <div style={{ textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: 14, fontFamily: '"Playfair Display", serif', fontStyle: 'italic', color: 'var(--text-faint)' }}>No slides yet</p>
              <p style={{ margin: '8px 0 0', fontSize: 10, fontFamily: '"DM Mono", monospace', color: 'var(--text-faint)', letterSpacing: '0.05em', lineHeight: 1.8 }}>
                Upload images and run the pipeline<br />to generate catalog slides.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Field editor ─────────────────────────────────────────── */}
      <div style={{ width: 260, flexShrink: 0, borderLeft: '1px solid var(--border)', overflowY: 'auto', background: 'var(--bg)' }}>
        {selected ? (
          <FieldEditor key={selected.id} slide={selected} onSave={onSave} />
        ) : (
          <div style={{ padding: '32px 16px', textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: 10, color: 'var(--text-faint)', fontFamily: '"DM Mono", monospace' }}>Select a slide to edit</p>
          </div>
        )}
      </div>
    </div>
  )
}
