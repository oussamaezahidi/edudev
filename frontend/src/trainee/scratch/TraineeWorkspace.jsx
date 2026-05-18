import { useEffect, useMemo, useState } from 'react'

const sections = [
  { key: 'dashboard', label: 'Tableau de bord', icon: GridIcon },
  { key: 'modules', label: 'Modules', icon: ModulesIcon },
  { key: 'courses', label: 'Cours', icon: BookIcon },
  { key: 'tp', label: 'TP', icon: ClipboardIcon },
  { key: 'controles', label: 'Contrôles', icon: ShieldIcon },
  { key: 'profile', label: 'Profil', icon: UserIcon },
]

const resourceTypes = [
  { value: 'all', label: 'Tous les types' },
  { value: 'courses', label: 'Cours' },
  { value: 'tp', label: 'TP' },
  { value: 'controles', label: 'Contrôles' },
]

const emptyPasswordForm = {
  current_password: '',
  password: '',
  password_confirmation: '',
}

export default function TraineeWorkspace({ user, api, onLogout, settings = null }) {
  const [active, setActive] = useState('dashboard')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [darkMode, setDarkMode] = useState(() => (settings?.appearance?.mode ?? 'light') === 'dark' || window.localStorage.getItem('edudev-trainee-dark') === '1')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toasts, setToasts] = useState([])
  const [preview, setPreview] = useState(null)
  
  // Single contextual filter state
  const [filters, setFilters] = useState({ query: '', module: 'all', trainer: 'all', type: 'all' })
  
  const [data, setData] = useState({ dashboard: null, modules: [], courses: [], practicalWorks: [], assessments: [] })
  const [profileUser, setProfileUser] = useState(user)
  const [profileForm, setProfileForm] = useState({ name: user?.name ?? '', email: user?.email ?? '' })
  const [profileErrors, setProfileErrors] = useState({})
  const [passwordForm, setPasswordForm] = useState(emptyPasswordForm)
  const [passwordErrors, setPasswordErrors] = useState({})
  const [passwordVisible, setPasswordVisible] = useState({ current: false, next: false, confirmation: false })
  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState('')
  const [avatarDragging, setAvatarDragging] = useState(false)

  const platformName = settings?.general?.platform_name ?? 'EduDev'
  const currentUser = profileUser ?? user

  useEffect(() => { loadWorkspace() }, [])
  useEffect(() => { window.localStorage.setItem('edudev-trainee-dark', darkMode ? '1' : '0') }, [darkMode])
  useEffect(() => { return () => { if (preview?.url) URL.revokeObjectURL(preview.url) } }, [preview])
  useEffect(() => { return () => { if (avatarPreview) URL.revokeObjectURL(avatarPreview) } }, [avatarPreview])

  // Reset filters when switching tabs
  useEffect(() => {
    setFilters({ query: '', module: 'all', trainer: 'all', type: 'all' })
  }, [active])

  const stats = useMemo(() => [
    { label: 'Modules disponibles', value: data.modules.length, accent: 'from-orange-500 to-amber-400', icon: ModulesIcon },
    { label: 'Cours disponibles', value: data.courses.length, accent: 'from-cyan-500 to-blue-500', icon: BookIcon },
    { label: 'TP disponibles', value: data.practicalWorks.length, accent: 'from-emerald-500 to-teal-500', icon: ClipboardIcon },
    { label: 'Contrôles disponibles', value: data.assessments.length, accent: 'from-fuchsia-500 to-rose-500', icon: ShieldIcon },
  ], [data.assessments.length, data.courses.length, data.modules.length, data.practicalWorks.length])

  // Unified resources array
  const resources = useMemo(() => {
    const courses = data.courses.map((course) => ({
      ...course,
      resourceType: 'courses',
      resourceLabel: 'Cours',
      body: course.description,
      moduleTitle: course.module?.title ?? 'Module',
      trainerName: course.trainer?.name ?? 'Formateur',
      date: course.created_at,
    }))
    const tps = data.practicalWorks.map((item) => ({
      ...item,
      resourceType: 'tp',
      resourceLabel: 'TP',
      body: item.instructions,
      moduleTitle: item.module?.title ?? item.course?.module?.title ?? 'Module',
      trainerName: item.trainer?.name ?? 'Formateur',
      date: item.due_at,
    }))
    const controles = data.assessments.map((item) => ({
      ...item,
      resourceType: 'controles',
      resourceLabel: 'Contrôle',
      body: item.course?.title ?? 'Contrôle général du module',
      moduleTitle: item.module?.title ?? item.course?.module?.title ?? 'Module',
      trainerName: item.trainer?.name ?? 'Formateur',
      date: item.scheduled_at ?? item.created_at,
    }))
    return [...courses, ...tps, ...controles]
  }, [data.assessments, data.courses, data.practicalWorks])

  // Contextual options & items calculation
  const contextualData = useMemo(() => {
    let sourceItems = []
    
    if (active === 'dashboard') {
      sourceItems = resources
    } else if (active === 'courses') {
      sourceItems = resources.filter(r => r.resourceType === 'courses')
    } else if (active === 'tp') {
      sourceItems = resources.filter(r => r.resourceType === 'tp')
    } else if (active === 'controles') {
      sourceItems = resources.filter(r => r.resourceType === 'controles')
    } else if (active === 'modules') {
      sourceItems = data.modules // Modules have their own filtering logic
    }

    const modMap = new Map()
    const trMap = new Map()

    if (active === 'modules') {
      data.modules.forEach(m => {
        modMap.set(String(m.id), m.title)
        ;(m.trainers || []).forEach(t => trMap.set(String(t.id), t.name))
      })
    } else {
      sourceItems.forEach(item => {
        const mId = String(item.module_id ?? item.module?.id ?? item.course?.module_id)
        if (mId && mId !== 'undefined') modMap.set(mId, item.moduleTitle)
        
        const tId = String(item.trainer_id ?? item.trainer?.id)
        if (tId && tId !== 'undefined') trMap.set(tId, item.trainerName)
      })
    }

    const moduleOptions = Array.from(modMap, ([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label))
    const trainerOptions = Array.from(trMap, ([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label))

    return { sourceItems, moduleOptions, trainerOptions }
  }, [active, resources, data.modules])

  // Contextual Filtering
  const filteredItems = useMemo(() => {
    const search = normalize(filters.query)
    
    if (active === 'modules') {
      return contextualData.sourceItems.filter(moduleItem => {
        const moduleResources = resources.filter(r => String(r.module_id ?? r.module?.id ?? r.course?.module_id) === String(moduleItem.id))
        const trainers = (moduleItem.trainers ?? []).map(t => t.name).join(' ')
        const haystack = normalize([moduleItem.title, moduleItem.description, trainers, ...moduleResources.map(r => `${r.title} ${r.trainerName}`)].join(' '))
        
        const matchesSearch = !search || haystack.includes(search)
        const matchesModule = filters.module === 'all' || String(moduleItem.id) === String(filters.module)
        const matchesTrainer = filters.trainer === 'all' || moduleResources.some(r => String(r.trainer_id ?? r.trainer?.id) === String(filters.trainer)) || (moduleItem.trainers ?? []).some(t => String(t.id) === String(filters.trainer))
        
        return matchesSearch && matchesModule && matchesTrainer
      })
    } else {
      return contextualData.sourceItems.filter(item => {
        const moduleId = String(item.module_id ?? item.module?.id ?? item.course?.module_id ?? '')
        const trainerId = String(item.trainer_id ?? item.trainer?.id ?? '')
        const haystack = normalize([item.title, item.body, item.moduleTitle, item.trainerName, item.document?.name].filter(Boolean).join(' '))
        
        const matchesSearch = !search || haystack.includes(search)
        const matchesModule = filters.module === 'all' || moduleId === String(filters.module)
        const matchesTrainer = filters.trainer === 'all' || trainerId === String(filters.trainer)
        const matchesType = active === 'dashboard' ? (filters.type === 'all' || item.resourceType === filters.type) : true
        
        return matchesSearch && matchesModule && matchesTrainer && matchesType
      })
    }
  }, [active, contextualData.sourceItems, filters, resources])

  async function loadWorkspace({ silent = false } = {}) {
    if (silent) setRefreshing(true); else setLoading(true)
    try {
      const [dashboard, modules, courses, practicalWorks, assessments, profile] = await Promise.all([
        api('/dashboard'), api('/trainee/modules'), api('/courses'), api('/trainee/practical-works'), api('/trainee/assessments'), api('/profile'),
      ])
      setData({ dashboard, modules, courses, practicalWorks, assessments })
      if (profile?.user) {
        setProfileUser(profile.user)
        setProfileForm({ name: profile.user.name ?? '', email: profile.user.email ?? '' })
      }
    } catch (requestError) {
      pushToast('error', requestError.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  function pushToast(type, message) {
    const toast = { id: crypto.randomUUID(), type, message }
    setToasts((previous) => [...previous, toast])
    window.setTimeout(() => setToasts((previous) => previous.filter((item) => item.id !== toast.id)), 4000)
  }

  function updateFilter(key, value) {
    setFilters((previous) => ({ ...previous, [key]: value }))
  }

  // Handle module click: navigate to resources with module pre-filtered
  function handleModuleClick(moduleItem) {
    setActive('courses')
    setFilters({ query: '', module: String(moduleItem.id), trainer: 'all', type: 'all' })
  }

  async function openPdf(resource) {
    if (!resource.document) return
    try {
      const response = await fetch(resource.document.preview_url, { credentials: 'include', headers: { Accept: 'application/pdf' } })
      if (!response.ok) throw new Error("Impossible d'ouvrir ce PDF pour le moment.")
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      if (preview?.url) URL.revokeObjectURL(preview.url)
      setPreview({ title: resource.title, url })
    } catch (requestError) {
      pushToast('error', requestError.message)
    }
  }

  async function downloadPdf(resource) {
    if (!resource.document) return
    try {
      const response = await fetch(resource.document.download_url, { credentials: 'include' })
      if (!response.ok) throw new Error('Téléchargement impossible.')
      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = objectUrl; anchor.download = resource.document.name; anchor.click()
      URL.revokeObjectURL(objectUrl)
    } catch (requestError) {
      pushToast('error', requestError.message)
    }
  }

  function handleAvatarFile(file) {
    if (!file) {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview)
      setAvatarFile(null); setAvatarPreview(''); return
    }
    if (!file.type.startsWith('image/')) { setProfileErrors((prev) => ({ ...prev, avatar: 'Veuillez sélectionner une image valide.' })); return }
    if (file.size > 4 * 1024 * 1024) { setProfileErrors((prev) => ({ ...prev, avatar: 'La photo ne doit pas dépasser 4 Mo.' })); return }
    if (avatarPreview) URL.revokeObjectURL(avatarPreview)
    setProfileErrors((prev) => { const next = { ...prev }; delete next.avatar; return next })
    setAvatarFile(file); setAvatarPreview(URL.createObjectURL(file))
  }

  async function submitProfile(event) {
    event.preventDefault()
    const errors = validateProfile(profileForm)
    if (Object.keys(errors).length) { setProfileErrors(errors); return }
    setSaving(true); setProfileErrors({})
    try {
      const body = new FormData()
      body.append('name', profileForm.name); body.append('email', profileForm.email)
      if (avatarFile) body.append('avatar', avatarFile)
      const response = await api('/profile', { method: 'POST', body })
      if (response?.user) {
        setProfileUser(response.user)
        setProfileForm({ name: response.user.name ?? '', email: response.user.email ?? '' })
      }
      handleAvatarFile(null)
      pushToast('success', 'Profil mis à jour avec succès.')
    } catch (requestError) { pushToast('error', requestError.message) } finally { setSaving(false) }
  }

  async function submitPassword(event) {
    event.preventDefault()
    const errors = validatePassword(passwordForm)
    if (Object.keys(errors).length) { setPasswordErrors(errors); return }
    setSaving(true); setPasswordErrors({})
    try {
      await api('/profile/password', { method: 'PUT', body: JSON.stringify(passwordForm) })
      setPasswordForm(emptyPasswordForm)
      pushToast('success', 'Mot de passe mis à jour avec succès.')
    } catch (requestError) { pushToast('error', requestError.message) } finally { setSaving(false) }
  }

  return (
    <div className={darkMode ? 'dark' : ''}>
      <div className="min-h-screen bg-slate-100 text-slate-900 transition-colors duration-300 dark:bg-slate-950 dark:text-slate-50">
        <ToastStack toasts={toasts} />
        <div className="flex min-h-screen">
          <aside className={classNames('fixed inset-y-0 left-0 z-40 w-72 border-r border-white/50 bg-white/90 p-5 shadow-2xl shadow-slate-200/60 backdrop-blur-xl transition-transform duration-300 dark:border-slate-800 dark:bg-slate-900/90 dark:shadow-black/20 lg:static lg:translate-x-0', mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0')}>
            <div className="mb-8 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-orange-400 text-white shadow-lg shadow-orange-500/25">
                <BookIcon className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-orange-500">{platformName}</p>
                <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Espace stagiaire</h1>
              </div>
            </div>
            <div className="mb-8 rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-orange-500 p-5 text-white shadow-xl shadow-slate-900/20">
              <div className="flex items-center gap-3">
                <Avatar user={currentUser} size="h-14 w-14" />
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold">{currentUser?.name}</h2>
                  <p className="truncate text-xs text-orange-50">{currentUser?.email}</p>
                </div>
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-200">Accédez simplement à vos modules, cours PDF, TP et contrôles disponibles.</p>
            </div>
            <nav className="space-y-2">
              {sections.map((item) => (
                <SidebarLink key={item.key} active={active === item.key} label={item.label} icon={item.icon} onClick={() => { setActive(item.key); setMobileMenuOpen(false) }} />
              ))}
            </nav>
            <div className="mt-8 rounded-3xl border border-slate-200/70 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-950/70">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">Mode sombre</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Confort de lecture des PDF.</p>
                </div>
                <button type="button" onClick={() => setDarkMode(v => !v)} className={classNames('relative inline-flex h-7 w-12 items-center rounded-full transition', darkMode ? 'bg-orange-500' : 'bg-slate-300')}>
                  <span className={classNames('inline-block h-5 w-5 rounded-full bg-white shadow transition', darkMode ? 'translate-x-6' : 'translate-x-1')}></span>
                </button>
              </div>
            </div>
          </aside>

          <div className="flex-1 lg:pl-0">
            <main className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
              <header className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-[28px] border border-white/70 bg-white/85 px-5 py-4 shadow-xl shadow-slate-200/40 backdrop-blur dark:border-slate-800 dark:bg-slate-900/85 dark:shadow-black/20">
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => setMobileMenuOpen(v => !v)} className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm lg:hidden dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                    <MenuIcon className="h-5 w-5" />
                  </button>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-500">{platformName}</p>
                    <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">
                      {sectionTitle(active)}
                      {filters.module !== 'all' && active !== 'dashboard' && active !== 'modules' ? ' - Filtre actif' : ''}
                    </h2>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <button type="button" onClick={() => loadWorkspace({ silent: true })} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-orange-200 hover:text-orange-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                    <RefreshIcon className={classNames('h-4 w-4', refreshing ? 'animate-spin' : '')} />
                    Actualiser
                  </button>
                  <button type="button" onClick={onLogout} className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-orange-500 to-orange-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-orange-500/25 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-orange-500/30">
                    <LogoutIcon className="h-4 w-4" />
                    Déconnexion
                  </button>
                </div>
              </header>

              {loading ? <LoadingState /> : null}

              {!loading && active === 'dashboard' ? (
                <section className="space-y-6">
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {stats.map((stat) => <StatCard key={stat.label} {...stat} />)}
                  </div>
                  <DashboardHero user={currentUser} modules={data.modules} resources={resources} />
                  <PageLayout eyebrow="Bibliothèque" title="Ressources récentes" description="Les derniers contenus PDF disponibles dans vos modules.">
                    <ResourceToolbar filters={filters} moduleOptions={contextualData.moduleOptions} trainerOptions={contextualData.trainerOptions} onFilter={updateFilter} showTypeFilter={true} />
                    <ResourceGrid resources={filteredItems.slice(0, 6)} emptyTitle="Aucune ressource trouvée" emptyDescription="Ajustez votre recherche ou vos filtres pour retrouver un document." onPreview={openPdf} onDownload={downloadPdf} />
                  </PageLayout>
                </section>
              ) : null}

              {!loading && active === 'modules' ? (
                <PageLayout eyebrow="Modules" title="Modules disponibles" description="Consultez les modules auxquels vous avez accès et ouvrez leurs ressources pédagogiques.">
                  <ResourceToolbar filters={filters} moduleOptions={contextualData.moduleOptions} trainerOptions={contextualData.trainerOptions} onFilter={updateFilter} showTypeFilter={false} />
                  {filteredItems.length ? (
                    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                      {filteredItems.map((moduleItem) => (
                        <ModuleCard key={moduleItem.id} module={moduleItem} resources={resources} onOpen={() => handleModuleClick(moduleItem)} />
                      ))}
                    </div>
                  ) : (
                    <EmptyState title="Aucun module disponible" description="Vos modules apparaîtront ici dès qu'ils seront associés à vos cours." icon={ModulesIcon} />
                  )}
                </PageLayout>
              ) : null}

              {!loading && ['courses', 'tp', 'controles'].includes(active) ? (
                <PageLayout 
                  eyebrow="Ressources PDF" 
                  title={active === 'courses' ? 'Cours' : active === 'tp' ? 'Travaux Pratiques' : 'Contrôles'} 
                  description={`Recherchez par titre ou par formateur, puis prévisualisez ou téléchargez les PDF de vos ${active === 'courses' ? 'cours' : active === 'tp' ? 'TP' : 'contrôles'}.`}
                  onClearModuleFilter={filters.module !== 'all' ? () => updateFilter('module', 'all') : null}
                >
                  <ResourceToolbar filters={filters} moduleOptions={contextualData.moduleOptions} trainerOptions={contextualData.trainerOptions} onFilter={updateFilter} showTypeFilter={false} />
                  <ResourceGrid resources={filteredItems} emptyTitle="Aucun PDF trouvé" emptyDescription="Essayez une recherche plus courte ou changez de formateur." onPreview={openPdf} onDownload={downloadPdf} />
                </PageLayout>
              ) : null}

              {!loading && active === 'profile' ? (
                <section className="space-y-6">
                  <ProfileHero user={currentUser} avatarPreview={avatarPreview} stats={stats} />
                  <div className="grid gap-6 xl:grid-cols-[1.05fr,0.95fr]">
                    <PageLayout eyebrow="Profil stagiaire" title="Informations personnelles">
                      <form className="space-y-5" onSubmit={submitProfile}>
                        <div className="grid gap-4 md:grid-cols-2">
                          <InputField label="Nom complet" value={profileForm.name} error={profileErrors.name} onChange={v => { setProfileForm(p => ({ ...p, name: v })); setProfileErrors(p => ({ ...p, name: '' })) }} />
                          <InputField label="Adresse email" type="email" value={profileForm.email} error={profileErrors.email} onChange={v => { setProfileForm(p => ({ ...p, email: v })); setProfileErrors(p => ({ ...p, email: '' })) }} />
                        </div>
                        <AvatarDropzone user={currentUser} previewUrl={avatarPreview} file={avatarFile} dragging={avatarDragging} error={profileErrors.avatar} onDragging={setAvatarDragging} onFile={handleAvatarFile} onClear={() => handleAvatarFile(null)} />
                        <ProfileActions saving={saving} submitLabel="Enregistrer le profil" onReset={() => { setProfileForm({ name: currentUser?.name ?? '', email: currentUser?.email ?? '' }); setProfileErrors({}); handleAvatarFile(null) }} />
                      </form>
                    </PageLayout>
                    <PageLayout eyebrow="Mot de passe" title="Sécurité du compte">
                      <form className="space-y-5" onSubmit={submitPassword}>
                        <PasswordField label="Mot de passe actuel" value={passwordForm.current_password} visible={passwordVisible.current} error={passwordErrors.current_password} autoComplete="current-password" onToggle={() => setPasswordVisible(p => ({ ...p, current: !p.current }))} onChange={v => { setPasswordForm(p => ({ ...p, current_password: v })); setPasswordErrors(p => ({ ...p, current_password: '' })) }} />
                        <PasswordField label="Nouveau mot de passe" value={passwordForm.password} visible={passwordVisible.next} error={passwordErrors.password} autoComplete="new-password" onToggle={() => setPasswordVisible(p => ({ ...p, next: !p.next }))} onChange={v => { setPasswordForm(p => ({ ...p, password: v })); setPasswordErrors(p => ({ ...p, password: '' })) }} />
                        <PasswordField label="Confirmation du mot de passe" value={passwordForm.password_confirmation} visible={passwordVisible.confirmation} error={passwordErrors.password_confirmation} autoComplete="new-password" onToggle={() => setPasswordVisible(p => ({ ...p, confirmation: !p.confirmation }))} onChange={v => { setPasswordForm(p => ({ ...p, password_confirmation: v })); setPasswordErrors(p => ({ ...p, password_confirmation: '' })) }} />
                        <div className="rounded-[24px] border border-orange-200/80 bg-orange-50/80 p-4 text-sm leading-6 text-orange-800 dark:border-orange-500/20 dark:bg-orange-500/10 dark:text-orange-200">Le mot de passe doit contenir au moins 8 caractères. La mise à jour reste sécurisée par l'API existante.</div>
                        <ProfileActions saving={saving} submitLabel="Mettre à jour le mot de passe" onReset={() => { setPasswordForm(emptyPasswordForm); setPasswordErrors({}) }} />
                      </form>
                    </PageLayout>
                  </div>
                </section>
              ) : null}
            </main>
          </div>
        </div>

        <Modal open={Boolean(preview)} onClose={() => setPreview(null)} title={preview?.title ?? 'Prévisualisation du PDF'} width="max-w-6xl">
          {preview ? <iframe title={preview.title} src={preview.url} className="h-[72vh] w-full rounded-3xl border border-slate-200 dark:border-slate-800"></iframe> : null}
        </Modal>
      </div>
    </div>
  )
}

function PageLayout({ eyebrow, title, description, onClearModuleFilter, children }) {
  return (
    <section className="rounded-[32px] border border-white/70 bg-white/90 p-6 shadow-xl shadow-slate-200/40 backdrop-blur dark:border-slate-800 dark:bg-slate-900/85 dark:shadow-black/20">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-500">{eyebrow}</p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{title}</h2>
          {description && <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p>}
        </div>
        {onClearModuleFilter && (
          <button type="button" onClick={onClearModuleFilter} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-orange-200 hover:text-orange-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:border-orange-500/50 dark:hover:text-orange-300">
            <CloseIcon className="h-4 w-4" />
            Retour à tous les modules
          </button>
        )}
      </div>
      {children}
    </section>
  )
}

function DashboardHero({ user, modules, resources }) {
  const readyResources = resources.filter((item) => item.document).length
  return (
    <section className="overflow-hidden rounded-[32px] border border-white/70 bg-white/90 shadow-xl shadow-slate-200/40 backdrop-blur dark:border-slate-800 dark:bg-slate-900/85 dark:shadow-black/20">
      <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-orange-500 p-6 text-white sm:p-8">
        <div className="grid gap-6 lg:grid-cols-[1fr,360px] lg:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-orange-100">Espace pédagogique</p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">Bonjour, {user?.name}</h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-100">Retrouvez vos modules et documents PDF dans une interface claire, rapide et pensée pour la consultation.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <HeroMetric label="Modules actifs" value={modules.length} />
            <HeroMetric label="PDF accessibles" value={readyResources} />
          </div>
        </div>
      </div>
    </section>
  )
}

function HeroMetric({ label, value }) {
  return (
    <div className="rounded-[24px] border border-white/15 bg-white/10 p-4 backdrop-blur">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-100">{label}</p>
      <strong className="mt-2 block text-2xl font-semibold">{value}</strong>
    </div>
  )
}

function ResourceToolbar({ filters, moduleOptions, trainerOptions, onFilter, showTypeFilter = false }) {
  return (
    <div className={classNames("mb-6 grid gap-3", showTypeFilter ? "lg:grid-cols-[1.2fr,220px,220px,190px]" : "lg:grid-cols-[1.2fr,220px,220px]")}>
      <label className="relative">
        <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={filters.query}
          onChange={(e) => onFilter('query', e.target.value)}
          placeholder="Rechercher..."
          className="h-12 w-full rounded-2xl border border-slate-300 bg-white pl-11 pr-4 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-orange-400 focus:ring-4 focus:ring-orange-100 dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:focus:ring-orange-500/15"
        />
      </label>
      <SelectBox value={filters.module} onChange={(v) => onFilter('module', v)} options={[{ value: 'all', label: 'Tous les modules' }, ...moduleOptions]} />
      <SelectBox value={filters.trainer} onChange={(v) => onFilter('trainer', v)} options={[{ value: 'all', label: 'Tous les formateurs' }, ...trainerOptions]} />
      {showTypeFilter && <SelectBox value={filters.type} onChange={(v) => onFilter('type', v)} options={resourceTypes} />}
    </div>
  )
}

function SelectBox({ value, onChange, options }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="h-12 w-full rounded-2xl border border-slate-300 bg-white px-4 text-sm text-slate-900 shadow-sm outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100 dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:focus:ring-orange-500/15">
      {options.map((opt) => <option key={`${opt.value}-${opt.label}`} value={opt.value}>{opt.label}</option>)}
    </select>
  )
}

function ModuleCard({ module, resources, onOpen }) {
  const moduleResources = resources.filter((item) => String(item.module_id ?? item.module?.id ?? item.course?.module_id) === String(module.id))
  const courses = moduleResources.filter((item) => item.resourceType === 'courses').length
  const practicalWorks = moduleResources.filter((item) => item.resourceType === 'tp').length
  const assessments = moduleResources.filter((item) => item.resourceType === 'controles').length

  return (
    <article className="group rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-xl dark:border-slate-800 dark:bg-slate-950/60 dark:hover:border-slate-700">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="break-words text-lg font-semibold text-slate-950 dark:text-white">{module.title}</h3>
          <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-500 dark:text-slate-400">{module.description || 'Aucune description disponible.'}</p>
        </div>
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-600 transition group-hover:bg-orange-50 group-hover:text-orange-600 dark:bg-slate-800 dark:text-slate-300 dark:group-hover:bg-orange-500/10 dark:group-hover:text-orange-300">
          <ModulesIcon className="h-5 w-5" />
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <MiniPill label={`${courses} cours`} />
        <MiniPill label={`${practicalWorks} TP`} />
        <MiniPill label={`${assessments} contrôles`} />
      </div>
      <button type="button" onClick={onOpen} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-orange-50 hover:text-orange-600 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-orange-500/20 dark:hover:text-orange-300">
        Voir les ressources
      </button>
    </article>
  )
}

function ResourceGrid({ resources, emptyTitle, emptyDescription, onPreview, onDownload }) {
  if (!resources.length) return <EmptyState title={emptyTitle} description={emptyDescription} icon={DocumentIcon} />
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      {resources.map((resource) => <ResourceCard key={`${resource.resourceType}-${resource.id}`} resource={resource} onPreview={onPreview} onDownload={onDownload} />)}
    </div>
  )
}

function ResourceCard({ resource, onPreview, onDownload }) {
  const Icon = resource.resourceType === 'courses' ? BookIcon : resource.resourceType === 'tp' ? ClipboardIcon : ShieldIcon
  return (
    <article className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl dark:border-slate-800 dark:bg-slate-950/60">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 text-white shadow-lg shadow-orange-500/20">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={resource.document ? 'success' : 'warning'}>{resource.document ? 'PDF prêt' : 'PDF indisponible'}</StatusBadge>
              <MiniPill label={resource.resourceLabel} />
            </div>
            <h3 className="mt-3 break-words text-lg font-semibold leading-tight text-slate-900 dark:text-white">{resource.title}</h3>
            <p className="mt-2 break-words text-sm leading-6 text-slate-500 dark:text-slate-400">{resource.body || 'Aucune description renseignée.'}</p>
          </div>
        </div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <CompactMetric label="Module" value={resource.moduleTitle} />
        <CompactMetric label="Formateur" value={resource.trainerName} />
        <CompactMetric label="Date" value={resource.date ? formatDate(resource.date) : 'Non définie'} />
      </div>
      <div className="mt-6 flex flex-wrap gap-2 border-t border-slate-100 pt-5 dark:border-slate-800">
        <ActionButton onClick={() => onPreview(resource)} disabled={!resource.document}>Prévisualiser</ActionButton>
        <ActionButton onClick={() => onDownload(resource)} disabled={!resource.document}>Télécharger</ActionButton>
        {resource.document ? <MiniPill label={resource.document.name} /> : null}
      </div>
    </article>
  )
}

function ProfileHero({ user, avatarPreview, stats }) {
  const avatarUrl = avatarPreview || user?.avatar_url
  return (
    <section className="overflow-hidden rounded-[32px] border border-white/70 bg-white/90 shadow-xl shadow-slate-200/40 backdrop-blur dark:border-slate-800 dark:bg-slate-900/85 dark:shadow-black/20">
      <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-orange-500 p-6 text-white sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end">
            <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-[28px] border border-white/20 bg-white/10 text-4xl font-semibold shadow-2xl shadow-slate-950/25">
              {avatarUrl ? <img src={avatarUrl} alt={user?.name ?? 'Stagiaire'} className="h-full w-full object-cover" /> : <span>{(user?.name ?? 'S').slice(0, 1).toUpperCase()}</span>}
            </div>
            <div className="min-w-0 pb-1">
              <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-orange-50">Stagiaire</span>
              <h2 className="mt-3 break-words text-3xl font-semibold leading-tight sm:text-4xl">{user?.name}</h2>
              <p className="mt-2 break-words text-sm text-orange-50">{user?.email}</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[360px]">
            {stats.slice(0, 2).map((stat) => <HeroMetric key={stat.label} label={stat.label} value={stat.value} />)}
          </div>
        </div>
      </div>
    </section>
  )
}

function AvatarDropzone({ user, previewUrl, file, dragging, error, onDragging, onFile, onClear }) {
  const displayUrl = previewUrl || user?.avatar_url
  return (
    <div>
      <span className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">Photo de profil</span>
      <label onDragOver={(e) => { e.preventDefault(); onDragging(true) }} onDragLeave={() => onDragging(false)} onDrop={(e) => { e.preventDefault(); onDragging(false); onFile(e.dataTransfer.files?.[0] ?? null) }} className={classNames('group flex cursor-pointer flex-col gap-4 rounded-[28px] border-2 border-dashed p-4 transition sm:flex-row sm:items-center', dragging ? 'border-orange-400 bg-orange-50 shadow-lg shadow-orange-100 dark:border-orange-400 dark:bg-orange-500/10 dark:shadow-none' : 'border-slate-300 bg-slate-50/80 hover:border-orange-300 hover:bg-white dark:border-slate-700 dark:bg-slate-950/70 dark:hover:border-orange-500/60 dark:hover:bg-slate-900')}>
        <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-[24px] bg-white text-2xl font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-100 dark:ring-slate-800">
          {displayUrl ? <img src={displayUrl} alt={user?.name ?? 'Avatar'} className="h-full w-full object-cover" /> : <span>{(user?.name ?? 'S').slice(0, 1).toUpperCase()}</span>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-orange-500 text-white shadow-lg shadow-orange-500/25 transition group-hover:-translate-y-0.5"><UploadIcon className="h-5 w-5" /></span>
            <div><p className="font-semibold text-slate-950 dark:text-white">Glissez votre image ici</p><p className="text-sm text-slate-500 dark:text-slate-400">PNG, JPG ou WEBP, jusqu'à 4 Mo.</p></div>
          </div>
          {file ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="max-w-full truncate rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700 dark:bg-orange-500/10 dark:text-orange-300">{file.name}</span>
              <button type="button" onClick={(e) => { e.preventDefault(); onClear() }} className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-rose-200 hover:text-rose-600 dark:border-slate-700 dark:text-slate-300">Retirer</button>
            </div>
          ) : null}
        </div>
      </label>
      {error ? <p className="mt-2 text-sm font-medium text-rose-600 dark:text-rose-300">{error}</p> : null}
    </div>
  )
}

function InputField({ label, value, onChange, type = 'text', error = '' }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className={classNames('h-12 w-full rounded-2xl border bg-white px-4 text-sm text-slate-900 shadow-sm outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100 dark:bg-slate-900 dark:text-white dark:focus:ring-orange-500/15', error ? 'border-rose-300 dark:border-rose-500/60' : 'border-slate-300 dark:border-slate-600')} />
      {error ? <p className="mt-2 text-sm font-medium text-rose-600 dark:text-rose-300">{error}</p> : null}
    </label>
  )
}

function PasswordField({ label, value, onChange, visible, onToggle, error, autoComplete }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">{label}</span>
      <div className="relative">
        <input type={visible ? 'text' : 'password'} value={value} autoComplete={autoComplete} onChange={(e) => onChange(e.target.value)} className={classNames('h-12 w-full rounded-2xl border bg-white px-4 pr-12 text-sm text-slate-900 shadow-sm outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100 dark:bg-slate-900 dark:text-white dark:focus:ring-orange-500/15', error ? 'border-rose-300 dark:border-rose-500/60' : 'border-slate-300 dark:border-slate-600')} />
        <button type="button" onClick={onToggle} className="absolute right-2 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-orange-600 dark:text-slate-300 dark:hover:bg-slate-800"><EyeIcon className="h-4 w-4" /></button>
      </div>
      {error ? <p className="mt-2 text-sm font-medium text-rose-600 dark:text-rose-300">{error}</p> : null}
    </label>
  )
}

function ProfileActions({ saving, submitLabel, onReset }) {
  return (
    <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-5 dark:border-slate-800">
      <button type="button" onClick={onReset} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 dark:border-slate-700 dark:text-slate-200">Réinitialiser</button>
      <button type="submit" disabled={saving} className="inline-flex min-w-[210px] items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-orange-500 to-orange-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-500/25 transition hover:-translate-y-0.5 disabled:opacity-70">{saving ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"></span> : <CheckIcon className="h-4 w-4" />}{saving ? 'Enregistrement...' : submitLabel}</button>
    </div>
  )
}

function StatCard({ label, value, accent, icon: Icon }) {
  return (
    <article className="group overflow-hidden rounded-[28px] border border-white/70 bg-white p-5 shadow-lg shadow-slate-200/45 transition hover:-translate-y-0.5 hover:shadow-xl dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/20">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className={classNames('h-1.5 flex-1 rounded-full bg-gradient-to-r', accent)}></div>
        <div className={classNames('flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg transition group-hover:scale-105', accent)}><Icon className="h-5 w-5" /></div>
      </div>
      <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">{label}</p>
      <strong className="mt-3 block text-3xl font-semibold text-slate-950 dark:text-white">{value}</strong>
    </article>
  )
}

function SidebarLink({ active, label, onClick, icon: Icon }) {
  return (
    <button type="button" onClick={onClick} className={classNames('group flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-medium transition', active ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/25' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white')}>
      <span className={classNames('flex h-9 w-9 items-center justify-center rounded-2xl transition', active ? 'bg-white/15' : 'bg-slate-100 text-slate-500 group-hover:bg-white dark:bg-slate-800 dark:text-slate-300 dark:group-hover:bg-slate-700')}><Icon className="h-4 w-4" /></span>
      {label}
    </button>
  )
}

function Modal({ open, onClose, title, children, width = 'max-w-2xl' }) {
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-8 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={classNames('max-h-[90vh] w-full overflow-y-auto rounded-[32px] border border-white/60 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900', width)}>
        <div className="mb-5 flex items-center justify-between gap-4">
          <h3 className="min-w-0 break-words text-xl font-semibold leading-tight text-slate-900 dark:text-white">{title}</h3>
          <button type="button" onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 text-slate-500 transition hover:border-orange-200 hover:text-orange-600 dark:border-slate-700 dark:text-slate-300"><CloseIcon className="h-4 w-4" /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

function EmptyState({ title, description, icon: Icon = SparkIcon }) {
  return (
    <div className="rounded-[28px] border border-dashed border-slate-300 bg-slate-50/80 p-10 text-center dark:border-slate-700 dark:bg-slate-950/70">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-3xl bg-white text-slate-500 shadow-sm dark:bg-slate-900 dark:text-slate-300"><Icon className="h-6 w-6" /></div>
      <p className="text-lg font-semibold text-slate-900 dark:text-white">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="grid gap-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}</div>
      <div className="grid gap-6 xl:grid-cols-2"><SkeletonCard tall /><SkeletonCard tall /></div>
    </div>
  )
}

function SkeletonCard({ tall = false }) {
  return (
    <div className={classNames('animate-pulse rounded-[28px] bg-white p-6 shadow-sm dark:bg-slate-900', tall ? 'h-64' : 'h-32')}>
      <div className="h-4 w-24 rounded-full bg-slate-200 dark:bg-slate-800"></div><div className="mt-5 h-8 w-20 rounded-full bg-slate-200 dark:bg-slate-800"></div><div className="mt-5 h-3 w-full rounded-full bg-slate-200 dark:bg-slate-800"></div>
    </div>
  )
}

function ActionButton({ children, onClick, disabled = false }) {
  return <button type="button" disabled={disabled} onClick={onClick} className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-orange-200 hover:text-orange-600 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">{children}</button>
}

function StatusBadge({ tone, children }) {
  const tones = { success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300', warning: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300' }
  return <span className={classNames('inline-flex max-w-full rounded-full px-3 py-1 text-xs font-semibold leading-snug', tones[tone])}>{children}</span>
}

function MiniPill({ label }) {
  return <span className="inline-flex max-w-full break-words rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium leading-snug text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">{label}</span>
}

function CompactMetric({ label, value }) {
  return (
    <div className="min-w-0 rounded-3xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-950/70">
      <p className="break-words text-sm text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-2 break-words text-sm font-semibold leading-tight text-slate-900 dark:text-white">{value}</p>
    </div>
  )
}

function Avatar({ user, size = 'h-20 w-20' }) {
  if (user?.avatar_url) return <img src={user.avatar_url} alt={user.name ?? ''} className={classNames(size, 'rounded-3xl object-cover ring-4 ring-white/20')} />
  return <div className={classNames(size, 'flex items-center justify-center rounded-3xl bg-white/15 text-xl font-semibold ring-4 ring-white/20')}>{(user?.name ?? 'S').slice(0, 1).toUpperCase()}</div>
}

function filterResources(resources, filters) { return [] }
function filterModules(modules, filters, resources) { return [] }

function validateProfile(form) {
  const errors = {}
  if (!form.name.trim()) errors.name = 'Le nom complet est obligatoire.'
  if (!form.email.trim()) errors.email = "L'adresse email est obligatoire."
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.email = 'Veuillez saisir une adresse email valide.'
  return errors
}

function validatePassword(form) {
  const errors = {}
  if (!form.current_password) errors.current_password = 'Le mot de passe actuel est obligatoire.'
  if (!form.password) errors.password = 'Le nouveau mot de passe est obligatoire.'
  else if (form.password.length < 8) errors.password = 'Le nouveau mot de passe doit contenir au moins 8 caractères.'
  if (!form.password_confirmation) errors.password_confirmation = 'Veuillez confirmer le nouveau mot de passe.'
  else if (form.password !== form.password_confirmation) errors.password_confirmation = 'Les mots de passe ne correspondent pas.'
  return errors
}

function normalize(value) { return String(value ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') }
function sectionTitle(key) { return sections.find((section) => section.key === key)?.label ?? 'Tableau de bord' }
function formatDate(value) { return !value ? 'Non défini' : new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) }
function classNames(...values) { return values.filter(Boolean).join(' ') }

function GridIcon({ className = 'h-5 w-5' }) { return <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" stroke="currentColor" strokeWidth="1.8" /></svg> }
function ModulesIcon({ className = 'h-5 w-5' }) { return <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true"><path d="m4 8 8-4 8 4-8 4-8-4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><path d="m4 12 8 4 8-4M4 16l8 4 8-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg> }
function BookIcon({ className = 'h-5 w-5' }) { return <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true"><path d="M6 5.5h9.5A2.5 2.5 0 0 1 18 8v10.5H8.5A2.5 2.5 0 0 0 6 21V5.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><path d="M6 7.5h-1A2.5 2.5 0 0 0 2.5 10V19A2.5 2.5 0 0 0 5 21h1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg> }
function ClipboardIcon({ className = 'h-5 w-5' }) { return <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true"><path d="M8 4.5h8M9 3h6a1 1 0 0 1 1 1v1H8V4a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><path d="M6.5 5.5h11A1.5 1.5 0 0 1 19 7v12.5A1.5 1.5 0 0 1 17.5 21h-11A1.5 1.5 0 0 1 5 19.5V7a1.5 1.5 0 0 1 1.5-1.5Z" stroke="currentColor" strokeWidth="1.8" /><path d="M8.5 10.5h7M8.5 14.5h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg> }
function ShieldIcon({ className = 'h-5 w-5' }) { return <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true"><path d="m12 3.5 6 2.5V11c0 4-2.35 7.44-6 9-3.65-1.56-6-5-6-9V6l6-2.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><path d="m9.4 11.8 1.7 1.7 3.6-3.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg> }
function UserIcon({ className = 'h-5 w-5' }) { return <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true"><circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.8" /><path d="M5 19a7 7 0 0 1 14 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg> }
function MenuIcon({ className = 'h-5 w-5' }) { return <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg> }
function RefreshIcon({ className = 'h-5 w-5' }) { return <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.34 5.66M20 7v4h-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg> }
function LogoutIcon({ className = 'h-5 w-5' }) { return <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true"><path d="M10 6H7a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><path d="m14 16 4-4-4-4M18 12H9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg> }
function SearchIcon({ className = 'h-5 w-5' }) { return <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true"><circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="1.8" /><path d="m20 20-4.2-4.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg> }
function DocumentIcon({ className = 'h-5 w-5' }) { return <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true"><path d="M8 3.5h5.5L18.5 8v12A1.5 1.5 0 0 1 17 21.5H8A1.5 1.5 0 0 1 6.5 20V5A1.5 1.5 0 0 1 8 3.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><path d="M13.5 3.5V8h5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><path d="M9.5 12h5M9.5 15.5h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg> }
function SparkIcon({ className = 'h-5 w-5' }) { return <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true"><path d="M12 3.5 13.9 10l6.6 1.9-6.6 1.9L12 20.5l-1.9-6.7L3.5 11.9l6.6-1.9L12 3.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg> }
function UploadIcon({ className = 'h-5 w-5' }) { return <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true"><path d="M12 15V4.5M8 8.5l4-4 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /><path d="M5 14.5v3A2.5 2.5 0 0 0 7.5 20h9A2.5 2.5 0 0 0 19 17.5v-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg> }
function EyeIcon({ className = 'h-5 w-5' }) { return <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true"><path d="M2.75 12s3.4-5.75 9.25-5.75S21.25 12 21.25 12s-3.4 5.75-9.25 5.75S2.75 12 2.75 12Z" stroke="currentColor" strokeWidth="1.8" /><circle cx="12" cy="12" r="2.75" stroke="currentColor" strokeWidth="1.8" /></svg> }
function EyeOffIcon({ className = 'h-5 w-5' }) { return <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true"><path d="M3 4.5 21 19.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><path d="M10.6 6.4c.45-.1.92-.15 1.4-.15 5.85 0 9.25 5.75 9.25 5.75a17 17 0 0 1-2.7 3.4M6.3 8.6C4.15 10.25 2.75 12 2.75 12s3.4 5.75 9.25 5.75c1.4 0 2.68-.33 3.84-.88" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /><path d="M10.4 10.4a2.25 2.25 0 0 0 3.2 3.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg> }
