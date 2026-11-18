// Minimal Supabase OAuth 2.1 consent page (documented flow: getAuthorizationDetails / approve / deny).
// No secrets, no tokens printed, DOM written with textContent only. Sign-in: email + password (Owner user must exist).
;(function (root) {
  'use strict'

  // ---- pure helpers (unit-tested) ----
  function parseAuthorizationId(search) {
    var v = new URLSearchParams(search || '').get('authorization_id')
    return v && /^[A-Za-z0-9_-]{8,128}$/.test(v) ? v : null
  }
  function scopeList(scope) {
    return typeof scope === 'string' && scope.trim() ? scope.trim().split(/\s+/) : []
  }
  function safeRedirect(url) {
    try {
      var u = new URL(url)
      return u.protocol === 'https:' ? u.toString() : null
    } catch (e) {
      return null
    }
  }
  var api = { parseAuthorizationId: parseAuthorizationId, scopeList: scopeList, safeRedirect: safeRedirect }
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  root.M01Consent = api
  if (typeof document === 'undefined') return

  // ---- page logic ----
  var $ = function (id) { return document.getElementById(id) }
  function say(msg, isErr) { var s = $('status'); s.textContent = msg; s.className = isErr ? 'err' : '' }
  function show(id, on) { $(id).hidden = !on }

  var cfg = root.M01_CONFIG || {}
  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_PUBLISHABLE_KEY || cfg.SUPABASE_PUBLISHABLE_KEY.indexOf('__') === 0) {
    say('Not configured: publishable key missing.', true)
    return
  }
  var authId = parseAuthorizationId(root.location.search)
  if (!authId) { say('Missing or invalid authorization_id. Start the connection from ChatGPT.', true); return }

  var sb = (root.supabase || root.supabaseLib).createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  })

  async function load() {
    show('login', false); show('consent', false)
    var s = await sb.auth.getSession()
    if (!s.data || !s.data.session) { say('Please sign in.'); show('login', true); return }
    var det = await sb.auth.oauth.getAuthorizationDetails(authId)
    if (det.error) { say('Cannot load request: ' + det.error.message, true); return }
    var d = det.data
    if (d && !('authorization_id' in d) && d.redirect_url) {
      // Already consented earlier: continue straight back to the client.
      var r0 = safeRedirect(d.redirect_url); if (r0) { root.location.href = r0; return }
    }
    $('who').textContent = (s.data.session.user && s.data.session.user.email) || 'unknown'
    $('client').textContent = (d.client && d.client.name) || 'unknown application'
    $('redirect').textContent = d.redirect_uri || ''
    var ul = $('scopes'); ul.textContent = ''
    var sc = scopeList(d.scope)
    if (!sc.length) { var li0 = document.createElement('li'); li0.textContent = '(none listed)'; ul.appendChild(li0) }
    sc.forEach(function (x) { var li = document.createElement('li'); li.textContent = x; ul.appendChild(li) })
    say('Review the request below.')
    show('consent', true)
  }

  async function decide(kind) {
    say('Working…')
    var res = kind === 'approve' ? await sb.auth.oauth.approveAuthorization(authId) : await sb.auth.oauth.denyAuthorization(authId)
    if (res.error) { say('Failed: ' + res.error.message, true); return }
    var dest = safeRedirect(res.data && res.data.redirect_url)
    if (!dest) { say('Unexpected response; not redirecting.', true); return }
    root.location.href = dest
  }

  $('signin').addEventListener('click', async function () {
    var r = await sb.auth.signInWithPassword({ email: $('email').value, password: $('password').value })
    $('password').value = ''
    if (r.error) { say('Sign-in failed: ' + r.error.message, true); return }
    load()
  })
  $('approve').addEventListener('click', function () { decide('approve') })
  $('deny').addEventListener('click', function () { decide('deny') })
  load()
})(typeof window !== 'undefined' ? window : globalThis)
