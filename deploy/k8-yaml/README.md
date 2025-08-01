# Kubernetes Deployment Configurations

This directory contains Kubernetes deployment configurations for ccflare with different database providers.

## Available Configurations

### SQLite (Default)
- **File**: `k8s-deployment.yaml`
- **Database**: SQLite with persistent volume
- **Use case**: Single-instance deployments, development, testing

### PostgreSQL
- **File**: `k8s-deployment-postgresql.yaml`
- **Database**: External PostgreSQL database
- **Use case**: Production deployments, multi-instance scaling

### MySQL
- **File**: `k8s-deployment-mysql.yaml`
- **Database**: External MySQL database
- **Use case**: Production deployments, multi-instance scaling

## Quick Start

### SQLite Deployment
```bash
kubectl apply -f k8s-deployment.yaml
```

### PostgreSQL Deployment
1. Update the database URL in the secret:
   ```bash
   # Edit the secret in k8s-deployment-postgresql.yaml
   database-url: "postgresql://user:password@your-postgres-host:5432/ccflare"
   ```

2. Deploy:
   ```bash
   kubectl apply -f k8s-deployment-postgresql.yaml
   ```

### MySQL Deployment
1. Update the database URL in the secret:
   ```bash
   # Edit the secret in k8s-deployment-mysql.yaml
   database-url: "mysql://user:password@your-mysql-host:3306/ccflare"
   ```

2. Deploy:
   ```bash
   kubectl apply -f k8s-deployment-mysql.yaml
   ```

## Environment Variables

### Database Configuration
- `DATABASE_PROVIDER`: Database type (`sqlite`, `postgresql`, `mysql`)
- `DATABASE_URL`: Connection string for PostgreSQL/MySQL
- `ccflare_DB_PATH`: SQLite database file path (SQLite only)

### Application Configuration
- `API_KEY`: Authentication key for the API
- `LOG_LEVEL`: Logging level (`DEBUG`, `INFO`, `WARN`, `ERROR`)
- `PORT`: HTTP server port (default: 8080)

## Security Considerations

### Secrets Management
- Database credentials are stored in Kubernetes secrets
- API keys should be rotated regularly
- Use proper RBAC to restrict secret access

### Network Security
- Services use ClusterIP by default (internal only)
- Consider using NetworkPolicies for additional isolation
- Use TLS for database connections in production

## Scaling Considerations

### SQLite Limitations
- SQLite deployments are limited to 1 replica
- Persistent volume must support ReadWriteOnce
- Not suitable for high-availability deployments

### PostgreSQL/MySQL Benefits
- Supports multiple replicas
- Better performance under load
- Built-in high availability options
- Proper ACID compliance for concurrent access

## Monitoring and Health Checks

All deployments include:
- **Liveness probe**: Checks if the application is running
- **Readiness probe**: Checks if the application is ready to serve traffic
- **Resource limits**: Prevents resource exhaustion

## Database Migration

### From SQLite to PostgreSQL/MySQL
1. Export data from SQLite
2. Set up PostgreSQL/MySQL database
3. Import data to new database
4. Update Kubernetes deployment
5. Redeploy application

### Example Migration Commands
```bash
# Export SQLite data (example)
sqlite3 /app/data/ccflare.db .dump > ccflare_backup.sql

# Import to PostgreSQL (example)
psql -h postgres-host -U username -d ccflare < ccflare_backup.sql
```

## Troubleshooting

### Common Issues
1. **Database connection failures**
   - Check DATABASE_URL format
   - Verify network connectivity
   - Confirm database credentials

2. **Permission errors**
   - Check securityContext settings
   - Verify volume permissions
   - Review RBAC policies

3. **Resource constraints**
   - Monitor CPU/memory usage
   - Adjust resource limits
   - Check node capacity

### Debug Commands
```bash
# Check pod logs
kubectl logs -n coder deployment/ccflare

# Check pod status
kubectl get pods -n coder -l app=ccflare

# Check secrets
kubectl get secrets -n coder

# Test database connectivity
kubectl exec -n coder deployment/ccflare -- nc -zv postgres-host 5432
```
