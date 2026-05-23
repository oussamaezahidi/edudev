import { useEffect, useMemo, useState } from 'react'
import './App.css'
import AdminWorkspace from './admin/AdminWorkspace'
import TrainerWorkspace from './trainer/TrainerWorkspace'
import TraineeWorkspace from './trainee/TraineeWorkspace'
import { getEffectiveDarkMode } from './themePreferences'

const API_BASE = resolveApiBase()
const AUTH_USER_KEY = 'edudev.auth.user'

const defaultSettings = {
  general: { platform_name: 'EduDev', support_email: 'support@edudev.local' },
  appearance: { mode: 'light', primary_color: '#ff7900' },
  files: { pdf_max_size: 20, allowed_file_types: ['pdf'], storage_disk: 'local' },
  maintenance: { enabled: false },
}

const emptyResources = {
  trainers: [],
  modules: [],
  courses: [],
  practicalWorks: [],
  assessments: [],
  trainees: [],
}

const emptyRegister = {
  name: '',
  email: '',
  phone: '',
  filiere: 'Développement Digital',
  year_level: '1',
  option: 'Full Stack',
  password: '',
  password_confirmation: '',
}

const emptyTrainer = {
  name: '',
  email: '',
  password: '',
  phone: '',
  specialty: '',
  bio: '',
  module_ids: [],
  trainee_ids: [],
}

const emptyModule = {
  title: '',
  description: '',
  year_level: '1',
  option: '',
  trainer_ids: [],
}

const emptyCourse = {
  module_id: '',
  trainer_id: '',
  title: '',
  description: '',
  level: 'beginner',
  duration_hours: 12,
}

const emptyPractical = {
  course_id: '',
  trainer_id: '',
  title: '',
  instructions: '',
  due_at: '',
}

const emptyAssessment = {
  course_id: '',
  trainer_id: '',
  title: '',
  format: 'quiz',
  scheduled_at: '',
  duration_minutes: 60,
  total_points: 20,
}

function App() {
  const [csrfToken, setCsrfToken] = useState('')
  const [user, setUser] = useState(() => readStoredUser())
  const [dashboard, setDashboard] = useState(null)
  const [resources, setResources] = useState(emptyResources)
  const [authMode, setAuthMode] = useState('login')
  const [authForm, setAuthForm] = useState(emptyRegister)
  const [loginForm, setLoginForm] = useState({ email: '', password: '' })
  const [rememberMe, setRememberMe] = useState(true)
  const [showLoginPassword, setShowLoginPassword] = useState(false)
  const [showRegisterPassword, setShowRegisterPassword] = useState(false)
  const [showRegisterPasswordConfirmation, setShowRegisterPasswordConfirmation] = useState(false)
  const [activeTab, setActiveTab] = useState(() => window.localStorage.getItem('edudev.activeTab') || 'overview')
  const [editing, setEditing] = useState({
    trainer: null,
    module: null,
    course: null,
    practical: null,
    assessment: null,
    trainee: null,
  })
  const [forms, setForms] = useState({
    trainer: emptyTrainer,
    module: emptyModule,
    course: emptyCourse,
    practical: emptyPractical,
    assessment: emptyAssessment,
    trainee: {
      name: '',
      email: '',
      phone: '',
      specialty: '',
      bio: '',
      trainer_ids: [],
      course_ids: [],
    },
  })
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [settings, setSettings] = useState(defaultSettings)

  const platformName = settings?.general?.platform_name || 'EduDev'
  const maintenanceEnabled = settings?.maintenance?.enabled === true

  const availableTabs = useMemo(() => {
    if (!user) {
      return []
    }

    if (user.role === 'admin') {
      return ['overview', 'trainers', 'modules', 'courses', 'practicalWorks', 'assessments', 'trainees']
    }

    if (user.role === 'trainer') {
      return ['overview', 'courses', 'practicalWorks', 'assessments']
    }

    return ['overview']
  }, [user])

  useEffect(() => {
    bootstrap()
  }, [])

  useEffect(() => {
    loadSettings()
    const interval = window.setInterval(loadSettings, 15000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    applyPlatformSettings(settings, user)
  }, [settings, user])

  useEffect(() => {
    function syncRoute() {
      if (!user && window.location.pathname !== '/login') {
        window.history.replaceState(null, '', '/login')
      }

      if (user && ['/', '/login', '/register'].includes(window.location.pathname)) {
        window.history.replaceState(null, '', '/dashboard')
      }
    }

    window.addEventListener('popstate', syncRoute)
    syncRoute()
    return () => window.removeEventListener('popstate', syncRoute)
  }, [user])

  useEffect(() => {
    if (user && user.role === 'admin') {
      window.localStorage.setItem('edudev.activeTab', activeTab)
    }
  }, [activeTab, user])

  useEffect(() => {
    applyPlatformSettings(settings, user)
  }, [user])

  async function loadSettings() {
    try {
      const response = await fetch(`${API_BASE}/settings`, {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      })

      if (!response.ok) return

      const data = await parseJsonResponse(response)
      if (data?.settings && typeof data.settings === 'object') {
        setSettings(data.settings)
      }
    } catch {
      // Keep the local defaults if settings cannot be loaded.
    }
  }

  function handleSettingsChange(nextSettings) {
    setSettings(nextSettings)
    applyPlatformSettings(nextSettings, user)
  }

  async function bootstrap() {
    setLoading(true)
    setError('')

    try {
      const meResponse = await api('/me')

      if (!meResponse.user) {
        clearStoredUser()
        clearWorkspaceCaches()
        setUser(null)
        setDashboard(null)
        setResources(emptyResources)
        return
      }

      storeUser(meResponse.user)
      setUser(meResponse.user)
      if (['/', '/login', '/register'].includes(window.location.pathname)) {
        window.history.replaceState(null, '', '/dashboard')
      }
      await loadRoleData(meResponse.user)
    } catch (requestError) {
      if ([401, 419].includes(requestError.status)) {
        clearStoredUser()
        clearWorkspaceCaches()
        setUser(null)
        setDashboard(null)
        setResources(emptyResources)
      } else {
        setError(requestError.message)
      }
    } finally {
      setLoading(false)
    }
  }

  async function loadRoleData(currentUser) {
    const dashboardData = await api('/dashboard')
    setDashboard(dashboardData)

    if (currentUser.role === 'admin') {
      const [trainers, modules, courses, practicalWorks, assessments, trainees] = await Promise.all([
        api('/trainers'),
        api('/modules'),
        api('/courses'),
        api('/practical-works'),
        api('/assessments'),
        api('/trainees'),
      ])

      setResources({ trainers, modules, courses, practicalWorks, assessments, trainees })
    } else if (currentUser.role === 'trainer') {
      const [courses, practicalWorks, assessments] = await Promise.all([
        api('/courses'),
        api('/practical-works'),
        api('/assessments'),
      ])

      setResources((previous) => ({
        ...previous,
        trainers: [],
        modules: dashboardData.trainer?.modules ?? [],
        courses,
        practicalWorks,
        assessments,
        trainees: dashboardData.trainer?.trainees ?? [],
      }))
    } else {
      setResources((previous) => ({
        ...previous,
        trainers: dashboardData.trainee?.trainers ?? [],
        modules: [],
        courses: dashboardData.trainee?.enrolled_courses ?? [],
        practicalWorks: dashboardData.practicalWorks ?? [],
        assessments: dashboardData.assessments ?? [],
        trainees: [],
      }))
    }

    const savedTab = window.localStorage.getItem('edudev.activeTab')
    if (savedTab && availableTabs.includes(savedTab)) {
      setActiveTab(savedTab)
    } else {
      setActiveTab('overview')
    }
    resetForms(currentUser)
  }

  function resetForms(currentUser = user) {
    setEditing({
      trainer: null,
      module: null,
      course: null,
      practical: null,
      assessment: null,
      trainee: null,
    })
    setForms({
      trainer: emptyTrainer,
      module: emptyModule,
      course: {
        ...emptyCourse,
        trainer_id: currentUser?.role === 'trainer' ? currentUser.id : '',
      },
      practical: {
        ...emptyPractical,
        trainer_id: currentUser?.role === 'trainer' ? currentUser.id : '',
      },
      assessment: {
        ...emptyAssessment,
        trainer_id: currentUser?.role === 'trainer' ? currentUser.id : '',
      },
      trainee: {
        name: '',
        email: '',
        phone: '',
        specialty: '',
        bio: '',
        trainer_ids: [],
        course_ids: [],
      },
    })
  }

  async function api(path, options = {}) {
    const method = (options.method || 'GET').toUpperCase()
    const isFormData = options.body instanceof FormData
    const headers = {
      Accept: 'application/json',
      ...(options.headers || {}),
    }

    if (!isFormData) {
      headers['Content-Type'] = headers['Content-Type'] || 'application/json'
    }

    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      headers['X-CSRF-TOKEN'] = headers['X-CSRF-TOKEN'] || (await ensureCsrfToken())
    }

    let response

    try {
      response = await fetch(`${API_BASE}${path}`, {
        ...options,
        method,
        credentials: 'include',
        headers: {
          ...headers,
        },
      })
    } catch {
      throw new Error('Connexion impossible au backend. Lance Laravel avec: php artisan serve')
    }

    const data = await parseJsonResponse(response)

    if (!response.ok) {
      const validationErrors = data?.errors ? Object.values(data.errors).flat().join(' ') : ''
      const requestError = new Error(
        validationErrors ||
          data?.message ||
          `La requête a échoué sur ${API_BASE}${path}. Vérifiez que Laravel est lancé et que l'API est accessible.`
      )

      requestError.status = response.status

      if (response.status === 403 && ['Your account has been deactivated.', 'Votre compte a été désactivé.'].includes(data?.message)) {
        setCsrfToken('')
        clearStoredUser()
        clearWorkspaceCaches()
        setUser(null)
        setDashboard(null)
        setResources(emptyResources)
        window.history.replaceState(null, '', '/login')
      }

      throw requestError
    }

    if (data === null) {
      throw new Error(`Le backend n'a pas renvoyé du JSON sur ${API_BASE}${path}. Vérifiez VITE_API_URL ou le proxy Vite.`)
    }

    return data
  }

  async function ensureCsrfToken() {
    if (csrfToken) {
      return csrfToken
    }

    const response = await fetch(`${API_BASE}/csrf-token`, {
      credentials: 'include',
      headers: {
        Accept: 'application/json',
      },
    })

    const data = await parseJsonResponse(response)
    if (!data?.csrf_token) {
      throw new Error(`Le backend n'a pas renvoyé un token CSRF JSON sur ${API_BASE}/csrf-token.`)
    }

    setCsrfToken(data.csrf_token)

    return data.csrf_token
  }

  async function handleLogin(event) {
    event.preventDefault()
    setLoading(true)
    setError('')

    try {
      const data = await api('/login', {
        method: 'POST',
        body: JSON.stringify({ ...loginForm, remember: rememberMe }),
      })

      setCsrfToken('')
      storeUser(data.user)
      clearWorkspaceCaches()
      setUser(data.user)
      window.history.replaceState(null, '', '/dashboard')
      await loadRoleData(data.user)
      setFeedback('Connexion réussie.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleRegister(event) {
    event.preventDefault()
    setLoading(true)
    setError('')

    try {
      const data = await api('/register', {
        method: 'POST',
        body: JSON.stringify(authForm),
      })

      setCsrfToken('')
      storeUser(data.user)
      clearWorkspaceCaches()
      setUser(data.user)
      window.history.replaceState(null, '', '/dashboard')
      await loadRoleData(data.user)
      setFeedback('Compte stagiaire créé avec succès.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleLogout() {
    try {
      await api('/logout', { method: 'POST' })
    } catch {
      // ignore logout failures and clear local state anyway
    }

    setCsrfToken('')
    clearStoredUser()
    clearWorkspaceCaches()
    setUser(null)
    setDashboard(null)
    setResources(emptyResources)
    window.history.replaceState(null, '', '/login')
    setFeedback('Session fermée.')
  }

  async function refreshAfterMutation(message) {
    if (user) {
      await loadRoleData(user)
    }

    setFeedback(message)
    setError('')
  }

  async function submitTrainer(event) {
    event.preventDefault()
    const payload = normalizeMultiSelect(forms.trainer, ['module_ids', 'trainee_ids'])
    const path = editing.trainer ? `/trainers/${editing.trainer.id}` : '/trainers'
    const method = editing.trainer ? 'PUT' : 'POST'

    await api(path, { method, body: JSON.stringify(payload) })
    resetForms()
    await refreshAfterMutation(editing.trainer ? 'Formateur modifié.' : 'Formateur ajouté.')
  }

  async function submitModule(event) {
    event.preventDefault()
    const payload = normalizeMultiSelect(forms.module, ['trainer_ids'])
    const path = editing.module ? `/modules/${editing.module.id}` : '/modules'
    const method = editing.module ? 'PUT' : 'POST'

    await api(path, { method, body: JSON.stringify(payload) })
    resetForms()
    await refreshAfterMutation(editing.module ? 'Module modifié.' : 'Module ajouté.')
  }

  async function submitCourse(event) {
    event.preventDefault()
    const path = editing.course ? `/courses/${editing.course.id}` : '/courses'
    const method = editing.course ? 'PUT' : 'POST'
    await api(path, { method, body: JSON.stringify(normalizeIds(forms.course)) })
    resetForms()
    await refreshAfterMutation(editing.course ? 'Cours modifié.' : 'Cours ajouté.')
  }

  async function submitPractical(event) {
    event.preventDefault()
    const path = editing.practical ? `/practical-works/${editing.practical.id}` : '/practical-works'
    const method = editing.practical ? 'PUT' : 'POST'
    await api(path, { method, body: JSON.stringify(normalizeIds(forms.practical)) })
    resetForms()
    await refreshAfterMutation(editing.practical ? 'TP modifié.' : 'TP ajouté.')
  }

  async function submitAssessment(event) {
    event.preventDefault()
    const path = editing.assessment ? `/assessments/${editing.assessment.id}` : '/assessments'
    const method = editing.assessment ? 'PUT' : 'POST'
    await api(path, { method, body: JSON.stringify(normalizeIds(forms.assessment)) })
    resetForms()
    await refreshAfterMutation(editing.assessment ? 'Contrôle modifié.' : 'Contrôle ajouté.')
  }

  async function submitTrainee(event) {
    event.preventDefault()
    const payload = normalizeMultiSelect(forms.trainee, ['trainer_ids', 'course_ids'])
    await api(`/trainees/${editing.trainee.id}`, { method: 'PUT', body: JSON.stringify(payload) })
    resetForms()
    await refreshAfterMutation('Stagiaire mis a jour.')
  }

  async function destroyResource(path, message) {
    await api(path, { method: 'DELETE' })
    resetForms()
    await refreshAfterMutation(message)
  }

  function beginEditTrainer(trainer) {
    setEditing((previous) => ({ ...previous, trainer }))
    setForms((previous) => ({
      ...previous,
      trainer: {
        name: trainer.name,
        email: trainer.email,
        password: '',
        phone: trainer.phone ?? '',
        specialty: trainer.specialty ?? '',
        bio: trainer.bio ?? '',
        module_ids: (trainer.modules ?? []).map((item) => String(item.id)),
        trainee_ids: (trainer.trainees ?? []).map((item) => String(item.id)),
      },
    }))
    setActiveTab('trainers')
  }

  function beginEditModule(moduleItem) {
    setEditing((previous) => ({ ...previous, module: moduleItem }))
    setForms((previous) => ({
      ...previous,
      module: {
        title: moduleItem.title,
        description: moduleItem.description ?? '',
        year_level: String(moduleItem.year_level ?? '1'),
        option: moduleItem.option ?? '',
        trainer_ids: (moduleItem.trainers ?? []).map((item) => String(item.id)),
      },
    }))
    setActiveTab('modules')
  }

  function beginEditCourse(course) {
    setEditing((previous) => ({ ...previous, course }))
    setForms((previous) => ({
      ...previous,
      course: {
        module_id: String(course.module_id),
        trainer_id: String(course.trainer_id),
        title: course.title,
        description: course.description ?? '',
        level: course.level,
        duration_hours: course.duration_hours,
      },
    }))
    setActiveTab('courses')
  }

  function beginEditPractical(practical) {
    setEditing((previous) => ({ ...previous, practical }))
    setForms((previous) => ({
      ...previous,
      practical: {
        course_id: String(practical.course_id),
        trainer_id: String(practical.trainer_id),
        title: practical.title,
        instructions: practical.instructions,
        due_at: practical.due_at ? practical.due_at.slice(0, 16) : '',
      },
    }))
    setActiveTab('practicalWorks')
  }

  function beginEditAssessment(assessment) {
    setEditing((previous) => ({ ...previous, assessment }))
    setForms((previous) => ({
      ...previous,
      assessment: {
        course_id: String(assessment.course_id),
        trainer_id: String(assessment.trainer_id),
        title: assessment.title,
        format: assessment.format,
        scheduled_at: assessment.scheduled_at ? assessment.scheduled_at.slice(0, 16) : '',
        duration_minutes: assessment.duration_minutes,
        total_points: assessment.total_points,
      },
    }))
    setActiveTab('assessments')
  }

  function beginEditTrainee(trainee) {
    setEditing((previous) => ({ ...previous, trainee }))
    setForms((previous) => ({
      ...previous,
      trainee: {
        name: trainee.name,
        email: trainee.email,
        phone: trainee.phone ?? '',
        specialty: trainee.specialty ?? '',
        bio: trainee.bio ?? '',
        trainer_ids: (trainee.trainers ?? []).map((item) => String(item.id)),
        course_ids: (trainee.enrolled_courses ?? []).map((item) => String(item.id)),
      },
    }))
    setActiveTab('trainees')
  }

  if (!user) {
    return (
      <AuthExperience
        authMode={authMode}
        setAuthMode={setAuthMode}
        platformName={platformName}
        error={error}
        feedback={feedback}
        loading={loading}
        loginForm={loginForm}
        setLoginForm={setLoginForm}
        authForm={authForm}
        setAuthForm={setAuthForm}
        rememberMe={rememberMe}
        setRememberMe={setRememberMe}
        showLoginPassword={showLoginPassword}
        setShowLoginPassword={setShowLoginPassword}
        showRegisterPassword={showRegisterPassword}
        setShowRegisterPassword={setShowRegisterPassword}
        showRegisterPasswordConfirmation={showRegisterPasswordConfirmation}
        setShowRegisterPasswordConfirmation={setShowRegisterPasswordConfirmation}
        handleLogin={handleLogin}
        handleRegister={handleRegister}
      />
    )
  }

  if (maintenanceEnabled && user.role !== 'admin') {
    return <MaintenanceExperience platformName={platformName} user={user} onLogout={handleLogout} />
  }

  if (user.role === 'trainer') {
    return <TrainerWorkspace user={user} api={api} onLogout={handleLogout} settings={settings} />
  }

  if (user.role === 'admin') {
    return <AdminWorkspace user={user} api={api} onLogout={handleLogout} settings={settings} onSettingsChange={handleSettingsChange} />
  }

  if (user.role === 'trainee') {
    return <TraineeWorkspace user={user} api={api} onLogout={handleLogout} settings={settings} />
  }

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Espace EduDev</p>
          <h1>{user.role === 'admin' ? 'Tableau de bord administration' : user.role === 'trainer' ? 'Tableau de bord formateur' : 'Tableau de bord stagiaire'}</h1>
          <p className="lede">
            Connecte en tant que <strong>{user.name}</strong> ({user.role})
          </p>
        </div>
        <div className="topbar-actions">
          <button type="button" className="secondary-button" onClick={() => bootstrap()}>
            Rafraichir
          </button>
          <button type="button" className="primary-button" onClick={handleLogout}>
            Deconnexion
          </button>
        </div>
      </header>

      {error ? <p className="alert error">{error}</p> : null}
      {feedback ? <p className="alert success">{feedback}</p> : null}

      <nav className="tabs-row">
        {availableTabs.map((tab) => (
          <button
            key={tab}
            type="button"
            className={activeTab === tab ? 'tab active' : 'tab'}
            onClick={() => setActiveTab(tab)}
          >
            {tabLabel(tab)}
          </button>
        ))}
      </nav>

      {activeTab === 'overview' ? (
        <OverviewPanel user={user} dashboard={dashboard} resources={resources} />
      ) : null}

      {user.role === 'admin' && activeTab === 'trainers' ? (
        <section className="management-grid">
          <ResourceList
            title="Formateurs"
            items={resources.trainers}
            renderItem={(trainer) => (
              <>
                <strong>{trainer.name}</strong>
                <span>{trainer.specialty}</span>
                <span>{trainer.modules?.map((item) => item.title).join(', ') || 'Aucun module'}</span>
              </>
            )}
            onEdit={beginEditTrainer}
            onDelete={(trainer) => destroyResource(`/trainers/${trainer.id}`, 'Formateur supprimé.')}
          />
          <form className="editor-card form-grid" onSubmit={submitTrainer}>
            <h3>{editing.trainer ? 'Modifier formateur' : 'Nouveau formateur'}</h3>
            <TextField label="Nom" value={forms.trainer.name} onChange={(value) => updateForm('trainer', 'name', value, setForms)} />
            <TextField label="E-mail" value={forms.trainer.email} onChange={(value) => updateForm('trainer', 'email', value, setForms)} />
            <TextField label="Mot de passe" type="password" value={forms.trainer.password} onChange={(value) => updateForm('trainer', 'password', value, setForms)} />
            <TextField label="Téléphone" value={forms.trainer.phone} onChange={(value) => updateForm('trainer', 'phone', value, setForms)} />
            <TextField label="Spécialité" value={forms.trainer.specialty} onChange={(value) => updateForm('trainer', 'specialty', value, setForms)} />
            <TextAreaField label="Bio" value={forms.trainer.bio} onChange={(value) => updateForm('trainer', 'bio', value, setForms)} />
            <MultiSelectField
              label="Modules"
              value={forms.trainer.module_ids}
              options={resources.modules.map((item) => ({ value: String(item.id), label: item.title }))}
              onChange={(value) => updateForm('trainer', 'module_ids', value, setForms)}
            />
            <MultiSelectField
              label="Stagiaires"
              value={forms.trainer.trainee_ids}
              options={resources.trainees.map((item) => ({ value: String(item.id), label: item.name }))}
              onChange={(value) => updateForm('trainer', 'trainee_ids', value, setForms)}
            />
            <FormButtons onReset={() => resetForms()} />
          </form>
        </section>
      ) : null}

      {user.role === 'admin' && activeTab === 'modules' ? (
        <section className="management-grid">
          <ResourceList
            title="Modules"
            items={resources.modules}
            renderItem={(moduleItem) => (
              <>
                <strong>{moduleItem.title}</strong>
                <span>
                  {moduleItem.year_level === 2
                    ? `2ème année${moduleItem.option ? ` - ${moduleItem.option}` : ' - Commune'}`
                    : '1ère année'}
                </span>
                <span>{moduleItem.description}</span>
                <span>{moduleItem.trainers?.map((item) => item.name).join(', ') || 'Aucun formateur'}</span>
              </>
            )}
            onEdit={beginEditModule}
            onDelete={(moduleItem) => destroyResource(`/modules/${moduleItem.id}`, 'Module supprimé.')}
          />
          <form className="editor-card form-grid" onSubmit={submitModule}>
            <h3>{editing.module ? 'Modifier module' : 'Nouveau module'}</h3>
            <TextField label="Titre" value={forms.module.title} onChange={(value) => updateForm('module', 'title', value, setForms)} />
            <TextAreaField label="Description" value={forms.module.description} onChange={(value) => updateForm('module', 'description', value, setForms)} />
            <SelectField
              label="Année d'études"
              value={forms.module.year_level}
              options={[
                { value: '1', label: '1ère année' },
                { value: '2', label: '2ème année' },
              ]}
              onChange={(value) => updateForm('module', 'year_level', value, setForms)}
            />
            {forms.module.year_level === '2' && (
              <SelectField
                label="Option (2ème année)"
                value={forms.module.option}
                options={[
                  { value: '', label: 'Commune (Toutes les options)' },
                  { value: 'Full Stack', label: 'Full Stack' },
                  { value: 'Mobile', label: 'Mobile' },
                  { value: 'RV/RA', label: 'RV/RA' },
                ]}
                onChange={(value) => updateForm('module', 'option', value, setForms)}
              />
            )}
            <MultiSelectField
              label="Formateurs"
              value={forms.module.trainer_ids}
              options={resources.trainers.map((item) => ({ value: String(item.id), label: item.name }))}
              onChange={(value) => updateForm('module', 'trainer_ids', value, setForms)}
            />
            <FormButtons onReset={() => resetForms()} />
          </form>
        </section>
      ) : null}

      {(user.role === 'admin' || user.role === 'trainer') && activeTab === 'courses' ? (
        <section className="management-grid">
          <ResourceList
            title="Cours"
            items={resources.courses}
            renderItem={(course) => (
              <>
                <strong>{course.title}</strong>
                <span>{course.module?.title}</span>
                <span>{course.trainer?.name}</span>
              </>
            )}
            onEdit={beginEditCourse}
            onDelete={(course) => destroyResource(`/courses/${course.id}`, 'Cours supprimé.')}
          />
          <form className="editor-card form-grid" onSubmit={submitCourse}>
            <h3>{editing.course ? 'Modifier cours' : 'Nouveau cours'}</h3>
            <SelectField
              label="Module"
              value={forms.course.module_id}
              options={resources.modules.map((item) => ({ value: String(item.id), label: item.title }))}
              onChange={(value) => updateForm('course', 'module_id', value, setForms)}
            />
            <SelectField
              label="Formateur"
              value={String(forms.course.trainer_id)}
              options={(user.role === 'trainer' ? [user] : resources.trainers).map((item) => ({
                value: String(item.id),
                label: item.name,
              }))}
              onChange={(value) => updateForm('course', 'trainer_id', value, setForms)}
            />
            <TextField label="Titre" value={forms.course.title} onChange={(value) => updateForm('course', 'title', value, setForms)} />
            <TextAreaField label="Description" value={forms.course.description} onChange={(value) => updateForm('course', 'description', value, setForms)} />
            <SelectField
              label="Niveau"
              value={forms.course.level}
              options={[
                { value: 'beginner', label: 'Debutant' },
                { value: 'intermediate', label: 'Intermediaire' },
                { value: 'advanced', label: 'Avance' },
              ]}
              onChange={(value) => updateForm('course', 'level', value, setForms)}
            />
            <TextField
              label="Duree (heures)"
              type="number"
              value={forms.course.duration_hours}
              onChange={(value) => updateForm('course', 'duration_hours', Number(value), setForms)}
            />
            <FormButtons onReset={() => resetForms()} />
          </form>
        </section>
      ) : null}

      {(user.role === 'admin' || user.role === 'trainer') && activeTab === 'practicalWorks' ? (
        <section className="management-grid">
          <ResourceList
            title="Travaux pratiques"
            items={resources.practicalWorks}
            renderItem={(practical) => (
              <>
                <strong>{practical.title}</strong>
                <span>{practical.course?.title}</span>
                <span>{practical.trainer?.name}</span>
              </>
            )}
            onEdit={beginEditPractical}
            onDelete={(practical) => destroyResource(`/practical-works/${practical.id}`, 'TP supprimé.')}
          />
          <form className="editor-card form-grid" onSubmit={submitPractical}>
            <h3>{editing.practical ? 'Modifier TP' : 'Nouveau TP'}</h3>
            <SelectField
              label="Cours"
              value={forms.practical.course_id}
              options={resources.courses.map((item) => ({ value: String(item.id), label: item.title }))}
              onChange={(value) => updateForm('practical', 'course_id', value, setForms)}
            />
            <SelectField
              label="Formateur"
              value={String(forms.practical.trainer_id)}
              options={(user.role === 'trainer' ? [user] : resources.trainers).map((item) => ({
                value: String(item.id),
                label: item.name,
              }))}
              onChange={(value) => updateForm('practical', 'trainer_id', value, setForms)}
            />
            <TextField label="Titre" value={forms.practical.title} onChange={(value) => updateForm('practical', 'title', value, setForms)} />
            <TextAreaField label="Consignes" value={forms.practical.instructions} onChange={(value) => updateForm('practical', 'instructions', value, setForms)} />
            <TextField
              label="Echeance"
              type="datetime-local"
              value={forms.practical.due_at}
              onChange={(value) => updateForm('practical', 'due_at', value, setForms)}
            />
            <FormButtons onReset={() => resetForms()} />
          </form>
        </section>
      ) : null}

      {(user.role === 'admin' || user.role === 'trainer') && activeTab === 'assessments' ? (
        <section className="management-grid">
          <ResourceList
            title="Contrôles"
            items={resources.assessments}
            renderItem={(assessment) => (
              <>
                <strong>{assessment.title}</strong>
                <span>{assessment.course?.title}</span>
                <span>{assessment.format}</span>
              </>
            )}
            onEdit={beginEditAssessment}
            onDelete={(assessment) => destroyResource(`/assessments/${assessment.id}`, 'Contrôle supprimé.')}
          />
          <form className="editor-card form-grid" onSubmit={submitAssessment}>
            <h3>{editing.assessment ? 'Modifier controle' : 'Nouveau controle'}</h3>
            <SelectField
              label="Cours"
              value={forms.assessment.course_id}
              options={resources.courses.map((item) => ({ value: String(item.id), label: item.title }))}
              onChange={(value) => updateForm('assessment', 'course_id', value, setForms)}
            />
            <SelectField
              label="Formateur"
              value={String(forms.assessment.trainer_id)}
              options={(user.role === 'trainer' ? [user] : resources.trainers).map((item) => ({
                value: String(item.id),
                label: item.name,
              }))}
              onChange={(value) => updateForm('assessment', 'trainer_id', value, setForms)}
            />
            <TextField label="Titre" value={forms.assessment.title} onChange={(value) => updateForm('assessment', 'title', value, setForms)} />
            <SelectField
              label="Format"
              value={forms.assessment.format}
              options={[
                { value: 'quiz', label: 'Quiz' },
                { value: 'exam', label: 'Exam' },
                { value: 'project_review', label: 'Project review' },
              ]}
              onChange={(value) => updateForm('assessment', 'format', value, setForms)}
            />
            <TextField
              label="Date"
              type="datetime-local"
              value={forms.assessment.scheduled_at}
              onChange={(value) => updateForm('assessment', 'scheduled_at', value, setForms)}
            />
            <TextField
              label="Duree (minutes)"
              type="number"
              value={forms.assessment.duration_minutes}
              onChange={(value) => updateForm('assessment', 'duration_minutes', Number(value), setForms)}
            />
            <TextField
              label="Points"
              type="number"
              value={forms.assessment.total_points}
              onChange={(value) => updateForm('assessment', 'total_points', Number(value), setForms)}
            />
            <FormButtons onReset={() => resetForms()} />
          </form>
        </section>
      ) : null}

      {user.role === 'admin' && activeTab === 'trainees' ? (
        <section className="management-grid">
          <ResourceList
            title="Stagiaires"
            items={resources.trainees}
            renderItem={(trainee) => (
              <>
                <strong>{trainee.name}</strong>
                <span>{trainee.email}</span>
                <span>{trainee.enrolled_courses?.map((item) => item.title).join(', ') || 'Aucun cours'}</span>
              </>
            )}
            onEdit={beginEditTrainee}
          />
          <form className="editor-card form-grid" onSubmit={submitTrainee}>
            <h3>{editing.trainee ? 'Affecter stagiaire' : 'Selectionner un stagiaire'}</h3>
            <TextField label="Nom" value={forms.trainee.name} onChange={(value) => updateForm('trainee', 'name', value, setForms)} />
            <TextField label="E-mail" value={forms.trainee.email} onChange={(value) => updateForm('trainee', 'email', value, setForms)} />
            <TextField label="Téléphone" value={forms.trainee.phone} onChange={(value) => updateForm('trainee', 'phone', value, setForms)} />
            <TextField label="Spécialité" value={forms.trainee.specialty} onChange={(value) => updateForm('trainee', 'specialty', value, setForms)} />
            <TextAreaField label="Bio" value={forms.trainee.bio} onChange={(value) => updateForm('trainee', 'bio', value, setForms)} />
            <MultiSelectField
              label="Formateurs"
              value={forms.trainee.trainer_ids}
              options={resources.trainers.map((item) => ({ value: String(item.id), label: item.name }))}
              onChange={(value) => updateForm('trainee', 'trainer_ids', value, setForms)}
            />
            <MultiSelectField
              label="Cours"
              value={forms.trainee.course_ids}
              options={resources.courses.map((item) => ({ value: String(item.id), label: item.title }))}
              onChange={(value) => updateForm('trainee', 'course_ids', value, setForms)}
            />
            <FormButtons onReset={() => resetForms()} disabled={!editing.trainee} />
          </form>
        </section>
      ) : null}
    </main>
  )
}

function OverviewPanel({ user, dashboard, resources }) {
  const stats = dashboard?.stats ?? {}

  return (
    <section className="overview-grid">
      <div className="stats-grid">
        {Object.entries(stats).map(([key, value]) => (
          <article key={key} className="stat-card">
            <span>{tabLabel(key)}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </div>

      {user.role === 'admin' ? (
        <section className="panel">
          <h3>Vue administration</h3>
          <p className="lede">
            Gerer les formateurs, creer les modules, assigner les stagiaires et piloter
            tout le catalogue de formation depuis les onglets CRUD.
          </p>
          <div className="mini-grid">
            <InfoCard title="Derniers formateurs" items={dashboard?.recent?.trainers ?? []} field="name" />
            <InfoCard title="Derniers modules" items={dashboard?.recent?.modules ?? []} field="title" />
            <InfoCard title="Derniers cours" items={dashboard?.recent?.courses ?? []} field="title" />
          </div>
        </section>
      ) : null}

      {user.role === 'trainer' ? (
        <section className="panel">
          <h3>Espace formateur</h3>
          <div className="mini-grid">
            <InfoCard title="Modules assignes" items={dashboard?.trainer?.modules ?? []} field="title" />
            <InfoCard title="Cours geres" items={resources.courses} field="title" />
            <InfoCard title="Stagiaires suivis" items={dashboard?.trainer?.trainees ?? []} field="name" />
          </div>
        </section>
      ) : null}

      {user.role === 'trainee' ? (
        <section className="panel">
          <h3>Espace stagiaire</h3>
          <div className="mini-grid">
            <InfoCard title="Formateurs" items={dashboard?.trainee?.trainers ?? []} field="name" />
            <InfoCard title="Cours inscrits" items={dashboard?.trainee?.enrolled_courses ?? []} field="title" />
            <InfoCard title="TP a faire" items={dashboard?.practicalWorks ?? []} field="title" />
            <InfoCard title="Contrôles" items={dashboard?.assessments ?? []} field="title" />
          </div>
        </section>
      ) : null}
    </section>
  )
}

function InfoCard({ title, items, field }) {
  return (
    <article className="info-card">
      <h4>{title}</h4>
      <ul className="plain-list">
        {items.length ? items.map((item) => <li key={item.id}>{item[field]}</li>) : <li>Aucune donnee.</li>}
      </ul>
    </article>
  )
}

function ResourceList({ title, items, renderItem, onEdit, onDelete }) {
  return (
    <section className="panel">
      <h3>{title}</h3>
      <div className="list-stack">
        {items.map((item) => (
          <article key={item.id} className="resource-card">
            <div className="resource-copy">{renderItem(item)}</div>
            <div className="card-actions">
              <button type="button" className="secondary-button" onClick={() => onEdit(item)}>
                Modifier
              </button>
              {onDelete ? (
                <button type="button" className="ghost-button" onClick={() => onDelete(item)}>
                  Supprimer
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function AuthExperience({
  authMode,
  setAuthMode,
  platformName,
  error,
  feedback,
  loading,
  loginForm,
  setLoginForm,
  authForm,
  setAuthForm,
  rememberMe,
  setRememberMe,
  showLoginPassword,
  setShowLoginPassword,
  showRegisterPassword,
  setShowRegisterPassword,
  showRegisterPasswordConfirmation,
  setShowRegisterPasswordConfirmation,
  handleLogin,
  handleRegister,
}) {
  return (
    <main className="auth-shell">
      <div className="auth-layout">
        <section className="auth-hero-panel">
          <div className="auth-hero-glow auth-hero-glow-one"></div>
          <div className="auth-hero-glow auth-hero-glow-two"></div>

          <div className="auth-hero-content">
            <div className="auth-badge-pill">
              <ShieldIcon />
              <span>Accès sécurisé</span>
            </div>

            <div className="auth-logo-row">
              <div className="auth-logo-icon">
                <EduDevMark />
              </div>
              <p className="auth-hero-logo">{platformName}</p>
            </div>

            <h1 className="auth-hero-title">Bienvenue</h1>
            <p className="auth-hero-subtitle">Accédez à votre espace de formation en toute sécurité.</p>

            <div className="auth-hero-cards">
              <article className="auth-mini-card">
                <span className="auth-mini-label">Parcours de formation</span>
                <strong>Modules structurés</strong>
                <p>Suivez les cours, les contrôles et la progression depuis un seul espace.</p>
              </article>
              <article className="auth-mini-card auth-mini-card-offset">
                <span className="auth-mini-label">Accès protégé</span>
                <strong>Espace sécurisé</strong>
                <p>Une plateforme claire et sécurisée pour les équipes de formation.</p>
              </article>
            </div>
          </div>
        </section>

        <section className="auth-card premium-auth-card">
          <div className="auth-card-header">
            <div className="auth-card-logo">
              <div className="auth-card-logo-icon">
                <EduDevMark />
              </div>
              <span>{platformName}</span>
            </div>
          </div>

          <div className="auth-card-copy">
            <h2>{authMode === 'login' ? 'Connectez-vous à votre compte' : 'Créez votre compte stagiaire'}</h2>
            <p>
              {authMode === 'login'
                ? 'Entrez vos identifiants pour continuer.'
                : 'Inscrivez-vous comme stagiaire pour accéder à la plateforme.'}
            </p>
          </div>

          <div className="auth-tabs premium-tabs">
            <span
              className="auth-tab-indicator"
              style={{ transform: authMode === 'login' ? 'translateX(0%)' : 'translateX(100%)' }}
            ></span>
            <button
              type="button"
              className={authMode === 'login' ? 'auth-tab active' : 'auth-tab'}
              onClick={() => setAuthMode('login')}
            >
              Connexion
            </button>
            <button
              type="button"
              className={authMode === 'register' ? 'auth-tab active' : 'auth-tab'}
              onClick={() => setAuthMode('register')}
            >
              Inscription
            </button>
          </div>

          {error ? <p className="auth-message auth-error">{error}</p> : null}
          {feedback ? <p className="auth-message auth-success">{feedback}</p> : null}

          <div key={authMode} className="auth-form-stage">
            {authMode === 'login' ? (
              <form className="auth-form premium-auth-form" onSubmit={handleLogin}>
                <AuthField
                  label="E-mail"
                  type="email"
                  placeholder="email@exemple.com"
                  value={loginForm.email}
                  autoComplete="email"
                  onChange={(value) => setLoginForm({ ...loginForm, email: value })}
                />

                <PasswordField
                  label="Mot de passe"
                  placeholder="Entrez votre mot de passe"
                  value={loginForm.password}
                  autoComplete="current-password"
                  visible={showLoginPassword}
                  onToggle={() => setShowLoginPassword((value) => !value)}
                  onChange={(value) => setLoginForm({ ...loginForm, password: value })}
                />

                <div className="auth-meta-row">
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(event) => setRememberMe(event.target.checked)}
                    />
                    <span>Se souvenir de moi</span>
                  </label>

                  <a href="#" className="auth-link" onClick={(event) => event.preventDefault()}>
                    Mot de passe oublié ?
                  </a>
                </div>

                <SubmitButton loading={loading} label="Se connecter" loadingLabel="Connexion..." />
              </form>
            ) : (
              <form className="auth-form premium-auth-form" onSubmit={handleRegister}>
                <AuthField
                  label="Nom"
                  type="text"
                  placeholder="Entrez votre nom complet"
                  value={authForm.name}
                  autoComplete="name"
                  onChange={(value) => setAuthForm({ ...authForm, name: value })}
                />

                <AuthField
                  label="E-mail"
                  type="email"
                  placeholder="email@exemple.com"
                  value={authForm.email}
                  autoComplete="email"
                  onChange={(value) => setAuthForm({ ...authForm, email: value })}
                />

                <AuthField
                  label="Téléphone"
                  type="tel"
                  placeholder="06 12 34 56 78"
                  value={authForm.phone}
                  autoComplete="tel"
                  onChange={(value) => setAuthForm({ ...authForm, phone: value })}
                />

                <label className="field auth-field">
                  <span>Filière</span>
                  <select
                    value={authForm.filiere}
                    onChange={(event) => setAuthForm({ ...authForm, filiere: event.target.value })}
                    required
                  >
                    <option value="Développement Digital">Développement Digital</option>
                  </select>
                </label>

                <label className="field auth-field">
                  <span>Année d'études</span>
                  <select
                    value={authForm.year_level}
                    onChange={(event) => setAuthForm({ ...authForm, year_level: event.target.value })}
                    required
                  >
                    <option value="1">1ère année</option>
                    <option value="2">2ème année</option>
                  </select>
                </label>

                {authForm.year_level === '2' && (
                  <label className="field auth-field">
                    <span>Option (2ème année)</span>
                    <select
                      value={authForm.option}
                      onChange={(event) => setAuthForm({ ...authForm, option: event.target.value })}
                      required
                    >
                      <option value="Full Stack">Full Stack</option>
                      <option value="Mobile">Mobile</option>
                      <option value="RV/RA">RV/RA (Réalité Virtuelle & Réalité Augmentée)</option>
                    </select>
                  </label>
                )}

                <PasswordField
                  label="Mot de passe"
                  placeholder="Créez votre mot de passe"
                  value={authForm.password}
                  autoComplete="new-password"
                  visible={showRegisterPassword}
                  onToggle={() => setShowRegisterPassword((value) => !value)}
                  onChange={(value) => setAuthForm({ ...authForm, password: value })}
                />

                <PasswordField
                  label="Confirmez le mot de passe"
                  placeholder="Confirmez votre mot de passe"
                  value={authForm.password_confirmation}
                  autoComplete="new-password"
                  visible={showRegisterPasswordConfirmation}
                  onToggle={() => setShowRegisterPasswordConfirmation((value) => !value)}
                  onChange={(value) =>
                    setAuthForm({ ...authForm, password_confirmation: value })
                  }
                />

                <SubmitButton
                  loading={loading}
                  label="Créer le compte stagiaire"
                  loadingLabel="Création du compte..."
                />
              </form>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}

function MaintenanceExperience({ platformName, user, onLogout }) {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-6 py-12 text-center">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-3xl bg-orange-500 text-white shadow-xl shadow-orange-500/25">
          <MaintenanceIcon />
        </div>
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-orange-300">{platformName}</p>
        <h1 className="mt-4 text-3xl font-bold sm:text-4xl">Application en maintenance</h1>
        <p className="mt-4 max-w-xl text-base leading-7 text-slate-300">
          Votre espace est temporairement indisponible pendant une opération de maintenance. Les administrateurs peuvent continuer à accéder à la plateforme.
        </p>
        {user?.name ? (
          <p className="mt-6 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-200">
            Connecté en tant que {user.name}
          </p>
        ) : null}
        <button
          type="button"
          onClick={onLogout}
          className="mt-8 rounded-2xl bg-orange-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-orange-500/25 transition hover:bg-orange-400"
        >
          Déconnexion
        </button>
      </div>
    </main>
  )
}

function MaintenanceIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8" aria-hidden="true">
      <path d="M12 3.75 21 19.5H3L12 3.75Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M12 9v4.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 16.4h.01" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}

function AuthField({ label, type, placeholder, value, onChange, autoComplete }) {
  return (
    <label className="field auth-field">
      <span>{label}</span>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
        required
      />
    </label>
  )
}

function PasswordField({
  label,
  placeholder,
  value,
  onChange,
  visible,
  onToggle,
  autoComplete,
}) {
  return (
    <label className="field auth-field">
      <span>{label}</span>
      <div className="password-field">
        <input
          type={visible ? 'text' : 'password'}
          placeholder={placeholder}
          value={value}
          autoComplete={autoComplete}
          onChange={(event) => onChange(event.target.value)}
          required
        />
        <button type="button" className="password-toggle" onClick={onToggle} aria-label="Afficher ou masquer le mot de passe">
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
    </label>
  )
}

function SubmitButton({ loading, label, loadingLabel }) {
  return (
    <button className="auth-submit" disabled={loading} type="submit">
      {loading ? (
        <span className="button-loading">
          <span className="button-spinner"></span>
          <span>{loadingLabel}</span>
        </span>
      ) : (
        label
      )}
    </button>
  )
}

function EduDevMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 9.5 12 5l8 4.5-8 4.5L4 9.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M7 11.25V15c0 .88 2.24 2.5 5 2.5s5-1.62 5-2.5v-3.75"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3.5 6.5 5.75v5.38c0 4.06 2.36 7.56 5.5 9.37 3.14-1.81 5.5-5.31 5.5-9.37V5.75L12 3.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="m9.5 12 1.7 1.7L14.8 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2.75 12s3.4-5.75 9.25-5.75S21.25 12 21.25 12s-3.4 5.75-9.25 5.75S2.75 12 2.75 12Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <circle cx="12" cy="12" r="2.75" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 4.5 21 19.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path
        d="M10.58 6.42A10.4 10.4 0 0 1 12 6.25c5.85 0 9.25 5.75 9.25 5.75a16.8 16.8 0 0 1-2.73 3.41M6.27 8.59C4.13 10.24 2.75 12 2.75 12s3.4 5.75 9.25 5.75c1.4 0 2.68-.33 3.84-.87"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10.39 10.39A2.25 2.25 0 0 0 13.61 13.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function TextField({ label, value, onChange, type = 'text' }) {
  return (
    <label>
      {label}
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

function TextAreaField({ label, value, onChange }) {
  return (
    <label className="full-span">
      {label}
      <textarea value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

function SelectField({ label, value, options, onChange }) {
  return (
    <label>
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Selectionner</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function MultiSelectField({ label, value, options, onChange }) {
  return (
    <label className="full-span">
      {label}
      <select
        multiple
        value={value}
        onChange={(event) =>
          onChange(Array.from(event.target.selectedOptions, (option) => option.value))
        }
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function FormButtons({ onReset, disabled = false }) {
  return (
    <div className="button-row full-span">
      <button className="primary-button" type="submit" disabled={disabled}>
        Enregistrer
      </button>
      <button className="secondary-button" type="button" onClick={onReset}>
        Reinitialiser
      </button>
    </div>
  )
}

function tabLabel(key) {
  const labels = {
    overview: 'Vue globale',
    trainers: 'Formateurs',
    trainees: 'Stagiaires',
    modules: 'Modules',
    courses: 'Cours',
    practicalWorks: 'TP',
    assessments: 'Contrôles',
    practical_works: 'TP',
    trainers_count: 'Formateurs',
    trainees_count: 'Stagiaires',
    practicalWorks_count: 'TP',
    assessments_count: 'Contrôles',
  }

  return labels[key] || key
}

function updateForm(formName, field, value, setForms) {
  setForms((previous) => ({
    ...previous,
    [formName]: {
      ...previous[formName],
      [field]: value,
    },
  }))
}

function normalizeMultiSelect(form, fields) {
  const next = normalizeIds(form)

  fields.forEach((field) => {
    next[field] = (next[field] ?? []).map((value) => Number(value))
  })

  return next
}

function normalizeIds(form) {
  const next = { ...form }

  if ('module_id' in next && next.module_id !== '') {
    next.module_id = Number(next.module_id)
  }

  if ('trainer_id' in next && next.trainer_id !== '') {
    next.trainer_id = Number(next.trainer_id)
  }

  if ('course_id' in next && next.course_id !== '') {
    next.course_id = Number(next.course_id)
  }

  return next
}

export default App

function resolveApiBase() {
  return import.meta.env.VITE_API_URL || '/api'
}

async function parseJsonResponse(response) {
  const raw = await response.text()

  if (!raw) return {}

  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function readStoredUser() {
  try {
    const rawUser = window.localStorage.getItem(AUTH_USER_KEY)

    return rawUser ? JSON.parse(rawUser) : null
  } catch {
    return null
  }
}

function applyPlatformSettings(settings, user = null) {
  const safeSettings = settings || defaultSettings
  const useDark = getEffectiveDarkMode(safeSettings, user)

  // Apply dark mode globally on <html> — affects login page + all workspaces
  document.documentElement.classList.toggle('dark', useDark)

  // Update CSS variable --primary-color on :root → var(--accent) everywhere updates automatically
  const color = safeSettings.appearance?.primary_color ?? '#ff7900'
  document.documentElement.style.setProperty('--primary-color', color)

  // Also update document title
  document.title = safeSettings.general?.platform_name || 'EduDev'
}

function storeUser(user) {
  if (!user) {
    clearStoredUser()
    return
  }

  window.localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user))
}

function clearStoredUser() {
  window.localStorage.removeItem(AUTH_USER_KEY)
}

function clearWorkspaceCaches() {
  window.localStorage.removeItem('edudev.admin.cache')
  window.localStorage.removeItem('edudev.trainer.cache')
  window.localStorage.removeItem('edudev.trainee.cache')
}



