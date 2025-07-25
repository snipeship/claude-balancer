import http from 'http'
import url from 'url'
import crypto from 'crypto'
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
    failover_attempts INTEGER DEFAULT 0
  )
`)

// Create index for faster queries
db.exec(`CREATE INDEX IF NOT EXISTS idx_requests_timestamp ON requests(timestamp DESC)`)

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
}

// Model configuration
const MODEL_RESTRICTIONS = {
  'claude-3-opus-20240229': ['max'], // Opus only available on Max plan
  'claude-3-5-sonnet-20241022': ['console', 'max'], // Sonnet available on both
  'claude-3-haiku-20240307': ['console', 'max'], // Haiku available on both
  'claude-3-5-haiku-20241022': ['console', 'max'], // New Haiku available on both
} as const

const PLAN_MODELS = {
  console: ['claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307', 'claude-3-5-haiku-20241022'],
  max: ['claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229']
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
  const response = await fetch("https://console.anthropic.com/v1/oauth/token", {
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
    throw new Error(`Failed to refresh token for account ${account.name}: ${response.statusText}`)
  }

  const json = await response.json() as any
  const newAccessToken = json.access_token as string
  const expiresAt = Date.now() + json.expires_in * 1000

  // Update account in database
  const stmt = db.prepare(`UPDATE accounts SET access_token = ?, expires_at = ? WHERE id = ?`)
  stmt.run(newAccessToken, expiresAt, account.id)

  return newAccessToken
}

async function getValidAccessToken(account: Account): Promise<string> {
  // Check if access token exists and is still valid
  if (account.access_token && account.expires_at && account.expires_at > Date.now()) {
    return account.access_token
  }

  // Refresh the token
  return await refreshAccessToken(account)
}

function getAvailableAccounts(): Account[] {
  // Get all accounts ordered by least requests, prioritizing those not used recently
  const stmt = db.prepare(`
    SELECT * FROM accounts 
    ORDER BY request_count ASC, last_used ASC NULLS FIRST
  `)
  const accounts = stmt.all() as Account[]
  return accounts || []
}

function updateAccountUsage(accountId: string) {
  const stmt = db.prepare(`UPDATE accounts SET last_used = ?, request_count = request_count + 1 WHERE id = ?`)
  stmt.run(Date.now(), accountId)
}

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
        .accounts-section, .requests-section {
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

        <div class="accounts-section">
            <h2>Accounts</h2>
            <table id="accountsTable">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Requests</th>
                        <th>Last Used</th>
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

        function formatDate(timestamp) {
            return new Date(timestamp).toLocaleString();
        }

        function formatResponseTime(ms) {
            if (ms < 1000) return ms + 'ms';
            return (ms / 1000).toFixed(2) + 's';
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
                const accountsTableBody = document.querySelector('#accountsTable tbody');
                accountsTableBody.innerHTML = accounts.map(account => \`
                    <tr>
                        <td>\${account.name}</td>
                        <td>\${account.request_count}</td>
                        <td>\${account.last_used ? formatDate(account.last_used) : 'Never'}</td>
                        <td>\${account.token_valid ? '✅ Valid' : '❌ Expired'}</td>
                    </tr>
                \`).join('');

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

        // Initial load and auto-refresh every 5 seconds
        updateDashboard();
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
        CASE 
          WHEN expires_at > ? THEN 1 
          ELSE 0 
        END as token_valid
      FROM accounts
      ORDER BY request_count DESC
    `)
    const accounts = stmt.all(Date.now())
    
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify(accounts))
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
        
        // Get valid access token
        const accessToken = await getValidAccessToken(account)

        // Prepare headers for Anthropic API
        const headers: Record<string, string> = { ...req.headers as any }
        headers["Authorization"] = `Bearer ${accessToken}`
        delete headers["host"] // Remove host header to avoid conflicts
        
        // Forward request to Anthropic API
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
          
          // If it's a 4xx error (except 429), don't retry or try other accounts
          if (response.status >= 400 && response.status < 500 && response.status !== 429) {
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

        // Update usage statistics only after successful request
        updateAccountUsage(account.id)

        // Save successful request to database
        const stmt = db.prepare(`
          INSERT INTO requests (id, timestamp, method, path, account_used, status_code, success, response_time_ms, failover_attempts)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        stmt.run(requestId, Date.now(), req.method, pathname, account.name, response.status, true, responseTime, errors.length)

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
    INSERT INTO requests (id, timestamp, method, path, account_used, status_code, success, error_message, response_time_ms, failover_attempts)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  stmt.run(requestId, Date.now(), req.method, pathname, null, 503, false, JSON.stringify(errors), responseTime, errors.length)
  
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