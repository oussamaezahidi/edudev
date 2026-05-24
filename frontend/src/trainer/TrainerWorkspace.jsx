import { useEffect, useMemo, useState } from 'react'
import { getEffectiveDarkMode, setUserThemePreference } from '../themePreferences'
import { client as axiosClient } from '../api/client'

const trainerSections = [
  { key: 'dashboard', label: 'Tableau de bord', icon: GridIcon },
  { key: 'modules', label: 'Modules', icon: ModulesIcon },
  { key: 'courses', label: 'Cours', icon: CourseIcon },
  { key: 'tp', label: 'TP', icon: ClipboardIcon },
  { key: 'controles', label: 'Contrôles', icon: ShieldCheckIcon },
  { key: 'profile', label: 'Profil', icon: UserIcon },
]

const emptyCourseForm = {
  module_id: '',
  title: '',
  description: '',
  level: 'beginner',
  duration_hours: 12,
}

const emptyPracticalForm = {
  course_id: '',
  title: '',
  instructions: '',
  due_at: '',
}

const emptyAssessmentForm = {
  module_id: '',
  course_id: '',
  title: '',
  format: 'exam',
  scheduled_at: '',
  duration_minutes: 60,
  total_points: 20,
}

const emptyProfileForm = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  bio: '',
}

const emptyPasswordForm = {
  current_password: '',
  password: '',
  password_confirmation: '',
}

export default function TrainerWorkspace({ user, api, onLogout, settings = null }) {
  const [darkMode, setDarkMode] = useState(() => getEffectiveDarkMode(settings, user))
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [activeSection, setActiveSection] = useState('dashboard')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [workspace, setWorkspace] = useState({
    dashboard: null,
    modules: [],
    courses: [],
    practicalWorks: [],
    assessments: [],
  })
  const [courseForm, setCourseForm] = useState(emptyCourseForm)
  const [courseFile, setCourseFile] = useState(null)
  const [practicalForm, setPracticalForm] = useState(emptyPracticalForm)
  const [practicalFile, setPracticalFile] = useState(null)
  const [assessmentForm, setAssessmentForm] = useState(emptyAssessmentForm)
  const [assessmentFile, setAssessmentFile] = useState(null)
  const [editingCourse, setEditingCourse] = useState(null)
  const [editingPractical, setEditingPractical] = useState(null)
  const [editingAssessment, setEditingAssessment] = useState(null)
  const [selectedModuleId, setSelectedModuleId] = useState(null)
  const [selectedModuleDetail, setSelectedModuleDetail] = useState(null)
  const [moduleLoading, setModuleLoading] = useState(false)
  const [moduleSearch, setModuleSearch] = useState('')
  const [moduleFilter, setModuleFilter] = useState('all')
  const [courseView, setCourseView] = useState('cards')
  const [courseSearch, setCourseSearch] = useState('')
  const [courseModuleFilter, setCourseModuleFilter] = useState('all')
  const [assessmentModuleFilter, setAssessmentModuleFilter] = useState('all')
  const [profileUser, setProfileUser] = useState(user)
  const [profileForm, setProfileForm] = useState({
    ...emptyProfileForm,
    first_name: user?.first_name ?? '',
    last_name: user?.last_name ?? '',
    email: user?.email ?? '',
    phone: user?.phone ?? '',
    bio: user?.bio ?? '',
  })
  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState('')
  const [avatarDragging, setAvatarDragging] = useState(false)
  const [passwordForm, setPasswordForm] = useState(emptyPasswordForm)
  const [profileErrors, setProfileErrors] = useState({})
  const [passwordErrors, setPasswordErrors] = useState({})
  const [passwordVisibility, setPasswordVisibility] = useState({
    current: false,
    next: false,
    confirmation: false,
  })
  const [modals, setModals] = useState({
    course: false,
    practical: false,
    assessment: false,
  })
  const [previewDocument, setPreviewDocument] = useState(null)
  const [toasts, setToasts] = useState([])

  useEffect(() => {
    loadWorkspace()
  }, [])

  useEffect(() => {
    setDarkMode(getEffectiveDarkMode(settings, user))
  }, [settings, user])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
  }, [darkMode])

  useEffect(() => {
    setProfileUser(user)
    setProfileForm({
      ...emptyProfileForm,
      first_name: user?.first_name ?? '',
      last_name: user?.last_name ?? '',
      email: user?.email ?? '',
      phone: user?.phone ?? '',
      bio: user?.bio ?? '',
    })
  }, [user])

  useEffect(() => {
    return () => {
      if (previewDocument?.url) {
        URL.revokeObjectURL(previewDocument.url)
      }
    }
  }, [previewDocument])

  useEffect(() => {
    return () => {
      if (avatarPreview) {
        URL.revokeObjectURL(avatarPreview)
      }
    }
  }, [avatarPreview])

  const stats = useMemo(() => {
    const base = workspace.dashboard?.stats ?? {}

    return [
      { key: 'modules', label: 'Modules assignés', value: base.modules ?? 0 },
      { key: 'courses', label: 'Cours', value: base.courses ?? 0 },
      { key: 'practicalWorks', label: 'TP', value: base.practicalWorks ?? 0 },
      { key: 'assessments', label: 'Contrôles', value: base.assessments ?? 0 },
    ]
  }, [workspace.dashboard])

  const filteredModules = useMemo(() => {
    return workspace.modules.filter((moduleItem) => {
      const matchesFilter =
        moduleFilter === 'all' ||
        (moduleFilter === 'with_courses' && Number(moduleItem.courses_count) > 0) ||
        (moduleFilter === 'with_tp' && Number(moduleItem.practical_works_count) > 0) ||
        (moduleFilter === 'with_assessments' && Number(moduleItem.assessments_count) > 0)

      if (!moduleSearch) {
        return matchesFilter
      }

      const needle = moduleSearch.toLowerCase()

      const matchesSearch = (
        moduleItem.title.toLowerCase().includes(needle) ||
        (moduleItem.description ?? '').toLowerCase().includes(needle)
      )

      return matchesFilter && matchesSearch
    })
  }, [workspace.modules, moduleSearch, moduleFilter])

  const filteredCourses = useMemo(() => {
    return workspace.courses.filter((cours) => {
      const matchesSearch =
        !courseSearch ||
        cours.title.toLowerCase().includes(courseSearch.toLowerCase()) ||
        (cours.description ?? '').toLowerCase().includes(courseSearch.toLowerCase())
      const matchesModule =
        courseModuleFilter === 'all' || String(cours.module_id) === String(courseModuleFilter)

      return matchesSearch && matchesModule
    })
  }, [workspace.courses, courseSearch, courseModuleFilter])

  const filteredAssessments = useMemo(() => {
    return workspace.assessments.filter((assessment) => {
      return assessmentModuleFilter === 'all' || String(assessment.module_id) === String(assessmentModuleFilter)
    })
  }, [workspace.assessments, assessmentModuleFilter])

  const courseOptions = useMemo(
    () =>
      workspace.courses.map((cours) => ({
        value: String(cours.id),
        label: `${cours.title} - ${cours.module?.title ?? 'Aucun module'}`,
      })),
    [workspace.courses]
  )

  const courseOptionsForAssessment = useMemo(() => {
    return workspace.courses
      .filter((cours) => !assessmentForm.module_id || String(cours.module_id) === String(assessmentForm.module_id))
      .map((cours) => ({
        value: String(cours.id),
        label: cours.title,
      }))
  }, [workspace.courses, assessmentForm.module_id])

  function toggleDarkMode() {
    setDarkMode((value) => {
      const next = !value
      setUserThemePreference(user, next ? 'dark' : 'light')
      return next
    })
  }

  async function loadWorkspace({ silent = false } = {}) {
    if (silent) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }

    try {
      const [dashboard, modules, courses, practicalWorks, assessments, profile] = await Promise.all([
        api('/dashboard'),
        api('/trainer/modules'),
        api('/courses'),
        api('/practical-works'),
        api('/assessments'),
        api('/profile'),
      ])

      const nextWorkspace = {
        dashboard,
        modules,
        courses,
        practicalWorks,
        assessments,
      }
      setWorkspace(nextWorkspace)
      if (profile?.user) {
        setProfileUser(profile.user)
        setProfileForm({
          ...emptyProfileForm,
          first_name: profile.user.first_name ?? '',
          last_name: profile.user.last_name ?? '',
          email: profile.user.email ?? '',
          phone: profile.user.phone ?? '',
          bio: profile.user.bio ?? '',
        })
      }
    } catch (error) {
      pushToast('error', error.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  function pushToast(type, message) {
    const toast = { id: crypto.randomUUID(), type, message }
    setToasts((previous) => [...previous, toast])
    window.setTimeout(() => {
      setToasts((previous) => previous.filter((item) => item.id !== toast.id))
    }, 4000)
  }

  function closeModal(name) {
    setModals((previous) => ({ ...previous, [name]: false }))
  }

  function openModal(name) {
    setModals((previous) => ({ ...previous, [name]: true }))
  }

  function resetCourseForm() {
    setEditingCourse(null)
    setCourseFile(null)
    setCourseForm({
      ...emptyCourseForm,
      module_id: workspace.modules[0]?.id ? String(workspace.modules[0].id) : '',
    })
  }

  function resetPracticalForm() {
    setEditingPractical(null)
    setPracticalFile(null)
    setPracticalForm({
      ...emptyPracticalForm,
      course_id: workspace.courses[0]?.id ? String(workspace.courses[0].id) : '',
    })
  }

  function resetAssessmentForm() {
    setEditingAssessment(null)
    setAssessmentFile(null)
    setAssessmentForm({
      ...emptyAssessmentForm,
      module_id: workspace.modules[0]?.id ? String(workspace.modules[0].id) : '',
    })
  }

  async function submitCourse(event) {
    event.preventDefault()
    setSaving(true)

    try {
      const body = new FormData()
      body.append('module_id', courseForm.module_id)
      body.append('title', courseForm.title)
      body.append('description', courseForm.description)
      body.append('level', courseForm.level)
      body.append('duration_hours', String(courseForm.duration_hours))

      if (courseFile) {
        body.append('file', courseFile)
      }

      const path = editingCourse ? `/courses/${editingCourse.id}` : '/courses'
      const method = editingCourse ? 'PUT' : 'POST'

      if (editingCourse && !courseFile) {
        body.append('_method', 'PUT')
        await api(editingCourse ? `/courses/${editingCourse.id}` : path, { method: 'POST', body })
      } else {
        if (editingCourse) {
          body.append('_method', 'PUT')
          await api(`/courses/${editingCourse.id}`, { method: 'POST', body })
        } else {
          await api(path, { method, body })
        }
      }

      pushToast('success', editingCourse ? 'Cours modifié avec succès.' : 'Cours PDF publié avec succès.')
      closeModal('course')
      resetCourseForm()
      await loadWorkspace({ silent: true })
    } catch (error) {
      pushToast('error', error.message)
    } finally {
      setSaving(false)
    }
  }

  async function submitPractical(event) {
    event.preventDefault()
    setSaving(true)

    try {
      const body = new FormData()
      body.append('course_id', practicalForm.course_id)
      body.append('title', practicalForm.title)
      body.append('instructions', practicalForm.instructions)
      if (practicalForm.due_at) body.append('due_at', practicalForm.due_at)
      if (practicalFile) body.append('file', practicalFile)
      if (editingPractical) body.append('_method', 'PUT')

      await api(editingPractical ? `/practical-works/${editingPractical.id}` : '/practical-works', {
        method: 'POST',
        body,
      })

      pushToast('success', editingPractical ? 'TP modifié avec succès.' : 'TP créé avec succès.')
      closeModal('practical')
      resetPracticalForm()
      await loadWorkspace({ silent: true })
    } catch (error) {
      pushToast('error', error.message)
    } finally {
      setSaving(false)
    }
  }

  async function submitAssessment(event) {
    event.preventDefault()
    setSaving(true)

    try {
      const body = new FormData()
      if (assessmentForm.module_id) body.append('module_id', assessmentForm.module_id)
      if (assessmentForm.course_id) body.append('course_id', assessmentForm.course_id)
      body.append('title', assessmentForm.title)
      body.append('format', assessmentForm.format)
      if (assessmentForm.scheduled_at) body.append('scheduled_at', assessmentForm.scheduled_at)
      body.append('duration_minutes', String(assessmentForm.duration_minutes))
      body.append('total_points', String(assessmentForm.total_points))
      if (assessmentFile) body.append('file', assessmentFile)
      if (editingAssessment) body.append('_method', 'PUT')

      await api(editingAssessment ? `/assessments/${editingAssessment.id}` : '/assessments', {
        method: 'POST',
        body,
      })

      pushToast('success', editingAssessment ? 'Contrôle modifié avec succès.' : 'Contrôle créé avec succès.')
      closeModal('assessment')
      resetAssessmentForm()
      await loadWorkspace({ silent: true })
    } catch (error) {
      pushToast('error', error.message)
    } finally {
      setSaving(false)
    }
  }

  async function destroyResource(path, label) {
    if (!window.confirm(`Supprimer ${label}?`)) {
      return
    }

    try {
      await api(path, { method: 'DELETE' })
      pushToast('success', `${label} supprimé avec succès.`)
      await loadWorkspace({ silent: true })
    } catch (error) {
      pushToast('error', error.message)
    }
  }

  function beginEditCourse(cours) {
    setEditingCourse(cours)
    setCourseFile(null)
    setCourseForm({
      module_id: String(cours.module_id),
      title: cours.title,
      description: cours.description ?? '',
      level: cours.level,
      duration_hours: cours.duration_hours,
    })
    openModal('course')
  }

  function beginEditPractical(practicalWork) {
    setEditingPractical(practicalWork)
    setPracticalFile(null)
    setPracticalForm({
      course_id: String(practicalWork.course_id),
      title: practicalWork.title,
      instructions: practicalWork.instructions,
      due_at: practicalWork.due_at ? practicalWork.due_at.slice(0, 16) : '',
    })
    openModal('practical')
  }

  function beginEditAssessment(assessment) {
    setEditingAssessment(assessment)
    setAssessmentFile(null)
    setAssessmentForm({
      module_id: assessment.module_id ? String(assessment.module_id) : '',
      course_id: assessment.course_id ? String(assessment.course_id) : '',
      title: assessment.title,
      format: assessment.format,
      scheduled_at: assessment.scheduled_at ? assessment.scheduled_at.slice(0, 16) : '',
      duration_minutes: assessment.duration_minutes,
      total_points: assessment.total_points,
    })
    openModal('assessment')
  }

  async function openModuleDetail(moduleId) {
    setSelectedModuleId(moduleId)
    setModuleLoading(true)

    try {
      const detail = await api(`/trainer/modules/${moduleId}`)
      setSelectedModuleDetail(detail)
    } catch (error) {
      pushToast('error', error.message)
    } finally {
      setModuleLoading(false)
    }
  }

  function resolveUrl(url) {
    if (!url) return ''
    if (url.startsWith('/api')) {
      return url.replace('/api', '')
    }
    return url
  }

  async function openPreview(documentUrl, title) {
    try {
      const resolved = resolveUrl(documentUrl)
      const response = await axiosClient.get(resolved, {
        responseType: 'blob',
        headers: { Accept: 'application/pdf' }
      })
      const urlBlob = URL.createObjectURL(response.data)

      if (previewDocument?.url) {
        URL.revokeObjectURL(previewDocument.url)
      }

      setPreviewDocument({ url: urlBlob, title })
    } catch (error) {
      pushToast('error', 'Impossible de prévisualiser ce document pour le moment.')
    }
  }

  async function downloadProtectedFile(url, fileName) {
    try {
      const resolved = resolveUrl(url)
      const response = await axiosClient.get(resolved, {
        responseType: 'blob'
      })
      const objectUrl = URL.createObjectURL(response.data)
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = fileName
      anchor.click()
      URL.revokeObjectURL(objectUrl)
    } catch (error) {
      pushToast('error', 'Impossible de télécharger ce fichier pour le moment.')
    }
  }

  async function submitProfile(event) {
    event.preventDefault()
    const errors = validateProfileForm(profileForm)

    if (Object.keys(errors).length) {
      setProfileErrors(errors)
      return
    }

    setSaving(true)
    setProfileErrors({})

    try {
      const body = new FormData()
      body.append('first_name', profileForm.first_name)
      body.append('last_name', profileForm.last_name)
      body.append('email', profileForm.email)
      if (profileForm.phone) body.append('phone', profileForm.phone)
      if (profileForm.bio) body.append('bio', profileForm.bio)
      if (avatarFile) {
        body.append('avatar', avatarFile)
      }

      const data = await api('/profile', {
        method: 'POST',
        body,
      })

      if (data?.user) {
        window.localStorage.setItem('edudev.avatar.buster', Date.now())
        setProfileUser(data.user)
        setProfileForm({
          ...emptyProfileForm,
          first_name: data.user.first_name ?? '',
          last_name: data.user.last_name ?? '',
          email: data.user.email ?? '',
          phone: data.user.phone ?? '',
          bio: data.user.bio ?? '',
        })
      }

      setAvatarFile(null)
      setAvatarPreview('')
      pushToast('success', 'Profil mis à jour avec succès.')
    } catch (error) {
      pushToast('error', error.message)
    } finally {
      setSaving(false)
    }
  }

  async function submitPassword(event) {
    event.preventDefault()
    const errors = validatePasswordForm(passwordForm)

    if (Object.keys(errors).length) {
      setPasswordErrors(errors)
      return
    }

    setSaving(true)
    setPasswordErrors({})

    try {
      await api('/profile/password', {
        method: 'PUT',
        body: JSON.stringify(passwordForm),
      })

      setPasswordForm(emptyPasswordForm)
      pushToast('success', 'Mot de passe mis à jour avec succès.')
    } catch (error) {
      pushToast('error', error.message)
    } finally {
      setSaving(false)
    }
  }

  function handleAvatarFile(file) {
    if (!file) {
      if (avatarPreview) {
        URL.revokeObjectURL(avatarPreview)
      }
      setAvatarFile(null)
      setAvatarPreview('')
      return
    }

    if (!file.type.startsWith('image/')) {
      setProfileErrors((previous) => ({ ...previous, avatar: 'Veuillez sélectionner une image valide.' }))
      return
    }

    if (file.size > 4 * 1024 * 1024) {
      setProfileErrors((previous) => ({ ...previous, avatar: 'La photo ne doit pas dépasser 4 Mo.' }))
      return
    }

    if (avatarPreview) {
      URL.revokeObjectURL(avatarPreview)
    }

    setProfileErrors((previous) => {
      const next = { ...previous }
      delete next.avatar
      return next
    })
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  function resetProfileForm() {
    if (avatarPreview) {
      URL.revokeObjectURL(avatarPreview)
    }
    setAvatarFile(null)
    setAvatarPreview('')
    setProfileErrors({})
    setProfileForm({
      ...emptyProfileForm,
      first_name: currentUser?.first_name ?? '',
      last_name: currentUser?.last_name ?? '',
      email: currentUser?.email ?? '',
      phone: currentUser?.phone ?? '',
      bio: currentUser?.bio ?? '',
    })
  }

  const wrapperClass = darkMode ? 'dark' : ''
  const platformName = settings?.general?.platform_name ?? 'EduDev'
  const currentUser = profileUser ?? user

  return (
    <div className={wrapperClass}>
      <div className="min-h-screen bg-slate-100 text-slate-900 transition-colors duration-300 dark:bg-slate-950 dark:text-slate-50">
        <ToastStack toasts={toasts} />

        <div className="flex min-h-screen">
          <aside
            className={classNames(
              'fixed inset-y-0 left-0 z-40 w-72 border-r border-white/50 bg-white/90 p-5 shadow-2xl shadow-slate-200/60 backdrop-blur-xl transition-transform duration-300 dark:border-slate-800 dark:bg-slate-900/90 dark:shadow-black/20 lg:static lg:translate-x-0',
              mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
            )}
          >
            <div className="mb-8 flex flex-col items-center gap-2 text-center">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-orange-400 text-white shadow-lg shadow-orange-500/25">
                <CourseIcon className="h-6 w-6" />
              </div>
              <div className="flex flex-col items-center">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-orange-500">{platformName}</p>
                <h1 className="text-sm font-bold leading-snug text-slate-900 dark:text-white">Espace<br /><span className="whitespace-nowrap">formateur</span></h1>
              </div>
            </div>

            <div className="mb-8 rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-orange-500 p-5 text-white shadow-xl shadow-slate-900/20">
              <h2 className="text-2xl font-semibold">{currentUser?.name}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-200">
                Gérez vos modules, publiez vos ressources PDF et pilotez votre espace pédagogique depuis une interface claire.
              </p>
            </div>

            <nav className="space-y-2">
              {trainerSections.map((item) => (
                <SidebarLink
                  key={item.key}
                  active={activeSection === item.key}
                  label={item.label}
                  onClick={() => {
                    setActiveSection(item.key)
                    setMobileMenuOpen(false)
                  }}
                  icon={item.icon}
                />
              ))}
            </nav>

            <div className="mt-8 rounded-3xl border border-slate-200/70 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-950/70">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">Mode sombre</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Confortable pour les longues sessions de correction.</p>
                </div>
                <button
                  type="button"
                  onClick={toggleDarkMode}
                  className={classNames(
                    'relative inline-flex h-7 w-12 items-center rounded-full transition',
                    darkMode ? 'bg-orange-500' : 'bg-slate-300'
                  )}
                >
                  <span
                    className={classNames(
                      'inline-block h-5 w-5 rounded-full bg-white shadow transition',
                      darkMode ? 'translate-x-6' : 'translate-x-1'
                    )}
                  ></span>
                </button>
              </div>
            </div>
          </aside>

          <div className="flex-1 lg:pl-0">
            <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
              <header className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-[28px] border border-white/70 bg-white/85 px-5 py-4 shadow-xl shadow-slate-200/40 backdrop-blur dark:border-slate-800 dark:bg-slate-900/85 dark:shadow-black/20">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setMobileMenuOpen((value) => !value)}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm lg:hidden dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  >
                    <MenuIcon className="h-5 w-5" />
                  </button>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-500">{platformName}</p>
                    <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">
                      {trainerSections.find((item) => item.key === activeSection)?.label}
                    </h2>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => loadWorkspace({ silent: true })}
                    className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-orange-200 hover:text-orange-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <RefreshIcon className={classNames('h-4 w-4', refreshing ? 'animate-spin' : '')} />
                    Actualiser
                  </button>
                  <button
                    type="button"
                    onClick={onLogout}
                    className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-orange-500 to-orange-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-orange-500/25 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-orange-500/30"
                  >
                    <LogoutIcon className="h-4 w-4" />
                    Déconnexion
                  </button>
                </div>
              </header>

              {loading ? (
                <LoadingState />
              ) : (
                <>
                  {activeSection === 'dashboard' ? (
                    <DashboardSection
                      stats={stats}
                      modules={workspace.modules}
                      courses={workspace.courses}
                      practicalWorks={workspace.practicalWorks}
                      assessments={workspace.assessments}
                      onPreviewDocument={(document, title) => document && openPreview(document.preview_url, title)}
                    />
                  ) : null}

                  {activeSection === 'modules' ? (
                    <section className="grid gap-6 xl:grid-cols-[1.15fr,0.85fr]">
                      <Panel>
                        <SectionHeader
                          eyebrow="Catalogue assigné"
                          title="Vos modules"
                          description="Seuls les modules qui vous sont assignés apparaissent ici, avec un accès rapide aux ressources liées."
                        />

                        <div className="mb-6">
                          <div className="flex flex-wrap gap-3">
                            <SearchField
                              value={moduleSearch}
                              onChange={setModuleSearch}
                              placeholder="Rechercher un module..."
                            />
                            <SelectBox
                              value={moduleFilter}
                              onChange={setModuleFilter}
                              options={[
                                { value: 'all', label: 'Tous les modules' },
                                { value: 'with_courses', label: 'Avec cours' },
                                { value: 'with_tp', label: 'Avec TP' },
                                { value: 'with_assessments', label: 'Avec contrôles' },
                              ]}
                            />
                          </div>
                        </div>

                        {filteredModules.length ? (
                          <div className="grid gap-4 md:grid-cols-2">
                            {filteredModules.map((moduleItem) => (
                              <button
                                key={moduleItem.id}
                                type="button"
                                onClick={() => openModuleDetail(moduleItem.id)}
                                className={classNames(
                                  'group rounded-3xl border p-5 text-left transition',
                                  selectedModuleId === moduleItem.id
                                    ? 'border-orange-300 bg-orange-50/80 shadow-lg shadow-orange-100 dark:border-orange-500/40 dark:bg-orange-500/10 dark:shadow-none'
                                    : 'border-slate-200 bg-white hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-xl dark:border-slate-800 dark:bg-slate-950/50 dark:hover:border-slate-700'
                                )}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{moduleItem.title}</h3>
                                    <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                                      {moduleItem.description || 'Aucune description disponible pour ce module.'}
                                    </p>
                                  </div>
                                  <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
                                    {moduleItem.courses_count}
                                  </span>
                                </div>
                                <div className="mt-4 flex flex-wrap gap-2 text-xs">
                                  <MiniPill label={`${moduleItem.practical_works_count} TP`} />
                                  <MiniPill label={`${moduleItem.assessments_count} contrôles`} />
                                </div>
                              </button>
                            ))}
                          </div>
                      ) : (
                        <EmptyState
                          title={workspace.modules.length ? 'Aucun module trouvé' : 'Aucun module assigné'}
                          description={
                            workspace.modules.length
                              ? 'Essayez un autre mot-clé pour retrouver un module.'
                              : "Quand l'administration vous assignera un module, il apparaîtra ici avec ses cours et ressources."
                          }
                        />
                      )}
                      </Panel>

                      <Panel>
                        <SectionHeader
                          eyebrow="Détails du module"
                          title={selectedModuleDetail?.title ?? 'Sélectionnez un module'}
                          description={
                            selectedModuleDetail?.description ??
                            'Ouvrez un module pour consulter ses cours, TP et contrôles dans un panneau dédié.'
                          }
                        />

                        {moduleLoading ? (
                          <div className="space-y-3">
                            <SkeletonBlock />
                            <SkeletonBlock />
                            <SkeletonBlock />
                          </div>
                        ) : selectedModuleDetail ? (
                          <div className="space-y-5">
                            <div className="grid gap-3 sm:grid-cols-3">
                              <CompactMetric label="Cours" value={selectedModuleDetail.courses_count} />
                              <CompactMetric label="TP" value={selectedModuleDetail.practical_works_count} />
                              <CompactMetric label="Contrôles" value={selectedModuleDetail.assessments_count} />
                            </div>

                            <div className="space-y-4">
                              {selectedModuleDetail.courses?.map((cours) => (
                                <article
                                  key={cours.id}
                                  className="rounded-3xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/60"
                                >
                                  <div className="flex items-center justify-between gap-3">
                                    <div>
                                      <h4 className="font-semibold text-slate-900 dark:text-white">{cours.title}</h4>
                                      <p className="text-sm text-slate-500 dark:text-slate-400">
                                        {cours.practical_works_count} TP - {cours.assessments_count} contrôles
                                      </p>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => setActiveSection('courses')}
                                      className="rounded-2xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-orange-200 hover:text-orange-600 dark:border-slate-700 dark:text-slate-200"
                                    >
                                      Ouvrir le cours
                                    </button>
                                  </div>
                                </article>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <EmptyState
                            title="Panneau de détail du module"
                            description="Cliquez sur un module pour voir ses ressources internes."
                          />
                        )}
                      </Panel>
                    </section>
                  ) : null}

                  {activeSection === 'courses' ? (
                    <Panel>
                      <SectionHeader
                        eyebrow="Publication des cours"
                        title="Cours PDF"
                        description="Publiez des documents PDF sécurisés, prévisualisez-les et organisez votre catalogue par module."
                        action={
                          <button
                            type="button"
                            onClick={() => {
                              resetCourseForm()
                              openModal('course')
                            }}
                            className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-orange-500 to-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-orange-500/25 transition hover:-translate-y-0.5"
                          >
                            <PlusIcon className="h-4 w-4" />
                            Publier un cours
                          </button>
                        }
                      />

                      <div className="mb-6 flex flex-wrap items-center gap-3">
                        <SearchField
                          value={courseSearch}
                          onChange={setCourseSearch}
                          placeholder="Rechercher un cours..."
                        />
                        <SelectBox
                          value={courseModuleFilter}
                          onChange={setCourseModuleFilter}
                          options={[
                            { value: 'all', label: 'Tous les modules' },
                            ...workspace.modules.map((moduleItem) => ({
                              value: String(moduleItem.id),
                              label: moduleItem.title,
                            })),
                          ]}
                        />
                        <div className="ml-auto inline-flex rounded-2xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-800 dark:bg-slate-950">
                          <TogglePill active={courseView === 'cards'} onClick={() => setCourseView('cards')}>
                            Cartes
                          </TogglePill>
                          <TogglePill active={courseView === 'table'} onClick={() => setCourseView('table')}>
                            Tableau
                          </TogglePill>
                        </div>
                      </div>

                      {filteredCourses.length ? (
                        courseView === 'cards' ? (
                          <div className="grid gap-5 xl:grid-cols-2">
                            {filteredCourses.map((cours) => (
                              <CourseCard
                                key={cours.id}
                                cours={cours}
                                onPreview={() => cours.document && openPreview(cours.document.preview_url, cours.title)}
                                onDownload={() =>
                                  cours.document && downloadProtectedFile(cours.document.download_url, cours.document.name)
                                }
                                onEdit={() => beginEditCourse(cours)}
                                onDelete={() => destroyResource(`/courses/${cours.id}`, 'cours')}
                              />
                            ))}
                          </div>
                        ) : (
                          <CourseTable
                            courses={filteredCourses}
                            onPreview={(cours) => cours.document && openPreview(cours.document.preview_url, cours.title)}
                            onDownload={(cours) =>
                              cours.document && downloadProtectedFile(cours.document.download_url, cours.document.name)
                            }
                            onEdit={beginEditCourse}
                            onDelete={(cours) => destroyResource(`/courses/${cours.id}`, 'cours')}
                          />
                        )
                      ) : (
                        <EmptyState
                          title="Aucun cours trouvé"
                          description="Essayez une autre recherche, changez de module ou publiez un nouveau cours PDF."
                        />
                      )}
                    </Panel>
                  ) : null}

                  {activeSection === 'tp' ? (
                    <Panel>
                      <SectionHeader
                        eyebrow="Travaux pratiques"
                        title="Gestion des TP"
                        description="Ajoutez des TP PDF, associez-les à vos cours et organisez vos ressources pédagogiques."
                        action={
                          <button
                            type="button"
                            onClick={() => {
                              resetPracticalForm()
                              openModal('practical')
                            }}
                            className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-orange-500 to-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-orange-500/25 transition hover:-translate-y-0.5"
                          >
                            <PlusIcon className="h-4 w-4" />
                            Nouveau TP
                          </button>
                        }
                      />

                      {workspace.practicalWorks.length ? (
                        <div className="grid gap-5 xl:grid-cols-2">
                          {workspace.practicalWorks.map((practicalWork) => (
                            <article
                              key={practicalWork.id}
                              className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl dark:border-slate-800 dark:bg-slate-950/60"
                            >
                              <div className="flex flex-wrap items-start justify-between gap-4">
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-orange-500">
                                    {practicalWork.module?.title ?? practicalWork.course?.module?.title ?? 'Module'}
                                  </p>
                                  <h3 className="mt-2 break-words text-lg font-semibold leading-tight text-slate-900 dark:text-white">{practicalWork.title}</h3>
                                  <p className="mt-2 break-words text-sm leading-6 text-slate-500 dark:text-slate-400">{practicalWork.instructions}</p>
                                </div>
                                <StatusBadge tone={isEcheanceNear(practicalWork.due_at) ? 'warning' : 'neutral'}>
                                  {practicalWork.due_at ? formatDate(practicalWork.due_at) : 'Aucune échéance'}
                                </StatusBadge>
                              </div>
                              <div className="mt-5 flex flex-wrap gap-2 text-xs">
                                <MiniPill label={practicalWork.course?.title ?? 'Aucun cours'} />
                              </div>
                              <div className="mt-6 flex flex-wrap gap-2">
                                <ActionButton
                                  onClick={() =>
                                    practicalWork.document &&
                                    openPreview(practicalWork.document.preview_url, practicalWork.title)
                                  }
                                  disabled={!practicalWork.document}
                                >
                                  Prévisualiser le PDF
                                </ActionButton>
                                <ActionButton
                                  onClick={() =>
                                    practicalWork.document &&
                                    downloadProtectedFile(practicalWork.document.download_url, practicalWork.document.name)
                                  }
                                  disabled={!practicalWork.document}
                                >
                                  Télécharger
                                </ActionButton>
                                <ActionButton onClick={() => beginEditPractical(practicalWork)}>Modifier</ActionButton>
                                <ActionButton tone="danger" onClick={() => destroyResource(`/practical-works/${practicalWork.id}`, 'TP')}>
                                  Supprimer
                                </ActionButton>
                              </div>
                            </article>
                          ))}
                        </div>
                      ) : (
                        <EmptyState
                          title="Aucun TP créé"
                          description="Ajoutez votre premier TP PDF pour le rendre disponible dans votre espace de formation."
                        />
                      )}
                    </Panel>
                  ) : null}

                  {activeSection === 'controles' ? (
                    <Panel>
                      <SectionHeader
                        eyebrow="Documents d'évaluation"
                        title="Contrôles"
                        description="Publiez des contrôles PDF par module, avec aperçu et téléchargement, sans examen en ligne."
                        action={
                          <button
                            type="button"
                            onClick={() => {
                              resetAssessmentForm()
                              openModal('assessment')
                            }}
                            className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-orange-500 to-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-orange-500/25 transition hover:-translate-y-0.5"
                          >
                            <PlusIcon className="h-4 w-4" />
                            Nouveau contrôle
                          </button>
                        }
                      />

                      <div className="mb-6">
                        <SelectBox
                          value={assessmentModuleFilter}
                          onChange={setAssessmentModuleFilter}
                          options={[
                            { value: 'all', label: 'Tous les modules' },
                            ...workspace.modules.map((moduleItem) => ({
                              value: String(moduleItem.id),
                              label: moduleItem.title,
                            })),
                          ]}
                        />
                      </div>

                      {filteredAssessments.length ? (
                        <div className="grid gap-5 xl:grid-cols-2">
                          {filteredAssessments.map((assessment) => (
                            <article
                              key={assessment.id}
                              className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl dark:border-slate-800 dark:bg-slate-950/60"
                            >
                              <div className="flex flex-wrap items-start justify-between gap-4">
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-orange-500">
                                    {assessment.module?.title ?? 'Module'}
                                  </p>
                                  <h3 className="mt-2 break-words text-lg font-semibold leading-tight text-slate-900 dark:text-white">{assessment.title}</h3>
                                  <p className="mt-2 break-words text-sm text-slate-500 dark:text-slate-400">
                                    {assessment.course?.title ?? 'Contrôle général du module'}
                                  </p>
                                </div>
                                <StatusBadge tone={assessment.document ? 'success' : 'warning'}>
                                  {assessment.document ? 'PDF prêt' : 'PDF manquant'}
                                </StatusBadge>
                              </div>
                              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                                <CompactMetric label="Date du document" value={assessment.scheduled_at ? formatDate(assessment.scheduled_at) : 'Non planifiée'} />
                                <CompactMetric label="Cours associé" value={assessment.course?.title ?? 'Module uniquement'} />
                              </div>
                              <div className="mt-6 flex flex-wrap gap-2">
                                <ActionButton
                                  onClick={() =>
                                    assessment.document &&
                                    openPreview(assessment.document.preview_url, assessment.title)
                                  }
                                  disabled={!assessment.document}
                                >
                                  Prévisualiser le PDF
                                </ActionButton>
                                <ActionButton
                                  onClick={() =>
                                    assessment.document &&
                                    downloadProtectedFile(assessment.document.download_url, assessment.document.name)
                                  }
                                  disabled={!assessment.document}
                                >
                                  Télécharger
                                </ActionButton>
                                <ActionButton onClick={() => beginEditAssessment(assessment)}>Modifier</ActionButton>
                                <ActionButton tone="danger" onClick={() => destroyResource(`/assessments/${assessment.id}`, 'contrôle')}>
                                  Supprimer
                                </ActionButton>
                              </div>
                            </article>
                          ))}
                        </div>
                      ) : (
                        <EmptyState
                          title="Aucun contrôle"
                          description="Créez un contrôle et associez-le à l'un de vos modules."
                        />
                      )}
                    </Panel>
                  ) : null}

                  {activeSection === 'profile' ? (
                    <section className="space-y-6">
                      <ProfileHero
                        user={currentUser}
                        modulesCount={workspace.modules.length}
                        coursesCount={workspace.courses.length}
                        avatarPreview={avatarPreview}
                      />

                      <div className="grid gap-6 xl:grid-cols-[1.05fr,0.95fr]">
                        <ProfileCard
                          title="Informations du profil"
                          eyebrow="Identité formateur"
                          description="Gardez vos coordonnées publiques propres et cohérentes avec le reste du tableau de bord."
                        >
                          <form className="space-y-5" onSubmit={submitProfile}>
                            <div className="grid gap-4 md:grid-cols-2">
                              <InputField
                                label="Prénom"
                                value={profileForm.first_name}
                                onChange={(value) => {
                                  setProfileForm((previous) => ({ ...previous, first_name: value }))
                                  setProfileErrors((previous) => ({ ...previous, first_name: '' }))
                                }}
                                placeholder="Votre prénom"
                                error={profileErrors.first_name}
                              />
                              <InputField
                                label="Nom"
                                value={profileForm.last_name}
                                onChange={(value) => {
                                  setProfileForm((previous) => ({ ...previous, last_name: value }))
                                  setProfileErrors((previous) => ({ ...previous, last_name: '' }))
                                }}
                                placeholder="Votre nom"
                                error={profileErrors.last_name}
                              />
                            </div>

                            <div className="grid gap-4 md:grid-cols-2">
                              <InputField
                                label="Adresse email"
                                type="email"
                                value={profileForm.email}
                                onChange={(value) => {
                                  setProfileForm((previous) => ({ ...previous, email: value }))
                                  setProfileErrors((previous) => ({ ...previous, email: '' }))
                                }}
                                placeholder="email@exemple.com"
                                error={profileErrors.email}
                              />
                              <InputField
                                label="Téléphone"
                                type="tel"
                                value={profileForm.phone}
                                onChange={(value) => setProfileForm((previous) => ({ ...previous, phone: value }))}
                                placeholder="+212 6XX XXX XXX"
                              />
                            </div>

                            <TextAreaField
                              label="Bio / Présentation"
                              value={profileForm.bio}
                              onChange={(value) => setProfileForm((previous) => ({ ...previous, bio: value }))}
                              placeholder="Décrivez votre parcours, vos spécialités ou votre expérience..."
                              rows={3}
                            />

                            <AvatarDropzone
                              user={currentUser}
                              previewUrl={avatarPreview}
                              file={avatarFile}
                              dragging={avatarDragging}
                              error={profileErrors.avatar}
                              onDragging={setAvatarDragging}
                              onFile={handleAvatarFile}
                              onClear={() => handleAvatarFile(null)}
                            />

                            <div className="grid gap-3 sm:grid-cols-3">
                              <CompactMetric label="Rôle" value="Formateur" />
                              <CompactMetric label="Modules assignés" value={workspace.modules.length} />
                              <CompactMetric label="Cours publiés" value={workspace.courses.length} />
                            </div>

                            <ProfileActions
                              saving={saving}
                              submitLabel="Enregistrer le profil"
                              onReset={resetProfileForm}
                            />
                          </form>
                        </ProfileCard>

                        <ProfileCard
                          title="Sécurité du compte"
                          eyebrow="Mot de passe"
                          description="Mettez à jour vos accès avec une confirmation claire et des champs protégés."
                          icon={ShieldCheckIcon}
                        >
                          <form className="space-y-5" onSubmit={submitPassword}>
                            <PasswordField
                              label="Mot de passe actuel"
                              value={passwordForm.current_password}
                              visible={passwordVisibility.current}
                              autoComplete="current-password"
                              error={passwordErrors.current_password}
                              onToggle={() => setPasswordVisibility((previous) => ({ ...previous, current: !previous.current }))}
                              onChange={(value) => {
                                setPasswordForm((previous) => ({ ...previous, current_password: value }))
                                setPasswordErrors((previous) => ({ ...previous, current_password: '' }))
                              }}
                            />
                            <PasswordField
                              label="Nouveau mot de passe"
                              value={passwordForm.password}
                              visible={passwordVisibility.next}
                              autoComplete="new-password"
                              error={passwordErrors.password}
                              onToggle={() => setPasswordVisibility((previous) => ({ ...previous, next: !previous.next }))}
                              onChange={(value) => {
                                setPasswordForm((previous) => ({ ...previous, password: value }))
                                setPasswordErrors((previous) => ({ ...previous, password: '' }))
                              }}
                            />
                            <PasswordField
                              label="Confirmation du mot de passe"
                              value={passwordForm.password_confirmation}
                              visible={passwordVisibility.confirmation}
                              autoComplete="new-password"
                              error={passwordErrors.password_confirmation}
                              onToggle={() => setPasswordVisibility((previous) => ({ ...previous, confirmation: !previous.confirmation }))}
                              onChange={(value) => {
                                setPasswordForm((previous) => ({ ...previous, password_confirmation: value }))
                                setPasswordErrors((previous) => ({ ...previous, password_confirmation: '' }))
                              }}
                            />

                            <div className="rounded-[24px] border border-orange-200/80 bg-orange-50/80 p-4 text-sm leading-6 text-orange-800 dark:border-orange-500/20 dark:bg-orange-500/10 dark:text-orange-200">
                              Utilisez au moins 8 caractères. La mise à jour reste gérée par l'API sécurisée existante.
                            </div>

                            <ProfileActions
                              saving={saving}
                              submitLabel="Mettre à jour le mot de passe"
                              onReset={() => {
                                setPasswordForm(emptyPasswordForm)
                                setPasswordErrors({})
                              }}
                            />
                          </form>
                        </ProfileCard>
                      </div>
                    </section>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </div>

        <Modal open={modals.course} onClose={() => closeModal('course')} title={editingCourse ? 'Modifier cours' : 'Publier un nouveau cours'}>
          <form className="space-y-4" onSubmit={submitCourse}>
            <SelectField
              label="Module"
              value={courseForm.module_id}
              onChange={(value) => setCourseForm((previous) => ({ ...previous, module_id: value }))}
              options={workspace.modules.map((moduleItem) => ({ value: String(moduleItem.id), label: moduleItem.title }))}
            />
            <InputField
              label="Titre"
              value={courseForm.title}
              onChange={(value) => setCourseForm((previous) => ({ ...previous, title: value }))}
              placeholder="Concepts avances d'API Laravel"
            />
            <TextAreaField
              label="Description"
              value={courseForm.description}
              onChange={(value) => setCourseForm((previous) => ({ ...previous, description: value }))}
              placeholder="Ajoutez une presentation claire de cette ressource PDF."
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                label="Niveau"
                value={courseForm.level}
                onChange={(value) => setCourseForm((previous) => ({ ...previous, level: value }))}
                options={[
                  { value: 'beginner', label: 'Débutant' },
                  { value: 'intermediate', label: 'Intermédiaire' },
                  { value: 'advanced', label: 'Avancé' },
                ]}
              />
              <InputField
                label="Durée (heures)"
                type="number"
                value={courseForm.duration_hours}
                onChange={(value) => setCourseForm((previous) => ({ ...previous, duration_hours: value }))}
              />
            </div>
            <FileField
              label={editingCourse ? 'Remplacer le PDF (optionnel)' : 'Document PDF'}
              helper="PDF uniquement - max 20 Mo"
              accept="application/pdf"
              onChange={(file) => {
                if (file) {
                  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
                    pushToast('error', 'Le fichier doit être au format PDF.')
                    return false
                  }
                  if (file.size > 20 * 1024 * 1024) {
                    pushToast('error', 'Le fichier ne doit pas dépasser 20 Mo.')
                    return false
                  }
                }
                setCourseFile(file)
                return true
              }}
            />
            <ModalActions
              saving={saving}
              submitLabel={editingCourse ? 'Enregistrer les modifications' : 'Ajouter / Publier le cours PDF'}
              onAnnuler={() => {
                closeModal('course')
                resetCourseForm()
              }}
            />
          </form>
        </Modal>

        <Modal open={modals.practical} onClose={() => closeModal('practical')} title={editingPractical ? 'Modifier TP' : 'Créer un TP'}>
          <form className="space-y-4" onSubmit={submitPractical}>
            <SelectField
              label="Cours"
              value={practicalForm.course_id}
              onChange={(value) => setPracticalForm((previous) => ({ ...previous, course_id: value }))}
              options={courseOptions}
            />
            <InputField
              label="Titre"
              value={practicalForm.title}
              onChange={(value) => setPracticalForm((previous) => ({ ...previous, title: value }))}
              placeholder="Ressources du TP API"
            />
            <TextAreaField
              label="Description"
              value={practicalForm.instructions}
              onChange={(value) => setPracticalForm((previous) => ({ ...previous, instructions: value }))}
              placeholder="Décrivez clairement le contenu du TP PDF et les attentes pédagogiques."
            />
            <InputField
              label="Échéance (optionnelle)"
              type="datetime-local"
              value={practicalForm.due_at}
              onChange={(value) => setPracticalForm((previous) => ({ ...previous, due_at: value }))}
            />
            <FileField
              label={editingPractical ? 'Remplacer le PDF (optionnel)' : 'Document PDF du TP'}
              helper="PDF uniquement - max 20 Mo"
              accept="application/pdf"
              onChange={(file) => {
                if (file) {
                  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
                    pushToast('error', 'Le fichier doit être au format PDF.')
                    return false
                  }
                  if (file.size > 20 * 1024 * 1024) {
                    pushToast('error', 'Le fichier ne doit pas dépasser 20 Mo.')
                    return false
                  }
                }
                setPracticalFile(file)
                return true
              }}
            />
            <ModalActions
              saving={saving}
              submitLabel={editingPractical ? 'Enregistrer le TP' : 'Ajouter le TP'}
              onAnnuler={() => {
                closeModal('practical')
                resetPracticalForm()
              }}
            />
          </form>
        </Modal>

        <Modal open={modals.assessment} onClose={() => closeModal('assessment')} title={editingAssessment ? 'Modifier le contrôle' : 'Créer un contrôle'}>
          <form className="space-y-4" onSubmit={submitAssessment}>
            <SelectField
              label="Module"
              value={assessmentForm.module_id}
              onChange={(value) =>
                setAssessmentForm((previous) => ({
                  ...previous,
                  module_id: value,
                  course_id:
                    previous.course_id &&
                    workspace.courses.some((cours) => String(cours.id) === String(previous.course_id) && String(cours.module_id) === value)
                      ? previous.course_id
                      : '',
                }))
              }
              options={workspace.modules.map((moduleItem) => ({ value: String(moduleItem.id), label: moduleItem.title }))}
            />
            <SelectField
              label="Cours (optionnel)"
              value={assessmentForm.course_id}
              onChange={(value) => setAssessmentForm((previous) => ({ ...previous, course_id: value }))}
              options={[{ value: '', label: 'Contrôle général du module' }, ...courseOptionsForAssessment]}
            />
            <InputField
              label="Titre"
              value={assessmentForm.title}
              onChange={(value) => setAssessmentForm((previous) => ({ ...previous, title: value }))}
            />
            <InputField
              label="Date du contrôle (optionnelle)"
              type="datetime-local"
              value={assessmentForm.scheduled_at}
              onChange={(value) => setAssessmentForm((previous) => ({ ...previous, scheduled_at: value }))}
            />
            <FileField
              label={editingAssessment ? 'Remplacer le PDF (optionnel)' : 'Document PDF du contrôle'}
              helper="PDF uniquement - max 20 Mo"
              accept="application/pdf"
              onChange={(file) => {
                if (file) {
                  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
                    pushToast('error', 'Le fichier doit être au format PDF.')
                    return false
                  }
                  if (file.size > 20 * 1024 * 1024) {
                    pushToast('error', 'Le fichier ne doit pas dépasser 20 Mo.')
                    return false
                  }
                }
                setAssessmentFile(file)
                return true
              }}
            />
            <ModalActions
              saving={saving}
              submitLabel={editingAssessment ? 'Enregistrer le contrôle' : 'Ajouter le contrôle'}
              onAnnuler={() => {
                closeModal('assessment')
                resetAssessmentForm()
              }}
            />
          </form>
        </Modal>

        <Modal open={Boolean(previewDocument)} onClose={() => setPreviewDocument(null)} title={previewDocument?.title ?? 'Prévisualisation du document'} width="max-w-6xl">
          {previewDocument ? (
            <iframe
              title={previewDocument.title}
              src={previewDocument.url}
              className="h-[70vh] w-full rounded-3xl border border-slate-200 dark:border-slate-800"
            ></iframe>
          ) : null}
        </Modal>
      </div>
    </div>
  )
}

function DashboardSection({ stats, modules, courses, practicalWorks, assessments, onPreviewDocument }) {
  const recentResources = [
    ...courses.map((item) => ({
      id: `course-${item.id}`,
      type: 'Cours PDF',
      title: item.title,
      module: item.module?.title ?? 'Aucun module',
      date: item.created_at,
      document: item.document,
    })),
    ...practicalWorks.map((item) => ({
      id: `tp-${item.id}`,
      type: 'TP PDF',
      title: item.title,
      module: item.module?.title ?? item.course?.module?.title ?? 'Aucun module',
      date: item.created_at,
      document: item.document,
    })),
    ...assessments.map((item) => ({
      id: `assessment-${item.id}`,
      type: 'Contrôle PDF',
      title: item.title,
      module: item.module?.title ?? 'Aucun module',
      date: item.created_at,
      document: item.document,
    })),
  ]
    .filter((item) => item.document)
    .sort((left, right) => new Date(right.date ?? 0).getTime() - new Date(left.date ?? 0).getTime())
    .slice(0, 6)

  return (
    <section className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat, index) => (
          <TrainerStatCard
            key={stat.key}
            label={stat.label}
            value={stat.value}
            accent={index === 0 ? 'from-orange-500 to-amber-400' : index === 1 ? 'from-cyan-500 to-blue-500' : index === 2 ? 'from-emerald-500 to-teal-500' : 'from-fuchsia-500 to-rose-500'}
            icon={index === 0 ? ModulesIcon : index === 1 ? CourseIcon : index === 2 ? ClipboardIcon : ShieldCheckIcon}
          />
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr,1.05fr]">
        <Panel>
          <SectionHeader
            eyebrow="Modules"
            title="Modules assignés"
            description="Un seul espace clair pour retrouver vos modules actifs, leurs descriptions et leur volume de contenu."
          />
          {modules.length ? (
            <div className="grid gap-4 md:grid-cols-2">
              {modules.slice(0, 6).map((moduleItem) => (
                <ModuleSummaryCard key={moduleItem.id} module={moduleItem} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="Aucun module assigné"
              description="Vos modules apparaîtront ici dès qu'une affectation sera disponible."
              icon={ModulesIcon}
            />
          )}
        </Panel>

        <Panel>
          <SectionHeader
            eyebrow="Bibliothèque"
            title="Ressources récentes"
            description="Vos derniers cours, TP et contrôles PDF publiés, avec accès direct à la prévisualisation."
          />
          {recentResources.length ? (
            <div className="space-y-3">
              {recentResources.map((item) => (
                <RecentResourceCard key={item.id} item={item} onPreview={() => onPreviewDocument(item.document, item.title)} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="Aucune ressource récente"
              description="Les derniers fichiers PDF publiés s'afficheront ici avec leur module et leur date d'ajout."
              icon={SparkIcon}
            />
          )}
        </Panel>
      </div>
    </section>
  )
}

function Panel({ children }) {
  return (
    <section className="rounded-[32px] border border-white/70 bg-white/90 p-6 shadow-xl shadow-slate-200/40 backdrop-blur dark:border-slate-800 dark:bg-slate-900/85 dark:shadow-black/20">
      {children}
    </section>
  )
}

function SectionHeader({ eyebrow, title, description, action = null }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-500">{eyebrow}</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{title}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p>
      </div>
      {action}
    </div>
  )
}

function TrainerStatCard({ label, value, accent, icon: Icon }) {
  return (
    <article className="group overflow-hidden rounded-[28px] border border-white/70 bg-white p-5 shadow-lg shadow-slate-200/45 transition hover:-translate-y-0.5 hover:shadow-xl dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/20">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className={classNames('h-1.5 flex-1 rounded-full bg-gradient-to-r', accent)}></div>
        <div className={classNames('flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg transition group-hover:scale-105', accent)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">{label}</p>
      <strong className="mt-3 block text-3xl font-semibold text-slate-950 dark:text-white">{value}</strong>
    </article>
  )
}

function ModuleSummaryCard({ module }) {
  return (
    <article className="group rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-xl dark:border-slate-800 dark:bg-slate-950/60 dark:hover:border-slate-700">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-slate-950 dark:text-white">{module.title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
            {module.description || 'Aucune description disponible pour ce module.'}
          </p>
        </div>
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-600 transition group-hover:bg-orange-50 group-hover:text-orange-600 dark:bg-slate-800 dark:text-slate-300 dark:group-hover:bg-orange-500/10 dark:group-hover:text-orange-300">
          <ModulesIcon className="h-5 w-5" />
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <MiniPill label={`${module.courses_count} cours`} />
        <MiniPill label={`${module.practical_works_count} TP`} />
        <MiniPill label={`${module.assessments_count} contrôles`} />
      </div>
    </article>
  )
}

function RecentResourceCard({ item, onPreview }) {
  return (
    <article className="group flex flex-wrap items-center justify-between gap-4 rounded-[24px] border border-slate-200/80 bg-slate-50/80 p-4 transition hover:border-orange-200 hover:bg-white hover:shadow-lg dark:border-slate-800 dark:bg-slate-950/60 dark:hover:border-slate-700 dark:hover:bg-slate-900">
      <div className="flex min-w-0 items-center gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 text-white shadow-lg shadow-orange-500/20">
          <DocumentIcon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-semibold text-slate-950 dark:text-white">{item.title}</p>
            <StatusBadge tone="success">{item.type}</StatusBadge>
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {item.module} - {item.date ? formatDate(item.date) : 'Date indisponible'}
          </p>
        </div>
      </div>
      <ActionButton onClick={onPreview}>
        Prévisualiser
      </ActionButton>
    </article>
  )
}

function CourseCard({ cours, onPreview, onDownload, onEdit, onDelete }) {
  return (
    <article className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl dark:border-slate-800 dark:bg-slate-950/60">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-orange-500">{cours.module?.title ?? 'Aucun module'}</p>
          <h3 className="mt-2 break-words text-lg font-semibold leading-tight text-slate-900 dark:text-white">{cours.title}</h3>
          <p className="mt-2 break-words text-sm leading-6 text-slate-500 dark:text-slate-400">{cours.description || 'Aucune description renseignée.'}</p>
        </div>
        <StatusBadge tone={cours.document ? 'success' : 'warning'}>{cours.document ? 'PDF prêt' : 'PDF manquant'}</StatusBadge>
      </div>
      <div className="mt-5 flex flex-wrap gap-2 text-xs">
        <MiniPill label={cours.level} />
        <MiniPill label={`${cours.duration_hours} heures`} />
        <MiniPill label={`${cours.practical_works_count} TP`} />
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        <ActionButton onClick={onPreview} disabled={!cours.document}>
          Prévisualiser le PDF
        </ActionButton>
        <ActionButton onClick={onDownload} disabled={!cours.document}>
          Télécharger
        </ActionButton>
        <ActionButton onClick={onEdit}>Modifier</ActionButton>
        <ActionButton tone="danger" onClick={onDelete}>
          Supprimer
        </ActionButton>
      </div>
    </article>
  )
}

function CourseTable({ courses, onPreview, onDownload, onEdit, onDelete }) {
  return (
    <div className="overflow-hidden rounded-[28px] border border-slate-200 dark:border-slate-800">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
          <thead className="bg-slate-50 dark:bg-slate-950">
            <tr className="text-left text-slate-500 dark:text-slate-400">
              <th className="px-4 py-3 font-medium">Cours</th>
              <th className="px-4 py-3 font-medium">Module</th>
              <th className="px-4 py-3 font-medium">Niveau</th>
              <th className="px-4 py-3 font-medium">PDF</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-900 dark:bg-slate-950/60">
            {courses.map((cours) => (
              <tr key={cours.id}>
                <td className="px-4 py-4">
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">{cours.title}</p>
                    <p className="text-slate-500 dark:text-slate-400">{cours.duration_hours} heures</p>
                  </div>
                </td>
                <td className="px-4 py-4 text-slate-600 dark:text-slate-300">{cours.module?.title ?? '-'}</td>
                <td className="px-4 py-4 text-slate-600 dark:text-slate-300">{cours.level}</td>
                <td className="px-4 py-4">
                  <StatusBadge tone={cours.document ? 'success' : 'warning'}>{cours.document ? 'Prêt' : 'Manquant'}</StatusBadge>
                </td>
                <td className="px-4 py-4">
                  <div className="flex flex-wrap gap-2">
                    <ActionButton onClick={() => onPreview(cours)} disabled={!cours.document}>
                      Prévisualiser
                    </ActionButton>
                    <ActionButton onClick={() => onDownload(cours)} disabled={!cours.document}>
                      Télécharger
                    </ActionButton>
                    <ActionButton onClick={() => onEdit(cours)}>Modifier</ActionButton>
                    <ActionButton tone="danger" onClick={() => onDelete(cours)}>
                      Supprimer
                    </ActionButton>
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

function SidebarLink({ active, label, onClick, icon: Icon, badge = null }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={classNames(
        'group flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm font-medium transition',
        active
          ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/25'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
      )}
    >
      <span className="flex items-center gap-3">
        <span className={classNames('flex h-9 w-9 items-center justify-center rounded-2xl transition', active ? 'bg-white/15' : 'bg-slate-100 text-slate-500 group-hover:bg-white dark:bg-slate-800 dark:text-slate-300 dark:group-hover:bg-slate-700')}>
          <Icon className="h-4 w-4" />
        </span>
        {label}
      </span>
      {badge ? <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-semibold">{badge}</span> : null}
    </button>
  )
}

function Modal({ open, onClose, title, children, width = 'max-w-2xl' }) {
  useEffect(() => {
    if (!open) {
      return undefined
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open) {
    return null
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-8 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <div className={classNames('max-h-[90vh] w-full overflow-y-auto rounded-[32px] border border-white/60 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900', width)}>
        <div className="mb-5 flex items-center justify-between gap-4">
          <h3 className="min-w-0 break-words text-xl font-semibold leading-tight text-slate-900 dark:text-white">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 text-slate-500 transition hover:border-orange-200 hover:text-orange-600 dark:border-slate-700 dark:text-slate-300"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function ModalActions({ saving, submitLabel, onAnnuler }) {
  return (
    <div className="sticky bottom-0 -mx-1 mt-6 flex flex-wrap justify-end gap-3 border-t border-slate-100 bg-white/95 px-1 pt-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
      <button
        type="button"
        onClick={onAnnuler}
        className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 dark:border-slate-700 dark:text-slate-200"
      >
        Annuler
      </button>
      <button
        type="submit"
        disabled={saving}
        className="inline-flex min-w-[220px] items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-orange-500 to-orange-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-500/25 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {saving ? null : <PlusIcon className="h-4 w-4" />}
        {saving ? 'Enregistrement...' : submitLabel}
      </button>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="grid gap-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <SkeletonCard key={index} />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <SkeletonCard tall />
        <SkeletonCard tall />
      </div>
    </div>
  )
}

function SkeletonCard({ tall = false }) {
  return (
    <div className={classNames('animate-pulse rounded-[28px] bg-white p-6 shadow-sm dark:bg-slate-900', tall ? 'h-64' : 'h-32')}>
      <div className="h-4 w-24 rounded-full bg-slate-200 dark:bg-slate-800"></div>
      <div className="mt-5 h-8 w-20 rounded-full bg-slate-200 dark:bg-slate-800"></div>
      <div className="mt-5 h-3 w-full rounded-full bg-slate-200 dark:bg-slate-800"></div>
    </div>
  )
}

function SkeletonBlock() {
  return <div className="h-24 animate-pulse rounded-[24px] bg-slate-100 dark:bg-slate-800"></div>
}

function EmptyState({ title, description, compact = false, icon: Icon = SparkIcon }) {
  return (
    <div
      className={classNames(
        'rounded-[28px] border border-dashed border-slate-300 bg-slate-50/80 text-center dark:border-slate-700 dark:bg-slate-950/70',
        compact ? 'p-4' : 'p-10'
      )}
    >
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-3xl bg-white text-slate-500 shadow-sm dark:bg-slate-900 dark:text-slate-300">
        <Icon className="h-6 w-6" />
      </div>
      <p className="text-lg font-semibold text-slate-900 dark:text-white">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p>
    </div>
  )
}

function SimpleList({ items }) {
  if (!items.length) {
    return <EmptyState title="Rien à afficher pour le moment" description="Cette section se remplira avec l'activité de votre espace." compact />
  }

  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <div
          key={`${item.title}-${index}`}
          className="rounded-3xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-950/70"
        >
          <p className="font-semibold text-slate-900 dark:text-white">{item.title}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">{item.meta}</p>
        </div>
      ))}
    </div>
  )
}

function SummaryRail({ label, value, maxValue }) {
  const width = `${Math.max((value / maxValue) * 100, 8)}%`

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-slate-600 dark:text-slate-300">{label}</p>
        <span className="text-sm font-semibold text-slate-900 dark:text-white">{value}</span>
      </div>
      <div className="h-3 rounded-full bg-slate-100 dark:bg-slate-800">
        <div className="h-3 rounded-full bg-gradient-to-r from-orange-500 to-orange-400" style={{ width }}></div>
      </div>
    </div>
  )
}

function SearchField({ value, onChange, placeholder }) {
  return (
    <label className="relative min-w-[240px] flex-1">
      <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-12 w-full rounded-2xl border border-slate-300 bg-white pl-11 pr-4 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-orange-400 focus:bg-white focus:ring-4 focus:ring-orange-100 dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:focus:border-orange-400 dark:focus:ring-orange-500/15"
      />
    </label>
  )
}

function SelectBox({ value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-12 rounded-2xl border border-slate-300 bg-white px-4 text-sm text-slate-900 shadow-sm outline-none transition focus:border-orange-400 focus:bg-white focus:ring-4 focus:ring-orange-100 dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:focus:border-orange-400 dark:focus:ring-orange-500/15"
    >
      {options.map((option) => (
        <option key={`${option.value}-${option.label}`} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

function ProfileHero({ user, modulesCount, coursesCount, avatarPreview }) {
  const avatarUrl = avatarPreview || user?.avatar_url

  return (
    <section className="overflow-hidden rounded-[32px] border border-white/70 bg-white/90 shadow-xl shadow-slate-200/40 backdrop-blur dark:border-slate-800 dark:bg-slate-900/85 dark:shadow-black/20">
      <div className="relative bg-gradient-to-br from-slate-950 via-slate-900 to-orange-500 p-6 text-white sm:p-8">
        <div className="absolute inset-x-0 top-0 h-24 bg-white/5"></div>
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end">
            <div className="relative">
              <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-[28px] border border-white/20 bg-white/10 text-4xl font-semibold shadow-2xl shadow-slate-950/25 sm:h-32 sm:w-32">
                {avatarUrl ? (
                  <img src={avatarUrl} alt={user?.name ?? 'Formateur'} className="h-full w-full object-cover" />
                ) : (
                  <span>{(user?.name ?? 'F').slice(0, 1).toUpperCase()}</span>
                )}
              </div>
              <div className="absolute -bottom-2 -right-2 flex h-10 w-10 items-center justify-center rounded-2xl bg-orange-500 text-white shadow-lg shadow-orange-950/30">
                <CameraIcon className="h-5 w-5" />
              </div>
            </div>
            <div className="min-w-0 pb-1">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-orange-50">Formateur</span>
                <span className="rounded-full border border-white/15 px-3 py-1 text-xs font-semibold text-slate-100">Profil actif</span>
              </div>
              <h2 className="break-words text-3xl font-semibold leading-tight sm:text-4xl">{user?.name}</h2>
              <p className="mt-2 break-words text-sm text-orange-50">{user?.email}</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[320px]">
            <div className="rounded-[24px] border border-white/15 bg-white/10 p-4 backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-100">Modules</p>
              <strong className="mt-2 block text-2xl font-semibold">{modulesCount}</strong>
            </div>
            <div className="rounded-[24px] border border-white/15 bg-white/10 p-4 backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-100">Cours</p>
              <strong className="mt-2 block text-2xl font-semibold">{coursesCount}</strong>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function ProfileCard({ title, eyebrow, description, children, icon: Icon = UserIcon }) {
  return (
    <section className="rounded-[32px] border border-white/70 bg-white/90 p-6 shadow-xl shadow-slate-200/40 backdrop-blur transition hover:shadow-2xl hover:shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900/85 dark:shadow-black/20 dark:hover:shadow-black/30">
      <div className="mb-6 flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-300">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-orange-500">{eyebrow}</p>
          <h3 className="mt-2 text-xl font-semibold text-slate-950 dark:text-white">{title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p>
        </div>
      </div>
      {children}
    </section>
  )
}

function AvatarDropzone({ user, previewUrl, file, dragging, error, onDragging, onFile, onClear }) {
  const displayUrl = resolveApiUrl(previewUrl || user?.avatar_url)

  function handleDrop(event) {
    event.preventDefault()
    onDragging(false)
    onFile(event.dataTransfer.files?.[0] ?? null)
  }

  return (
    <div>
      <span className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">Photo de profil</span>
      <label
        onDragOver={(event) => {
          event.preventDefault()
          onDragging(true)
        }}
        onDragLeave={() => onDragging(false)}
        onDrop={handleDrop}
        className={classNames(
          'group flex cursor-pointer flex-col gap-4 rounded-[28px] border-2 border-dashed p-4 transition sm:flex-row sm:items-center',
          dragging
            ? 'border-orange-400 bg-orange-50 shadow-lg shadow-orange-100 dark:border-orange-400 dark:bg-orange-500/10 dark:shadow-none'
            : 'border-slate-300 bg-slate-50/80 hover:border-orange-300 hover:bg-white dark:border-slate-700 dark:bg-slate-950/70 dark:hover:border-orange-500/60 dark:hover:bg-slate-900'
        )}
      >
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          onChange={(event) => onFile(event.target.files?.[0] ?? null)}
        />
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-[24px] bg-white text-2xl font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-100 dark:ring-slate-800">
          {displayUrl ? (
            <img src={displayUrl} alt={user?.name ?? 'Avatar'} className="h-full w-full object-cover" />
          ) : (
            <span>{(user?.name ?? 'F').slice(0, 1).toUpperCase()}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-orange-500 text-white shadow-lg shadow-orange-500/25 transition group-hover:-translate-y-0.5">
              <UploadIcon className="h-5 w-5" />
            </span>
            <div>
              <p className="font-semibold text-slate-950 dark:text-white">Glissez votre image ici</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">PNG, JPG ou WEBP, jusqu'à 4 Mo.</p>
            </div>
          </div>
          {file ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="max-w-full truncate rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700 dark:bg-orange-500/10 dark:text-orange-300">
                {file.name}
              </span>
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault()
                  onClear()
                }}
                className="cursor-pointer rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition-all duration-200 hover:scale-105 hover:border-rose-200 hover:text-rose-600 active:scale-95 dark:border-slate-700 dark:text-slate-300"
              >
                Retirer
              </button>
            </div>
          ) : null}
        </div>
      </label>
      {error ? <p className="mt-2 text-sm font-medium text-rose-600 dark:text-rose-300">{error}</p> : null}
    </div>
  )
}

function PasswordField({ label, value, onChange, visible, onToggle, error, autoComplete }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">{label}</span>
      <div className="relative">
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          autoComplete={autoComplete}
          onChange={(event) => onChange(event.target.value)}
          className={classNames(
            'h-12 w-full rounded-2xl border bg-white px-4 pr-12 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-orange-400 focus:bg-white focus:ring-4 focus:ring-orange-100 dark:bg-slate-900 dark:text-white dark:focus:border-orange-400 dark:focus:ring-orange-500/15',
            error ? 'border-rose-300 dark:border-rose-500/60' : 'border-slate-300 dark:border-slate-600'
          )}
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-2 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-orange-600 dark:text-slate-300 dark:hover:bg-slate-800"
          aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
        >
          {visible ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
        </button>
      </div>
      {error ? <p className="mt-2 text-sm font-medium text-rose-600 dark:text-rose-300">{error}</p> : null}
    </label>
  )
}

function ProfileActions({ saving, submitLabel, onReset }) {
  return (
    <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-5 dark:border-slate-800">
      <button
        type="button"
        onClick={onReset}
        className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 dark:border-slate-700 dark:text-slate-200"
      >
        Réinitialiser
      </button>
      <button
        type="submit"
        disabled={saving}
        className="inline-flex min-w-[210px] items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-orange-500 to-orange-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-500/25 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {saving ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"></span> : <PlusIcon className="h-4 w-4" />}
        {saving ? 'Enregistrement...' : submitLabel}
      </button>
    </div>
  )
}

function InputField({ label, value, onChange, type = 'text', placeholder = '', error = '' }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={classNames(
          'h-12 w-full rounded-2xl border bg-white px-4 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-orange-400 focus:bg-white focus:ring-4 focus:ring-orange-100 dark:bg-slate-900 dark:text-white dark:focus:border-orange-400 dark:focus:ring-orange-500/15',
          error ? 'border-rose-300 dark:border-rose-500/60' : 'border-slate-300 dark:border-slate-600'
        )}
      />
      {error ? <p className="mt-2 text-sm font-medium text-rose-600 dark:text-rose-300">{error}</p> : null}
    </label>
  )
}

function TextAreaField({ label, value, onChange, placeholder = '', rows = 5 }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">{label}</span>
      <textarea
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-orange-400 focus:bg-white focus:ring-4 focus:ring-orange-100 dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:focus:border-orange-400 dark:focus:ring-orange-500/15"
      ></textarea>
    </label>
  )
}

function SelectField({ label, value, onChange, options }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full rounded-2xl border border-slate-300 bg-white px-4 text-sm text-slate-900 shadow-sm outline-none transition focus:border-orange-400 focus:bg-white focus:ring-4 focus:ring-orange-100 dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:focus:border-orange-400 dark:focus:ring-orange-500/15"
      >
        {options.map((option) => (
          <option key={`${option.value}-${option.label}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function FileField({ label, helper, accept, onChange }) {
  const [fileName, setFileName] = useState('')

  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">{label}</span>
      <input
        type="file"
        accept={accept}
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null
          const success = onChange(file)
          if (success !== false) {
            setFileName(file?.name ?? '')
          } else {
            event.target.value = ''
            setFileName('')
          }
        }}
        className="block w-full rounded-2xl border-2 border-dashed border-slate-300 bg-white px-4 py-4 text-sm text-slate-700 shadow-sm file:mr-4 file:rounded-xl file:border-0 file:bg-orange-500 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:border-orange-300 hover:file:bg-orange-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500 dark:text-slate-400">{helper}</p>
        {fileName ? (
          <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-600 dark:bg-orange-500/10 dark:text-orange-300">
            Fichier sélectionné : {fileName}
          </span>
        ) : null}
      </div>
    </label>
  )
}

function ActionButton({ children, onClick, tone = 'neutral', disabled = false }) {
  const tones = {
    neutral:
      'border-slate-200 bg-white text-slate-700 hover:border-orange-200 hover:text-orange-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200',
    danger:
      'border-rose-200 bg-rose-50 text-rose-600 hover:border-rose-300 hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300',
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={classNames(
        'rounded-2xl border px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50',
        tones[tone]
      )}
    >
      {children}
    </button>
  )
}

function TogglePill({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={classNames(
        'rounded-2xl px-4 py-2 text-sm font-semibold transition',
        active ? 'bg-white text-slate-900 shadow dark:bg-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'
      )}
    >
      {children}
    </button>
  )
}

function StatusBadge({ tone, children }) {
  const tones = {
    neutral: 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900',
    success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    warning: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300',
  }

  return <span className={classNames('inline-flex max-w-full shrink-0 break-words rounded-full px-3 py-1 text-xs font-semibold capitalize leading-snug', tones[tone])}>{children}</span>
}

function MiniPill({ label }) {
  return (
    <span className="inline-flex max-w-full break-words rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium leading-snug text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
      {label}
    </span>
  )
}

function CompactMetric({ label, value }) {
  return (
    <div className="min-w-0 rounded-3xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-950/70">
      <p className="break-words text-sm text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-2 break-words text-lg font-semibold leading-tight text-slate-900 dark:text-white">{value}</p>
    </div>
  )
}

function ToastStack({ toasts }) {
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[60] space-y-3">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={classNames(
            'pointer-events-auto rounded-2xl px-4 py-3 text-sm font-medium shadow-xl backdrop-blur',
            toast.type === 'error'
              ? 'bg-rose-600 text-white shadow-rose-600/20'
              : 'bg-slate-900 text-white shadow-slate-900/20'
          )}
        >
          {toast.message}
        </div>
      ))}
    </div>
  )
}

function isEcheanceNear(date) {
  if (!date) {
    return false
  }

  const diff = new Date(date).getTime() - Date.now()
  return diff > 0 && diff < 1000 * 60 * 60 * 48
}

function formatDate(value) {
  if (!value) {
    return 'Non planifiée'
  }

  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function validateProfileForm(form) {
  const errors = {}

  if (!form.first_name || !form.first_name.trim()) {
    errors.first_name = 'Le prénom est obligatoire.'
  }

  if (!form.last_name || !form.last_name.trim()) {
    errors.last_name = 'Le nom est obligatoire.'
  }

  if (!form.email || !form.email.trim()) {
    errors.email = "L'adresse email est obligatoire."
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
    errors.email = 'Veuillez saisir une adresse email valide.'
  }

  return errors
}

function validatePasswordForm(form) {
  const errors = {}

  if (!form.current_password) {
    errors.current_password = 'Le mot de passe actuel est obligatoire.'
  }

  if (!form.password) {
    errors.password = 'Le nouveau mot de passe est obligatoire.'
  } else if (form.password.length < 8) {
    errors.password = 'Le nouveau mot de passe doit contenir au moins 8 caractères.'
  }

  if (!form.password_confirmation) {
    errors.password_confirmation = 'Veuillez confirmer le nouveau mot de passe.'
  } else if (form.password !== form.password_confirmation) {
    errors.password_confirmation = 'Les mots de passe ne correspondent pas.'
  }

  return errors
}

function classNames(...values) {
  return values.filter(Boolean).join(' ')
}

function GridIcon({ className = 'h-5 w-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}

function ModulesIcon({ className = 'h-5 w-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="m4 8 8-4 8 4-8 4-8-4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="m4 12 8 4 8-4M4 16l8 4 8-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CourseIcon({ className = 'h-5 w-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M6 5.5h9.5A2.5 2.5 0 0 1 18 8v10.5H8.5A2.5 2.5 0 0 0 6 21V5.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M6 7.5h-1A2.5 2.5 0 0 0 2.5 10V19A2.5 2.5 0 0 0 5 21h1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function ClipboardIcon({ className = 'h-5 w-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M8 4.5h8M9 3h6a1 1 0 0 1 1 1v1H8V4a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M6.5 5.5h11A1.5 1.5 0 0 1 19 7v12.5A1.5 1.5 0 0 1 17.5 21h-11A1.5 1.5 0 0 1 5 19.5V7a1.5 1.5 0 0 1 1.5-1.5Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8.5 10.5h7M8.5 14.5h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function ShieldCheckIcon({ className = 'h-5 w-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="m12 3.5 6 2.5V11c0 4-2.35 7.44-6 9-3.65-1.56-6-5-6-9V6l6-2.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="m9.4 11.8 1.7 1.7 3.6-3.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function UserIcon({ className = 'h-5 w-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M5 19a7 7 0 0 1 14 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function SparkIcon({ className = 'h-5 w-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M12 3.5 13.9 10l6.6 1.9-6.6 1.9L12 20.5l-1.9-6.7L3.5 11.9l6.6-1.9L12 3.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  )
}

function MenuIcon({ className = 'h-5 w-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function RefreshIcon({ className = 'h-5 w-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M20 11a8 8 0 1 0-2.34 5.66M20 7v4h-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function LogoutIcon({ className = 'h-5 w-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M10 6H7a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="m14 16 4-4-4-4M18 12H9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function SearchIcon({ className = 'h-5 w-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="1.8" />
      <path d="m20 20-4.2-4.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function DocumentIcon({ className = 'h-5 w-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M8 3.5h5.5L18.5 8v12A1.5 1.5 0 0 1 17 21.5H8A1.5 1.5 0 0 1 6.5 20V5A1.5 1.5 0 0 1 8 3.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M13.5 3.5V8h5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M9.5 12h5M9.5 15.5h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function PlusIcon({ className = 'h-5 w-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function CloseIcon({ className = 'h-5 w-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function CameraIcon({ className = 'h-5 w-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M8.5 6.5 10 4h4l1.5 2.5H19A2.5 2.5 0 0 1 21.5 9v8A2.5 2.5 0 0 1 19 19.5H5A2.5 2.5 0 0 1 2.5 17V9A2.5 2.5 0 0 1 5 6.5h3.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="12" cy="13" r="3.2" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}

function UploadIcon({ className = 'h-5 w-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M12 15V4.5M8 8.5l4-4 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 14.5v3A2.5 2.5 0 0 0 7.5 20h9A2.5 2.5 0 0 0 19 17.5v-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function EyeIcon({ className = 'h-5 w-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M2.75 12s3.4-5.75 9.25-5.75S21.25 12 21.25 12s-3.4 5.75-9.25 5.75S2.75 12 2.75 12Z" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="2.75" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}

function EyeOffIcon({ className = 'h-5 w-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M3 4.5 21 19.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M10.6 6.4c.45-.1.92-.15 1.4-.15 5.85 0 9.25 5.75 9.25 5.75a17 17 0 0 1-2.7 3.4M6.3 8.6C4.15 10.25 2.75 12 2.75 12s3.4 5.75 9.25 5.75c1.4 0 2.68-.33 3.84-.88" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10.4 10.4a2.25 2.25 0 0 0 3.2 3.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
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




