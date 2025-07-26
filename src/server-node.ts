import * as http from 'http'
import * as url from 'url'
import * as crypto from 'crypto'
import { Readable } from 'stream'
import Database from 'better-sqlite3'
import fetch from 'node-fetch'

const CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e"
const db = new Database("./claude-accounts.db")

// Configuration
const RETRY_COUNT = 3 // Number of retries per account
const RETRY_DELAY_MS = 1000 // Initial delay between retries
const RETRY_BACKOFF = 2 // Exponential backoff multiplier

// Simple logging utility
const log = {
  info: (message: string, data?: any) => {
    console.log(`[${new Date().toISOString()}] INFO: ${message}`, data ? JSON.stringify(data) : '')
  },
  error: (message: string, error?: any) => {
    console.error(`[${new Date().toISOString()}] ERROR: ${message}`, error)
  },
  warn: (message: string, data?: any) => {
    console.warn(`[${new Date().toISOString()}] WARN: ${message}`, data ? JSON.stringify(data) : '')
  }
}

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    access_token TEXT,
    expires_at INTEGER,
    created_at INTEGER NOT NULL,
    last_used INTEGER,
    request_count INTEGER DEFAULT 0,
    plan_type TEXT DEFAULT 'console',
    supported_models TEXT DEFAULT 'claude-3-5-sonnet-20241022,claude-3-haiku-20240307'
  )
`)

// Add new columns to existing tables if they don't exist
try {
  db.exec(`ALTER TABLE accounts ADD COLUMN plan_type TEXT DEFAULT 'console'`)
} catch (e) {
  // Column already exists
}
try {
  db.exec(`ALTER TABLE accounts ADD COLUMN supported_models TEXT DEFAULT 'claude-3-5-sonnet-20241022,claude-3-haiku-20240307'`)
} catch (e) {
  // Column already exists
}
try {
  db.exec(`ALTER TABLE accounts ADD COLUMN usage_window_start INTEGER DEFAULT NULL`)
} catch (e) {
  // Column already exists
}
try {
  db.exec(`ALTER TABLE accounts ADD COLUMN usage_window_requests INTEGER DEFAULT 0`)
} catch (e) {
  // Column already exists
}
try {
  db.exec(`ALTER TABLE accounts ADD COLUMN input_tokens_window INTEGER DEFAULT 0`)
} catch (e) {
  // Column already exists
}
try {
  db.exec(`ALTER TABLE accounts ADD COLUMN output_tokens_window INTEGER DEFAULT 0`)
} catch (e) {
  // Column already exists
}
try {
  db.exec(`ALTER TABLE accounts ADD COLUMN estimated_quota_remaining REAL DEFAULT 1.0`)
} catch (e) {
  // Column already exists
}
try {
  db.exec(`ALTER TABLE accounts ADD COLUMN detected_tier TEXT DEFAULT NULL`)
} catch (e) {
  // Column already exists
}
try {
  db.exec(`ALTER TABLE accounts ADD COLUMN last_tier_detection INTEGER DEFAULT NULL`)
} catch (e) {
  // Column already exists
}

db.exec(`
  CREATE TABLE IF NOT EXISTS requests (
    id TEXT PRIMARY KEY,
    timestamp INTEGER NOT NULL,
    method TEXT NOT NULL,
    path TEXT NOT NULL,
    account_used TEXT,
    status_code INTEGER,
    success BOOLEAN,
    error_message TEXT,
    response_time_ms INTEGER,
    failover_attempts INTEGER DEFAULT 0,
    input_tokens INTEGER,
    output_tokens INTEGER,
    model_used TEXT
  )
`)

// Add new columns to existing requests table
try {
  db.exec(`ALTER TABLE requests ADD COLUMN input_tokens INTEGER`)
} catch (e) {
  // Column already exists
}
try {
  db.exec(`ALTER TABLE requests ADD COLUMN output_tokens INTEGER`)
} catch (e) {
  // Column already exists
}
try {
  db.exec(`ALTER TABLE requests ADD COLUMN model_used TEXT`)
} catch (e) {
  // Column already exists
}

// Create configuration table for settings
db.exec(`
  CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )
`)

// Set default load balancing strategy
try {
  const configStmt = db.prepare(`INSERT OR IGNORE INTO config (key, value, updated_at) VALUES (?, ?, ?)`)
  configStmt.run('load_balance_strategy', 'dynamic', Date.now())
} catch (e) {
  // Config already exists
}

// Create index for faster queries
db.exec(`CREATE INDEX IF NOT EXISTS idx_requests_timestamp ON requests(timestamp DESC)`)

// Auto-ticker configuration  
const AUTO_TICKER_ENABLED = true // Re-enabled with enhanced token management
const AUTO_TICKER_INTERVAL_MS = 30 * 60 * 1000 // Check every 30 minutes
const TICKER_MESSAGE = "." // Simple period to start window

interface Account {
  id: string
  name: string
  refresh_token: string
  access_token: string | null
  expires_at: number | null
  created_at: number
  last_used: number | null
  request_count: number
  plan_type: 'console' | 'max'
  supported_models: string
  usage_window_start: number | null
  usage_window_requests: number
  input_tokens_window: number
  output_tokens_window: number
  estimated_quota_remaining: number
  detected_tier: string | null
  last_tier_detection: number | null
}

// Model configuration
const MODEL_RESTRICTIONS = {
  'claude-3-opus-20240229': ['max'], // Opus only available on Max plan
  'claude-3-5-sonnet-20241022': ['console', 'max'], // Sonnet available on both
  'claude-3-haiku-20240307': ['console', 'max'], // Haiku available on both
  'claude-3-5-haiku-20241022': ['console', 'max'], // New Haiku available on both
  'claude-sonnet-4-20250514': ['console', 'max'], // Sonnet 4 available on both
  'claude-opus-4-20250514': ['max'], // Opus 4 only available on Max plan
} as const

const PLAN_MODELS = {
  console: ['claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307', 'claude-3-5-haiku-20241022', 'claude-sonnet-4-20250514'],
  max: ['claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229', 'claude-sonnet-4-20250514', 'claude-opus-4-20250514']
} as const

function extractModelFromRequest(requestBody: Buffer | null): string | null {
  if (!requestBody || requestBody.length === 0) return null
  
  try {
    const bodyStr = requestBody.toString('utf8')
    const parsed = JSON.parse(bodyStr)
    return parsed.model || null
  } catch (error) {
    log.warn('Failed to parse request body for model extraction', { error: error instanceof Error ? error.message : error })
    return null
  }
}

function canAccountHandleModel(account: Account, model: string): boolean {
  const supportedModels = account.supported_models.split(',')
  return supportedModels.includes(model)
}

function getCompatibleAccounts(accounts: Account[], model: string | null): Account[] {
  if (!model) {
    // No specific model requested, return all accounts
    return accounts
  }
  
  // Check if model exists in our restrictions
  if (!(model in MODEL_RESTRICTIONS)) {
    log.warn(`Unknown model requested: ${model}. Allowing all accounts.`)
    return accounts
  }
  
  // Filter accounts that support this model
  const compatibleAccounts = accounts.filter(account => 
    canAccountHandleModel(account, model)
  )
  
  if (compatibleAccounts.length === 0) {
    log.error(`No accounts support model: ${model}`)
    return []
  }
  
  log.info(`Model ${model} compatible with ${compatibleAccounts.length} account(s): ${compatibleAccounts.map(a => a.name).join(', ')}`)
  return compatibleAccounts
}

async function refreshAccessToken(account: Account): Promise<string> {
  log.info(`🔄 Refreshing OAuth token for account ${account.name}`)
  
  // Use the correct OAuth endpoint based on plan type
  const oauthEndpoint = account.plan_type === 'max' 
    ? "https://claude.ai/v1/oauth/token"  // Max plan endpoint
    : "https://console.anthropic.com/v1/oauth/token"  // Console plan endpoint
  
  const response = await fetch(oauthEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: account.refresh_token,
      client_id: CLIENT_ID,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    log.error(`❌ Failed to refresh token for account ${account.name}: ${response.status} - ${errorText}`)
    throw new Error(`Failed to refresh token for account ${account.name}: ${response.statusText}`)
  }

  const json = await response.json() as any
  const newAccessToken = json.access_token as string
  const expiresAt = Date.now() + json.expires_in * 1000

  // Update account in database
  const stmt = db.prepare(`UPDATE accounts SET access_token = ?, expires_at = ? WHERE id = ?`)
  stmt.run(newAccessToken, expiresAt, account.id)

  log.info(`✅ Token refreshed successfully for account ${account.name}`)
  return newAccessToken
}

async function getValidAccessToken(account: Account, forceRefresh: boolean = false): Promise<string> {
  // Force refresh if requested or check if access token exists and is still valid
  if (!forceRefresh && account.access_token && account.expires_at && account.expires_at > Date.now()) {
    return account.access_token
  }

  // Refresh the token
  return await refreshAccessToken(account)
}

async function getValidAccessTokenWithRetry(account: Account): Promise<string> {
  try {
    return await getValidAccessToken(account)
  } catch (error) {
    log.warn(`🔄 Initial token refresh failed for ${account.name}, trying once more`)
    // Wait a moment and try once more
    await new Promise(resolve => setTimeout(resolve, 2000))
    return await getValidAccessToken(account, true)
  }
}

function getAvailableAccounts(): Account[] {
  // Get current load balancing strategy from config
  const configStmt = db.prepare(`SELECT value FROM config WHERE key = ?`)
  const strategyRow = configStmt.get('load_balance_strategy') as any
  const strategy = strategyRow?.value || 'dynamic'
  
  const FIVE_HOURS_MS = 5 * 60 * 60 * 1000
  const FOUR_HOURS_MS = 4 * 60 * 60 * 1000
  const now = Date.now()
  
  let stmt: any
  let accounts: Account[]
  
  switch (strategy) {
    case 'round_robin':
      // Original: Start all accounts simultaneously
      stmt = db.prepare(`
        SELECT * FROM accounts 
        ORDER BY 
          CASE WHEN usage_window_start IS NULL THEN 0
               WHEN (? - usage_window_start) >= ? THEN 0
               ELSE 2 END,
          usage_window_requests ASC,
          request_count ASC,
          last_used ASC NULLS FIRST,
          RANDOM()
      `)
      accounts = stmt.all(now, FIVE_HOURS_MS) as Account[]
      break
      
    case 'sequential':
      // Sequential: Use one account until exhausted, then next
      stmt = db.prepare(`
        SELECT * FROM accounts 
        ORDER BY 
          -- Prioritize active windows first
          CASE WHEN usage_window_start IS NOT NULL AND (? - usage_window_start) < ? THEN 0
               ELSE 1 END,
          -- Then accounts ready to start
          CASE WHEN usage_window_start IS NULL THEN 0
               WHEN (? - usage_window_start) >= ? THEN 0
               ELSE 2 END,
          usage_window_requests DESC,  -- Use the most used account in active window
          request_count ASC,
          last_used ASC NULLS FIRST
      `)
      accounts = stmt.all(now, FIVE_HOURS_MS, now, FIVE_HOURS_MS) as Account[]
      break
      
    case 'dynamic':
    default:
      // Dynamic: Token-aware with intelligent handoff
      stmt = db.prepare(`
        SELECT * FROM accounts 
        ORDER BY 
          -- Phase 1: Start accounts that are ready
          CASE WHEN usage_window_start IS NULL THEN 0
               WHEN (? - usage_window_start) >= ? THEN 0
               ELSE 2 END,
          -- Phase 2: Prioritize accounts with low quota remaining (need backup)
          CASE WHEN usage_window_start IS NOT NULL AND estimated_quota_remaining < 0.25 THEN 1
               ELSE 2 END,
          -- Phase 3: Load balance based on quota remaining
          estimated_quota_remaining DESC,
          usage_window_requests ASC,
          request_count ASC,
          last_used ASC NULLS FIRST,
          RANDOM()
      `)
      accounts = stmt.all(now, FIVE_HOURS_MS) as Account[]
      break
  }
  
  log.info(`🎯 Using ${strategy} strategy with ${accounts.length} accounts`)
  
  // Log algorithm decision making
  if (accounts.length > 0) {
    const selectedAccount = accounts[0]
    const windowActive = selectedAccount.usage_window_start && (now - selectedAccount.usage_window_start) < FIVE_HOURS_MS
    const quotaRemaining = selectedAccount.estimated_quota_remaining || 1.0
    
    let reason = ""
    switch (strategy) {
      case 'round_robin':
        reason = windowActive ? "Round Robin - Active Window" : "Round Robin - Start Window"
        break
      case 'sequential':
        reason = windowActive ? "Sequential - Continue Current" : "Sequential - Start Next"
        break
      case 'dynamic':
        if (!windowActive) reason = "Dynamic - Start Window"
        else if (quotaRemaining < 0.25) reason = "Dynamic - Low Quota (needs backup)"
        else reason = `Dynamic - Quota ${(quotaRemaining * 100).toFixed(0)}% remaining`
        break
    }
    
    log.info(`🎯 Selected ${selectedAccount.name} via ${strategy}: ${reason}`)
  }
  
  // Additional round-robin logic for equal accounts
  if (accounts.length >= 2) {
    const topAccounts = accounts.filter(acc => 
      acc.usage_window_requests === accounts[0].usage_window_requests &&
      acc.request_count === accounts[0].request_count
    )
    
    if (topAccounts.length > 1) {
      // Find least recently used among equal accounts
      topAccounts.sort((a, b) => (a.last_used || 0) - (b.last_used || 0))
      log.info(`🔄 Round-robin tiebreaker: ${topAccounts.length} equal accounts, chose least recently used: ${topAccounts[0].name}`)
      return [topAccounts[0], ...accounts.filter(acc => !topAccounts.includes(acc))]
    }
  }
  
  return accounts || []
}

function getAccountPhase(account: Account): string {
  const now = Date.now()
  const FIVE_HOURS_MS = 5 * 60 * 60 * 1000
  const FOUR_HOURS_MS = 4 * 60 * 60 * 1000
  
  const phase1Ready = !account.usage_window_start || (now - account.usage_window_start) >= FIVE_HOURS_MS
  const phase2Near = account.usage_window_start && (now - account.usage_window_start) >= FOUR_HOURS_MS
  
  if (phase1Ready) return "Phase 1: Round Robin (Start Ticker)"
  else if (phase2Near) return "Phase 2: Reset Priority (<1hr remaining)"
  else return "Phase 3: Load Balance"
}

function updateAccountUsage(accountId: string) {
  const now = Date.now()
  const stmt = db.prepare(`UPDATE accounts SET last_used = ?, request_count = request_count + 1 WHERE id = ?`)
  stmt.run(now, accountId)
  
  // Update usage window tracking
  updateUsageWindow(accountId, now)
}

function updateUsageWindow(accountId: string, timestamp: number) {
  const account = db.prepare(`SELECT usage_window_start, usage_window_requests FROM accounts WHERE id = ?`).get(accountId) as any
  
  if (!account) return
  
  const FIVE_HOURS_MS = 5 * 60 * 60 * 1000 // 5 hours in milliseconds
  
  // If no usage window started or current window expired, start new window
  if (!account.usage_window_start || (timestamp - account.usage_window_start) >= FIVE_HOURS_MS) {
    const stmt = db.prepare(`UPDATE accounts SET usage_window_start = ?, usage_window_requests = 1 WHERE id = ?`)
    stmt.run(timestamp, accountId)
  } else {
    // Increment requests in current window
    const stmt = db.prepare(`UPDATE accounts SET usage_window_requests = usage_window_requests + 1 WHERE id = ?`)
    stmt.run(accountId)
  }
}

function updateAccountTokenUsage(accountId: string, inputTokens: number, outputTokens: number, modelUsed: string | null) {
  const now = Date.now()
  const account = db.prepare(`SELECT usage_window_start, input_tokens_window, output_tokens_window FROM accounts WHERE id = ?`).get(accountId) as any
  
  if (!account) return
  
  const FIVE_HOURS_MS = 5 * 60 * 60 * 1000
  
  // If no usage window started or current window expired, reset token counters
  if (!account.usage_window_start || (now - account.usage_window_start) >= FIVE_HOURS_MS) {
    const stmt = db.prepare(`UPDATE accounts SET input_tokens_window = ?, output_tokens_window = ? WHERE id = ?`)
    stmt.run(inputTokens, outputTokens, accountId)
  } else {
    // Add tokens to current window
    const stmt = db.prepare(`UPDATE accounts SET input_tokens_window = input_tokens_window + ?, output_tokens_window = output_tokens_window + ? WHERE id = ?`)
    stmt.run(inputTokens, outputTokens, accountId)
  }
  
  // Update quota estimation (placeholder - will enhance with real quotas)
  updateQuotaEstimation(accountId)
}

function updateQuotaEstimation(accountId: string) {
  const account = db.prepare(`SELECT input_tokens_window, output_tokens_window, plan_type FROM accounts WHERE id = ?`).get(accountId) as any
  
  if (!account) return
  
  // Rough quota estimates (these will need to be refined based on actual limits)
  const ESTIMATED_QUOTAS = {
    'console': { input: 200000, output: 100000 }, // Pro plan estimates
    'max': { input: 500000, output: 250000 }      // Max plan estimates
  }
  
  const quota = ESTIMATED_QUOTAS[account.plan_type as keyof typeof ESTIMATED_QUOTAS] || ESTIMATED_QUOTAS.console
  
  const inputUsage = (account.input_tokens_window || 0) / quota.input
  const outputUsage = (account.output_tokens_window || 0) / quota.output
  
  // Use the higher of input/output usage percentages
  const estimatedUsage = Math.max(inputUsage, outputUsage)
  const remainingQuota = Math.max(0, 1.0 - estimatedUsage)
  
  const stmt = db.prepare(`UPDATE accounts SET estimated_quota_remaining = ? WHERE id = ?`)
  stmt.run(remainingQuota, accountId)
}

// Detect actual plan tier by testing model availability
async function detectPlanTier(account: Account): Promise<{tier: string, availableModels: string[]}> {
  const testModels = [
    { name: 'claude-3-5-haiku-20241022', tier: 'pro' },    // Available on both
    { name: 'claude-3-5-sonnet-20241022', tier: 'pro' },  // Available on both
    { name: 'claude-3-opus-20240229', tier: 'max' }       // Max plan only
  ]
  
  const availableModels: string[] = []
  let detectedTier = 'pro' // Default to pro
  
  try {
    const accessToken = await getValidAccessToken(account)
    
    for (const model of testModels) {
      try {
        const testBody = JSON.stringify({
          model: model.name,
          max_tokens: 1,
          messages: [{ role: "user", content: "Hi" }]
        })
        
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "anthropic-version": "2023-06-01",
            "user-agent": "claude-load-balancer-detector/1.0.0",
          },
          body: testBody
        })
        
        // If we get a non-403 response, the model is available
        if (response.status !== 403) {
          availableModels.push(model.name)
          if (model.tier === 'max') {
            detectedTier = 'max'
          }
        }
        
        // Small delay between tests
        await new Promise(resolve => setTimeout(resolve, 500))
        
      } catch (error) {
        log.warn(`Failed to test model ${model.name} for account ${account.name}:`, error)
      }
    }
    
  } catch (error) {
    log.error(`Failed to detect plan tier for account ${account.name}:`, error)
  }
  
  return { tier: detectedTier, availableModels }
}

function getUsageWindowInfo(account: Account) {
  if (!account.usage_window_start) {
    return {
      windowActive: false,
      windowStarted: null,
      windowEnds: null,
      requestsInWindow: 0,
      timeUntilReset: null
    }
  }
  
  const FIVE_HOURS_MS = 5 * 60 * 60 * 1000
  const now = Date.now()
  const windowEnd = account.usage_window_start + FIVE_HOURS_MS
  const isActive = now < windowEnd
  
  return {
    windowActive: isActive,
    windowStarted: new Date(account.usage_window_start).toISOString(),
    windowEnds: new Date(windowEnd).toISOString(),
    requestsInWindow: account.usage_window_requests,
    timeUntilReset: isActive ? windowEnd - now : 0
  }
}

// Auto-ticker system to keep windows active
async function sendTickerRequest(account: Account): Promise<boolean> {
  try {
    log.info(`🕐 Auto-ticker: Starting window for account ${account.name}`)
    
    const accessToken = await getValidAccessTokenWithRetry(account)
    const tickerBody = JSON.stringify({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 5,
      messages: [{ role: "user", content: TICKER_MESSAGE }]
    })
    
    // Both Max and Pro plans use the same API endpoint
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
        "user-agent": "claude-load-balancer-ticker/1.0.0",
      },
      body: tickerBody
    })
    
    if (response.ok) {
      updateAccountUsage(account.id)
      log.info(`✅ Auto-ticker: Window started for account ${account.name}`)
      return true
    } else {
      const errorText = await response.text()
      log.warn(`❌ Auto-ticker failed for account ${account.name}: ${response.status} - ${errorText}`)
      
      // If it's a 401/403, the token might have scope issues
      if (response.status === 401 || response.status === 403) {
        log.warn(`🔒 Account ${account.name} has OAuth token issues - may need re-authorization`)
      }
      return false
    }
  } catch (error) {
    log.error(`Auto-ticker error for account ${account.name}:`, error)
    return false
  }
}

async function checkAndStartWindows() {
  if (!AUTO_TICKER_ENABLED) return
  
  const stmt = db.prepare(`
    SELECT * FROM accounts 
    WHERE usage_window_start IS NULL 
       OR (? - usage_window_start) >= ?
  `)
  const FIVE_HOURS_MS = 5 * 60 * 60 * 1000
  const accountsNeedingTicker = stmt.all(Date.now(), FIVE_HOURS_MS) as Account[]
  
  if (accountsNeedingTicker.length > 0) {
    log.info(`🕐 Auto-ticker: Found ${accountsNeedingTicker.length} "Ready" accounts (never started or expired windows)`)
    
    for (const account of accountsNeedingTicker) {
      const windowInfo = getUsageWindowInfo(account)
      log.info(`🕐 Auto-ticker: Account ${account.name} is ${!windowInfo.windowActive ? 'Ready' : 'Active'} - ${windowInfo.windowActive ? 'Skipping' : 'Starting window'}`)
      
      if (!windowInfo.windowActive) {
        await sendTickerRequest(account)
        // Small delay between requests to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }
  } else {
    log.info(`🕐 Auto-ticker: All accounts have active windows - no ticker needed`)
  }
}

// Proactive token refresh system
async function refreshExpiringTokens() {
  const stmt = db.prepare(`
    SELECT * FROM accounts 
    WHERE expires_at IS NOT NULL 
      AND expires_at < ? 
      AND expires_at > 0
  `)
  const THIRTY_MINUTES_MS = 30 * 60 * 1000
  const expiringAccounts = stmt.all(Date.now() + THIRTY_MINUTES_MS) as Account[]
  
  if (expiringAccounts.length > 0) {
    log.info(`🔄 Found ${expiringAccounts.length} accounts with tokens expiring soon`)
    
    for (const account of expiringAccounts) {
      try {
        await getValidAccessToken(account, true) // Force refresh
        log.info(`✅ Proactively refreshed token for account ${account.name}`)
      } catch (error) {
        log.error(`❌ Failed to proactively refresh token for account ${account.name}:`, error)
      }
      // Small delay between refreshes
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }
}

// Auto-ticker scheduler function
function scheduleAutoTicker() {
    const now = new Date()
    const currentMinutes = now.getMinutes()
    const currentSeconds = now.getSeconds()
    
    // Calculate time until next 10 minutes past the hour or 40 minutes past the hour
    let nextTriggerMinutes: number
    if (currentMinutes < 10) {
      nextTriggerMinutes = 10 // Next is 10 minutes past this hour
    } else if (currentMinutes < 40) {
      nextTriggerMinutes = 40 // Next is 40 minutes past this hour
    } else {
      nextTriggerMinutes = 70 // Next is 10 minutes past next hour (60 + 10)
    }
    
    const timeUntilNext = ((nextTriggerMinutes - currentMinutes) * 60 - currentSeconds) * 1000
    
    log.info(`🕐 Auto-ticker scheduled: next run in ${Math.round(timeUntilNext / 1000 / 60)} minutes at ${nextTriggerMinutes >= 60 ? `${String(now.getHours() + 1).padStart(2, '0')}:10` : `${String(now.getHours()).padStart(2, '0')}:${String(nextTriggerMinutes).padStart(2, '0')}`}`)
    
    setTimeout(() => {
      checkAndStartWindows()
      // Schedule regular interval from now on
      setInterval(checkAndStartWindows, AUTO_TICKER_INTERVAL_MS)
    }, timeUntilNext)
}

// Start the auto-ticker system - runs every 30 minutes starting at 10 minutes past each hour
if (AUTO_TICKER_ENABLED) {
  scheduleAutoTicker()
  // Also run once on startup after a short delay for immediate availability
  setTimeout(checkAndStartWindows, 30000) // 30 seconds after startup
}

// Start proactive token refresh system (runs every 15 minutes)
setInterval(refreshExpiringTokens, 15 * 60 * 1000)
setTimeout(refreshExpiringTokens, 60000) // Run after 1 minute on startup

// Helper function to read request body
function getRequestBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
  })
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url || '', true)
  const pathname = parsedUrl.pathname || ''
  
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200)
    res.end()
    return
  }
  
  // Health check endpoint
  if (pathname === "/health") {
    const stmt = db.prepare("SELECT COUNT(*) as count FROM accounts")
    const accountCount = stmt.get() as { count: number }
    const response = JSON.stringify({ 
      status: "ok", 
      accounts: accountCount?.count || 0,
      timestamp: new Date().toISOString()
    })
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(response)
    return
  }

  // UI Dashboard
  if (pathname === "/" || pathname === "/dashboard") {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Claude Load Balancer Dashboard</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background: #f5f5f5;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        h1 {
            color: #333;
            margin-bottom: 30px;
        }
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .stat-card {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .stat-card h3 {
            margin: 0 0 10px 0;
            color: #666;
            font-size: 14px;
            text-transform: uppercase;
        }
        .stat-value {
            font-size: 32px;
            font-weight: bold;
            color: #333;
        }
        .accounts-section, .requests-section, .model-availability-section {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            margin-bottom: 20px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
        }
        th, td {
            text-align: left;
            padding: 12px;
            border-bottom: 1px solid #eee;
        }
        th {
            font-weight: 600;
            color: #666;
        }
        .status-success {
            color: #10b981;
        }
        .status-error {
            color: #ef4444;
        }
        .refresh-btn {
            background: #3b82f6;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
        }
        .refresh-btn:hover {
            background: #2563eb;
        }
        .window-active {
            color: #10b981;
        }
        .window-expired {
            color: #f59e0b;
        }
        .window-ready {
            color: #6b7280;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Claude Load Balancer Dashboard</h1>
        
        <div class="stats" id="stats">
            <div class="stat-card">
                <h3>Total Requests</h3>
                <div class="stat-value" id="totalRequests">-</div>
            </div>
            <div class="stat-card">
                <h3>Success Rate</h3>
                <div class="stat-value" id="successRate">-</div>
            </div>
            <div class="stat-card">
                <h3>Active Accounts</h3>
                <div class="stat-value" id="activeAccounts">-</div>
            </div>
            <div class="stat-card">
                <h3>Avg Response Time</h3>
                <div class="stat-value" id="avgResponseTime">-</div>
            </div>
        </div>

        <div class="model-availability-section">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <h2 style="margin: 0;">Model Support</h2>
                <button id="toggleModelMatrix" style="padding: 6px 12px; border: 1px solid #d1d5db; border-radius: 6px; background: white; cursor: pointer; font-size: 12px;">
                    Show Details
                </button>
            </div>
            <div id="modelSummary" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 15px;">
                <div style="padding: 12px; background: #f0f9ff; border-radius: 6px; border-left: 4px solid #3b82f6;">
                    <div style="font-weight: 600; color: #1e40af;">Opus Available</div>
                    <div id="opusCount" style="font-size: 24px; font-weight: bold; color: #3b82f6;">-</div>
                </div>
                <div style="padding: 12px; background: #f0fdf4; border-radius: 6px; border-left: 4px solid #10b981;">
                    <div style="font-weight: 600; color: #065f46;">Sonnet Available</div>
                    <div id="sonnetCount" style="font-size: 24px; font-weight: bold; color: #10b981;">-</div>
                </div>
                <div style="padding: 12px; background: #fefce8; border-radius: 6px; border-left: 4px solid #eab308;">
                    <div style="font-weight: 600; color: #92400e;">Haiku Available</div>
                    <div id="haikuCount" style="font-size: 24px; font-weight: bold; color: #eab308;">-</div>
                </div>
            </div>
            <div id="modelMatrix" style="display: none; margin-bottom: 20px; padding: 15px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
                <div style="display: grid; grid-template-columns: 200px repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; align-items: center;">
                    <div style="font-weight: bold;">Model</div>
                    <div id="modelHeaders" style="display: contents;"></div>
                    <div id="modelRows" style="display: contents;"></div>
                </div>
            </div>
        </div>

        <div class="accounts-section">
            <h2>Accounts & Usage Windows</h2>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding: 15px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px; color: white;">
                <div style="display: flex; align-items: center; gap: 15px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 18px;">🕐</span>
                        <span style="font-weight: 600;">Auto-Ticker:</span>
                        <span title="Runs every ${AUTO_TICKER_INTERVAL_MS / 60000} minutes starting at 10 minutes past each hour (10:10, 10:40, 11:10, etc.) and starts windows only when Ready" style="cursor: help;">
                            ${AUTO_TICKER_ENABLED ? '✅ Active' : '❌ Disabled'}
                        </span>
                    </div>
                    <div style="height: 20px; width: 1px; background: rgba(255,255,255,0.3);"></div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 18px;">⚡</span>
                        <span style="font-weight: 600;">Strategy:</span>
                        <select id="loadBalanceStrategy" style="padding: 6px 12px; border-radius: 6px; border: none; background: rgba(255,255,255,0.9); color: #333; font-weight: 500;">
                            <option value="round_robin">Round Robin</option>
                            <option value="sequential">Sequential</option>
                            <option value="dynamic" selected>Dynamic</option>
                        </select>
                    </div>
                </div>
                <div id="strategyDescription" style="font-style: italic; opacity: 0.9; color: rgba(255,255,255,0.9); font-size: 14px;"></div>
            </div>
            <table id="accountsTable">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Plan Tier</th>
                        <th>Requests</th>
                        <th>Usage Window</th>
                        <th>Tokens Used</th>
                        <th>Quota Remaining</th>
                        <th>Next Reset</th>
                        <th>Token Status</th>
                    </tr>
                </thead>
                <tbody></tbody>
            </table>
        </div>

        <div class="requests-section">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h2>Recent Requests</h2>
                <button class="refresh-btn" onclick="refreshData()">Refresh</button>
            </div>
            <table id="requestsTable">
                <thead>
                    <tr>
                        <th>Time</th>
                        <th>Method</th>
                        <th>Path</th>
                        <th>Account</th>
                        <th>Status</th>
                        <th>Response Time</th>
                        <th>Failovers</th>
                    </tr>
                </thead>
                <tbody></tbody>
            </table>
        </div>
    </div>

    <script>
        async function fetchStats() {
            const response = await fetch('/api/stats');
            return response.json();
        }

        async function fetchAccounts() {
            const response = await fetch('/api/accounts');
            return response.json();
        }

        async function fetchRequests() {
            const response = await fetch('/api/requests?limit=50');
            return response.json();
        }

        async function fetchConfig() {
            const response = await fetch('/api/config');
            return response.json();
        }

        async function updateConfig(key, value) {
            const response = await fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key, value })
            });
            return response.json();
        }

        function formatDate(timestamp) {
            return new Date(timestamp).toLocaleString();
        }

        function formatResponseTime(ms) {
            if (ms < 1000) return ms + 'ms';
            return (ms / 1000).toFixed(2) + 's';
        }

        function formatTimeUntilReset(ms) {
            if (!ms || ms <= 0) return 'Ready';
            
            const hours = Math.floor(ms / (1000 * 60 * 60));
            const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((ms % (1000 * 60)) / 1000);
            
            if (hours > 0) {
                return \`\${hours}h \${minutes}m\`;
            } else if (minutes > 0) {
                return \`\${minutes}m \${seconds}s\`;
            } else {
                return \`\${seconds}s\`;
            }
        }

        function formatTokenUsage(inputTokens, outputTokens) {
            if (!inputTokens && !outputTokens) return '-';
            
            const formatNum = (num) => {
                if (!num) return '0';
                if (num < 1000) return num.toString();
                if (num < 1000000) return (num / 1000).toFixed(1) + 'K';
                return (num / 1000000).toFixed(1) + 'M';
            };
            
            return \`\${formatNum(inputTokens)} in / \${formatNum(outputTokens)} out\`;
        }

        function formatQuotaRemaining(quotaRemaining) {
            if (quotaRemaining === null || quotaRemaining === undefined) return '-';
            
            const percentage = Math.round(quotaRemaining * 100);
            let color = '#10b981'; // green
            let icon = '🟢';
            
            if (percentage < 25) {
                color = '#ef4444'; // red
                icon = '🔴';
            } else if (percentage < 50) {
                color = '#f59e0b'; // yellow
                icon = '🟡';
            }
            
            return \`<span style="color: \${color};">\${icon} \${percentage}%</span>\`;
        }

        function formatPlanTier(originalPlanType) {
            return originalPlanType === 'max' ? '🎯 Max' : '📝 Pro';
        }

        function updateStrategyDescription(strategy) {
            const descriptions = {
                'round_robin': 'Starts all accounts simultaneously for maximum initial capacity',
                'sequential': 'Uses one account until exhausted, then switches - zero service gaps',
                'dynamic': 'Intelligently predicts quota usage and starts accounts proactively'
            };
            
            document.getElementById('strategyDescription').textContent = descriptions[strategy] || '';
        }

        async function handleStrategyChange(event) {
            const newStrategy = event.target.value;
            
            try {
                await updateConfig('load_balance_strategy', newStrategy);
                updateStrategyDescription(newStrategy);
                
                // Show success feedback
                const desc = document.getElementById('strategyDescription');
                const originalText = desc.textContent;
                desc.textContent = '✅ Strategy updated successfully!';
                desc.style.color = '#10b981';
                
                setTimeout(() => {
                    updateStrategyDescription(newStrategy);
                    desc.style.color = '#6b7280';
                }, 2000);
                
            } catch (error) {
                console.error('Failed to update strategy:', error);
                alert('Failed to update load balancing strategy');
            }
        }


        function setupInlineEditing() {
            // Setup name editing
            document.querySelectorAll('.editable-name').forEach(nameSpan => {
                nameSpan.addEventListener('mouseenter', function() {
                    this.style.backgroundColor = '#f3f4f6';
                });
                
                nameSpan.addEventListener('mouseleave', function() {
                    this.style.backgroundColor = '';
                });
                
                nameSpan.addEventListener('click', function() {
                    const currentName = this.textContent;
                    const accountId = this.dataset.accountId;
                    
                    const input = document.createElement('input');
                    input.type = 'text';
                    input.value = currentName;
                    input.style.cssText = 'padding: 2px 6px; border: 1px solid #3b82f6; border-radius: 4px; outline: none; width: 120px;';
                    
                    this.replaceWith(input);
                    input.focus();
                    input.select();
                    
                    const saveEdit = async () => {
                        const newName = input.value.trim();
                        if (newName && newName !== currentName) {
                            try {
                                const response = await fetch('/api/rename-account', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ oldName: currentName, newName: newName })
                                });
                                
                                if (response.ok) {
                                    updateDashboard(); // Refresh dashboard
                                } else {
                                    throw new Error('Failed to rename account');
                                }
                            } catch (error) {
                                alert('Failed to rename account: ' + error.message);
                                input.replaceWith(nameSpan);
                            }
                        } else {
                            input.replaceWith(nameSpan);
                        }
                    };
                    
                    input.addEventListener('blur', saveEdit);
                    input.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') saveEdit();
                        if (e.key === 'Escape') input.replaceWith(nameSpan);
                    });
                });
            });
        }

        function updateModelSummary(accounts) {
            // Count available accounts for each model type
            let opusCount = 0;
            let sonnetCount = 0; 
            let haikuCount = 0;
            
            accounts.forEach(account => {
                if (!account.token_valid) return;
                
                const supportedModels = account.supported_models ? account.supported_models.split(',') : [];
                
                if (supportedModels.includes('claude-3-opus-20240229')) opusCount++;
                if (supportedModels.some(m => m.includes('sonnet'))) sonnetCount++;
                if (supportedModels.some(m => m.includes('haiku'))) haikuCount++;
            });
            
            document.getElementById('opusCount').textContent = opusCount + ' accounts';
            document.getElementById('sonnetCount').textContent = sonnetCount + ' accounts';
            document.getElementById('haikuCount').textContent = haikuCount + ' accounts';
        }

        function updateModelMatrix(accounts) {
            const allModels = [
                'claude-3-5-sonnet-20241022',
                'claude-sonnet-4-20250514',
                'claude-3-haiku-20240307', 
                'claude-3-5-haiku-20241022',
                'claude-3-opus-20240229',
                'claude-opus-4-20250514'
            ];
            
            const modelNames = {
                'claude-3-5-sonnet-20241022': 'Sonnet 3.5',
                'claude-sonnet-4-20250514': 'Sonnet 4 ⚡',
                'claude-3-haiku-20240307': 'Haiku 3',
                'claude-3-5-haiku-20241022': 'Haiku 3.5',
                'claude-3-opus-20240229': 'Opus 3 🎯',
                'claude-opus-4-20250514': 'Opus 4 🚀'
            };
            
            // Update headers
            const modelHeaders = document.getElementById('modelHeaders');
            modelHeaders.innerHTML = accounts.map(account => 
                \`<div style="font-weight: bold; text-align: center;">\${account.name}</div>\`
            ).join('');
            
            // Update rows
            const modelRows = document.getElementById('modelRows');
            modelRows.innerHTML = allModels.map(model => {
                const modelRow = [\`<div style="font-weight: 500;">\${modelNames[model]}</div>\`];
                
                accounts.forEach(account => {
                    const supportedModels = account.supported_models ? account.supported_models.split(',') : [];
                    const isSupported = supportedModels.includes(model);
                    
                    modelRow.push(\`
                        <div style="text-align: center; padding: 5px;">
                            \${isSupported ? 
                                (account.token_valid ? 
                                    \`<span style="color: #10b981;">✅</span>\` : 
                                    \`<span style="color: #f59e0b;">⚠️</span>\`
                                ) : 
                                \`<span style="color: #ef4444;">❌</span>\`
                            }
                        </div>
                    \`);
                });
                
                return modelRow.join('');
            }).join('');
        }

        async function updateDashboard() {
            try {
                // Update stats
                const stats = await fetchStats();
                document.getElementById('totalRequests').textContent = stats.totalRequests;
                document.getElementById('successRate').textContent = stats.successRate + '%';
                document.getElementById('activeAccounts').textContent = stats.activeAccounts;
                document.getElementById('avgResponseTime').textContent = formatResponseTime(stats.avgResponseTime);

                // Update accounts table
                const accounts = await fetchAccounts();
                
                // Update model summary and matrix
                updateModelSummary(accounts);
                updateModelMatrix(accounts);
                
                const accountsTableBody = document.querySelector('#accountsTable tbody');
                accountsTableBody.innerHTML = accounts.map(account => \`
                    <tr>
                        <td>
                            <span class="editable-name" data-account-id="\${account.name}" style="cursor: pointer; padding: 2px 6px; border-radius: 4px; transition: background 0.2s;" 
                                  title="Click to edit name">\${account.name}</span> 
                            \${account.plan_type === 'max' ? '🎯' : ''}
                        </td>
                        <td>
                            <span>\${formatPlanTier(account.plan_type)}</span>
                        </td>
                        <td>\${account.request_count}</td>
                        <td>\${account.windowActive ? 
                            \`🟢 Active (\${account.requestsInWindow} reqs)\` : 
                            (account.windowStarted ? '⭕ Expired' : '⚪ Not Started')
                        }</td>
                        <td>\${formatTokenUsage(account.input_tokens_window, account.output_tokens_window)}</td>
                        <td>\${formatQuotaRemaining(account.estimated_quota_remaining)}</td>
                        <td>\${formatTimeUntilReset(account.timeUntilReset)}</td>
                        <td>\${account.token_valid ? '✅ Valid' : '❌ Expired'}</td>
                    </tr>
                \`).join('');

                // Add event listeners for inline editing
                setupInlineEditing();

                // Update requests table
                const requests = await fetchRequests();
                const requestsTableBody = document.querySelector('#requestsTable tbody');
                requestsTableBody.innerHTML = requests.map(request => \`
                    <tr>
                        <td>\${formatDate(request.timestamp)}</td>
                        <td>\${request.method}</td>
                        <td>\${request.path}</td>
                        <td>\${request.account_used || 'N/A'}</td>
                        <td class="\${request.success ? 'status-success' : 'status-error'}">
                            \${request.status_code || 'Failed'}
                        </td>
                        <td>\${formatResponseTime(request.response_time_ms)}</td>
                        <td>\${request.failover_attempts}</td>
                    </tr>
                \`).join('');
            } catch (error) {
                console.error('Error updating dashboard:', error);
            }
        }

        function refreshData() {
            updateDashboard();
        }

        // Initialize dashboard
        async function initializeDashboard() {
            // Load current strategy from config
            try {
                const config = await fetchConfig();
                const currentStrategy = config.load_balance_strategy || 'dynamic';
                
                const strategySelect = document.getElementById('loadBalanceStrategy');
                strategySelect.value = currentStrategy;
                updateStrategyDescription(currentStrategy);
                
                // Add event listener for strategy changes
                strategySelect.addEventListener('change', handleStrategyChange);
                
                // Add toggle for model matrix
                const toggleButton = document.getElementById('toggleModelMatrix');
                const modelMatrix = document.getElementById('modelMatrix');
                
                toggleButton.addEventListener('click', () => {
                    if (modelMatrix.style.display === 'none') {
                        modelMatrix.style.display = 'block';
                        toggleButton.textContent = 'Hide Details';
                    } else {
                        modelMatrix.style.display = 'none';
                        toggleButton.textContent = 'Show Details';
                    }
                });
                
            } catch (error) {
                console.error('Failed to load configuration:', error);
            }
            
            // Load dashboard data
            updateDashboard();
        }

        // Initial load and auto-refresh every 5 seconds
        initializeDashboard();
        setInterval(updateDashboard, 5000);
    </script>
</body>
</html>
    `
    res.writeHead(200, { "Content-Type": "text/html" })
    res.end(html)
    return
  }

  // API endpoints for the dashboard
  if (pathname === "/api/stats") {
    const stmt = db.prepare(`
      SELECT 
        COUNT(*) as totalRequests,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successfulRequests,
        AVG(response_time_ms) as avgResponseTime
      FROM requests
    `)
    const stats = stmt.get() as any
    
    const accountStmt = db.prepare("SELECT COUNT(*) as count FROM accounts")
    const accountCount = accountStmt.get() as { count: number }
    
    const successRate = stats?.totalRequests > 0 
      ? Math.round((stats.successfulRequests / stats.totalRequests) * 100)
      : 0

    const response = JSON.stringify({
      totalRequests: stats?.totalRequests || 0,
      successRate,
      activeAccounts: accountCount?.count || 0,
      avgResponseTime: Math.round(stats?.avgResponseTime || 0)
    })
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(response)
    return
  }

  if (pathname === "/api/accounts") {
    const stmt = db.prepare(`
      SELECT 
        name, 
        request_count, 
        last_used,
        usage_window_start,
        usage_window_requests,
        plan_type,
        supported_models,
        input_tokens_window,
        output_tokens_window,
        estimated_quota_remaining,
        detected_tier,
        last_tier_detection,
        CASE 
          WHEN expires_at > ? THEN 1 
          ELSE 0 
        END as token_valid
      FROM accounts
      ORDER BY request_count DESC
    `)
    const accountsData = stmt.all(Date.now()) as any[]
    
    // Add usage window information to each account
    const accountsWithWindows = accountsData.map(account => {
      const windowInfo = getUsageWindowInfo(account as Account)
      return {
        ...account,
        ...windowInfo
      }
    })
    
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify(accountsWithWindows))
    return
  }

  if (pathname === "/api/requests") {
    const limit = parseInt(parsedUrl.query.limit as string || "50")
    const stmt = db.prepare(`
      SELECT * FROM requests
      ORDER BY timestamp DESC
      LIMIT ?
    `)
    const requests = stmt.all(limit)
    
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify(requests))
    return
  }

  if (pathname === "/api/config") {
    if (req.method === 'GET') {
      // Get configuration values
      const stmt = db.prepare(`SELECT key, value FROM config`)
      const configRows = stmt.all()
      
      const config: Record<string, string> = {}
      configRows.forEach((row: any) => {
        config[row.key] = row.value
      })
      
      res.writeHead(200, { "Content-Type": "application/json" })
      res.end(JSON.stringify(config))
      return
      
    } else if (req.method === 'POST') {
      // Update configuration value
      try {
        const requestBodyStr = requestBody.toString()
        const { key, value } = JSON.parse(requestBodyStr)
        
        const stmt = db.prepare(`INSERT OR REPLACE INTO config (key, value, updated_at) VALUES (?, ?, ?)`)
        stmt.run(key, value, Date.now())
        
        log.info(`Configuration updated: ${key} = ${value}`)
        
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ success: true, key, value }))
        return
        
      } catch (error) {
        log.error('Failed to update configuration:', error)
        res.writeHead(400, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ error: 'Invalid request body' }))
        return
      }
    }
  }

  // Removed /api/detect-plans endpoint
  if (false && pathname === "/api/detect-plans") {
    if (req.method === 'POST') {
      // Trigger plan detection for all accounts
      try {
        const stmt = db.prepare(`SELECT * FROM accounts`)
        const accounts = stmt.all() as Account[]
        
        const detectionResults = []
        
        for (const account of accounts) {
          try {
            log.info(`🔍 Detecting plan tier for account ${account.name}...`)
            const detection = await detectPlanTier(account)
            
            // Update database with detected info
            const updateStmt = db.prepare(`
              UPDATE accounts 
              SET detected_tier = ?, supported_models = ?, last_tier_detection = ?
              WHERE id = ?
            `)
            updateStmt.run(detection.tier, detection.availableModels.join(','), Date.now(), account.id)
            
            detectionResults.push({
              name: account.name,
              detectedTier: detection.tier,
              availableModels: detection.availableModels,
              originalPlanType: account.plan_type
            })
            
            log.info(`✅ Account ${account.name}: detected ${detection.tier} tier with ${detection.availableModels.length} models`)
            
          } catch (error) {
            log.error(`❌ Failed to detect plan for ${account.name}:`, error)
            detectionResults.push({
              name: account.name,
              error: error instanceof Error ? error.message : String(error)
            })
          }
        }
        
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ success: true, results: detectionResults }))
        return
        
      } catch (error) {
        log.error('Failed to detect plans:', error)
        res.writeHead(500, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ error: 'Plan detection failed' }))
        return
      }
    }
  }

  if (pathname === "/api/rename-account") {
    if (req.method === 'POST') {
      try {
        const requestBodyStr = requestBody.toString()
        const { oldName, newName } = JSON.parse(requestBodyStr)
        
        if (!oldName || !newName) {
          res.writeHead(400, { "Content-Type": "application/json" })
          res.end(JSON.stringify({ error: 'Missing oldName or newName' }))
          return
        }
        
        // Check if new name already exists
        const existingStmt = db.prepare(`SELECT id FROM accounts WHERE name = ?`)
        const existing = existingStmt.get(newName)
        
        if (existing) {
          res.writeHead(400, { "Content-Type": "application/json" })
          res.end(JSON.stringify({ error: 'Account name already exists' }))
          return
        }
        
        // Update account name
        const updateStmt = db.prepare(`UPDATE accounts SET name = ? WHERE name = ?`)
        const result = updateStmt.run(newName, oldName)
        
        if (result.changes > 0) {
          log.info(`Account renamed from ${oldName} to ${newName}`)
          res.writeHead(200, { "Content-Type": "application/json" })
          res.end(JSON.stringify({ success: true, oldName, newName }))
        } else {
          res.writeHead(404, { "Content-Type": "application/json" })
          res.end(JSON.stringify({ error: 'Account not found' }))
        }
        return
        
      } catch (error) {
        log.error('Failed to rename account:', error)
        res.writeHead(500, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ error: 'Failed to rename account' }))
        return
      }
    }
  }

  // Removed /api/reauth-account endpoint - use CLI instead
  if (false && pathname === "/api/reauth-account") {
    if (req.method === 'POST') {
      try {
        const requestBodyStr = requestBody.toString()
        const { accountName } = JSON.parse(requestBodyStr)
        
        if (!accountName) {
          res.writeHead(400, { "Content-Type": "application/json" })
          res.end(JSON.stringify({ error: 'Missing accountName' }))
          return
        }
        
        // Find the account
        const accountStmt = db.prepare(`SELECT * FROM accounts WHERE name = ?`)
        const account = accountStmt.get(accountName) as Account | undefined
        
        if (!account) {
          res.writeHead(404, { "Content-Type": "application/json" })
          res.end(JSON.stringify({ error: 'Account not found' }))
          return
        }
        
        // Generate OAuth URL (similar to CLI)
        const state = crypto.randomBytes(32).toString('hex')
        const codeVerifier = crypto.randomBytes(32).toString('base64url')
        const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url')
        
        const oauthUrl = new URL(`https://${account.plan_type === 'max' ? 'claude.ai' : 'console.anthropic.com'}/oauth/authorize`)
        oauthUrl.searchParams.set('client_id', CLIENT_ID)
        oauthUrl.searchParams.set('response_type', 'code')
        oauthUrl.searchParams.set('redirect_uri', 'urn:ietf:wg:oauth:2.0:oob')
        oauthUrl.searchParams.set('scope', 'user:inference')
        oauthUrl.searchParams.set('state', state)
        oauthUrl.searchParams.set('code_challenge', codeChallenge)
        oauthUrl.searchParams.set('code_challenge_method', 'S256')
        
        // Store challenge for later verification (you'd need to implement the callback handling)
        log.info(`Generated re-auth URL for account ${accountName}`)
        
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ 
          success: true, 
          authUrl: oauthUrl.toString(),
          message: 'Complete authentication and manually update tokens via CLI'
        }))
        return
        
      } catch (error) {
        log.error('Failed to generate re-auth URL:', error)
        res.writeHead(500, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ error: 'Failed to generate re-auth URL' }))
        return
      }
    }
  }

  if (pathname === "/api/algorithm-test") {
    // Test endpoint to show algorithm behavior
    const allAccounts = getAvailableAccounts()
    const modelRequested = parsedUrl.query.model as string || "claude-3-5-sonnet-20241022"
    const compatibleAccounts = getCompatibleAccounts(allAccounts, modelRequested)
    
    const algorithmInfo = {
      requestedModel: modelRequested,
      totalAccounts: allAccounts.length,
      compatibleAccounts: compatibleAccounts.length,
      selectedAccount: compatibleAccounts.length > 0 ? compatibleAccounts[0].name : null,
      accountDetails: allAccounts.map(acc => ({
        name: acc.name,
        plan: acc.plan_type,
        windowActive: !!acc.usage_window_start && (Date.now() - acc.usage_window_start) < (5 * 60 * 60 * 1000),
        windowRequests: acc.usage_window_requests || 0,
        totalRequests: acc.request_count,
        lastUsed: acc.last_used,
        supportedModels: acc.supported_models?.split(',') || [],
        phase: getAccountPhase(acc)
      })),
      algorithmPhases: {
        phase1: "Round Robin - Start all tickers (highest priority)",
        phase2: "Reset Priority - Use accounts closest to reset (<1hr remaining)", 
        phase3: "Load Balance - Even distribution within active windows"
      }
    }
    
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify(algorithmInfo, null, 2))
    return
  }

  // Only proxy requests to Anthropic API
  if (!pathname.startsWith("/v1/")) {
    res.writeHead(404, { "Content-Type": "text/plain" })
    res.end("Not Found")
    return
  }

  // Generate request ID and track start time
  const requestId = crypto.randomUUID()
  const startTime = Date.now()
  
  // Read request body
  const requestBody = await getRequestBody(req)
  
  // Extract model from request body for routing
  const requestedModel = extractModelFromRequest(requestBody)
  
  // Log incoming request with model info
  log.info(`Incoming request: ${req.method} ${pathname}`, {
    requestId,
    method: req.method,
    path: pathname,
    model: requestedModel,
    headers: req.headers
  })

  // Get all available accounts
  const allAccounts = getAvailableAccounts()
  if (allAccounts.length === 0) {
    log.error("No accounts available")
    const response = JSON.stringify({ 
      error: "No accounts available. Please add accounts using the CLI." 
    })
    res.writeHead(503, { "Content-Type": "application/json" })
    res.end(response)
    return
  }

  // Filter accounts based on model compatibility
  const compatibleAccounts = getCompatibleAccounts(allAccounts, requestedModel)
  if (compatibleAccounts.length === 0) {
    log.error(`No accounts support the requested model: ${requestedModel}`)
    const response = JSON.stringify({ 
      error: `No accounts support the requested model: ${requestedModel}. Opus requires Max plan accounts.`,
      requestedModel,
      availableAccounts: allAccounts.map(a => ({ name: a.name, plan: a.plan_type, models: a.supported_models }))
    })
    res.writeHead(403, { "Content-Type": "application/json" })
    res.end(response)
    return
  }

  // Try each compatible account until one succeeds
  const errors: Array<{ account: string; error: string; retries: number; model: string | null }> = []
  
  for (const account of compatibleAccounts) {
    let lastError: string | null = null
    let retryDelay = RETRY_DELAY_MS
    
    // Try multiple times with the same account before moving to the next
    for (let retry = 0; retry < RETRY_COUNT; retry++) {
      try {
        if (retry > 0) {
          log.info(`Retrying request with account: ${account.name} (attempt ${retry + 1}/${RETRY_COUNT})`)
          await new Promise(resolve => setTimeout(resolve, retryDelay))
          retryDelay *= RETRY_BACKOFF // Exponential backoff
        } else {
          log.info(`Attempting request with account: ${account.name}`)
        }
        
        // Get valid access token with automatic retry
        const accessToken = await getValidAccessTokenWithRetry(account)

        // Prepare headers for Anthropic API - only keep essential headers
        const headers: Record<string, string> = {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": req.headers["content-type"] || "application/json",
          "anthropic-version": Array.isArray(req.headers["anthropic-version"]) 
            ? req.headers["anthropic-version"][0] 
            : req.headers["anthropic-version"] || "2023-06-01",
          "user-agent": "claude-load-balancer/1.0.0",
        }
        
        // Preserve specific Anthropic headers if present
        if (req.headers["anthropic-beta"]) {
          headers["anthropic-beta"] = req.headers["anthropic-beta"] as string
        }
        
        // Both Max and Pro plans use the same API endpoint - difference is model availability
        const anthropicUrl = `https://api.anthropic.com${pathname}${parsedUrl.search || ''}`
        const response = await fetch(anthropicUrl, {
          method: req.method,
          headers: headers,
          body: requestBody.length > 0 ? requestBody : undefined,
        })

        // Check if request was successful
        if (!response.ok) {
          const errorText = await response.text()
          lastError = `HTTP ${response.status}: ${errorText}`
          
          log.warn(`Request failed with account ${account.name}`, {
            status: response.status,
            statusText: response.statusText,
            error: errorText,
            retry: retry + 1
          })
          
          // Handle OAuth token refresh for 401/403 errors on first retry
          if ((response.status === 401 || response.status === 403) && retry === 0) {
            try {
              log.info(`🔄 Attempting automatic token refresh for account ${account.name}`)
              await getValidAccessToken(account, true) // Force refresh
              log.info(`✅ Token refreshed, retrying request for account ${account.name}`)
              continue // Retry with new token
            } catch (refreshError) {
              log.error(`❌ Token refresh failed for account ${account.name}:`, refreshError)
              // Continue with normal retry logic
            }
          }
          
          // Allow failover for authentication-related errors that might be account-specific
          // 400 from Cloudflare, 401 Unauthorized, 403 Forbidden could be token issues
          const allowFailover = response.status === 400 || response.status === 401 || 
                               response.status === 403 || response.status === 429 || response.status >= 500
          
          if (!allowFailover) {
            // For other 4xx errors, don't retry or try other accounts
            res.writeHead(response.status, { "Content-Type": "application/json" })
            res.end(errorText)
            return
          }
          
          // For 429 or 5xx errors, continue retrying
          continue
        }

        // Success! Log and return response
        const responseTime = Date.now() - startTime
        log.info(`Request successful with account: ${account.name}`, {
          status: response.status,
          account: account.name,
          responseTime,
          retry: retry > 0 ? retry + 1 : undefined
        })

        // Extract request info for token estimation (safe for streaming)
        let modelUsed: string | null = null
        let estimatedInputTokens: number | null = null
        
        try {
          const requestBodyStr = requestBody.toString()
          const requestJson = JSON.parse(requestBodyStr)
          modelUsed = requestJson.model || null
          
          // Estimate input tokens from request content
          if (requestJson.messages && Array.isArray(requestJson.messages)) {
            const totalContent = requestJson.messages
              .map((msg: any) => msg.content || '')
              .join(' ')
            // Rough estimation: ~4 characters per token
            estimatedInputTokens = Math.ceil(totalContent.length / 4)
          }
        } catch (e) {
          // Ignore parsing errors
        }

        // Update usage statistics and token tracking
        updateAccountUsage(account.id)
        
        // Update token usage with estimation (better than no tracking)
        if (estimatedInputTokens && modelUsed) {
          // Estimate output tokens as roughly 1/3 of input for streaming responses
          const estimatedOutputTokens = Math.ceil(estimatedInputTokens / 3)
          log.info(`Token estimation for ${account.name}: ${estimatedInputTokens} input, ${estimatedOutputTokens} output (model: ${modelUsed})`)
          updateAccountTokenUsage(account.id, estimatedInputTokens, estimatedOutputTokens, modelUsed)
        } else {
          log.warn(`No token estimation possible: estimatedInputTokens=${estimatedInputTokens}, modelUsed=${modelUsed}`)
        }

        // Save successful request to database with token estimates
        const stmt = db.prepare(`
          INSERT OR REPLACE INTO requests (id, timestamp, method, path, account_used, status_code, success, response_time_ms, failover_attempts, input_tokens, output_tokens, model_used)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        stmt.run(requestId, Date.now(), req.method, pathname, account.name, response.status, 1, responseTime, errors.length, estimatedInputTokens, estimatedInputTokens ? Math.ceil(estimatedInputTokens / 3) : null, modelUsed)

        // Clone response headers
        const responseHeaders: Record<string, string> = {}
        response.headers.forEach((value, key) => {
          responseHeaders[key] = value
        })
        responseHeaders["X-Proxy-Account"] = account.name
        responseHeaders["X-Request-Id"] = requestId
        
        // Return proxied response
        res.writeHead(response.status, responseHeaders)
        if (response.body) {
          response.body.pipe(res)
        } else {
          res.end()
        }
        return
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error)
        log.error(`Error proxying request with account ${account.name} (retry ${retry + 1}/${RETRY_COUNT}):`, error)
        
        // If this is not the last retry, continue with the next retry
        if (retry < RETRY_COUNT - 1) {
          continue
        }
      }
    }
    
    // All retries failed for this account
    errors.push({
      account: account.name,
      error: lastError || "Unknown error",
      retries: RETRY_COUNT,
      model: requestedModel
    })
  }

  // All accounts failed
  const responseTime = Date.now() - startTime
  log.error("All accounts failed to proxy request", { errors })
  
  // Save failed request to database
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO requests (id, timestamp, method, path, account_used, status_code, success, error_message, response_time_ms, failover_attempts, input_tokens, output_tokens, model_used)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  
  // Try to extract model from request body for failed requests
  let modelUsed: string | null = null
  try {
    const requestBodyStr = requestBody.toString()
    const requestJson = JSON.parse(requestBodyStr)
    modelUsed = requestJson.model || null
  } catch (e) {
    // Ignore parsing errors for failed requests
  }
  
  stmt.run(requestId, Date.now(), req.method, pathname, null, 503, 0, JSON.stringify(errors), responseTime, errors.length, null, null, modelUsed)
  
  const response = JSON.stringify({ 
    error: "All accounts failed to proxy request",
    attempts: errors,
    requestId
  })
  res.writeHead(503, { 
    "Content-Type": "application/json",
    "X-Request-Id": requestId
  })
  res.end(response)
})

const port = process.env.PORT ? parseInt(process.env.PORT) : 8080

server.on('error', (err: any) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${port} is already in use.`)
    console.log(`💡 Try using a different port: PORT=8081 npm start`)
    console.log(`💡 Or kill the process using port ${port}: lsof -ti:${port} | xargs kill`)
    process.exit(1)
  } else {
    console.error('❌ Server error:', err)
    process.exit(1)
  }
})

server.listen(port, () => {
  console.log(`🚀 Claude proxy server running on http://localhost:${port}`)
  console.log(`📊 Dashboard: http://localhost:${port}/dashboard`)
  console.log(`🔍 Health check: http://localhost:${port}/health`)
  console.log(`\n💡 To use as proxy: export ANTHROPIC_BASE_URL=http://localhost:${port}`)
})