import React, { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo })
    console.error('ErrorBoundary captured a crash:', error, errorInfo)
  }

  handleReload = () => {
    window.location.reload()
  }

  handleGoBack = () => {
    window.localStorage.removeItem('edudev.trainee.activeTab')
    window.localStorage.removeItem('edudev.trainer.activeTab')
    window.location.href = '/'
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="relative min-h-screen w-full flex items-center justify-center bg-slate-950 px-4 py-16 font-sans overflow-hidden text-slate-100 selection:bg-orange-500/30 selection:text-orange-200">
          {/* Animated Background Gradients */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(249,115,22,0.15),transparent_45%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,rgba(239,68,68,0.12),transparent_40%)]" />
          
          {/* Subtle Grid Lines Overlay */}
          <div 
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
              backgroundSize: '32px 32px'
            }}
          />

          <div className="relative z-10 max-w-xl w-full">
            {/* Glassmorphic Container Card */}
            <div className="backdrop-blur-xl bg-slate-900/60 border border-slate-800/80 rounded-[32px] p-8 md:p-10 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] flex flex-col items-center text-center">
              
              {/* Animated Accent Ring around Danger Icon */}
              <div className="relative flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-tr from-rose-500/20 to-orange-500/20 border border-rose-500/30 shadow-[0_8px_32px_-4px_rgba(244,63,94,0.3)] mb-8">
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-rose-500 to-orange-500 opacity-20 blur-md animate-pulse" />
                <svg className="w-10 h-10 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>

              {/* Title and Subtitle */}
              <span className="text-xs font-bold tracking-[0.2em] text-orange-400 uppercase mb-3">Oups ! Quelque chose a mal tourné</span>
              <h1 className="text-3xl font-extrabold text-white tracking-tight leading-tight mb-4">
                Une erreur inattendue est survenue
              </h1>
              <p className="text-slate-400 text-sm md:text-base max-w-sm leading-relaxed mb-8">
                L'application a rencontré un dysfonctionnement technique temporaire. Ne vous inquiétez pas, vos données sont en sécurité.
              </p>

              {/* Dynamic Expandable Tech Specs for Debugging */}
              {this.state.error && (
                <div className="w-full mb-8 rounded-2xl border border-slate-800 bg-slate-950/80 overflow-hidden text-left transition-all duration-300">
                  <details className="group">
                    <summary className="flex items-center justify-between px-5 py-4 cursor-pointer select-none text-xs font-semibold text-slate-500 hover:text-slate-300 transition-colors">
                      <span>DÉTAILS TECHNIQUES DE L'ERREUR</span>
                      <svg className="w-4 h-4 transform group-open:rotate-180 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </summary>
                    <div className="px-5 pb-5 border-t border-slate-900 pt-4">
                      <p className="text-rose-400 font-mono text-xs font-semibold break-all mb-2">
                        {this.state.error.toString()}
                      </p>
                      {this.state.errorInfo && (
                        <pre className="text-slate-500 font-mono text-[10px] leading-relaxed overflow-x-auto whitespace-pre-wrap max-h-48 border border-slate-900 rounded-lg p-3 bg-black/40">
                          {this.state.errorInfo.componentStack}
                        </pre>
                      )}
                    </div>
                  </details>
                </div>
              )}

              {/* Dual CTA Actions */}
              <div className="flex flex-col sm:flex-row items-center gap-3 w-full">
                <button
                  onClick={this.handleReload}
                  className="w-full sm:w-auto flex-1 h-12 inline-flex items-center justify-center px-6 rounded-2xl bg-gradient-to-r from-orange-500 to-rose-500 text-white font-semibold text-sm hover:opacity-90 active:scale-[0.98] transition-all shadow-[0_4px_24px_rgba(249,115,22,0.3)]"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H18.5" />
                  </svg>
                  Actualiser la page
                </button>
                <button
                  onClick={this.handleGoBack}
                  className="w-full sm:w-auto h-12 inline-flex items-center justify-center px-6 rounded-2xl border border-slate-800 bg-slate-950/40 hover:bg-slate-900 hover:border-slate-700 text-slate-300 font-semibold text-sm transition-all"
                >
                  Retourner à l'accueil
                </button>
              </div>

            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
