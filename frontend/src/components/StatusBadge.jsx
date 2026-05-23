const CONFIG = {
  UPLOADED:       { label: 'Uploaded',        bg: '#1A1A1A',                   text: '#6B6052', border: '#252525', pulse: null },
  CLASSIFYING:    { label: 'Classifying',     bg: 'rgba(60,28,0,0.8)',         text: '#FDB347', border: '#5A3000', pulse: 'pulse-amber' },
  CLASSIFIED:     { label: 'Classified',      bg: 'rgba(45,20,0,0.6)',         text: '#D48E28', border: '#3D2200', pulse: null },
  GROUPED:        { label: 'Grouped',         bg: 'rgba(0,40,42,0.7)',         text: '#3DD6CC', border: '#004A4E', pulse: null },
  PROCESSING:     { label: 'Processing',      bg: 'rgba(0,24,52,0.8)',         text: '#6BB8FF', border: '#003366', pulse: 'pulse-blue' },
  PROCESSED:      { label: 'Processed',       bg: 'rgba(0,18,40,0.6)',         text: '#4DA0EF', border: '#002650', pulse: null },
  EXTRACTING:     { label: 'Extracting',      bg: 'rgba(32,0,56,0.8)',         text: '#C4A0FF', border: '#4A0080', pulse: 'pulse-purple' },
  SPEC_EXTRACTED: { label: 'Spec Extracted',  bg: 'rgba(24,0,44,0.6)',         text: '#A882F5', border: '#380060', pulse: null },
  ASSIGNED:       { label: 'Assigned',        bg: 'rgba(196,150,106,0.12)',    text: '#C4966A', border: '#5A4228', pulse: 'pulse-gold' },
  DUPLICATE:      { label: 'Duplicate',       bg: '#111111',                   text: '#3D3730', border: '#1A1A1A', pulse: null },
  NEEDS_REVIEW:   { label: 'Needs Review',    bg: 'rgba(50,18,0,0.7)',         text: '#FF8C42', border: '#5A2800', pulse: null },
  FAILED:         { label: 'Failed',          bg: 'rgba(40,0,0,0.7)',          text: '#FF6B6B', border: '#500000', pulse: null },
}

export function StatusBadge({ status, size = 'sm' }) {
  const cfg = CONFIG[status] ?? CONFIG['UPLOADED']
  const pad = size === 'xs' ? '2px 6px' : '3px 8px'
  const fs  = size === 'xs' ? '9px'     : '10px'

  return (
    <span
      className={cfg.pulse ?? ''}
      style={{
        display:      'inline-block',
        padding:      pad,
        fontSize:     fs,
        fontFamily:   '"DM Mono", monospace',
        fontWeight:   500,
        letterSpacing:'0.06em',
        textTransform:'uppercase',
        borderRadius: '3px',
        background:   cfg.bg,
        color:        cfg.text,
        border:       `1px solid ${cfg.border}`,
        lineHeight:   1.4,
        whiteSpace:   'nowrap',
      }}
    >
      {cfg.label}
    </span>
  )
}
