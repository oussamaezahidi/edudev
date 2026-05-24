import { useEffect, useMemo, useState } from 'react'
import Modal from '../components/Modal'
import { client as axiosClient } from '../api/client'

const sections = [
  ['dashboard', 'Tableau de bord'],
  ['users', 'Utilisateurs'],
  ['modules', 'Modules'],
  ['assignments', 'Affectation des modules'],
  ['content', 'Gestion du contenu'],
  ['settings', 'Paramètres'],
  ['profile', 'Profil'],
]

const emptyUser = {
  first_name: '',
  last_name: '',
  email: '',
  password: '',
  role: 'trainee',
  is_active: true,
  phone: '',
  specialty: '',
  bio: '',
  module_ids: [],
}

const emptyModule = {
  title: '',
  description: '',
}

const defaultSettings = {
  general: { platform_name: 'EduDev', support_email: 'support@edudev.local' },
  appearance: { mode: 'light', primary_color: '#ff7900' },
  security: { session_timeout: 120, upload_size_limit: 20 },
  files: { pdf_max_size: 20, allowed_file_types: ['pdf'], storage_disk: 'local' },
  maintenance: { enabled: false },
  localization: { language: 'fr', timezone: 'Africa/Casablanca', date_format: 'd/m/Y H:i' },
}

export default function AdminWorkspace({ user, api, onLogout, settings: appSettings = defaultSettings, onSettingsChange = null }) {
  const [darkMode, setDarkMode] = useState(() => (appSettings.appearance?.mode ?? 'light') === 'dark' || window.localStorage.getItem('edudev-admin-dark') === '1')
  const [active, setActive] = useState('dashboard')
  const [loading, setLoading] = useState(() => !window.localStorage.getItem('edudev.admin.cache'))
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [contentType, setContentType] = useState('courses')
  const [contentQuery, setContentQuery] = useState('')
  const [moduleFilter, setModuleFilter] = useState('all')
  const [trainerFilter, setTrainerFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [preview, setPreview] = useState(null)
  const [data, setData] = useState({
    dashboard: null,
    users: [],
    modules: [],
    courses: [],
    practicalWorks: [],
    assessments: [],
    profile: user,
    settings: defaultSettings,
    assignmentHistory: [],
  })
  const [modals, setModals] = useState({ user: false, module: false, password: false })
  const [editingUser, setEditingUser] = useState(null)
  const [editingModule, setEditingModule] = useState(null)
  const [userForm, setUserForm] = useState(emptyUser)
  const [moduleForm, setModuleForm] = useState(emptyModule)
  const [assignmentForm, setAssignmentForm] = useState({ trainer_id: '', module_ids: [] })
  const [profileForm, setProfileForm] = useState({ first_name: user.first_name || '', last_name: user.last_name || '', email: user.email, avatar: null })
  const [passwordForm, setPasswordForm] = useState({ current_password: '', password: '', password_confirmation: '' })
  const [settingsForm, setSettingsForm] = useState(appSettings)

  useEffect(() => {
    loadAdmin()
  }, [])

  useEffect(() => {
    setSettingsForm(appSettings)
    setData((previous) => ({ ...previous, settings: appSettings }))
    setDarkMode((appSettings.appearance?.mode ?? 'light') === 'dark')
  }, [appSettings])

  useEffect(() => {
    window.localStorage.setItem('edudev-admin-dark', darkMode ? '1' : '0')
    document.documentElement.classList.toggle('dark', darkMode)
  }, [darkMode])

  useEffect(() => {
    setPage(1)
  }, [contentType, contentQuery, moduleFilter, trainerFilter])

  useEffect(() => {
    return () => {
      if (preview?.url) URL.revokeObjectURL(preview.url)
    }
  }, [preview])

  const trainers = useMemo(() => data.users.filter((item) => item.role === 'trainer'), [data.users])
  const filteredUsers = useMemo(() => {
    const search = query.trim().toLowerCase()
    return data.users.filter((item) => {
      const matchesRole = roleFilter === 'all' || item.role === roleFilter
      const matchesSearch = !search || item.name.toLowerCase().includes(search) || item.email.toLowerCase().includes(search)
      return matchesRole && matchesSearch
    })
  }, [data.users, query, roleFilter])

  const contentItems = useMemo(() => {
    const source = contentType === 'courses' ? data.courses : contentType === 'tp' ? data.practicalWorks : data.assessments
    const search = contentQuery.trim().toLowerCase()

    return source.filter((item) => {
      const moduleId = item.module_id ?? item.module?.id ?? item.course?.module_id
      const trainerId = item.trainer_id ?? item.trainer?.id
      const matchesSearch = !search || item.title.toLowerCase().includes(search) || (item.module?.title ?? item.course?.module?.title ?? '').toLowerCase().includes(search)
      const matchesModule = moduleFilter === 'all' || String(moduleId) === String(moduleFilter)
      const matchesTrainer = trainerFilter === 'all' || String(trainerId) === String(trainerFilter)
      return matchesSearch && matchesModule && matchesTrainer
    })
  }, [contentType, contentQuery, data.assessments, data.courses, data.practicalWorks, moduleFilter, trainerFilter])

  const pagedContent = useMemo(() => contentItems.slice((page - 1) * 8, page * 8), [contentItems, page])
  const totalPages = Math.max(1, Math.ceil(contentItems.length / 8))
  const stats = data.dashboard?.stats ?? {}

  async function loadAdmin({ silent = false } = {}) {
    if (!silent) {
      setLoading(true)
    }
    setError('')

    try {
      const [dashboard, users, modules, courses, practicalWorks, assessments, profile, settings, assignments] = await Promise.all([
        api('/dashboard'),
        api('/admin/users'),
        api('/modules'),
        api('/courses'),
        api('/practical-works'),
        api('/assessments'),
        api('/profile'),
        api('/admin/settings'),
        api('/admin/module-assignments'),
      ])

      const nextData = { dashboard, users, modules, courses, practicalWorks, assessments, profile: profile.user, settings: settings.settings, assignmentHistory: assignments.history ?? [] }
      setData(nextData)
      setProfileForm({ first_name: profile.user.first_name || '', last_name: profile.user.last_name || '', email: profile.user.email, avatar: null })
      setSettingsForm(settings.settings)
      onSettingsChange?.(settings.settings)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  function showToast(message) {
    setToast(message)
    window.setTimeout(() => setToast(''), 3200)
  }

  function openUserModal(nextUser = null) {
    setEditingUser(nextUser)
    setUserForm(nextUser ? {
      first_name: nextUser.first_name ?? '',
      last_name: nextUser.last_name ?? '',
      email: nextUser.email ?? '',
      password: '',
      role: nextUser.role ?? 'trainee',
      is_active: nextUser.is_active !== false,
      phone: nextUser.phone ?? '',
      specialty: nextUser.specialty ?? '',
      bio: nextUser.bio ?? '',
      module_ids: (nextUser.modules ?? []).map((item) => String(item.id)),
    } : emptyUser)
    setModals((previous) => ({ ...previous, user: true }))
  }

  function openModuleModal(nextModule = null) {
    setEditingModule(nextModule)
    setModuleForm(nextModule ? {
      title: nextModule.title ?? '',
      description: nextModule.description ?? '',
    } : emptyModule)
    setModals((previous) => ({ ...previous, module: true }))
  }

  async function submitUser(event) {
    event.preventDefault()
    setSaving(true)

    try {
      const payload = { ...userForm }
      delete payload.module_ids
      if (payload.role === 'trainer') {
        payload.specialty = ''
        payload.bio = ''
      }
      if (editingUser && !payload.password) delete payload.password

      await api(editingUser ? `/admin/users/${editingUser.id}` : '/admin/users', {
        method: editingUser ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      })
      setModals((previous) => ({ ...previous, user: false }))
      await loadAdmin()
      showToast(editingUser ? 'Utilisateur modifié.' : 'Utilisateur créé.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  async function submitModule(event) {
    event.preventDefault()
    setSaving(true)

    try {
      await api(editingModule ? `/modules/${editingModule.id}` : '/modules', {
        method: editingModule ? 'PUT' : 'POST',
        body: JSON.stringify({
          title: moduleForm.title,
          description: moduleForm.description,
        }),
      })
      setModals((previous) => ({ ...previous, module: false }))
      await loadAdmin()
      showToast(editingModule ? 'Module modifié.' : 'Module créé.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  async function submitAssignment(event) {
    event.preventDefault()
    if (!assignmentForm.trainer_id) {
      setError('Veuillez sélectionner un formateur.')
      return
    }

    setSaving(true)
    try {
      const response = await api('/admin/module-assignments', {
        method: 'POST',
        body: JSON.stringify({
          trainer_id: Number(assignmentForm.trainer_id),
          module_ids: assignmentForm.module_ids.map(Number),
        }),
      })
      setData((previous) => ({
        ...previous,
        users: previous.users.map((item) => String(item.id) === String(response.trainer.id) ? response.trainer : item),
        assignmentHistory: response.history ?? previous.assignmentHistory,
      }))
      await loadAdmin()
      showToast('Modules affectés sans remplacer les affectations existantes.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  async function submitProfile(event) {
    event.preventDefault()
    setSaving(true)

    try {
      const form = new FormData()
      form.append('first_name', profileForm.first_name)
      form.append('last_name', profileForm.last_name)
      form.append('email', profileForm.email)
      if (profileForm.avatar) form.append('avatar', profileForm.avatar)
      await api('/profile', { method: 'POST', body: form })
      window.localStorage.setItem('edudev.avatar.buster', Date.now())
      await loadAdmin()
      showToast('Profil mis à jour.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  async function submitPassword(event) {
    event.preventDefault()
    setSaving(true)

    try {
      await api('/profile/password', { method: 'PUT', body: JSON.stringify(passwordForm) })
      setPasswordForm({ current_password: '', password: '', password_confirmation: '' })
      setModals((previous) => ({ ...previous, password: false }))
      showToast('Mot de passe mis à jour.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  async function submitSettings(event) {
    event.preventDefault()
    setSaving(true)

    try {
      const response = await api('/admin/settings', {
        method: 'PUT',
        body: JSON.stringify(settingsForm),
      })
      setSettingsForm(response.settings)
      setData((previous) => ({ ...previous, settings: response.settings }))
      applyThemePreference(response.settings.appearance?.mode)
      const isDark = response.settings.appearance?.mode === 'dark'
      window.localStorage.setItem('edudev-admin-dark', isDark ? '1' : '0')
      onSettingsChange?.(response.settings)
      showToast('Paramètres mis à jour sur toute la plateforme.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  async function uploadSettingAsset(type, file) {
    if (!file) return
    setSaving(true)

    try {
      const form = new FormData()
      form.append('type', type)
      form.append('asset', file)
      const response = await api('/admin/settings/assets', { method: 'POST', body: form })
      setSettingsForm(response.settings)
      setData((previous) => ({ ...previous, settings: response.settings }))
      onSettingsChange?.(response.settings)
      showToast(type === 'logo' ? 'Logo mis à jour.' : 'Favicon mis à jour.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  async function runSettingsAction(action) {
    setSaving(true)

    try {
      const response = await api('/admin/settings/action', {
        method: 'POST',
        body: JSON.stringify({ action }),
      })
      setSettingsForm(response.settings)
      setData((previous) => ({ ...previous, settings: response.settings }))
      onSettingsChange?.(response.settings)
      showToast('Action exécutée.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  async function removeAssignment(trainerId, moduleId) {
    setSaving(true)
    try {
      const response = await api(`/admin/module-assignments/${trainerId}/${moduleId}`, { method: 'DELETE' })
      setData((previous) => ({
        ...previous,
        users: previous.users.map((item) => String(item.id) === String(response.trainer.id) ? response.trainer : item),
        assignmentHistory: response.history ?? previous.assignmentHistory,
      }))
      await loadAdmin()
      showToast('Affectation retirée.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  function updateSettings(group, key, value) {
    const next = {
      ...settingsForm,
      [group]: {
        ...settingsForm[group],
        [key]: value,
      },
    }
    setSettingsForm(next)
    setData((current) => ({ ...current, settings: next }))
    onSettingsChange?.(next)
  }

  function applyThemePreference(mode) {
    if (mode === 'dark') setDarkMode(true)
    if (mode === 'light') setDarkMode(false)
  }

  function selectAssignmentTrainer(trainerId) {
    const trainer = trainers.find((item) => String(item.id) === String(trainerId))
    setAssignmentForm({
      trainer_id: trainerId,
      module_ids: (trainer?.modules ?? []).map((module) => String(module.id)),
    })
  }

  async function toggleUser(nextUser) {
    try {
      await api(`/admin/users/${nextUser.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !nextUser.is_active }),
      })
      await loadAdmin()
      showToast(nextUser.is_active ? 'Compte desactive.' : 'Compte active.')
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function remove(path, message) {
    if (!window.confirm('Confirmer la suppression ?')) return

    try {
      await api(path, { method: 'DELETE' })
      await loadAdmin()
      showToast(message)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  function resolveUrl(url) {
    if (!url) return ''
    if (url.startsWith('/api')) {
      const apiBase = import.meta.env.VITE_API_URL || '/api'
      return url.replace('/api', apiBase)
    }
    return url
  }

  async function openPdf(document, title) {
    if (!document) return

    try {
      const url = resolveUrl(document.preview_url)
      const response = await axiosClient.get(url, {
        responseType: 'blob',
        headers: { Accept: 'application/pdf' }
      })
      const urlBlob = URL.createObjectURL(response.data)
      if (preview?.url) URL.revokeObjectURL(preview.url)
      setPreview({ title, url: urlBlob })
    } catch (requestError) {
      setError("Impossible d'ouvrir ce PDF.")
    }
  }

  async function downloadPdf(file) {
    if (!file) return

    try {
      const url = resolveUrl(file.download_url)
      const response = await axiosClient.get(url, {
        responseType: 'blob'
      })
      const objectUrl = URL.createObjectURL(response.data)
      const anchor = window.document.createElement('a')
      anchor.href = objectUrl
      anchor.download = file.name
      anchor.click()
      URL.revokeObjectURL(objectUrl)
    } catch (requestError) {
      setError("Téléchargement impossible.")
    }
  }

  return (
    <div className={darkMode ? 'dark' : ''}>
      <div className="min-h-screen bg-slate-100 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100">
        <div className="flex min-h-screen">
          <aside className="hidden w-72 border-r border-white/70 bg-white/90 p-5 shadow-xl shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900/90 dark:shadow-black/20 lg:block">
            <div className="mb-8 rounded-[28px] bg-gradient-to-br from-slate-950 via-slate-800 to-orange-500 p-5 text-white shadow-xl shadow-slate-950/20">
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-orange-100">{data.settings.general?.platform_name ?? 'EduDev'}</p>
              <h1 className="mt-2 text-2xl font-bold text-white">Admin Pro</h1>
              <p className="mt-2 text-sm text-orange-50">{data.profile?.name ?? user.name}</p>
            </div>
            <nav className="space-y-2">
              {sections.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActive(key)}
                  className={classNames(
                    'flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition',
                    active === key ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/25' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                  )}
                >
                  <NavIcon />
                  {label}
                </button>
              ))}
            </nav>
          </aside>

          <main className="flex-1 p-4 sm:p-6 lg:p-8">
            <header className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-[28px] border border-white/70 bg-white/90 p-5 shadow-xl shadow-slate-200/45 dark:border-slate-800 dark:bg-slate-900/90 dark:shadow-black/20">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-orange-500">Administration</p>
                <h2 className="mt-1 text-2xl font-bold text-slate-950 dark:text-white">{sectionTitle(active)}</h2>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select className="admin-input max-w-xs lg:hidden dark:border-slate-700 dark:bg-slate-950 dark:text-white" value={active} onChange={(event) => setActive(event.target.value)}>
                  {sections.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
                {/* Dark mode toggle — same style as trainer/trainee */}
                <button
                  type="button"
                  onClick={() => setDarkMode((value) => !value)}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-orange-200 hover:text-orange-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:text-orange-400"
                  title={darkMode ? 'Passer en mode clair' : 'Passer en mode sombre'}
                >
                  {darkMode ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m8.66-9H21M3 12H2m15.364-6.364l-.707.707M7.05 16.95l-.707.707m11.314 0l-.707-.707M7.757 7.757l-.707-.707M12 7a5 5 0 100 10A5 5 0 0012 7z" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
                    </svg>
                  )}
                </button>
                <button
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-orange-200 hover:text-orange-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  type="button"
                  onClick={() => loadAdmin({ silent: true })}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Actualiser
                </button>
                <button
                  className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-orange-500 to-orange-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-orange-500/25 transition hover:-translate-y-0.5"
                  type="button"
                  onClick={onLogout}
                >
                  Déconnexion
                </button>
              </div>
            </header>

            {error ? <Alert tone="error" message={error} onClose={() => setError('')} /> : null}
            {toast ? <Alert tone="success" message={toast} onClose={() => setToast('')} /> : null}
            {loading ? <LoadingGrid /> : null}

            {!loading && active === 'dashboard' ? (
              <section className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <StatCard label="Utilisateurs" value={stats.users ?? 0} accent="from-orange-500 to-amber-400" />
                  <StatCard label="Formateurs" value={stats.trainers ?? 0} accent="from-cyan-500 to-blue-500" />
                  <StatCard label="Stagiaires" value={stats.trainees ?? 0} accent="from-emerald-500 to-teal-500" />
                  <StatCard label="Modules" value={stats.modules ?? 0} accent="from-fuchsia-500 to-rose-500" />
                  <StatCard label="Cours" value={stats.courses ?? 0} accent="from-indigo-500 to-violet-500" />
                  <StatCard label="Total TP" value={stats.practicalWorks ?? 0} accent="from-lime-500 to-emerald-500" />
                  <StatCard label="Contrôles" value={stats.assessments ?? 0} accent="from-sky-500 to-cyan-500" />
                  <StatCard label="Comptes inactifs" value={stats.inactiveUsers ?? 0} accent="from-rose-500 to-red-500" />
                </div>
                <Panel title="Activité récente">
                  <div className="grid gap-4 lg:grid-cols-3">
                    <MiniList title="Utilisateurs" items={data.dashboard?.recent?.users ?? []} field="name" />
                    <MiniList title="Modules" items={data.dashboard?.recent?.modules ?? []} field="title" />
                    <MiniList title="Cours" items={data.dashboard?.recent?.courses ?? []} field="title" />
                  </div>
                </Panel>
              </section>
            ) : null}

            {!loading && active === 'users' ? (
              <Panel title="Gestion des utilisateurs" action={<button className="primary-admin-button" type="button" onClick={() => openUserModal()}>Ajouter utilisateur</button>}>
                <div className="mb-5 grid gap-3 md:grid-cols-[1fr,220px]">
                  <input className="admin-input dark:border-slate-700 dark:bg-slate-950 dark:text-white" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher par nom ou email..." />
                  <select className="admin-input dark:border-slate-700 dark:bg-slate-950 dark:text-white" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
                    <option value="all">Tous les rôles</option>
                    <option value="admin">Admins</option>
                    <option value="trainer">Formateurs</option>
                    <option value="trainee">Stagiaires</option>
                  </select>
                </div>
                <UsersTable users={filteredUsers} onEdit={openUserModal} onToggle={toggleUser} onDelete={(item) => remove(`/admin/users/${item.id}`, 'Utilisateur supprimé.')} />
              </Panel>
            ) : null}

            {!loading && active === 'assignments' ? (
              <AssignmentPage
                trainers={trainers}
                modules={data.modules}
                history={data.assignmentHistory}
                form={assignmentForm}
                saving={saving}
                onTrainer={selectAssignmentTrainer}
                onModules={(moduleIds) => setAssignmentForm((previous) => ({ ...previous, module_ids: moduleIds }))}
                onSubmit={submitAssignment}
                onRemove={removeAssignment}
              />
            ) : null}

            {!loading && active === 'modules' ? (
              <Panel title="Modules" action={<button className="primary-admin-button" type="button" onClick={() => openModuleModal()}>Ajouter module</button>}>
                <CardsGrid
                  items={data.modules}
                  render={(moduleItem) => (
                    <AdminCard
                      key={moduleItem.id}
                      title={moduleItem.title}
                      meta={moduleItem.description || 'Aucune description'}
                      tags={(moduleItem.trainers ?? []).map((item) => item.name)}
                      onEdit={() => openModuleModal(moduleItem)}
                      onDelete={() => remove(`/modules/${moduleItem.id}`, 'Module supprimé.')}
                    />
                  )}
                />
              </Panel>
            ) : null}

            {!loading && active === 'content' ? (
              <Panel title="Gestion du contenu">
                <ContentToolbar
                  contentType={contentType}
                  setContentType={setContentType}
                  query={contentQuery}
                  setQuery={setContentQuery}
                  moduleFilter={moduleFilter}
                  setModuleFilter={setModuleFilter}
                  trainerFilter={trainerFilter}
                  setTrainerFilter={setTrainerFilter}
                  modules={data.modules}
                  trainers={trainers}
                />
                <ContentTable
                  type={contentType}
                  items={pagedContent}
                  onPreview={(item) => openPdf(item.document, item.title)}
                  onDownload={(item) => downloadPdf(item.document)}
                  onDelete={(item) => remove(contentDeletePath(contentType, item), 'Contenu supprimé.')}
                />
                <Pagination page={page} totalPages={totalPages} onPage={setPage} total={contentItems.length} />
              </Panel>
            ) : null}

            {!loading && active === 'settings' ? (
              <SettingsPage
                settings={settingsForm}
                saving={saving}
                darkMode={darkMode}
                onChange={updateSettings}
                onSubmit={submitSettings}
                onAsset={uploadSettingAsset}
                onAction={runSettingsAction}
                onDarkMode={(value) => {
                  setDarkMode(value)
                  updateSettings('appearance', 'mode', value ? 'dark' : 'light')
                }}
              />
            ) : null}

            {!loading && active === 'profile' ? (
              <Panel title="Profil administrateur">
                <div className="grid gap-6 xl:grid-cols-[360px,1fr]">
                  <div className="rounded-[28px] bg-gradient-to-br from-slate-950 via-slate-800 to-orange-500 p-6 text-white shadow-xl shadow-slate-950/20">
                    <div className="flex items-center gap-4">
                      <Avatar user={data.profile} />
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.24em] text-orange-100">Administrateur</p>
                        <h3 className="mt-1 text-2xl font-bold text-white">{data.profile?.name}</h3>
                        <p className="mt-1 text-sm text-orange-50">{data.profile?.email}</p>
                      </div>
                    </div>
                  </div>
                  <form className="grid gap-4 rounded-[28px] border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-950/70" onSubmit={submitProfile}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                      <Input label="Prénom" value={profileForm.first_name || ''} onChange={(value) => setProfileForm((previous) => ({ ...previous, first_name: value }))} />
                      <Input label="Nom" value={profileForm.last_name || ''} onChange={(value) => setProfileForm((previous) => ({ ...previous, last_name: value }))} />
                    </div>
                    <Input label="Email" type="email" value={profileForm.email} onChange={(value) => setProfileForm((previous) => ({ ...previous, email: value }))} />
                    <FileInput label="Avatar" accept="image/png,image/jpeg,image/webp" onChange={(file) => setProfileForm((previous) => ({ ...previous, avatar: file }))} />
                    <div className="flex flex-wrap gap-3">
                      <button className="primary-admin-button" type="submit" disabled={saving}>{saving ? 'Enregistrement...' : 'Enregistrer le profil'}</button>
                      <button className="secondary-admin-button" type="button" onClick={() => setModals((previous) => ({ ...previous, password: true }))}>Changer mot de passe</button>
                    </div>
                  </form>
                </div>
              </Panel>
            ) : null}
          </main>
        </div>

        <Modal open={modals.user} title={editingUser ? 'Modifier utilisateur' : 'Ajouter utilisateur'} onClose={() => setModals((previous) => ({ ...previous, user: false }))}>
          <form className="space-y-4" onSubmit={submitUser}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <Input label="Prénom" value={userForm.first_name || ''} onChange={(value) => setUserForm((previous) => ({ ...previous, first_name: value }))} />
              <Input label="Nom" value={userForm.last_name || ''} onChange={(value) => setUserForm((previous) => ({ ...previous, last_name: value }))} />
            </div>
            <Input label="Email" type="email" value={userForm.email} onChange={(value) => setUserForm((previous) => ({ ...previous, email: value }))} />
            <Input label={editingUser ? 'Mot de passe (optionnel)' : 'Mot de passe'} type="password" value={userForm.password} onChange={(value) => setUserForm((previous) => ({ ...previous, password: value }))} />
            <Select label="Rôle" value={userForm.role} onChange={(value) => setUserForm((previous) => ({ ...previous, role: value }))} options={[['admin', 'Admin'], ['trainer', 'Formateur'], ['trainee', 'Stagiaire']]} />
            <Input label="Téléphone" value={userForm.phone} onChange={(value) => setUserForm((previous) => ({ ...previous, phone: value }))} />
            {userForm.role !== 'trainer' ? (
              <>
                <Input label="Groupe" value={userForm.specialty} onChange={(value) => setUserForm((previous) => ({ ...previous, specialty: value }))} />
                <Textarea label="Bio" value={userForm.bio} onChange={(value) => setUserForm((previous) => ({ ...previous, bio: value }))} />
              </>
            ) : null}
            <label className="flex items-center gap-3 text-sm font-semibold"><input type="checkbox" checked={userForm.is_active} onChange={(event) => setUserForm((previous) => ({ ...previous, is_active: event.target.checked }))} /> Compte actif</label>
            <Submit saving={saving} label={editingUser ? 'Enregistrer' : 'Créer utilisateur'} />
          </form>
        </Modal>

        <Modal open={modals.module} title={editingModule ? 'Modifier module' : 'Ajouter module'} onClose={() => setModals((previous) => ({ ...previous, module: false }))}>
          <form className="space-y-4" onSubmit={submitModule}>
            <Input label="Titre" value={moduleForm.title} onChange={(value) => setModuleForm((previous) => ({ ...previous, title: value }))} />
            <Textarea label="Description" value={moduleForm.description} onChange={(value) => setModuleForm((previous) => ({ ...previous, description: value }))} />
            <Submit saving={saving} label={editingModule ? 'Enregistrer module' : 'Créer module'} />
          </form>
        </Modal>

        <Modal open={modals.password} title="Changer mot de passe" onClose={() => setModals((previous) => ({ ...previous, password: false }))}>
          <form className="space-y-4" onSubmit={submitPassword}>
            <Input label="Mot de passe actuel" type="password" value={passwordForm.current_password} onChange={(value) => setPasswordForm((previous) => ({ ...previous, current_password: value }))} />
            <Input label="Nouveau mot de passe" type="password" value={passwordForm.password} onChange={(value) => setPasswordForm((previous) => ({ ...previous, password: value }))} />
            <Input label="Confirmation" type="password" value={passwordForm.password_confirmation} onChange={(value) => setPasswordForm((previous) => ({ ...previous, password_confirmation: value }))} />
            <Submit saving={saving} label="Mettre à jour" />
          </form>
        </Modal>

        <Modal open={Boolean(preview)} title={preview?.title ?? 'PDF'} onClose={() => setPreview(null)} wide>
          {preview ? <iframe title={preview.title} src={preview.url} className="h-[72vh] w-full rounded-3xl border border-slate-200 dark:border-slate-800"></iframe> : null}
        </Modal>
      </div>
    </div>
  )
}

function SettingsPage({ settings, saving, darkMode, onChange, onSubmit, onAsset, onAction, onDarkMode }) {
  return (
    <form className="space-y-5" onSubmit={onSubmit}>
      <Panel title="Général">
        <div className="grid gap-4 md:grid-cols-2">
          <Input label="Nom de la plateforme" value={settings.general.platform_name ?? ''} onChange={(value) => onChange('general', 'platform_name', value)} />
          <Input label="Email support" type="email" value={settings.general.support_email ?? ''} onChange={(value) => onChange('general', 'support_email', value)} />
        </div>
      </Panel>

      <Panel title="Apparence">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex items-center justify-between rounded-3xl bg-slate-50 p-4 text-sm font-bold text-slate-700 dark:bg-slate-950/70 dark:text-slate-200">
            Mode sombre
            <input type="checkbox" checked={darkMode} onChange={(event) => { onDarkMode(event.target.checked); onChange('appearance', 'mode', event.target.checked ? 'dark' : 'light') }} />
          </label>
          <Input label="Couleur principale" type="color" value={settings.appearance.primary_color ?? '#ff7900'} onChange={(value) => onChange('appearance', 'primary_color', value)} />
        </div>
      </Panel>

      <Panel title="Système">
        <div className="grid gap-4 md:grid-cols-2">
          <Input label="Taille maximale upload PDF (Mo)" type="number" value={settings.files.pdf_max_size ?? 20} onChange={(value) => onChange('files', 'pdf_max_size', Number(value))} />
          <label className="flex items-center justify-between rounded-3xl bg-slate-50 p-4 text-sm font-bold text-slate-700 dark:bg-slate-950/70 dark:text-slate-200">
            Mode maintenance
            <input
              type="checkbox"
              checked={Boolean(settings.maintenance.enabled)}
              onChange={(event) => {
                onChange('maintenance', 'enabled', event.target.checked)
                onAction(event.target.checked ? 'maintenance_on' : 'maintenance_off')
              }}
            />
          </label>
        </div>
      </Panel>

      <div className="flex justify-end">
        <button className="primary-admin-button min-w-56" type="submit" disabled={saving}>{saving ? 'Enregistrement...' : 'Enregistrer'}</button>
      </div>
    </form>
  )
}

function AssignmentPage({ trainers, modules, history = [], form, saving, onTrainer, onModules, onSubmit, onRemove }) {
  const selectedTrainer = trainers.find((trainer) => String(trainer.id) === String(form.trainer_id))
  const selectedHistory = form.trainer_id ? history.filter((item) => String(item.trainer_id) === String(form.trainer_id)) : history

  return (
    <Panel title="Affectation des modules">
      <form className="grid gap-5" onSubmit={onSubmit}>
        <Select
          label="Formateur"
          value={form.trainer_id}
          onChange={onTrainer}
          options={[['', 'Sélectionner un formateur'], ...trainers.map((trainer) => [String(trainer.id), trainer.name])]}
        />
        <Multi
          label="Modules à affecter"
          value={form.module_ids}
          onChange={onModules}
          options={modules.map((module) => [String(module.id), module.title])}
        />
        <div className="rounded-3xl bg-slate-50 p-4 dark:bg-slate-950/70">
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Modules actuellement affectés</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {selectedTrainer?.modules?.length ? selectedTrainer.modules.map((module) => (
              <span key={module.id} className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {module.title}
                <button type="button" className="text-rose-500 hover:text-rose-700 hover:underline transition-all duration-200" onClick={() => onRemove(selectedTrainer.id, module.id)} disabled={saving}>Retirer</button>
              </span>
            )) : <span className="text-sm text-slate-500">Aucun module affecté.</span>}
          </div>
        </div>
        <div className="flex justify-end">
          <button className="primary-admin-button min-w-56" type="submit" disabled={saving || !form.trainer_id}>{saving ? 'Enregistrement...' : 'Ajouter les modules sélectionnés'}</button>
        </div>
      </form>
      <div className="mt-6 rounded-3xl bg-slate-50 p-4 dark:bg-slate-950/70">
        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Historique des affectations</p>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="py-2 pr-4">Formateur</th>
                <th className="py-2 pr-4">Module</th>
                <th className="py-2 pr-4">Action</th>
                <th className="py-2 pr-4">Date</th>
              </tr>
            </thead>
            <tbody>
              {selectedHistory.length ? selectedHistory.map((item) => (
                <tr key={item.id} className="border-t border-slate-200 dark:border-slate-800">
                  <td className="py-2 pr-4">{item.trainer?.name ?? '-'}</td>
                  <td className="py-2 pr-4">{item.module?.title ?? '-'}</td>
                  <td className="py-2 pr-4">{item.action === 'removed' ? 'Retiré' : 'Affecté'}</td>
                  <td className="py-2 pr-4">{formatDate(item.assigned_at ?? item.created_at)}</td>
                </tr>
              )) : (
                <tr><td className="py-3 text-slate-500" colSpan="4">Aucun historique.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Panel>
  )
}

function UsersTable({ users, onEdit, onToggle, onDelete }) {
  if (!users.length) return <Empty label="Aucun utilisateur trouvé." />

  return (
    <div className="overflow-hidden rounded-[24px] border border-slate-200 dark:border-slate-800">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
          <thead className="bg-slate-50 text-left text-slate-500 dark:bg-slate-950 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3">Utilisateur</th>
              <th className="px-4 py-3">Rôle</th>
              <th className="px-4 py-3">Statut</th>
              <th className="px-4 py-3">Modules</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
            {users.map((item) => (
              <tr key={item.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-800/70">
                <td className="px-4 py-4"><strong>{item.name}</strong><p className="text-slate-500">{item.email}</p></td>
                <td className="px-4 py-4">{roleLabel(item.role)}</td>
                <td className="px-4 py-4"><Badge tone={item.is_active ? 'success' : 'danger'}>{item.is_active ? 'Actif' : 'Inactif'}</Badge></td>
                <td className="max-w-sm px-4 py-4 text-slate-600 dark:text-slate-300">{(item.modules ?? []).map((module) => module.title).join(', ') || '-'}</td>
                <td className="px-4 py-4">
                  <div className="flex flex-wrap gap-2">
                    <SmallButton onClick={() => onEdit(item)}>Modifier</SmallButton>
                    <SmallButton onClick={() => onToggle(item)}>{item.is_active ? 'Désactiver' : 'Activer'}</SmallButton>
                    <SmallButton danger onClick={() => onDelete(item)}>Supprimer</SmallButton>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ContentToolbar({ contentType, setContentType, query, setQuery, moduleFilter, setModuleFilter, trainerFilter, setTrainerFilter, modules, trainers }) {
  return (
    <div className="mb-5 grid gap-3 xl:grid-cols-[auto,1fr,220px,220px]">
      <div className="flex rounded-2xl bg-slate-100 p-1 dark:bg-slate-950">
        {[
          ['courses', 'Cours'],
          ['tp', 'TP'],
          ['controles', 'Contrôles'],
        ].map(([key, label]) => (
          <button key={key} type="button" onClick={() => setContentType(key)} className={classNames('rounded-xl px-4 py-2 text-sm font-bold transition', contentType === key ? 'bg-white text-slate-950 shadow dark:bg-slate-800 dark:text-white' : 'text-slate-500')}>
            {label}
          </button>
        ))}
      </div>
      <input className="admin-input dark:border-slate-700 dark:bg-slate-950 dark:text-white" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un contenu..." />
      <select className="admin-input dark:border-slate-700 dark:bg-slate-950 dark:text-white" value={moduleFilter} onChange={(event) => setModuleFilter(event.target.value)}>
        <option value="all">Tous les modules</option>
        {modules.map((module) => <option key={module.id} value={module.id}>{module.title}</option>)}
      </select>
      <select className="admin-input dark:border-slate-700 dark:bg-slate-950 dark:text-white" value={trainerFilter} onChange={(event) => setTrainerFilter(event.target.value)}>
        <option value="all">Tous les formateurs</option>
        {trainers.map((trainer) => <option key={trainer.id} value={trainer.id}>{trainer.name}</option>)}
      </select>
    </div>
  )
}

function ContentTable({ type, items, onPreview, onDownload, onDelete }) {
  if (!items.length) return <Empty label="Aucun contenu." />

  return (
    <div className="overflow-hidden rounded-[24px] border border-slate-200 dark:border-slate-800">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
          <thead className="bg-slate-50 text-left text-slate-500 dark:bg-slate-950 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3">Titre</th>
              <th className="px-4 py-3">Module</th>
              <th className="px-4 py-3">Formateur</th>
              <th className="px-4 py-3">Fichier PDF</th>
              <th className="px-4 py-3">{type === 'tp' ? 'Échéance' : type === 'controles' ? 'Date' : "Date d'ajout"}</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
            {items.map((item) => (
              <tr key={item.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-800/70">
                <td className="px-4 py-4 font-bold">{item.title}</td>
                <td className="px-4 py-4">{item.module?.title ?? item.course?.module?.title ?? '-'}</td>
                <td className="px-4 py-4">{item.trainer?.name ?? '-'}</td>
                <td className="px-4 py-4">{item.document ? <Badge>{item.document.name}</Badge> : <Badge tone="danger">PDF manquant</Badge>}</td>
                <td className="px-4 py-4">{formatDate(type === 'tp' ? item.due_at : type === 'controles' ? item.scheduled_at : item.created_at)}</td>
                <td className="px-4 py-4">
                  <div className="flex flex-wrap gap-2">
                    <SmallButton onClick={() => onPreview(item)} disabled={!item.document}>Prévisualiser</SmallButton>
                    <SmallButton onClick={() => onDownload(item)} disabled={!item.document}>Télécharger</SmallButton>
                    <SmallButton danger onClick={() => onDelete(item)}>Supprimer</SmallButton>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Pagination({ page, totalPages, onPage, total }) {
  return (
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500 dark:text-slate-400">
      <p>{total} éléments</p>
      <div className="flex gap-2">
        <SmallButton onClick={() => onPage(Math.max(1, page - 1))} disabled={page === 1}>Précédent</SmallButton>
        <span className="rounded-2xl bg-slate-100 px-4 py-2 font-bold dark:bg-slate-950">{page} / {totalPages}</span>
        <SmallButton onClick={() => onPage(Math.min(totalPages, page + 1))} disabled={page === totalPages}>Suivant</SmallButton>
      </div>
    </div>
  )
}

function Panel({ title, action = null, children }) {
  return <section className="rounded-[32px] border border-white/70 bg-white/90 p-6 shadow-xl shadow-slate-200/45 dark:border-slate-800 dark:bg-slate-900/90 dark:shadow-black/20"><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h3 className="text-xl font-bold text-slate-950 dark:text-white">{title}</h3>{action}</div>{children}</section>
}

function StatCard({ label, value, accent }) {
  return <article className="overflow-hidden rounded-[28px] border border-white/70 bg-white p-5 shadow-lg shadow-slate-200/45 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/20"><div className={classNames('mb-5 h-1.5 rounded-full bg-gradient-to-r', accent)}></div><p className="text-sm font-semibold text-slate-500 dark:text-slate-400">{label}</p><strong className="mt-3 block text-3xl text-slate-950 dark:text-white">{value}</strong></article>
}

function MiniList({ title, items, field }) {
  return <div className="rounded-3xl bg-slate-50 p-4 dark:bg-slate-950/70"><h4 className="font-bold text-slate-950 dark:text-white">{title}</h4><div className="mt-3 space-y-2">{items.length ? items.map((item) => <p className="text-sm text-slate-600 dark:text-slate-300" key={item.id}>{item[field]}</p>) : <p className="text-sm text-slate-400">Aucune donnée.</p>}</div></div>
}

function CardsGrid({ items, render }) {
  if (!items.length) return <Empty label="Aucune donnée." />
  return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{items.map(render)}</div>
}

function AdminCard({ title, meta, tags = [], onEdit = null, onDelete = null }) {
  return <article className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/70"><h3 className="break-words text-lg font-bold text-slate-950 dark:text-white">{title}</h3><p className="mt-2 break-words text-sm leading-6 text-slate-500 dark:text-slate-400">{meta}</p><div className="mt-4 flex flex-wrap gap-2">{tags.slice(0, 6).map((tag) => <Badge key={tag}>{tag}</Badge>)}</div><div className="mt-5 flex gap-2">{onEdit ? <SmallButton onClick={onEdit}>Modifier</SmallButton> : null}{onDelete ? <SmallButton danger onClick={onDelete}>Supprimer</SmallButton> : null}</div></article>
}

function SettingCard({ title, text }) {
  return <article className="rounded-[28px] border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-950/70"><h3 className="text-lg font-bold text-slate-950 dark:text-white">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{text}</p></article>
}

function Input({ label, value, onChange, type = 'text' }) {
  return <label className="block"><span className="mb-2 block text-sm font-bold text-slate-700 dark:text-slate-200">{label}</span><input className="admin-input dark:border-slate-700 dark:bg-slate-950 dark:text-white" type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={label} /></label>
}

function FileInput({ label, accept, onChange }) {
  return <label className="block"><span className="mb-2 block text-sm font-bold text-slate-700 dark:text-slate-200">{label}</span><input className="admin-input dark:border-slate-700 dark:bg-slate-950 dark:text-white" type="file" accept={accept} onChange={(event) => onChange(event.target.files?.[0] ?? null)} /></label>
}

function Textarea({ label, value, onChange }) {
  return <label className="block"><span className="mb-2 block text-sm font-bold text-slate-700 dark:text-slate-200">{label}</span><textarea className="admin-input min-h-28 dark:border-slate-700 dark:bg-slate-950 dark:text-white" value={value} onChange={(event) => onChange(event.target.value)} placeholder={label}></textarea></label>
}

function Select({ label, value, onChange, options }) {
  return <label className="block"><span className="mb-2 block text-sm font-bold text-slate-700 dark:text-slate-200">{label}</span><select className="admin-input dark:border-slate-700 dark:bg-slate-950 dark:text-white" value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([valueOption, labelOption]) => <option key={valueOption} value={valueOption}>{labelOption}</option>)}</select></label>
}

function Multi({ label, value, onChange, options }) {
  return <label className="block"><span className="mb-2 block text-sm font-bold text-slate-700 dark:text-slate-200">{label}</span><select className="admin-input min-h-32 dark:border-slate-700 dark:bg-slate-950 dark:text-white" multiple value={value} onChange={(event) => onChange(Array.from(event.target.selectedOptions, (option) => option.value))}>{options.map(([valueOption, labelOption]) => <option key={valueOption} value={valueOption}>{labelOption}</option>)}</select></label>
}

function Submit({ saving, label }) {
  return <button className="primary-admin-button w-full" type="submit" disabled={saving}>{saving ? 'Enregistrement...' : label}</button>
}

function SmallButton({ children, onClick, danger = false, disabled = false }) {
  return <button className={classNames('rounded-2xl border px-3 py-2 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-50', danger ? 'border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300' : 'border-slate-200 bg-white text-slate-700 hover:border-orange-200 hover:text-orange-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200')} type="button" disabled={disabled} onClick={onClick}>{children}</button>
}

function Badge({ children, tone = 'neutral' }) {
  const color = tone === 'success' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : tone === 'danger' ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
  return <span className={classNames('inline-flex max-w-xs break-words rounded-full px-3 py-1 text-xs font-bold', color)}>{children}</span>
}

function Alert({ tone, message, onClose }) {
  return <button type="button" onClick={onClose} className={classNames('mb-4 w-full rounded-2xl px-4 py-3 text-left text-sm font-semibold', tone === 'error' ? 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300')}>{message}</button>
}

function Empty({ label }) {
  return <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-400">{label}</div>
}

function LoadingGrid() {
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }).map((_, index) => <div key={index} className="h-32 animate-pulse rounded-[28px] bg-white dark:bg-slate-900"></div>)}</div>
}

function Avatar({ user }) {
  if (user?.avatar_url) return <img src={resolveApiUrl(user.avatar_url)} alt="" className="h-20 w-20 rounded-3xl object-cover ring-4 ring-white/20" />
  return <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-white/15 text-2xl font-bold ring-4 ring-white/20">{(user?.name ?? 'A').slice(0, 1).toUpperCase()}</div>
}

function NavIcon() {
  return <span className="h-2.5 w-2.5 rounded-full bg-current opacity-70"></span>
}

function contentDeletePath(type, item) {
  if (type === 'tp') return `/practical-works/${item.id}`
  if (type === 'controles') return `/assessments/${item.id}`
  return `/courses/${item.id}`
}

function roleLabel(role) {
  return role === 'trainer' ? 'Formateur' : role === 'trainee' ? 'Stagiaire' : 'Admin'
}

function sectionTitle(key) {
  return sections.find(([section]) => section === key)?.[1] ?? 'Tableau de bord'
}

function formatDate(value) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function classNames(...values) {
  return values.filter(Boolean).join(' ')
}

function resolveApiUrl(url) {
  if (!url) return ''
  if (url.startsWith('/api')) {
    const apiBase = import.meta.env.VITE_API_URL || '/api'
    const finalUrl = url.replace('/api', apiBase)
    const buster = window.localStorage.getItem('edudev.avatar.buster') || '1'
    const separator = finalUrl.includes('?') ? '&' : '?'
    return `${finalUrl}${separator}v=${buster}`
  }
  return url
}
