#!/usr/bin/env node

import Database from 'better-sqlite3'
import crypto from 'crypto'
import readline from 'readline'
import fetch from 'node-fetch'

const CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e"
const db = new Database("./claude-accounts.db")

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

// Plan-specific model configurations
const PLAN_MODELS = {
  console: ['claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307', 'claude-3-5-haiku-20241022'],
  max: ['claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229']
} as const

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })
  
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

async function generatePKCE() {
  const verifier = crypto.randomBytes(32).toString("base64url")
  const challenge = crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url")
  return { verifier, challenge }
}

async function authorize(mode: "max" | "console") {
  const pkce = await generatePKCE()
  
  const url = new URL(
    `https://${mode === "console" ? "console.anthropic.com" : "claude.ai"}/oauth/authorize`
  )
  url.searchParams.set("code", "true")
  url.searchParams.set("client_id", CLIENT_ID)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("redirect_uri", "https://console.anthropic.com/oauth/code/callback")
  url.searchParams.set("scope", "org:create_api_key user:profile user:inference")
  url.searchParams.set("code_challenge", pkce.challenge)
  url.searchParams.set("code_challenge_method", "S256")
  url.searchParams.set("state", pkce.verifier)
  
  return {
    url: url.toString(),
    verifier: pkce.verifier,
  }
}

async function exchangeCode(code: string, verifier: string) {
  const splits = code.split("#")
  const response = await fetch("https://console.anthropic.com/v1/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      code: splits[0],
      state: splits[1],
      grant_type: "authorization_code",
      client_id: CLIENT_ID,
      redirect_uri: "https://console.anthropic.com/oauth/code/callback",
      code_verifier: verifier,
    }),
  })
  
  if (!response.ok) {
    throw new Error(`Exchange failed: ${response.statusText}`)
  }
  
  const json = await response.json() as any
  return {
    refresh: json.refresh_token as string,
    access: json.access_token as string,
    expires: Date.now() + json.expires_in * 1000,
  }
}

async function addAccount(name: string, mode: "max" | "console" = "console") {
  // Check if account name already exists
  const stmt = db.prepare(`SELECT * FROM accounts WHERE name = ?`)
  const existing = stmt.get(name) as Account
  if (existing) {
    console.error(`❌ Account with name "${name}" already exists`)
    process.exit(1)
  }

  const { url, verifier } = await authorize(mode)
  
  console.log("\n🔗 Open this URL in your browser to authorize:")
  console.log(url)
  console.log("\n📋 After authorization, you'll get a code. Paste it here:")
  
  const code = await prompt("Authorization code: ")
  if (!code) {
    console.error("❌ No code provided")
    process.exit(1)
  }

  try {
    const tokens = await exchangeCode(code, verifier)
    const id = crypto.randomUUID()
    const supportedModels = PLAN_MODELS[mode].join(',')
    
    const insertStmt = db.prepare(
      `INSERT INTO accounts (id, name, refresh_token, access_token, expires_at, created_at, plan_type, supported_models) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    insertStmt.run(id, name, tokens.refresh, tokens.access, tokens.expires, Date.now(), mode, supportedModels)
    
    console.log(`✅ Account "${name}" added successfully!`)
    console.log(`   Plan: ${mode.toUpperCase()}`)
    console.log(`   Supported models: ${PLAN_MODELS[mode].join(', ')}`)
    if (mode === 'max') {
      console.log(`   🎯 This account supports Claude 3 Opus (premium model)`)
    }
  } catch (error) {
    console.error("❌ Failed to exchange code:", error)
    process.exit(1)
  }
}

function listAccounts() {
  const stmt = db.prepare(`SELECT * FROM accounts ORDER BY created_at DESC`)
  const accounts = stmt.all() as Account[]
  
  if (accounts.length === 0) {
    console.log("No accounts found. Add one with: npm run cli add <name>")
    return
  }

  console.log("\n📊 Claude Accounts:")
  console.log("─".repeat(100))
  
  for (const account of accounts) {
    const lastUsed = account.last_used 
      ? new Date(account.last_used).toLocaleString() 
      : "Never"
    const tokenStatus = account.expires_at && account.expires_at > Date.now() 
      ? "✅ Valid" 
      : "⏳ Expired"
    
    const planType = account.plan_type || 'console'
    const supportedModels = account.supported_models || 'claude-3-5-sonnet-20241022,claude-3-haiku-20240307'
    const modelList = supportedModels.split(',')
    const hasOpus = modelList.includes('claude-3-opus-20240229')
    
    console.log(`\n🔑 ${account.name} ${hasOpus ? '🎯' : ''}`)
    console.log(`   ID: ${account.id}`)
    console.log(`   Plan: ${planType.toUpperCase()} ${hasOpus ? '(Opus enabled)' : ''}`)
    console.log(`   Models: ${modelList.length} supported`)
    modelList.forEach(model => {
      const isOpus = model === 'claude-3-opus-20240229'
      console.log(`     ${isOpus ? '🎯' : '•'} ${model}`)
    })
    console.log(`   Created: ${new Date(account.created_at).toLocaleString()}`)
    console.log(`   Last Used: ${lastUsed}`)
    console.log(`   Requests: ${account.request_count}`)
    console.log(`   Token: ${tokenStatus}`)
  }
  console.log("\n" + "─".repeat(100))
}

function removeAccount(name: string) {
  const stmt = db.prepare(`DELETE FROM accounts WHERE name = ?`)
  const result = stmt.run(name)
  
  if (result.changes === 0) {
    console.error(`❌ Account "${name}" not found`)
    process.exit(1)
  }
  
  console.log(`✅ Account "${name}" removed successfully`)
}

function resetStats() {
  const stmt = db.prepare(`UPDATE accounts SET request_count = 0, last_used = NULL`)
  stmt.run()
  console.log("✅ Statistics reset for all accounts")
}

function clearHistory() {
  const countStmt = db.prepare("SELECT COUNT(*) as count FROM requests")
  const result = countStmt.get() as { count: number }
  const count = result?.count || 0
  
  if (count === 0) {
    console.log("ℹ️  No request history to clear")
    return
  }
  
  // Clear the requests table
  const deleteStmt = db.prepare(`DELETE FROM requests`)
  deleteStmt.run()
  
  console.log(`✅ Cleared ${count} request(s) from history`)
}

function showHelp() {
  console.log(`
Claude Load Balancer CLI - Model-Aware Account Management

Usage:
  npm run cli <command> [options]

Commands:
  add <name> [--mode max|console]  Add a new Claude account
  list                              List all accounts with plan and model info
  remove <name>                     Remove an account
  reset-stats                       Reset usage statistics for all accounts
  clear-history                     Clear all request history
  help                              Show this help message

Plan Types:
  console (default)                 Pro Plan - Sonnet & Haiku only
  max                               Max Plan - All models including Opus 🎯

Examples:
  npm run cli add personal          Add Pro plan account (console.anthropic.com)
  npm run cli add work -- --mode max   Add Max plan account (claude.ai) with Opus
  npm run cli list                   Show all accounts with model support
  npm run cli remove personal        Remove the personal account

Model Routing:
  • Opus requests automatically route to Max plan accounts
  • Sonnet/Haiku requests can use any account type
  • Requests denied if no compatible account available
`)
}

// Parse command line arguments manually (since parseArgs is not available in older Node versions)
const args = process.argv.slice(2)
const command = args[0]

let mode: "max" | "console" = "console"
let accountName: string | undefined

// Simple argument parsing
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--mode' && args[i + 1]) {
    mode = args[i + 1] as "max" | "console"
  }
}

async function main() {
  switch (command) {
    case "add":
      accountName = args[1]
      if (!accountName) {
        console.error("❌ Please provide an account name")
        console.log("Usage: npm run cli add <name> [-- --mode max|console]")
        process.exit(1)
      }
      if (mode !== "max" && mode !== "console") {
        console.error("❌ Invalid mode. Use 'max' or 'console'")
        process.exit(1)
      }
      await addAccount(accountName, mode)
      break
      
    case "list":
      listAccounts()
      break
      
    case "remove":
      const removeAccountName = args[1]
      if (!removeAccountName) {
        console.error("❌ Please provide an account name")
        console.log("Usage: npm run cli remove <name>")
        process.exit(1)
      }
      removeAccount(removeAccountName)
      break
      
    case "reset-stats":
      resetStats()
      break
      
    case "clear-history":
      clearHistory()
      break
      
    case "help":
    default:
      showHelp()
  }
  
  // Close database connection
  db.close()
}

main().catch((error) => {
  console.error("❌ Error:", error)
  process.exit(1)
})