import { useState } from 'react'

const panelStyle = {
  position: 'absolute',
  left: 12,
  bottom: 12,
  zIndex: 10,
  width: 380,
  maxWidth: 'calc(100vw - 24px)',
  color: '#e8d8c8',
  fontFamily: 'ui-monospace, Consolas, monospace',
  fontSize: 12,
}

const buttonStyle = {
  font: 'inherit',
  color: '#e8d8c8',
  background: 'rgba(30, 22, 18, 0.85)',
  border: '1px solid rgba(255, 200, 150, 0.25)',
  borderRadius: 6,
  padding: '6px 10px',
  cursor: 'pointer',
}

/**
 * Dev-only. Paste any backend payload to test it without wiring the API.
 * Mounted only when import.meta.env.DEV is true.
 */
export default function DevScenePanel({ scene, onApply, onReset }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(() => JSON.stringify(scene, null, 2))
  const [error, setError] = useState(null)

  const apply = () => {
    try {
      const parsed = JSON.parse(text)
      onApply?.(parsed)
      setError(null)
    } catch (parseError) {
      setError(parseError.message)
    }
  }

  const reset = () => {
    onReset?.()
    setText(JSON.stringify(scene, null, 2))
    setError(null)
  }

  return (
    <div style={panelStyle}>
      {open && (
        <div
          style={{
            display: 'grid',
            gap: 8,
            marginBottom: 8,
            padding: 10,
            borderRadius: 8,
            background: 'rgba(15, 11, 9, 0.92)',
            border: '1px solid rgba(255, 200, 150, 0.2)',
          }}
        >
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            spellCheck={false}
            style={{
              width: '100%',
              height: 260,
              resize: 'vertical',
              boxSizing: 'border-box',
              color: '#f3e7da',
              background: '#0b0807',
              border: '1px solid rgba(255, 200, 150, 0.2)',
              borderRadius: 6,
              padding: 8,
              font: 'inherit',
              lineHeight: 1.5,
            }}
          />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button type="button" style={buttonStyle} onClick={apply}>
              Apply
            </button>
            <button type="button" style={buttonStyle} onClick={reset}>
              Reset
            </button>
            {error && (
              <span style={{ color: '#ff8f7a', overflow: 'hidden' }}>
                {error}
              </span>
            )}
          </div>
        </div>
      )}

      <button
        type="button"
        style={buttonStyle}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? 'Close scene JSON' : 'Edit scene JSON'}
      </button>
    </div>
  )
}
