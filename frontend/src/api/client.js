import axios from 'axios'

const API_BASE = resolveApiBase()
const AUTH_REFRESH_KEY = 'edudev.auth.refresh_token'

let accessToken = window.localStorage.getItem('token') || null

function resolveApiBase() {
  return import.meta.env.VITE_API_URL || '/api'
}

export const setAccessToken = (token) => {
  accessToken = token
  if (token) {
    window.localStorage.setItem('token', token)
  } else {
    window.localStorage.removeItem('token')
  }
}

export const getAccessToken = () => accessToken || window.localStorage.getItem('token')

export const setRefreshToken = (token) => {
  if (token) {
    window.localStorage.setItem(AUTH_REFRESH_KEY, token)
  } else {
    window.localStorage.removeItem(AUTH_REFRESH_KEY)
  }
}

export const getRefreshToken = () => {
  return window.localStorage.getItem(AUTH_REFRESH_KEY)
}

export const client = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  headers: {
    Accept: 'application/json',
  },
})

// Request Interceptor: Attach JWT Access Token
client.interceptors.request.use(
  (config) => {
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Response Interceptor: Silent Token Refresh & Rotation (RTR) & Auto-Logout
client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    const status = error.response?.status

    if (status === 401) {
      const refreshToken = getRefreshToken()
      const requestUrl = originalRequest.url || ''
      const isAuthRoute =
        requestUrl.includes('/login') ||
        requestUrl.includes('/refresh') ||
        requestUrl.includes('/register')

      if (refreshToken && !isAuthRoute && !originalRequest._retry) {
        originalRequest._retry = true
        try {
          // Attempt silent token refresh
          const refreshResponse = await axios.post(`${API_BASE}/refresh`, {
            refresh_token: refreshToken,
          }, { withCredentials: true })

          const data = refreshResponse.data
          if (data.access_token && data.refresh_token) {
            setAccessToken(data.access_token)
            setRefreshToken(data.refresh_token)

            // Re-store user locally to sync the role/details if updated
            if (data.user) {
              window.localStorage.setItem('edudev.auth.user', JSON.stringify(data.user))
            }

            // Retry original request with new access token
            originalRequest.headers.Authorization = `Bearer ${data.access_token}`
            return client(originalRequest)
          }
        } catch (refreshError) {
          // Invalidate credentials on failure (token hijacked or expired)
          setAccessToken(null)
          setRefreshToken(null)
          window.localStorage.removeItem('edudev.auth.user')
          window.localStorage.removeItem('edudev.admin.cache')
          window.localStorage.removeItem('edudev.trainer.cache')
          window.localStorage.removeItem('edudev.trainee.cache')
          
          // Dispatch storage event to notify other open tabs
          window.localStorage.setItem('edudev.auth.logout_trigger', String(Date.now()))
          window.location.href = '/login'
          return Promise.reject(refreshError)
        }
      } else {
        // No refresh token, already retried, or auth route returned 401
        setAccessToken(null)
        setRefreshToken(null)
        window.localStorage.removeItem('edudev.auth.user')
        window.localStorage.removeItem('edudev.admin.cache')
        window.localStorage.removeItem('edudev.trainer.cache')
        window.localStorage.removeItem('edudev.trainee.cache')
        
        // Dispatch storage event
        window.localStorage.setItem('edudev.auth.logout_trigger', String(Date.now()))
        
        // Bypasses loops on login
        if (!isAuthRoute && window.location.pathname !== '/login') {
          window.location.href = '/login'
        }
      }
    }

    return Promise.reject(error)
  }
)

/**
 * Backward-compatible api wrapper accepting fetch options and mapping to Axios.
 */
export async function api(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase()
  const headers = options.headers || {}
  let data = options.body

  if (typeof data === 'string') {
    try {
      data = JSON.parse(data)
    } catch {
      // Keep as raw string if not JSON
    }
  }

  try {
    const response = await client({
      url: path,
      method,
      headers,
      data,
    })
    return response.data;
  } catch (err) {
    const status = err.response?.status || 500
    const responseData = err.response?.data || {}

    const validationErrors = responseData.errors
      ? Object.values(responseData.errors).flat().join(' ')
      : ''

    const errorMessage =
      validationErrors ||
      responseData.message ||
      `La requête a échoué sur ${path} (Statut: ${status}).`

    const requestError = new Error(errorMessage)
    requestError.status = status
    requestError.data = responseData

    throw requestError
  }
}
