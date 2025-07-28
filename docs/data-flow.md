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
- **AsyncDbWriter**: Asynchronous database write queue to prevent blocking
- **Stream Tee**: Captures streaming responses for analytics without blocking the client
- **Service Container**: Dependency injection for component management

## Overview of Request Lifecycle

The request lifecycle in ccflare follows these main stages:

1. **Request Reception**: Client sends request to ccflare server
2. **Route Determination**: Server checks if it's an API request, dashboard request, or proxy request
3. **Account Selection**: Load balancer strategy selects available accounts based on configured algorithm
4. **Token Validation**: System checks if account has valid access token, refreshes if needed
5. **Request Forwarding**: Proxy forwards request to Anthropic API with authentication
6. **Response Handling**: System processes response, extracts usage data, checks rate limits
7. **Stream Capture**: For streaming responses, uses teeStream to capture content without blocking
8. **Data Persistence**: Queues database updates via AsyncDbWriter for non-blocking writes
9. **Response Streaming**: Returns response to client, preserving streaming capabilities
10. **Async Processing**: Background processing of usage data, cost calculation, and analytics

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
            alt Streaming Response
                Proxy->>Proxy: teeStream(response.body)
                Note over Proxy: Capture stream without blocking
                Proxy->>Provider: extractUsageInfo(async)
                Provider-->>Proxy: Usage promise
                Proxy->>Client: Stream response immediately
                
                Note over Proxy: Background processing
                Proxy->>Proxy: await usage promise
                Proxy->>AsyncWriter: enqueue(updateRequestUsage)
                Proxy->>AsyncWriter: enqueue(saveRequestPayload with stream data)
            else Non-streaming Response
                Proxy->>Provider: extractUsageInfo(response)
                Provider-->>Proxy: Usage data (tokens, model)
                Proxy->>Proxy: estimateCostUSD(model, tokens)
                
                alt Has tier info
                    Proxy->>Provider: extractTierInfo(response)
                    Provider-->>Proxy: Account tier
                    Proxy->>AsyncWriter: enqueue(updateAccountTier)
                end
                
                Proxy->>AsyncWriter: enqueue(saveRequest)
                Proxy->>AsyncWriter: enqueue(saveRequestPayload)
                
                Proxy->>Provider: processResponse(response)
                Proxy-->>Client: Processed response
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
    participant Proxy
    participant TeeStream
    participant AsyncWriter as Async DB Writer
    participant Provider
    participant DB

    Note over Proxy: Streaming response detected
    
    Proxy->>Provider: isStreamingResponse(response)?
    Provider-->>Proxy: true
    
    Proxy->>TeeStream: Create teeStream(response.body)
    Note over TeeStream: maxBytes: runtime.streamBodyMaxBytes
    
    TeeStream->>TeeStream: Create new ReadableStream
    
    par Stream to Client
        TeeStream->>Client: Pass through chunks immediately
        Note over Client: Receives stream without delay
    and Buffer for Analytics
        loop While streaming
            TeeStream->>TeeStream: Buffer chunks (up to maxBytes)
            alt Buffer full
                TeeStream->>TeeStream: Set truncated flag
                Note over TeeStream: Stop buffering
            end
        end
    end
    
    Note over Proxy: Fire-and-forget usage extraction
    Proxy->>Provider: extractUsageInfo(responseClone)
    
    alt Stream completed
        TeeStream->>TeeStream: onClose callback
        TeeStream->>TeeStream: combineChunks(buffered)
        TeeStream->>AsyncWriter: enqueue(saveRequestPayload)
        Note over AsyncWriter: Payload includes:<br/>- Captured stream data<br/>- bodyTruncated flag<br/>- Stream metadata
    else Stream error
        TeeStream->>TeeStream: onError callback
        Note over Proxy: Log error, continue streaming
    end
    
    Note over Provider: Background usage extraction
    Provider->>Provider: Parse streaming response
    Provider-->>AsyncWriter: enqueue(updateRequestUsage)
    
    Note over AsyncWriter,DB: Async processing
    AsyncWriter->>DB: Process all queued updates
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
            Proxy->>Proxy: teeStream for capture
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
- **Stream body max bytes**: Default: 1MB (1024 * 1024 bytes) in teeStream

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
            M[AsyncDbWriter Queue] --> N[Process Jobs]
            N --> O[Execute DB Operations]
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
   - Non-blocking async database writes
   - Streaming response passthrough with tee capture
   - Efficient request/response payload storage
7. **Support analytics** by capturing streaming responses without impacting performance
8. **Enable debugging** through comprehensive request/response payload storage

The system ensures reliable Claude API access while providing comprehensive monitoring and management capabilities through its dashboard and API endpoints. Recent enhancements include streaming response capture for analytics, asynchronous database operations for better performance, and enhanced cost tracking with detailed token breakdowns.