# ccflare Data Flow Documentation

## Overview

ccflare is a load balancer proxy for Claude API that distributes requests across multiple OAuth accounts to avoid rate limiting. This document details the complete data flow through the system, including request lifecycle, error handling, token refresh, rate limit management, and streaming response capture.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Overview of Request Lifecycle](#overview-of-request-lifecycle)
3. [Sequence Diagrams](#sequence-diagrams)
   - [Successful Request Flow](#successful-request-flow)
   - [Rate Limited Request Flow](#rate-limited-request-flow)
   - [Token Refresh Flow](#token-refresh-flow)
   - [Agent Interceptor Flow](#agent-interceptor-flow)
   - [Failed Request with Retry Flow](#failed-request-with-retry-flow)
   - [Streaming Response Flow](#streaming-response-flow)
4. [Error Handling Flows](#error-handling-flows)
5. [Request Retry Logic](#request-retry-logic)
6. [Database Update Patterns](#database-update-patterns)
7. [Asynchronous Database Operations](#asynchronous-database-operations)

## Architecture Overview

ccflare uses a modular architecture with the following key components:

- **Server**: Main HTTP server handling routing between API, dashboard, and proxy requests
- **Proxy**: Core request forwarding logic with retry, rate limiting, and usage tracking
- **Provider System**: Abstraction layer for different AI providers (currently Anthropic)
- **Load Balancer**: Strategy pattern implementation for account selection
- **Agent Interceptor**: Detects agent usage and modifies requests based on agent preferences
- **Post-Processor Worker**: Background worker that handles all usage extraction and database writes via message passing
- **AsyncDbWriter**: Asynchronous database write queue to prevent blocking (100ms processing interval)
- **Response Handler**: Uses Response.clone() for streaming analytics without blocking the client
- **Service Container**: Dependency injection for component management

## Overview of Request Lifecycle

The request lifecycle in ccflare follows these main stages:

1. **Request Reception**: Client sends request to ccflare server
2. **Route Determination**: Server checks if it's an API request, dashboard request, or proxy request
3. **Request Body Preparation**: Request body is buffered for potential modification and reuse
4. **Agent Interception**: System detects agent usage in system prompts and modifies model preference if configured
5. **Account Selection**: Load balancer strategy selects available accounts based on configured algorithm
6. **Token Validation**: System checks if account has valid access token, refreshes if needed
7. **Request Forwarding**: Proxy forwards request to Anthropic API with authentication
8. **Response Handling**: System immediately returns response to client while cloning for analytics
9. **Background Processing**: Post-processor worker receives messages (START, CHUNK, END) for async processing
10. **Data Persistence**: Worker queues database updates via AsyncDbWriter for non-blocking writes
11. **Usage Extraction**: Worker extracts usage data from streaming responses without blocking

## Sequence Diagrams

### Successful Request Flow

```mermaid
sequenceDiagram
    participant Client
    participant Server as ccflare Server
    participant Router as API Router
    participant LoadBalancer as Load Balancer
    participant Proxy
    participant Provider as Anthropic Provider
    participant AsyncWriter as Async DB Writer
    participant DB as Database
    participant Anthropic as Anthropic API

    Client->>Server: HTTP Request to /v1/*
    Server->>Router: Check API routes
    Router-->>Server: No match, continue
    Server->>Proxy: handleProxy(req, url, context)
    
    Note over Proxy: Validate provider can handle path
    Proxy->>Proxy: Prepare request body buffer
    
    Note over Proxy: Agent Interception
    Proxy->>AgentInterceptor: interceptAndModifyRequest(body)
    AgentInterceptor->>AgentInterceptor: Extract system prompt
    AgentInterceptor->>AgentInterceptor: Detect agent usage
    AgentInterceptor->>DB: getAgentPreference(agentId)
    AgentInterceptor-->>Proxy: Modified body with preferred model
    
    Note over Proxy: Generate request ID and metadata
    
    Proxy->>Provider: canHandle(path)?
    Provider-->>Proxy: true
    
    Proxy->>LoadBalancer: getOrderedAccounts(meta, strategy)
    LoadBalancer->>DB: getAllAccounts()
    DB-->>LoadBalancer: Account list
    LoadBalancer->>LoadBalancer: Filter by provider & availability
    LoadBalancer->>LoadBalancer: Apply strategy algorithm
    LoadBalancer-->>Proxy: Ordered account list
    
    loop For each account until success
        Proxy->>Proxy: Check token validity
        alt Token expired
            Proxy->>Provider: refreshAccessTokenSafe()
            Provider->>Anthropic: POST /v1/oauth/token
            Anthropic-->>Provider: New access token
            Provider->>AsyncWriter: enqueue(updateAccountTokens)
            Note over AsyncWriter: Queued for async write
        end
        
        Proxy->>Provider: prepareHeaders(headers, accessToken)
        Proxy->>Provider: buildUrl(path, query)
        Proxy->>Anthropic: Forward request
        Anthropic-->>Proxy: Response (streaming or JSON)
        
        Proxy->>AsyncWriter: enqueue(updateAccountUsage)
        
        Proxy->>Provider: parseRateLimit(response)
        Provider-->>Proxy: Rate limit info
        
        alt Has rate limit metadata
            Proxy->>AsyncWriter: enqueue(updateAccountRateLimitMeta)
        end
        
        alt Response OK
            alt Response OK
                Proxy->>ResponseHandler: forwardToClient(options, context)
                ResponseHandler->>Worker: postMessage(START message)
                Note over Worker: Contains request/response metadata
                
                alt Streaming Response
                    ResponseHandler->>ResponseHandler: response.clone()
                    ResponseHandler-->>Client: Return original response immediately
                    
                    Note over ResponseHandler: Background stream processing
                    ResponseHandler->>ResponseHandler: Read clone stream
                    loop For each chunk
                        ResponseHandler->>Worker: postMessage(CHUNK message)
                    end
                    ResponseHandler->>Worker: postMessage(END message)
                else Non-streaming Response
                    ResponseHandler-->>Client: Return original response immediately
                    
                    Note over ResponseHandler: Background body processing
                    ResponseHandler->>ResponseHandler: response.clone()
                    ResponseHandler->>ResponseHandler: Read clone body
                    ResponseHandler->>Worker: postMessage(END message with body)
                end
            end
        end
    end
    
    Note over AsyncWriter,DB: Background processing
    AsyncWriter->>DB: Process queued writes
```

### Rate Limited Request Flow

```mermaid
sequenceDiagram
    participant Client
    participant Server
    participant Proxy
    participant Provider
    participant DB
    participant Anthropic

    Client->>Server: HTTP Request
    Server->>Proxy: handleProxy()
    
    Proxy->>Proxy: Select account from strategy
    Proxy->>Proxy: Validate/refresh token
    Proxy->>Anthropic: Forward request
    
    alt Hard rate limit (429 or rate_limited status)
        Anthropic-->>Proxy: 429 Rate Limited
        Note over Anthropic: Headers: anthropic-ratelimit-unified-status: rate_limited<br/>anthropic-ratelimit-unified-reset: 1234567890
        
        Proxy->>Provider: parseRateLimit(response)
        Provider-->>Proxy: {isRateLimited: true, resetTime: 1234567890000}
        
        Proxy->>DB: markAccountRateLimited(accountId, resetTime)
        Note over DB: Set rate_limited_until = resetTime
        
        Proxy->>DB: saveRequestPayload(rateLimited: true)
        
        Proxy->>Proxy: Continue to next account
        
        alt No more accounts available
            Proxy->>DB: saveRequest(status: 503, error: "All accounts failed")
            Proxy-->>Client: 503 Service Unavailable
        else Another account available
            Proxy->>Proxy: Try next account
        end
    else Soft warning (allowed_warning)
        Anthropic-->>Proxy: 200 OK
        Note over Anthropic: Headers: anthropic-ratelimit-unified-status: allowed_warning<br/>anthropic-ratelimit-unified-remaining: 50
        
        Proxy->>Provider: parseRateLimit(response)
        Provider-->>Proxy: {isRateLimited: false, statusHeader: "allowed_warning", remaining: 50}
        
        Proxy->>DB: updateAccountRateLimitMeta()
        Note over DB: Update rate limit metadata only
        
        Proxy->>Provider: processResponse()
        Proxy-->>Client: 200 OK (continue normally)
    end
```

### Token Refresh Flow

```mermaid
sequenceDiagram
    participant Proxy
    participant RefreshMap as refreshInFlight Map
    participant Provider
    participant AsyncWriter as Async DB Writer
    participant DB
    participant Anthropic

    Note over Proxy: Multiple requests may need token refresh
    
    Proxy->>Proxy: getValidAccessToken(account)
    
    alt Token expired or missing
        Proxy->>RefreshMap: Check if refresh in progress?
        
        alt No refresh in progress
            Proxy->>RefreshMap: Set refresh promise
            Proxy->>Provider: refreshToken(account, clientId)
            Provider->>Anthropic: POST /v1/oauth/token
            Note over Provider: Body: {grant_type: "refresh_token",<br/>refresh_token: account.refresh_token,<br/>client_id: clientId}
            
            alt Refresh successful
                Anthropic-->>Provider: {access_token: "new_token", expires_in: 3600}
                Provider-->>Proxy: TokenRefreshResult
                Proxy->>AsyncWriter: enqueue(updateAccountTokens)
                Note over AsyncWriter: Token update queued
                Proxy->>RefreshMap: Delete promise
                Proxy-->>Proxy: Return new access token
            else Refresh failed
                Anthropic-->>Provider: Error response
                Provider-->>Proxy: Throw error
                Proxy->>RefreshMap: Delete promise
                Note over Proxy: Refresh failed - will try next account
            end
        else Refresh already in progress
            Proxy->>RefreshMap: Get existing promise
            Note over Proxy: Wait for existing refresh to complete
            RefreshMap-->>Proxy: Resolved access token
        end
    else Token still valid
        Proxy-->>Proxy: Return existing token
    end
    
    Note over AsyncWriter,DB: Background processing
    AsyncWriter->>DB: Process token update
```

### Failed Request with Retry Flow

```mermaid
sequenceDiagram
    participant Client
    participant Server
    participant Proxy
    participant Provider
    participant DB
    participant Anthropic

    Client->>Server: HTTP Request
    Server->>Proxy: handleProxy()
    
    Proxy->>Proxy: Select account
    
    loop Retry up to runtime.retry.attempts times
        Note over Proxy: Retry attempt #1
        
        alt First attempt
            Proxy->>Anthropic: Forward request
        else Retry attempt
            Note over Proxy: Wait retry.delayMs * (backoff ^ attempt)
            Proxy->>Proxy: Sleep for backoff delay
            Proxy->>Anthropic: Retry request
        end
        
        alt Network error
            Anthropic--xProxy: Connection timeout/error
            Proxy->>DB: saveRequestPayload(error, retry count)
            
            alt More retries available
                Note over Proxy: Continue to next retry
            else Max retries reached
                Proxy->>Proxy: Log failure for account
                Proxy->>Proxy: Try next account
            end
        else Success
            Anthropic-->>Proxy: Successful response
            Proxy->>DB: saveRequest(success)
            Proxy-->>Client: Return response
            Note over Proxy: Exit retry loop
        end
    end
    
    alt All accounts and retries exhausted
        Proxy->>DB: saveRequest(status: 503, error: "All accounts failed")
        Proxy->>DB: saveRequestPayload(final failure)
        Proxy-->>Client: 503 Service Unavailable
    end
```

### Streaming Response Flow

```mermaid
sequenceDiagram
    participant Client
    participant ResponseHandler
    participant Worker as Post-Processor Worker
    participant AsyncWriter as Async DB Writer
    participant DB

    Note over ResponseHandler: Streaming response detected
    
    ResponseHandler->>ResponseHandler: isStreamingResponse(response)?
    Note over ResponseHandler: true
    
    ResponseHandler->>Worker: postMessage(START)
    Note over Worker: Initialize request state
    Worker->>AsyncWriter: enqueue(saveRequestMeta)
    Worker->>AsyncWriter: enqueue(updateAccountUsage)
    
    ResponseHandler->>ResponseHandler: response.clone()
    Note over ResponseHandler: Clone for analytics
    
    par Stream to Client
        ResponseHandler-->>Client: Return original response
        Note over Client: Receives stream immediately
    and Analytics Processing
        ResponseHandler->>ResponseHandler: getReader() on clone
        loop While streaming
            ResponseHandler->>ResponseHandler: reader.read()
            ResponseHandler->>Worker: postMessage(CHUNK)
            Worker->>Worker: Process chunk for usage
            Worker->>Worker: Extract tokens from SSE
            Worker->>Worker: Buffer chunks
        end
        ResponseHandler->>Worker: postMessage(END)
    end
    
    Note over Worker: Process final usage data
    Worker->>Worker: Calculate total tokens
    Worker->>Worker: Estimate cost
    Worker->>Worker: Calculate tokens/second
    Worker->>AsyncWriter: enqueue(saveRequest)
    Worker->>AsyncWriter: enqueue(saveRequestPayload)
    
    Note over AsyncWriter,DB: Process queue every 100ms
    AsyncWriter->>DB: Execute batched operations
```

### Post-Processor Worker Message Flow

```mermaid
sequenceDiagram
    participant ResponseHandler
    participant Worker as Post-Processor Worker
    participant TokenEncoder as Tiktoken Encoder
    participant AsyncWriter
    participant DB

    Note over ResponseHandler,Worker: START Phase
    ResponseHandler->>Worker: START message
    Note over Worker: Contains: requestId, accountId, method, path,<br/>headers, body, status, isStream, agent info
    
    Worker->>Worker: Create request state
    Worker->>Worker: Check shouldLogRequest(path, status)
    
    alt Should log request
        Worker->>AsyncWriter: enqueue(saveRequestMeta)
        alt Has accountId
            Worker->>AsyncWriter: enqueue(updateAccountUsage)
        end
    else Skip logging (e.g., .well-known 404)
        Note over Worker: Mark as shouldSkipLogging
    end

    Note over ResponseHandler,Worker: CHUNK Phase (Streaming only)
    loop For each stream chunk
        ResponseHandler->>Worker: CHUNK message with data
        Worker->>Worker: Store chunk in buffer
        Worker->>Worker: Decode chunk to text
        Worker->>Worker: Parse SSE lines
        
        alt message_start event
            Worker->>Worker: Extract initial usage data
            Worker->>Worker: Extract model info
        else content_block_start
            Worker->>Worker: Record firstTokenTimestamp
        else content_block_delta
            Worker->>TokenEncoder: encode(delta text)
            TokenEncoder-->>Worker: Token count
            Worker->>Worker: Update outputTokensComputed
        else message_delta with usage
            Worker->>Worker: Update providerFinalOutputTokens
            Worker->>Worker: Record lastTokenTimestamp
        end
    end

    Note over ResponseHandler,Worker: END Phase
    ResponseHandler->>Worker: END message
    
    alt Not skipping logs
        Worker->>Worker: Calculate final token counts
        Note over Worker: Use provider count if available,<br/>else use computed count
        
        Worker->>Worker: estimateCostUSD(model, tokens)
        Worker->>Worker: Calculate tokens/second
        
        Worker->>AsyncWriter: enqueue(saveRequest)
        Note over AsyncWriter: Includes usage metrics
        
        Worker->>Worker: combineChunks() if streaming
        Worker->>AsyncWriter: enqueue(saveRequestPayload)
        Note over AsyncWriter: Includes full request/response
    end
    
    Worker->>Worker: Clean up request state
```

## Error Handling Flows

### Provider Cannot Handle Path

```mermaid
sequenceDiagram
    participant Client
    participant Proxy
    participant Provider

    Client->>Proxy: Request to unsupported path
    Proxy->>Provider: canHandle(path)?
    Provider-->>Proxy: false
    Proxy-->>Client: 400 Bad Request<br/>{"error": "Provider cannot handle this request path"}
```

### No Available Accounts (Fallback Mode)

```mermaid
sequenceDiagram
    participant Client
    participant Proxy
    participant LoadBalancer
    participant AsyncWriter
    participant DB
    participant Anthropic

    Client->>Proxy: HTTP Request
    Proxy->>LoadBalancer: getOrderedAccounts()
    LoadBalancer->>DB: getAllAccounts()
    DB-->>LoadBalancer: Empty or all rate-limited
    LoadBalancer-->>Proxy: [] (empty array)
    
    Note over Proxy: Fallback to unauthenticated mode
    
    Proxy->>Anthropic: Forward without auth headers
    
    alt Success
        Anthropic-->>Proxy: Response
        
        alt Streaming Response
            Proxy->>ResponseHandler: forwardToClient()
            ResponseHandler->>ResponseHandler: response.clone()
            Proxy-->>Client: Stream response
            Proxy->>AsyncWriter: enqueue(saveRequest)<br/>accountId: NO_ACCOUNT_ID
            Proxy->>AsyncWriter: enqueue(saveRequestPayload)
        else Non-streaming
            Proxy->>AsyncWriter: enqueue(saveRequest)<br/>accountId: NO_ACCOUNT_ID
            Proxy->>AsyncWriter: enqueue(saveRequestPayload)
            Proxy-->>Client: Forward response
        end
    else Failure
        Anthropic-->>Proxy: Error
        Proxy->>AsyncWriter: enqueue(saveRequest with error)
        Proxy-->>Client: 502 Bad Gateway
    end
    
    Note over AsyncWriter,DB: Background processing
    AsyncWriter->>DB: Process queued operations
```

## Request Retry Logic

The retry mechanism follows an exponential backoff strategy:

```mermaid
flowchart TD
    A[Start Request] --> B{Token Valid?}
    B -->|No| C[Refresh Token]
    B -->|Yes| D[Send Request]
    C --> D
    
    D --> E{Response OK?}
    E -->|Yes| F[Process Response]
    E -->|No| G{Rate Limited?}
    
    G -->|Yes| H[Mark Account Limited]
    G -->|No| I{Retries < Max?}
    
    H --> J[Try Next Account]
    I -->|Yes| K[Wait Backoff Delay]
    I -->|No| J
    
    K --> L[Increment Retry]
    L --> D
    
    J --> M{More Accounts?}
    M -->|Yes| B
    M -->|No| N[Return 503 Error]
    
    F --> O[Save Stats & Return]
```

### Retry Configuration

- **Initial delay**: `runtime.retry.delayMs` (default: 1000ms, configurable)
- **Backoff multiplier**: `runtime.retry.backoff` (default: 2, configurable)
- **Max attempts**: `runtime.retry.attempts` (default: 3, configurable)
- **Delay calculation**: `delayMs * (backoff ^ attemptNumber)`
- **Stream body max bytes**: Controlled by CF_STREAM_USAGE_BUFFER_KB env var (default: defined in BUFFER_SIZES constant)
- **Worker processing interval**: AsyncDbWriter processes queue every 100ms
- **Worker shutdown delay**: TIMING.WORKER_SHUTDOWN_DELAY for graceful shutdown

Configuration can be set via:
1. Environment variables: `RETRY_ATTEMPTS`, `RETRY_DELAY_MS`, `RETRY_BACKOFF`
2. Config file: `retry_attempts`, `retry_delay_ms`, `retry_backoff`
3. Default values in code

## Database Update Patterns

### Request Lifecycle Updates

```mermaid
flowchart LR
    subgraph "Per Request Updates (via AsyncDbWriter)"
        A[Request Start] --> B[enqueue: updateAccountUsage]
        B --> C{Response Type}
        C -->|Success| D[enqueue: saveRequest<br/>success=true]
        C -->|Rate Limited| E[enqueue: markAccountRateLimited<br/>+ saveRequest]
        C -->|Error| F[enqueue: saveRequest<br/>with error]
        
        D --> G[enqueue: saveRequestPayload]
        E --> G
        F --> G
        
        D --> H[enqueue: updateAccountRateLimitMeta]
        E --> H
        
        D --> I[extractUsageInfo]
        I --> J[enqueue: updateRequestUsage<br/>with cost/tokens]
        
        D --> K[extractTierInfo]
        K --> L[enqueue: updateAccountTier]
        
        subgraph "Async Processing"
            M[Worker Message Queue] --> N[Post-Processor Worker]
            N --> O[AsyncDbWriter Queue]
            O --> P[Process Jobs (100ms interval)]
            P --> Q[Execute DB Operations]
        end
    end
```

### Account State Management

```mermaid
stateDiagram-v2
    [*] --> Active: Account Added
    Active --> TokenExpired: Token expires
    TokenExpired --> Active: Token refreshed
    Active --> RateLimited: Hit rate limit
    RateLimited --> Active: Reset time reached
    Active --> Paused: Manual pause
    Paused --> Active: Manual unpause
    
    note right of Active
        - Can receive requests
        - Token valid
        - Not rate limited
    end note
    
    note right of RateLimited
        - rate_limited_until set
        - Skipped by strategies
        - Auto-clears after reset
    end note
    
    note right of TokenExpired
        - Triggers refresh flow
        - Blocks until refreshed
    end note
```

### Session Management (Session Strategy)

```mermaid
flowchart TD
    A[Request Arrives] --> B{Active Session?}
    B -->|Yes| C{Session Expired?}
    B -->|No| D[Select New Account]
    
    C -->|No| E[Use Session Account]
    C -->|Yes| F[Reset Session]
    
    D --> G[Start New Session]
    F --> G
    
    G --> H[Set session_start = now]
    H --> I[Set session_request_count = 0]
    
    E --> J[Increment session_request_count]
    I --> J
    
    J --> K[Process Request]
```

### Database Tables Updated

1. **accounts** table:
   - `last_used`: Updated on every request
   - `request_count`: Incremented per request
   - `total_requests`: Lifetime counter
   - `rate_limited_until`: Set when rate limited
   - `access_token` & `expires_at`: Updated on token refresh
   - `account_tier`: Updated when detected from response
   - `session_start` & `session_request_count`: For session strategy
   - `rate_limit_status`, `rate_limit_reset`, `rate_limit_remaining`: Rate limit metadata
   - `provider`: Provider type (e.g., "anthropic")

2. **requests** table:
   - One row per request with status, timing, and usage data
   - Links to account used (or "no-account" for fallback)
   - Stores error messages for failed requests
   - Enhanced usage tracking:
     - `model`: AI model used
     - `input_tokens`, `output_tokens`: Token counts
     - `cache_read_input_tokens`, `cache_creation_input_tokens`: Cache token details
     - `cost_usd`: Calculated cost in USD

3. **request_payloads** table:
   - Stores full request/response bodies (base64 encoded)
   - Includes headers and metadata
   - Enhanced metadata:
     - `isStream`: Whether response was streamed
     - `bodyTruncated`: If stream body exceeded maxBytes
     - `rateLimited`: If request hit rate limits
   - Used for debugging, replay, and analytics

### Update Transaction Flow

```mermaid
sequenceDiagram
    participant Request
    participant AsyncWriter as Async DB Writer
    participant DB
    
    Note over Request,AsyncWriter: During Request Processing
    
    Request->>AsyncWriter: enqueue(updateAccountUsage)
    Request->>AsyncWriter: enqueue(updateAccountRateLimitMeta)
    
    alt Rate Limited
        Request->>AsyncWriter: enqueue(markAccountRateLimited)
    end
    
    Request->>AsyncWriter: enqueue(saveRequest)
    Request->>AsyncWriter: enqueue(saveRequestPayload)
    
    alt Tier Changed
        Request->>AsyncWriter: enqueue(updateAccountTier)
    end
    
    alt Streaming Response
        Note over Request: Response sent to client
        Request->>AsyncWriter: enqueue(updateRequestUsage)
        Note over AsyncWriter: Usage data queued after extraction
    end
    
    Note over AsyncWriter,DB: Background Processing (every 100ms)
    
    loop Process Queue
        AsyncWriter->>AsyncWriter: Check queue
        alt Jobs Available
            AsyncWriter->>DB: BEGIN (implicit)
            AsyncWriter->>DB: Execute queued operations
            Note over DB: UPDATE accounts<br/>INSERT requests<br/>INSERT request_payloads
            AsyncWriter->>DB: COMMIT (implicit)
        end
    end
    
    Note over AsyncWriter: On shutdown: flush remaining jobs
```

## Asynchronous Database Operations

The AsyncDbWriter component ensures non-blocking database operations:

### Architecture

```mermaid
flowchart TD
    subgraph "Request Thread"
        A[Proxy Handler] --> B[Process Request]
        B --> C[Enqueue DB Operations]
        C --> D[Return Response Immediately]
    end
    
    subgraph "AsyncDbWriter"
        E[Job Queue] --> F{Queue Empty?}
        F -->|No| G[Process Job]
        G --> H[Execute DB Operation]
        H --> F
        F -->|Yes| I[Wait 100ms]
        I --> F
    end
    
    C -.-> E
    
    subgraph "On Shutdown"
        J[SIGINT/SIGTERM] --> K[Stop Timer]
        K --> L[Flush Queue]
        L --> M[Exit]
    end
```

### Key Features

1. **Non-blocking Operations**: All database writes are queued, allowing requests to complete without waiting
2. **Batch Processing**: Queue processed every 100ms or immediately when jobs are added
3. **Graceful Shutdown**: Ensures all queued operations complete before process exit
4. **Error Isolation**: Failed DB operations don't affect request processing
5. **Memory Efficient**: Processes queue continuously to prevent unbounded growth

## Summary

The ccflare data flow is designed to:

1. **Maximize availability** through multiple account rotation and retry logic
2. **Prevent stampedes** with singleton token refresh promises
3. **Track everything** for debugging, analytics, and replay capabilities
4. **Handle failures gracefully** with fallback modes and clear error reporting
5. **Respect rate limits** intelligently, distinguishing between hard limits and warnings
6. **Optimize performance** through:
   - Non-blocking async database writes via worker message passing
   - Streaming response passthrough with Response.clone() for analytics
   - Background post-processor worker for all usage extraction
   - Efficient request/response payload storage with base64 encoding
7. **Support analytics** by capturing streaming responses without impacting performance
8. **Enable debugging** through comprehensive request/response payload storage

The system ensures reliable Claude API access while providing comprehensive monitoring and management capabilities through its dashboard and API endpoints.

## Key Implementation Details

### Agent Interceptor Flow

The agent interceptor examines system prompts to:
1. Detect agent usage by matching system prompts
2. Extract workspace paths from CLAUDE.md references
3. Look up agent model preferences in the database
4. Modify the request body to use the preferred model
5. Track which agent was used for analytics

### Post-Processor Worker Architecture

The post-processor worker handles all analytics asynchronously:
1. Receives START message with request/response metadata
2. Processes CHUNK messages for streaming responses, extracting usage from SSE data
3. Receives END message to finalize processing
4. Calculates costs, tokens per second, and other metrics
5. Queues all database operations through AsyncDbWriter
6. Handles graceful shutdown via shutdown message

### Response Handling Strategy

1. **Immediate Response**: Original response is returned to client without modification
2. **Background Analytics**: Response.clone() used for analytics processing
3. **Worker Communication**: All processing delegated to post-processor worker
4. **No Blocking**: Client never waits for analytics or database operations