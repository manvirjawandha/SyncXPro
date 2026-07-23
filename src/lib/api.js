const API_URL = import.meta.env.VITE_API_URL || ''

function getToken() { return localStorage.getItem('docscan_token') }
function setToken(t) { t ? localStorage.setItem('docscan_token', t) : localStorage.removeItem('docscan_token') }

async function request(path, options = {}) {
  const token = getToken()
  const res = await fetch(`${API_URL}/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data
}

// Operator requests use a separate token so the ops session is fully isolated
// from any regular user session that might also exist in this browser.
async function opsRequest(path, options = {}) {
  const token = localStorage.getItem('syncx_ops_token')
  const res = await fetch(`${API_URL}/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data
}

export const api = {
  async signup(payload) { const data = await request('/auth/signup', { method: 'POST', body: JSON.stringify(payload) }); if (data.token) setToken(data.token); return data },
  async login(username, password) { const data = await request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }); if (data.token) setToken(data.token); return data },
  logout() { setToken(null) },
  isAuthed() { return !!getToken() },
  async getMe() { return request('/users/me') },
  async updateEmails(notifyEmails) { return request('/users/update-emails', { method: 'PUT', body: JSON.stringify({ notifyEmails }) }) },
  async getDrivers() { return request('/company/drivers') },
  async submitDocument(payload) { return request('/documents', { method: 'POST', body: JSON.stringify(payload) }) },
  async getMyDocuments() { return request('/documents/mine') },
  async getCompanyDocuments({ search, status } = {}) { const p = new URLSearchParams(); if (search) p.set('search', search); if (status && status !== 'all') p.set('status', status); const qs = p.toString(); return request(`/documents/company${qs ? `?${qs}` : ''}`) },
  async updateDocument(id, updates) { return request(`/documents/${id}`, { method: 'PUT', body: JSON.stringify(updates) }) },
  async deleteDocument(id) { return request(`/documents/${id}`, { method: 'DELETE' }) },
  async getDriversList() { return request('/company/drivers/list') },
  async createDriver(driverUsername, driverPassword, driverName) { return request('/company/drivers/create', { method: 'POST', body: JSON.stringify({ driverUsername, driverPassword, driverName }) }) },
  async deleteDriver(username) { return request(`/company/drivers/${username}`, { method: 'DELETE' }) },
  async updateCompanySettings(updates) { return request('/company/settings', { method: 'PUT', body: JSON.stringify(updates) }) },
  async getDocumentsByDriver(driverUsername) { return request(`/documents/by-driver/${driverUsername}`) },
  async getCompanySettings() { return request('/company/settings') },
  async updateEmailRouting(payload) { return request('/company/email-routing', { method: 'PUT', body: JSON.stringify(payload) }) },
  async updateDriver(username, updates) { return request(`/company/drivers/${username}`, { method: 'PUT', body: JSON.stringify(updates) }) },

  // ── Operator portal ──
  async opsCheckPath(secretPath) { return request('/ops/check-path', { method: 'POST', body: JSON.stringify({ secretPath }) }) },
  async opsLogin(username, password, secretPath) {
    const data = await request('/ops/login', { method: 'POST', body: JSON.stringify({ username, password, secretPath }) })
    if (data.token) localStorage.setItem('syncx_ops_token', data.token)
    return data
  },
  opsLogout() { localStorage.removeItem('syncx_ops_token') },
  opsIsAuthed() { return !!localStorage.getItem('syncx_ops_token') },
  async opsGetCompanies() { return opsRequest('/ops/companies') },
  async opsCreateCompany(payload) { return opsRequest('/ops/companies/create', { method: 'POST', body: JSON.stringify(payload) }) },
  async opsResendActivation(id) { return opsRequest(`/ops/companies/${id}/resend-activation`, { method: 'POST' }) },
  async opsDeleteCompany(id) { return opsRequest(`/ops/companies/${id}`, { method: 'DELETE' }) },
  async opsGetCompany(id) { return opsRequest(`/ops/companies/${id}`) },
  async opsUpdateCompany(id, payload) { return opsRequest(`/ops/companies/${id}`, { method: 'PUT', body: JSON.stringify(payload) }) },
  async opsSetCompanyStatus(id, status) { return opsRequest(`/ops/companies/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }) },
  async opsResetDriverPassword(username, newPassword) { return opsRequest(`/ops/drivers/${username}/reset-password`, { method: 'POST', body: JSON.stringify({ newPassword }) }) },
  async opsUpdateDriver(username, payload) { return opsRequest(`/ops/drivers/${username}`, { method: 'PUT', body: JSON.stringify(payload) }) },
  async opsSendDriverReset(username) { return opsRequest(`/ops/drivers/${username}/send-reset`, { method: 'POST' }) },

  // ── Activation (client-facing) ──
  async getActivation(token, company) { return request(`/activate/${token}?company=${company}`) },
  async sendActivationCode(token, company) { return request(`/activate/${token}/send-code`, { method: 'POST', body: JSON.stringify({ company }) }) },
  async completeActivation(token, company, code, password) {
    const data = await request(`/activate/${token}/complete`, { method: 'POST', body: JSON.stringify({ company, code, password }) })
    if (data.token) setToken(data.token)
    return data
  },

  // ── Contact / signup requests ──
  async submitSignupRequest(payload) { return request('/signup-request', { method: 'POST', body: JSON.stringify(payload) }) },
  async opsGetRequests() { return opsRequest('/ops/requests') },
  async opsConvertRequest(id) { return opsRequest(`/ops/requests/${id}/convert`, { method: 'POST' }) },
  async opsDeleteRequest(id) { return opsRequest(`/ops/requests/${id}`, { method: 'DELETE' }) },

  // ── Driver self-signup phone verification ──
  async driverSendCode(phone) { return request('/auth/driver-send-code', { method: 'POST', body: JSON.stringify({ phone }) }) },

  // ── Document requests (admin asks a driver for a document) ──
  async createDocRequest(payload) { return request('/company/requests', { method: 'POST', body: JSON.stringify(payload) }) },
  async getDocRequests() { return request('/company/requests') },
  async cancelDocRequest(id) { return request(`/company/requests/${id}`, { method: 'DELETE' }) },
  async getMyDocRequests() { return request('/driver/requests') },

  // ── Staff (department sub-accounts) ──
  async createStaff(payload) { return request('/company/staff', { method: 'POST', body: JSON.stringify(payload) }) },
  async getStaff() { return request('/company/staff') },
  async deleteStaff(username) { return request(`/company/staff/${username}`, { method: 'DELETE' }) },

  // ── Pay settlements ──
  async getNextPayPeriod(driverUsername) { return request(`/company/settlements/next-period/${driverUsername}`) },
  async createSettlement(payload) { return request('/company/settlements', { method: 'POST', body: JSON.stringify(payload) }) },
  async getSettlements() { return request('/company/settlements') },
  async getMySettlements() { return request('/driver/settlements') },
  async commentSettlement(id, text) { return request(`/settlements/${id}/comments`, { method: 'POST', body: JSON.stringify({ text }) }) },
  async setSettlementStatus(id, status) { return request(`/company/settlements/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }) },
  async deleteSettlement(id) { return request(`/company/settlements/${id}`, { method: 'DELETE' }) },

  // ── Password reset ──
  // Admin sets a driver's password directly (from the drivers list).
  async adminResetDriverPassword(username, newPassword) { return request(`/company/drivers/${username}/reset-password`, { method: 'POST', body: JSON.stringify({ newPassword }) }) },
  // Driver self-service via SMS OTP.
  async driverResetRequest(username) { return request('/auth/reset/driver/request', { method: 'POST', body: JSON.stringify({ username }) }) },
  async driverResetConfirm(payload) { return request('/auth/reset/driver/confirm', { method: 'POST', body: JSON.stringify(payload) }) },
  // Admin self-service: email link -> OTP to company phone -> new password.
  async adminResetRequest(email) { return request('/auth/reset/admin/request', { method: 'POST', body: JSON.stringify({ email }) }) },
  async adminResetSendCode(token, companyId) { return request('/auth/reset/admin/send-code', { method: 'POST', body: JSON.stringify({ token, companyId }) }) },
  async adminResetConfirm(payload) { return request('/auth/reset/admin/confirm', { method: 'POST', body: JSON.stringify(payload) }) },
  async driverLinkSendCode(token, driver) { return request('/auth/reset/driver-link/send-code', { method: 'POST', body: JSON.stringify({ token, driver }) }) },
  async driverLinkConfirm(payload) { return request('/auth/reset/driver-link/confirm', { method: 'POST', body: JSON.stringify(payload) }) },

  // ── Driver self-service profile ──
  async getDriverProfile() { return request('/driver/profile') },
  async updateDriverProfile(payload) { return request('/driver/profile', { method: 'PUT', body: JSON.stringify(payload) }) },
  async driverPhoneRequest(phone) { return request('/driver/profile/phone/request', { method: 'POST', body: JSON.stringify({ phone }) }) },
  async driverPhoneConfirm(payload) { return request('/driver/profile/phone/confirm', { method: 'POST', body: JSON.stringify(payload) }) },
}
