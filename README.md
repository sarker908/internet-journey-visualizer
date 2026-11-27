# Internet Journey Visualizer

An educational Computer Networks web application that investigates how a request travels from a client to a public internet destination.

The project combines **real network diagnostics** with an interactive visualization. It does not invent router hops or geographic locations: unavailable measurements are shown as unknown.

## Current status

**Milestone 1: Project foundation and first working diagnostics API**

- [x] Flask application foundation
- [x] DNS A/AAAA lookup
- [x] Ping diagnostics
- [x] Traceroute diagnostics (Windows and Unix-like systems)
- [x] Interactive browser dashboard
- [ ] Hop geolocation enrichment
- [ ] Animated topology and route map
- [ ] Diagnostic history and export

## Architecture

```text
Browser (HTML/CSS/JavaScript)
       |
       | HTTP / JSON
       v
Flask REST API
       |
       +-- DNS resolver (dnspython)
       +-- Ping engine (system ping utility)
       +-- Traceroute engine (tracert / traceroute)
       |
       v
Operating system networking stack
       |
       v
Public DNS servers, routers and destination hosts
```

## Requirements

- Python 3.10+
- Windows 10/11, macOS or Linux
- Internet access
- VS Code or another editor

## Run locally

From the repository root:

```bash
python -m venv venv
```

Windows PowerShell:

```powershell
.\venv\Scripts\Activate.ps1
python -m pip install -r backend/requirements.txt
python backend/app.py
```

macOS / Linux:

```bash
source venv/bin/activate
python -m pip install -r backend/requirements.txt
python backend/app.py
```

Open **http://127.0.0.1:5000** in your browser.

## API

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | Check the backend |
| POST | `/api/dns` | Resolve a domain to A/AAAA records |
| POST | `/api/ping` | Measure round-trip time and packet loss |
| POST | `/api/traceroute` | Discover responding network hops |

Example request:

```json
{ "target": "example.com" }
```

## Important measurement notes

- Traceroute depends on router responses. A `*` or timeout means no response was received, not that the router does not exist.
- Ping and traceroute may be blocked or rate-limited by firewalls.
- IP geolocation is an estimate, not a physical router location.
- The route can differ by direction, time, ISP and network conditions.
- Browser animations represent measured results; they are not packet captures.
- The diagnostic API is designed for public destinations. Private, loopback, link-local and reserved IP destinations are rejected.

## Project safety

Only test destinations you are authorized to investigate. Do not use this tool to scan networks or overwhelm hosts. The backend validates targets and invokes diagnostic commands without a shell.

## Academic topics demonstrated

DNS, IPv4/IPv6, ICMP, TTL, routing, traceroute, round-trip time (RTT), packet loss, client-server architecture and REST APIs.

## License

MIT
