# Internet Journey Visualizer

An educational Computer Networks web application that explores how traffic travels from a client to a public internet destination.

The application combines real DNS, ping and traceroute measurements with an interactive route view, approximate IP geolocation, a replay of measured traceroute hops, latency charting, and browser-local history. It does not invent router hops or geographic locations.

## Features

- DNS A and AAAA record resolution.
- Ping measurements: sent/received packets, packet loss, and min/average/max RTT.
- Traceroute using Windows `tracert` or Linux/macOS `traceroute`, with IPv4/IPv6 hop parsing.
- Hop-by-hop route list with timeout states.
- Approximate IP geolocation and Leaflet map for responding public IP hops (private hops are skipped).
- Replay animation based on the actual traceroute result.
- Hop RTT chart with missing values preserved as gaps.
- Last 20 journeys saved in browser local storage.
- CSV and JSON export of browser-local journey history.
- Responsive dark dashboard.
- Flask API, Docker deployment and automated Python tests.

## Architecture

```text
Browser (HTML / CSS / JavaScript)
       | same-origin HTTP / JSON
       v
Flask REST API (Python)
       +-- DNS resolver (dnspython)
       +-- Ping utility (operating system)
       +-- Traceroute utility (tracert / traceroute)
       +-- IP geolocation (ipwho.is)
       |
       v
Host operating system network stack
       |
       v
Public DNS, routers and destination hosts
```

The frontend and backend are served from the same Flask application. In the cloud, Docker installs the required Linux network utilities and Gunicorn runs Flask.

## Run locally

Requirements: Python 3.10+, Git, and internet access.

From the repository root:

```powershell
py -m venv venv
.\venv\Scripts\Activate.ps1
python -m pip install -r backend/requirements.txt
python backend/app.py
```

Open http://127.0.0.1:5000.

On macOS/Linux, activate the environment with `source venv/bin/activate` and then run the same pip and Python commands.

## Deploy to Render

This repository includes a `Dockerfile` and `render.yaml`.

1. Sign in to Render with GitHub.
2. Choose **New + → Blueprint**.
3. Select this repository: `sarker908/internet-journey-visualizer`.
4. Review the service named `internet-journey-visualizer`.
5. Apply the Blueprint and wait for the Docker build and deployment.
6. Open the public `.onrender.com` URL shown by Render.

Render reads `render.yaml`, builds the Docker image, and uses `/api/health` as the health-check endpoint. New commits to the connected branch can trigger automatic deployments.

The free web service may spin down after inactivity and take time to wake up. Cloud providers can restrict ICMP or traceroute traffic. A successful web deployment therefore does not guarantee that every network diagnostic will work from the hosting environment. Test the health endpoint and diagnostics after deployment.

## API

All POST endpoints accept JSON with a `target` field except geolocation, which accepts an `ips` array.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | Backend health check |
| POST | `/api/dns` | Resolve public A/AAAA records |
| POST | `/api/ping` | Ping a public destination |
| POST | `/api/traceroute` | Discover responding route hops |
| POST | `/api/geolocate` | Enrich up to 20 public hop IPs with approximate locations |

Example:

```json
{ "target": "example.com" }
```

## Interpreting results correctly

- A traceroute timeout means no probe response was received. It does not prove a router is absent.
- Ping and traceroute may be blocked, filtered or rate-limited by routers, firewalls, ISPs or the hosting provider.
- The measured route is the path observed from the machine running the backend, not necessarily the path from the browser visitor.
- IP geolocation is approximate. It may identify an ISP gateway or network hub rather than a physical router.
- The map connects only the approximate locations returned by the geolocation provider. Dotted lines are visual guides, not actual fiber or cable routes.
- The replay visualizes the returned traceroute hop sequence. It is not a packet capture and does not animate fabricated packets.
- History is stored in the browser's local storage on the device where the page is used. It is not synced to an account or uploaded to the backend.

## Security and responsible use

- Only investigate public destinations you are authorized to test.
- Private, loopback, link-local and reserved destination addresses are rejected.
- Diagnostic commands are executed with argument arrays, not through a shell.
- Do not use this educational tool to scan networks or overwhelm hosts.
- The public cloud deployment has no user authentication. Do not expose it as a general-purpose network diagnostic service for unrestricted use.

## Testing

```powershell
python -m compileall -q backend tests
python -m unittest discover -s tests -v
```

GitHub Actions runs these checks on pushes and pull requests to `main`.

## Academic concepts

DNS, IPv4/IPv6, ICMP, TTL, routing, traceroute, round-trip time (RTT), packet loss, geolocation limitations, REST APIs and client-server architecture.

## License

MIT
