# Claude Load Balancer - Model-Aware Routing

Enhanced version with intelligent model-based account routing for Claude Pro and Max plans.

## 🎯 Key Features

### **Smart Model Routing**
- **Opus requests** → Automatically routed to Max plan accounts only
- **Sonnet/Haiku requests** → Can use any account type (Pro or Max)
- **Unknown models** → Fallback to all available accounts
- **No compatible accounts** → Clear error with account details

### **Plan-Based Account Management**
- **Console mode** (`--mode console`): Pro Plan accounts (console.anthropic.com)
  - ✅ Claude 3.5 Sonnet, Claude 3 Haiku, Claude 3.5 Haiku
  - ❌ Claude 3 Opus (Premium model)

- **Max mode** (`--mode max`): Max Plan accounts (claude.ai)
  - ✅ All models including Claude 3 Opus 🎯
  - ✅ Claude 3.5 Sonnet, Claude 3 Haiku, Claude 3.5 Haiku

## 🚀 Quick Start

### 1. Install and Setup
```bash
npm install
```

### 2. Add Accounts with Plan Types
```bash
# Add Pro plan account (no Opus access)
npm run cli add personal

# Add Max plan account (includes Opus access)
npm run cli add work -- --mode max
```

### 3. View Account Details
```bash
npm run cli list
```
```
📊 Claude Accounts:
────────────────────────────────────────────────────────────────────────────────────────────────────

🔑 work 🎯
   ID: 550e8400-e29b-41d4-a716-446655440000  
   Plan: MAX (Opus enabled)
   Models: 4 supported
     🎯 claude-3-opus-20240229
     • claude-3-5-sonnet-20241022
     • claude-3-haiku-20240307
     • claude-3-5-haiku-20241022
   Created: 7/25/2025, 9:15:23 AM
   Last Used: Never
   Requests: 0
   Token: ✅ Valid

🔑 personal 
   ID: 550e8400-e29b-41d4-a716-446655440001
   Plan: CONSOLE
   Models: 3 supported
     • claude-3-5-sonnet-20241022
     • claude-3-haiku-20240307
     • claude-3-5-haiku-20241022
   Created: 7/25/2025, 9:14:12 AM
   Last Used: Never
   Requests: 0
   Token: ✅ Valid
```

### 4. Start Server
```bash
npm start                # Port 8080
# OR
PORT=8081 npm start     # Custom port
```

### 5. Use as Proxy
```bash
export ANTHROPIC_BASE_URL=http://localhost:8080
```

## 🔄 How Model Routing Works

### **Request Flow**
1. **Extract model** from request body (`model` field)
2. **Filter accounts** based on model compatibility
3. **Route request** to compatible account with least usage
4. **Automatic failover** to next compatible account if needed

### **Model Compatibility Matrix**
| Model                        | Pro Plan | Max Plan | Notes                    |
|-----------------------------|----------|----------|--------------------------|
| claude-3-5-sonnet-20241022  | ✅       | ✅       | Available on both plans  |
| claude-3-haiku-20240307     | ✅       | ✅       | Available on both plans  |
| claude-3-5-haiku-20241022   | ✅       | ✅       | Available on both plans  |
| claude-3-opus-20240229      | ❌       | ✅       | **Max plan only** 🎯     |

### **Error Handling**
When no compatible accounts exist:
```json
{
  "error": "No accounts support the requested model: claude-3-opus-20240229. Opus requires Max plan accounts.",
  "requestedModel": "claude-3-opus-20240229",
  "availableAccounts": [
    {
      "name": "personal",
      "plan": "console", 
      "models": "claude-3-5-sonnet-20241022,claude-3-haiku-20240307"
    }
  ]
}
```

## 🧪 Testing

### Basic Functionality Test
```bash
npm test
```

### Model Routing Test  
```bash
npm run test:routing
```

This tests:
- Model extraction from requests
- Plan-based filtering
- Opus restriction enforcement
- Error message clarity
- Fallback behavior

## 📊 Enhanced Dashboard

The dashboard now shows account plan types and model support:

**Accounts Section:**
- Account names with 🎯 indicator for Opus-enabled accounts
- Plan type (CONSOLE/MAX)
- Supported model count
- Individual model listings

**Request History:**
- Shows which model was requested
- Displays account used for routing
- Tracks model-specific routing decisions

## 🛠 CLI Commands

```bash
# Account management with plan awareness
npm run cli add <name>                    # Add Pro plan account
npm run cli add <name> -- --mode max     # Add Max plan account  
npm run cli list                          # Show accounts with plan/model info
npm run cli remove <name>                 # Remove account
npm run cli reset-stats                   # Reset usage statistics
npm run cli clear-history                 # Clear request history
npm run cli help                          # Show enhanced help

# Server management
npm start                                 # Start on port 8080
npm run start:8081                        # Start on port 8081
npm run start:8082                        # Start on port 8082
PORT=8083 npm start                       # Start on custom port

# Testing
npm test                                  # Basic functionality
npm run test:routing                      # Model routing tests
```

## 🔒 Security & Best Practices

### **Account Separation**
- Keep Pro and Max plan accounts separate
- Use descriptive names (e.g., `personal-pro`, `work-max`)
- Monitor usage patterns in dashboard

### **Model Request Patterns**
- Opus requests automatically route to Max accounts
- Load balancing within compatible account pools
- Automatic failover maintains service availability

### **Rate Limiting**
- Per-account rate limiting still applies
- Model routing doesn't bypass Claude's limits
- Monitor account usage for optimal distribution

## 🚨 Migration from Original Version

Existing databases are automatically migrated:
- `plan_type` column added (defaults to 'console')
- `supported_models` column added with Pro plan models
- Existing accounts remain functional

To upgrade existing accounts to Max plan:
1. Remove old account: `npm run cli remove <name>`  
2. Re-add with Max plan: `npm run cli add <name> -- --mode max`

## 📈 Monitoring

### **Dashboard Metrics**
- Model-specific request counts
- Plan-based routing decisions  
- Account utilization by model type
- Opus request success/failure rates

### **Log Analysis**
- Model extraction success/failure
- Account compatibility filtering
- Routing decisions with reasoning
- Enhanced error details

## 🎯 Production Recommendations

1. **Mixed Account Setup**: Use both Pro and Max accounts for optimal cost/performance
2. **Opus Dedicated**: Keep at least one Max account for Opus requests
3. **Load Distribution**: Monitor usage to balance between account types
4. **Error Monitoring**: Watch for 403 errors indicating model/plan mismatches
5. **Regular Testing**: Use `npm run test:routing` to verify routing logic

The enhanced Claude Load Balancer ensures your Opus requests always reach compatible accounts while optimizing usage across your entire account pool.