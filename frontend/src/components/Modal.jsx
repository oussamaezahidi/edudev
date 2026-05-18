import { useEffect, useRef } from 'react'

export default function Modal({ open, title, onClose, children, wide = false, actions = null }) {
  const panelRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined

    function onKeyDown(event) {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 opacity-100 backdrop-blur-sm transition-opacity"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      role="presentation"
    >
      <section
        ref={panelRef}
        className={[
          'max-h-[90vh] w-full overflow-hidden rounded-[28px] border border-white/70 bg-white shadow-2xl shadow-slate-950/20 transition-all dark:border-slate-800 dark:bg-slate-900',
          wide ? 'max-w-6xl' : 'max-w-2xl',
        ].join(' ')}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="flex items-center justify-between gap-4 border-b border-slate-100 px-6 py-5 dark:border-slate-800">
          <h3 className="min-w-0 break-words text-xl font-bold text-slate-950 dark:text-white">{title}</h3>
          <button className="secondary-admin-button" type="button" onClick={onClose}>
            Fermer
          </button>
        </header>
        <div className="max-h-[calc(90vh-88px)] overflow-y-auto p-6">{children}</div>
        {actions ? <footer className="border-t border-slate-100 px-6 py-4 dark:border-slate-800">{actions}</footer> : null}
      </section>
    </div>
  )
}

export function ConfirmModal({ open, title, message, confirmLabel = 'Confirmer', loading = false, onConfirm, onClose }) {
  return (
    <Modal open={open} title={title} onClose={onClose}>
      <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">{message}</p>
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <button className="secondary-admin-button" type="button" onClick={onClose} disabled={loading}>
          Annuler
        </button>
        <button className="primary-admin-button" type="button" onClick={onConfirm} disabled={loading}>
          {loading ? 'Traitement...' : confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
