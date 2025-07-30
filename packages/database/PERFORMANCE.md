# Database Performance Optimizations

## Overview

This document describes the database indexes added to improve query performance in the Claude proxy load balancer.

## Indexes Added

### 1. Time-based Account Queries
- **Index**: `idx_requests_timestamp_account` on `requests(timestamp DESC, account_used)`
- **Purpose**: Speeds up analytics queries that filter by time range and account
- **Used by**: Analytics endpoints for per-account metrics

### 2. Model Analytics
- **Index**: `idx_requests_model_timestamp` on `requests(model, timestamp DESC)` WHERE `model IS NOT NULL`
- **Purpose**: Optimizes model distribution and performance queries
- **Used by**: Model analytics, performance metrics

### 3. Success Rate Calculations
- **Index**: `idx_requests_success_timestamp` on `requests(success, timestamp DESC)`
- **Purpose**: Speeds up success rate calculations over time periods
- **Used by**: Dashboard analytics, health checks

### 4. Active Account Lookups
- **Index**: `idx_accounts_paused` on `accounts(paused)` WHERE `paused = 0`
- **Purpose**: Quickly find active (non-paused) accounts
- **Used by**: Load balancer account selection

### 5. Per-Account Analytics
- **Index**: `idx_requests_account_timestamp` on `requests(account_used, timestamp DESC)`
- **Purpose**: Optimizes queries for individual account performance
- **Used by**: Account performance dashboards

### 6. Cost Analysis
- **Index**: `idx_requests_cost_model` on `requests(cost_usd, model, timestamp DESC)`
- **Purpose**: Speeds up cost analysis queries by model
- **Used by**: Cost tracking and billing analytics

### 7. Response Time Analysis
- **Index**: `idx_requests_response_time` on `requests(model, response_time_ms)`
- **Purpose**: Optimizes p95 percentile calculations
- **Used by**: Performance metrics, SLA monitoring

### 8. Token Usage
- **Index**: `idx_requests_tokens` on `requests(timestamp DESC, total_tokens)`
- **Purpose**: Speeds up token usage analytics
- **Used by**: Usage tracking, quota monitoring

### 9. Account Name Lookups
- **Index**: `idx_accounts_name` on `accounts(name)`
- **Purpose**: Optimizes joins between requests and accounts tables
- **Used by**: Analytics queries that filter by account name

### 10. Rate Limit Checks
- **Index**: `idx_accounts_rate_limited` on `accounts(rate_limited_until)`
- **Purpose**: Quickly identify rate-limited accounts
- **Used by**: Load balancer account selection

### 11. Session Management
- **Index**: `idx_accounts_session` on `accounts(session_start, session_request_count)`
- **Purpose**: Optimizes session-based load balancing
- **Used by**: Session strategy implementation

### 12. Request Count Ordering
- **Index**: `idx_accounts_request_count` on `accounts(request_count DESC, last_used)`
- **Purpose**: Speeds up account ordering for load balancing
- **Used by**: Various load balancing strategies

## Query Optimizations

### P95 Response Time Calculation
The p95 response time calculation has been optimized to use SQL window functions instead of loading all response times into memory:

```sql
WITH ordered_times AS (
  SELECT 
    response_time_ms,
    ROW_NUMBER() OVER (ORDER BY response_time_ms) as row_num,
    COUNT(*) OVER () as total_count
  FROM requests
  WHERE model = ? AND response_time_ms IS NOT NULL
)
SELECT response_time_ms as p95_response_time
FROM ordered_times
WHERE row_num = CAST(CEIL(total_count * 0.95) AS INTEGER)
LIMIT 1
```

## Performance Analysis

To analyze the performance impact of these indexes:

```bash
# From the database package directory
bun run analyze

# Or from the project root
cd packages/database && bun run analyze
```

This will show:
- Current index usage statistics
- Query execution plans
- Performance timings for common queries

## Maintenance Considerations

1. **Index Size**: The indexes add storage overhead but significantly improve query performance
2. **Write Performance**: Slight overhead on INSERT operations, but negligible for this use case
3. **Statistics**: Run `ANALYZE` periodically to keep query optimizer statistics current
4. **Monitoring**: Use the analyze script to verify indexes are being used effectively

## Future Optimizations

Consider these additional optimizations if needed:
1. Composite indexes for complex WHERE clauses
2. Covering indexes to avoid table lookups
3. Partial indexes for frequently filtered subsets
4. Query rewriting for better index utilization