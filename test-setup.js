#!/usr/bin/env node

import fetch from 'node-fetch'
import { spawn } from 'child_process'

console.log('🧪 Testing Claude Load Balancer Setup...\n')

let serverProcess

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function testHealthEndpoint() {
  try {
    const response = await fetch('http://localhost:8080/health')
    const data = await response.json()
    
    if (response.ok && data.status === 'ok') {
      console.log('✅ Health endpoint working')
      console.log(`   Accounts: ${data.accounts}`)
      return true
    } else {
      console.log('❌ Health endpoint failed')
      return false
    }
  } catch (error) {
    console.log('❌ Health endpoint unreachable:', error.message)
    return false
  }
}

async function testDashboard() {
  try {
    const response = await fetch('http://localhost:8080/dashboard')
    const html = await response.text()
    
    if (response.ok && html.includes('Claude Load Balancer Dashboard')) {
      console.log('✅ Dashboard working')
      return true
    } else {
      console.log('❌ Dashboard failed')
      return false
    }
  } catch (error) {
    console.log('❌ Dashboard unreachable:', error.message)
    return false
  }
}

async function testAPI() {
  try {
    const endpoints = ['/api/stats', '/api/accounts', '/api/requests']
    let allPassed = true
    
    for (const endpoint of endpoints) {
      const response = await fetch(`http://localhost:8080${endpoint}`)
      const data = await response.json()
      
      if (response.ok) {
        console.log(`✅ API ${endpoint} working`)
      } else {
        console.log(`❌ API ${endpoint} failed`)
        allPassed = false
      }
    }
    
    return allPassed
  } catch (error) {
    console.log('❌ API endpoints unreachable:', error.message)
    return false
  }
}

async function startServer() {
  return new Promise((resolve, reject) => {
    console.log('🚀 Starting server...')
    
    serverProcess = spawn('npm', ['start'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: false
    })
    
    let started = false
    
    serverProcess.stdout.on('data', (data) => {
      const output = data.toString()
      if (output.includes('Claude proxy server running') && !started) {
        started = true
        console.log('✅ Server started successfully')
        resolve()
      }
    })
    
    serverProcess.stderr.on('data', (data) => {
      console.error('Server error:', data.toString())
    })
    
    serverProcess.on('exit', (code) => {
      if (!started) {
        reject(new Error(`Server exited with code ${code}`))
      }
    })
    
    // Timeout after 10 seconds
    setTimeout(() => {
      if (!started) {
        reject(new Error('Server start timeout'))
      }
    }, 10000)
  })
}

function stopServer() {
  if (serverProcess) {
    console.log('🛑 Stopping server...')
    serverProcess.kill('SIGTERM')
    
    // Force kill if it doesn't stop gracefully
    setTimeout(() => {
      if (serverProcess && !serverProcess.killed) {
        serverProcess.kill('SIGKILL')
      }
    }, 5000)
  }
}

async function runTests() {
  try {
    // Start the server
    await startServer()
    
    // Wait for server to be fully ready
    await sleep(2000)
    
    console.log('\n🔍 Running tests...')
    
    // Test endpoints
    const healthOk = await testHealthEndpoint()
    const dashboardOk = await testDashboard()
    const apiOk = await testAPI()
    
    console.log('\n📊 Test Results:')
    console.log(`Health Endpoint: ${healthOk ? '✅ PASS' : '❌ FAIL'}`)
    console.log(`Dashboard: ${dashboardOk ? '✅ PASS' : '❌ FAIL'}`)
    console.log(`API Endpoints: ${apiOk ? '✅ PASS' : '❌ FAIL'}`)
    
    const allPassed = healthOk && dashboardOk && apiOk
    
    console.log(`\n${allPassed ? '🎉 All tests passed!' : '❌ Some tests failed'}`)
    
    if (allPassed) {
      console.log('\n🎯 Ready to use! Next steps:')
      console.log('1. Add Claude accounts: npm run cli add <account-name>')
      console.log('2. Visit dashboard: http://localhost:8080/dashboard')
      console.log('3. Set ANTHROPIC_BASE_URL=http://localhost:8080')
    }
    
    return allPassed
    
  } catch (error) {
    console.error('❌ Test failed:', error.message)
    return false
  } finally {
    stopServer()
  }
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n🛑 Test interrupted')
  stopServer()
  process.exit(1)
})

process.on('SIGTERM', () => {
  stopServer()
  process.exit(1)
})

// Run the tests
runTests().then((success) => {
  process.exit(success ? 0 : 1)
}).catch((error) => {
  console.error('❌ Unexpected error:', error)
  stopServer()
  process.exit(1)
})