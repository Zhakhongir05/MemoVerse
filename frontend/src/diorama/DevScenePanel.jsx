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
 * "Move props" turns on the drag-to-place gizmo, and "Copy current" copies the
 * calibrated scene JSON back out. Mounted only when import.meta.env.DEV is true.
 */
export default function DevScenePanel({
  scene,
  baseScene,
  editMode = false,
  onToggleEditMode,
  onApply,
  onReset,
}) {
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
    setText(JSON.stringify(baseScene, null, 2))
    setError(null)
  }

  const copyCurrent = async () => {
    const json = JSON.stringify(scene, null, 2)
    setText(json)

    try {
      await navigator.clipboard.writeText(json)
      setError(null)
    } catch {
      setError('clipboard blocked — copy the JSON manually')
    }
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
          {!editMode && (
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
          )}
          <div
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            {!editMode && (
              <>
                <button type="button" style={buttonStyle} onClick={apply}>
                  Apply
                </button>
                <button type="button" style={buttonStyle} onClick={reset}>
                  Reset
                </button>
              </>
            )}
            <button type="button" style={buttonStyle} onClick={copyCurrent}>
              Copy current
            </button>
            <button
              type="button"
              onClick={onToggleEditMode}
              style={{
                ...buttonStyle,
                background: editMode
                  ? 'rgba(255, 178, 122, 0.22)'
                  : buttonStyle.background,
                borderColor: editMode
                  ? 'rgba(255, 200, 150, 0.7)'
                  : buttonStyle.border,
              }}
            >
              {editMode ? 'Stop moving props' : 'Move props'}
            </button>
            {error && (
              <span style={{ color: '#ff8f7a', overflow: 'hidden' }}>
                {error}
              </span>
            )}
          </div>
          {editMode && (
            <div style={{ color: 'rgba(255, 210, 170, 0.7)', lineHeight: 1.5 }}>
              Drag any prop to move it in X/Y. Copy current gives you the new
              normalized positions.
            </div>
          )}
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
