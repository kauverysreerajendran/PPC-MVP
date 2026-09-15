# Infrastructure, Scaling and Load Balancing Standard

## 1. When a load balancer is actually required

A load balancer is introduced for a stated reason, not by default. Valid reasons:

| Reason | Notes |
|---|---|
| A single instance cannot handle peak load | Confirmed by measurement, not by assumption |
| Zero downtime deployment is required | Rolling restart behind an LB |
| High availability commitment in the contract | Instance failure must not cause an outage |
| Blue green or canary release process | Traffic shifting |

Before adding a second application server, confirm the bottleneck is the application tier. In most business applications the first bottleneck is the database or an unindexed query, and a second application server makes that worse by increasing connection count. Scale vertically and fix queries first. Scale horizontally when the application tier is genuinely saturated.

## 2. Reference architecture

```
Client
  |
CDN (static assets, images)
  |
Load balancer / reverse proxy   TLS termination, rate limiting, health checks
  |
  |-- App instance 1 (stateless)
  |-- App instance 2 (stateless)
  |
  |-- Redis (cache, sessions, queue)
  |-- Worker instances (background jobs)
  |
PostgreSQL primary  --> read replica (reporting)
Object storage (user uploads, exports, backups)
```

## 3. Requirements for horizontal scaling

An application can only be placed behind a load balancer if all of the following are true.

| # | Requirement |
|---|---|
| 1 | No session state stored in application process memory. Sessions live in Redis or in a signed token |
| 2 | No uploaded files written to local disk. Files go to object storage or a shared volume |
| 3 | No in process cache holding data that must be consistent across instances |
| 4 | Scheduled jobs run from a single scheduler or use a distributed lock so that they do not run once per instance |
| 5 | Logs written to stdout or a central collector, not to local files |
| 6 | Database migrations run as a separate deployment step, not on instance startup |
| 7 | WebSocket connections backed by a shared pub/sub channel |

Sticky sessions are a workaround for a stateful application. Use them only as an interim measure and record the debt. They undermine even load distribution and complicate deployment.

## 4. Load balancer configuration

| Setting | Recommendation |
|---|---|
| Algorithm | Least connections for varied request durations, round robin for uniform workloads |
| Health check | Dedicated endpoint, interval 10 s, 2 consecutive failures to remove an instance |
| TLS | Terminated at the load balancer. Internal traffic on a private network |
| Timeouts | Idle timeout above the longest legitimate request, typically 60 s |
| Request size limit | Set explicitly to match the largest permitted upload |
| Rate limiting | Applied at this tier for global protection |
| Real client IP | `X-Forwarded-For` forwarded and trusted proxy configured in the application |
| Draining | Connection draining enabled before instance removal |

### 4.1 Health endpoints

| Endpoint | Checks | Used by |
|---|---|---|
| `/healthz` | Process is alive. No dependency checks | Load balancer liveness |
| `/readyz` | Database reachable, migrations applied, Redis reachable if required | Deployment readiness |

A health check that queries the database on every probe adds avoidable load. Keep liveness cheap.

## 5. Environments

| Environment | Purpose | Data |
|---|---|---|
| Local | Development | Seeded sample data |
| Development or integration | Shared feature testing | Synthetic data |
| Staging | Release verification and client UAT | Masked copy of production structure |
| Production | Live | Real |

Rules:

1. Staging matches production in configuration, versions, and topology. A staging environment that differs materially does not validate a release.
2. No production credentials in lower environments.
3. Production data copied to lower environments only after masking, with approval.

## 6. Deployment

| # | Rule |
|---|---|
| 6.1 | Deployments are automated and repeatable. Manual file copying to a server is not an accepted process |
| 6.2 | Every release is tagged and traceable to a commit |
| 6.3 | Database migrations run before the new application version receives traffic, and remain backward compatible with the previous version during the rollout |
| 6.4 | Rollback procedure is documented and tested. Rolling back code is not enough if a migration was destructive |
| 6.5 | Static assets are versioned and cache busted |
| 6.6 | Deployment windows and stakeholder communication follow the release process document |

## 7. Monitoring and alerting

| Area | Metric | Alert threshold |
|---|---|---|
| Availability | Uptime check per environment | Two consecutive failures |
| Application | Error rate | Above 1 percent of requests over 5 minutes |
| Application | p95 response time | Above the agreed budget |
| Server | CPU, memory, disk | Above 80 percent sustained |
| Database | Connections, replication lag, long transactions | Connection usage above 80 percent |
| Redis | Memory, evictions | Evictions rising on a session or queue instance |
| Queue | Depth, failed job count | Depth growing continuously, any dead letter entry |
| Certificates | Expiry | 21 days before expiry |

Alerts route to a named on call owner. An alert with no owner is noise.

## 8. Backup and recovery

| # | Item |
|---|---|
| 8.1 | Automated encrypted database backups, retention defined per client contract |
| 8.2 | Uploaded files backed up or stored in replicated object storage |
| 8.3 | Restore tested quarterly, with the result recorded |
| 8.4 | RPO and RTO agreed with the client and documented |
| 8.5 | Infrastructure configuration stored as code or, at minimum, documented in a runbook |
| 8.6 | Recovery runbook covers instance loss, database loss, and full region loss |

## 9. Single points of failure

Record them explicitly. For most projects the honest list is:

1. Single database instance. Mitigation: automated backups plus a documented restore, or a managed service with failover.
2. Single Redis instance holding sessions or the job queue. Mitigation: persistence enabled, or a managed replicated instance.
3. Single object storage region.
4. Third party services such as payment, SMS, and email providers.

A load balancer in front of two application servers, with one database behind them, does not make the system highly available. Stating this to stakeholders early avoids a false availability claim in the proposal.
