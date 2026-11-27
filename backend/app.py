from __future__ import annotations

import ipaddress
import os
import json
import platform
import re
import shutil
import socket
import subprocess
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from typing import Any

import dns.resolver
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

app = Flask(__name__, static_folder="../frontend", static_url_path="")
CORS(app)

GEOLOCATION_CACHE: dict[str, dict[str, Any]] = {}

DOMAIN_RE = re.compile(r"^(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)(?:\.(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?))*\.?$")


def validate_target(raw: Any) -> str:
    """Validate a public hostname or IP before passing it to network tools."""
    if not isinstance(raw, str):
        raise ValueError("Please provide a domain name or IP address.")

    target = raw.strip().rstrip(".")
    if not target or len(target) > 253 or any(ch.isspace() for ch in target):
        raise ValueError("Enter a valid domain name or IP address.")

    try:
        address = ipaddress.ip_address(target)
        if not address.is_global:
            raise ValueError("For safety, only public internet IP addresses are supported.")
        return str(address)
    except ValueError as exc:
        if "only public" in str(exc):
            raise

    if not DOMAIN_RE.fullmatch(target):
        raise ValueError("Enter a valid domain name, such as example.com.")

    return target.encode("idna").decode("ascii").lower()


def public_addresses(hostname: str) -> list[dict[str, str]]:
    """Resolve A and AAAA records and reject non-public destinations."""
    records: list[dict[str, str]] = []
    resolver = dns.resolver.Resolver()
    resolver.lifetime = 5
    for record_type in ("A", "AAAA"):
        try:
            answers = resolver.resolve(hostname, record_type, raise_on_no_answer=False)
            if answers.rrset:
                for answer in answers:
                    value = str(answer)
                    address = ipaddress.ip_address(value)
                    if not address.is_global:
                        continue
                    item = {"type": record_type, "address": value}
                    if item not in records:
                        records.append(item)
        except (dns.resolver.NXDOMAIN, dns.resolver.NoAnswer):
            continue
        except (dns.resolver.NoNameservers, dns.exception.Timeout):
            continue

    if not records:
        raise RuntimeError("No public A or AAAA records were found. Check the domain or try again.")
    return records


def resolve_target(raw: Any) -> tuple[str, list[dict[str, str]]]:
    target = validate_target(raw)
    try:
        ipaddress.ip_address(target)
        return target, [{"type": "IP", "address": target}]
    except ValueError:
        records = public_addresses(target)
        # Prefer IPv4 for broad traceroute compatibility.
        selected = next((r["address"] for r in records if r["type"] == "A"), records[0]["address"])
        return selected, records


def lookup_ip_location(address: str) -> dict[str, Any]:
    """Return an approximate public-IP location using ipwho.is."""
    if address in GEOLOCATION_CACHE:
        return GEOLOCATION_CACHE[address]

    url = f"https://ipwho.is/{address}"
    req = urllib.request.Request(url, headers={"User-Agent": "InternetJourneyVisualizer/0.2"})
    try:
        with urllib.request.urlopen(req, timeout=6) as response:
            payload = json.loads(response.read().decode("utf-8"))
        if not payload.get("success"):
            result = {"ip": address, "available": False}
        else:
            latitude = payload.get("latitude")
            longitude = payload.get("longitude")
            valid_coordinates = (
                isinstance(latitude, (int, float))
                and isinstance(longitude, (int, float))
                and -90 <= latitude <= 90
                and -180 <= longitude <= 180
            )
            result = {
                "ip": address,
                "available": bool(valid_coordinates),
                "latitude": latitude if valid_coordinates else None,
                "longitude": longitude if valid_coordinates else None,
                "city": payload.get("city"),
                "region": payload.get("region"),
                "country": payload.get("country"),
                "isp": (payload.get("connection") or {}).get("isp"),
            }
    except (urllib.error.URLError, TimeoutError, ValueError, json.JSONDecodeError):
        result = {"ip": address, "available": False}

    GEOLOCATION_CACHE[address] = result
    return result


def run_command(command: list[str], timeout: int = 35) -> str:
    completed = subprocess.run(
        command,
        capture_output=True,
        text=True,
        errors="replace",
        timeout=timeout,
        check=False,
    )
    return (completed.stdout or "") + (completed.stderr or "")


@app.get("/")
def home():
    return send_from_directory(app.static_folder, "index.html")


@app.get("/api/health")
def health():
    return jsonify({"status": "ok", "service": "Internet Journey Visualizer API"})


@app.post("/api/dns")
def dns_lookup():
    body = request.get_json(silent=True) or {}
    try:
        target = validate_target(body.get("target"))
        try:
            ipaddress.ip_address(target)
            records = [{"type": "IP", "address": target}]
        except ValueError:
            records = public_addresses(target)
        return jsonify({"success": True, "hostname": target, "records": records})
    except (ValueError, RuntimeError) as exc:
        return jsonify({"success": False, "error": str(exc)}), 400


@app.post("/api/ping")
def ping():
    body = request.get_json(silent=True) or {}
    try:
        destination, records = resolve_target(body.get("target"))
        count = 4
        if platform.system().lower() == "windows":
            command = ["ping", "-n", str(count), "-w", "1500", destination]
        else:
            command = ["ping", "-c", str(count), "-W", "2", destination]

        if not shutil.which(command[0]):
            return jsonify({"success": False, "error": "The system ping utility is not installed."}), 501

        output = run_command(command, timeout=12)
        times = [float(x) for x in re.findall(r"time[=<]([0-9]+(?:\.[0-9]+)?)\s*ms", output, re.I)]
        sent = count
        received = len(times)
        return jsonify({
            "success": True,
            "target": body.get("target", "").strip(),
            "destination_ip": destination,
            "dns_records": records,
            "packets_sent": sent,
            "packets_received": received,
            "packet_loss_percent": round((sent - received) * 100 / sent, 1),
            "min_ms": round(min(times), 2) if times else None,
            "avg_ms": round(sum(times) / len(times), 2) if times else None,
            "max_ms": round(max(times), 2) if times else None,
            "raw_output": output[-5000:],
        })
    except ValueError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400
    except subprocess.TimeoutExpired:
        return jsonify({"success": False, "error": "Ping timed out. The destination may be filtering ICMP."}), 504
    except RuntimeError as exc:
        return jsonify({"success": False, "error": str(exc)}), 502


@app.post("/api/traceroute")
def traceroute():
    body = request.get_json(silent=True) or {}
    try:
        destination, records = resolve_target(body.get("target"))
        system = platform.system().lower()

        if system == "windows":
            command = ["tracert", "-d", "-h", "20", "-w", "1000", destination]
            executable = "tracert"
        else:
            executable = "traceroute"
            command = ["traceroute", "-n", "-m", "20", "-w", "1", destination]

        if not shutil.which(executable):
            return jsonify({
                "success": False,
                "error": f"{executable} is not installed. Install the system traceroute utility and try again.",
            }), 501

        output = run_command(command, timeout=35)
        hops = []
        for line in output.splitlines():
            match = re.match(r"^\s*(\d+)\s+(.*)$", line)
            if not match:
                continue
            hop_number = int(match.group(1))
            remainder = match.group(2).strip()
            ip_match = re.search(r"\b(?:\d{1,3}\.){3}\d{1,3}\b", remainder)
            hop_ip = ip_match.group(0) if ip_match else None
            time_values = [
                float(value)
                for value in re.findall(r"([0-9]+(?:\.[0-9]+)?)\s*ms", remainder, re.I)
            ]
            hops.append({
                "hop": hop_number,
                "ip": hop_ip,
                "rtt_ms": round(sum(time_values) / len(time_values), 2) if time_values else None,
                "status": "responded" if hop_ip else "timeout",
                "raw": remainder[:240],
            })

        return jsonify({
            "success": True,
            "target": body.get("target", "").strip(),
            "destination_ip": destination,
            "dns_records": records,
            "hops": hops,
            "hop_count": len(hops),
            "reached_destination": any(h.get("ip") == destination for h in hops),
            "raw_output": output[-10000:],
            "note": "A timeout means no probe response was received; it does not prove that a router is absent.",
        })
    except ValueError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400
    except subprocess.TimeoutExpired:
        return jsonify({"success": False, "error": "Traceroute exceeded its time limit."}), 504
    except RuntimeError as exc:
        return jsonify({"success": False, "error": str(exc)}), 502


@app.post("/api/geolocate")
def geolocate_hops():
    """Enrich responding public traceroute hops with approximate IP locations."""
    body = request.get_json(silent=True) or {}
    addresses = body.get("ips")
    if not isinstance(addresses, list) or not addresses:
        return jsonify({"success": False, "error": "Provide a non-empty list of hop IP addresses."}), 400
    if len(addresses) > 20:
        return jsonify({"success": False, "error": "A maximum of 20 hop addresses can be enriched at once."}), 400

    unique_addresses = []
    for raw_address in addresses:
        try:
            address = ipaddress.ip_address(str(raw_address))
        except ValueError:
            return jsonify({"success": False, "error": "Every hop must be a valid public IP address."}), 400
        if not address.is_global:
            return jsonify({"success": False, "error": "Only public hop IP addresses can be geolocated."}), 400
        canonical = str(address)
        if canonical not in unique_addresses:
            unique_addresses.append(canonical)

    with ThreadPoolExecutor(max_workers=5) as executor:
        locations = list(executor.map(lookup_ip_location, unique_addresses))

    return jsonify({
        "success": True,
        "locations": locations,
        "note": "IP geolocation is approximate and may identify an ISP gateway or network hub rather than the physical router.",
    })


@app.errorhandler(404)
def not_found(_error):
    if request.path.startswith("/api/"):
        return jsonify({"success": False, "error": "API endpoint not found."}), 404
    return jsonify({"error": "Page not found."}), 404


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "5000")), debug=False)
