const API = "";
const $ = (id) => document.getElementById(id);
const state = { busy: false, dns: null, ping: null, trace: null };
let routeMap = null;
let routeLayer = null;

function toast(message) {
  const node = $("toast");
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove("show"), 3600);
}

async function api(path, target) {
  const response = await fetch(API + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target })
  });
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error(data.error || "The request failed.");
  return data;
}

async function apiPost(path, payload) {
  const response = await fetch(API + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error(data.error || "The request failed.");
  return data;
}

function setBusy(busy) {
  state.busy = busy;
  $("start-button").disabled = busy;
  $("start-button").innerHTML = busy ? "Tracing route…" : 'Start journey <span>↗</span>';
}

function renderStats() {
  $("stat-ip").textContent = state.dns?.records?.[0]?.address || "—";
  $("stat-host").textContent = state.dns?.hostname || "Waiting for a target";
  $("stat-latency").innerHTML = state.ping?.avg_ms == null ? "— <i>ms</i>" : `${state.ping.avg_ms} <i>ms</i>`;
  $("stat-loss").innerHTML = state.ping ? `${state.ping.packet_loss_percent} <i>%</i>` : "— <i>%</i>";
  $("stat-hops").textContent = state.trace ? state.trace.hop_count : "—";
}

function renderHops(data) {
  const list = $("route-list");
  if (!data.hops.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-symbol">⌁</div><b>No responding hops detected</b><span>Routers may filter traceroute probes. Check the raw output below.</span></div>';
    return;
  }
  list.innerHTML = data.hops.map((hop, index) => {
    const timeout = !hop.ip;
    const label = timeout ? "No response received" : hop.ip;
    const rtt = hop.rtt_ms == null ? "—" : `${hop.rtt_ms} ms`;
    return `<div class="hop-row ${timeout ? "timeout" : ""}" style="animation-delay:${Math.min(index * 45, 500)}ms">
      <div class="hop-number">${hop.hop}</div>
      <div class="hop-main"><b>${label}</b><small>HOP ${String(hop.hop).padStart(2, "0")} · ${timeout ? "REQUEST TIMED OUT" : "RESPONDED"}</small></div>
      <div class="hop-rtt">${rtt}</div>
    </div>`;
  }).join("");
}

let journeyTimer = null;

function stopJourneyReplay() {
  if (journeyTimer) {
    clearTimeout(journeyTimer);
    journeyTimer = null;
  }
}

function renderPacketJourney(trace) {
  stopJourneyReplay();
  const track = $("journey-track");
  const button = $("replay-button");
  const progress = $("journey-progress-bar");
  const status = $("journey-status");
  const hops = trace?.hops || [];
  progress.style.width = "0%";
  if (!hops.length) {
    track.innerHTML = '<div class="journey-empty">No traceroute hops are available to replay.</div>';
    status.textContent = "No route data to animate.";
    button.disabled = true;
    return;
  }

  track.innerHTML = hops.map((hop, index) => {
    const timeout = !hop.ip;
    const title = timeout ? "No response from this hop" : hop.ip;
    const detail = timeout ? "Probe timed out" : (hop.rtt_ms == null ? "Responding router" : hop.rtt_ms + " ms response time");
    return `<div class="journey-step ${timeout ? "is-timeout" : ""}" data-step="${index}">
      <span class="journey-node">${timeout ? "?" : index + 1}</span>
      <span class="journey-step-copy"><b>${title}</b><small>HOP ${String(hop.hop).padStart(2, "0")} · ${detail}</small></span>
      <span class="journey-step-state">${timeout ? "NO REPLY" : "WAITING"}</span>
    </div>`;
  }).join("");
  button.disabled = false;
  status.textContent = hops.length + " traceroute hop entries ready. Press replay to follow the measured sequence.";
}

function replayPacketJourney() {
  stopJourneyReplay();
  const steps = [...$("journey-track").querySelectorAll(".journey-step")];
  const button = $("replay-button");
  const progress = $("journey-progress-bar");
  const status = $("journey-status");
  if (!steps.length) return;
  steps.forEach(step => {
    step.classList.remove("is-active", "is-complete");
    const stateLabel = step.querySelector(".journey-step-state");
    stateLabel.textContent = step.classList.contains("is-timeout") ? "NO REPLY" : "WAITING";
  });
  button.disabled = true;
  let index = 0;
  const advance = () => {
    if (index > 0) {
      const previous = steps[index - 1];
      previous.classList.remove("is-active");
      previous.classList.add("is-complete");
      previous.querySelector(".journey-step-state").textContent = previous.classList.contains("is-timeout") ? "TIMEOUT" : "PASSED";
    }
    if (index >= steps.length) {
      progress.style.width = "100%";
      status.textContent = "Replay complete. This sequence represents traceroute responses, not a captured application packet.";
      button.disabled = false;
      journeyTimer = null;
      return;
    }
    const current = steps[index];
    current.classList.add("is-active");
    current.querySelector(".journey-step-state").textContent = current.classList.contains("is-timeout") ? "NO REPLY" : "CURRENT HOP";
    progress.style.width = ((index + 1) / steps.length * 100) + "%";
    status.textContent = "Following hop " + (Number(current.dataset.step) + 1) + " of " + steps.length + (current.classList.contains("is-timeout") ? ": no response was received." : ".");
    index += 1;
    journeyTimer = setTimeout(advance, 650);
  };
  advance();
}

function renderMap(locations) {
  const mapNode = $("map");
  if (!window.L) { mapNode.innerHTML = '<div class="map-placeholder"><b>Map library unavailable</b><small>Check your internet connection and reload.</small></div>'; return; }
  if (!routeMap) {
    mapNode.innerHTML = "";
    routeMap = L.map(mapNode, { scrollWheelZoom: false }).setView([20, 0], 2);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' }).addTo(routeMap);
    routeLayer = L.layerGroup().addTo(routeMap);
  }
  routeLayer.clearLayers();
  const points = (locations || []).filter(item => item.available && Number.isFinite(item.latitude) && Number.isFinite(item.longitude));
  if (!points.length) {
    routeMap.setView([20, 0], 2);
    $("map-note").textContent = "No responding hop had an available approximate location. The hop list still contains the traceroute results.";
    setTimeout(() => routeMap.invalidateSize(), 100);
    return;
  }
  const coordinates = points.map(item => [item.latitude, item.longitude]);
  points.forEach((item, index) => {
    const marker = L.circleMarker(coordinates[index], { radius: 7, color: "#071522", weight: 2, fillColor: "#59d7c8", fillOpacity: 0.95 }).addTo(routeLayer);
    const popup = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = "Hop " + (item.hop || (index + 1)) + ": " + item.ip;
    popup.appendChild(title);
    const location = document.createElement("div");
    location.textContent = [item.city, item.region, item.country].filter(Boolean).join(", ") || "Location unavailable";
    popup.appendChild(location);
    if (item.isp) { const isp = document.createElement("small"); isp.textContent = item.isp; popup.appendChild(isp); }
    marker.bindPopup(popup);
  });
  if (coordinates.length > 1) {
    L.polyline(coordinates, { color: "#59d7c8", weight: 3, opacity: 0.8, dashArray: "7 8" }).addTo(routeLayer);
    routeMap.fitBounds(L.latLngBounds(coordinates), { padding: [28, 28], maxZoom: 6 });
  } else { routeMap.setView(coordinates[0], 4); }
  $("map-note").textContent = points.length + " approximate IP location(s) shown. The dotted line connects known locations and is not the exact physical cable path.";
  setTimeout(() => routeMap.invalidateSize(), 100);
}

async function startJourney() {
  if (state.busy) return;
  const target = $("target-input").value.trim();
  if (!target) return toast("Enter a domain name or public IP address first.");

  stopJourneyReplay();
  renderPacketJourney(null);
  state.dns = state.ping = state.trace = null;
  renderStats();
  $("route-list").innerHTML = '<div class="empty-state"><div class="empty-symbol">◌</div><b>Resolving destination…</b><span>Contacting DNS and preparing network diagnostics.</span></div>';
  $("raw-output").textContent = "Running real network diagnostics…";
  $("route-summary").textContent = "Resolving DNS, measuring latency and discovering route hops.";
  setBusy(true);

  const outputs = [];
  try {
    state.dns = await api("/api/dns", target);
    outputs.push("DNS LOOKUP\n" + JSON.stringify(state.dns, null, 2));
    renderStats();
    $("route-summary").textContent = `Resolved ${state.dns.hostname}. Running ping and traceroute from this computer…`;

    const results = await Promise.allSettled([
      api("/api/ping", target),
      api("/api/traceroute", target)
    ]);

    if (results[0].status === "fulfilled") {
      state.ping = results[0].value;
      outputs.push("PING RESULTS\n" + JSON.stringify(state.ping, null, 2));
    } else {
      outputs.push("PING ERROR\n" + results[0].reason.message);
    }

    if (results[1].status === "fulfilled") {
      state.trace = results[1].value;
      outputs.push("TRACEROUTE RESULTS\n" + state.trace.raw_output);
      renderHops(state.trace);
      renderPacketJourney(state.trace);
      const hopIps = [...new Set(state.trace.hops.filter(hop => hop.ip).map(hop => hop.ip))];
      if (hopIps.length) {
        try {
          const geo = await apiPost("/api/geolocate", { ips: hopIps });
          geo.locations.forEach(location => {
            const matchingHop = state.trace.hops.find(hop => hop.ip === location.ip);
            location.hop = matchingHop ? matchingHop.hop : null;
          });
          renderMap(geo.locations);
          outputs.push("APPROXIMATE HOP LOCATIONS\n" + JSON.stringify(geo, null, 2));
        } catch (geoError) {
          renderMap([]);
          outputs.push("GEOLOCATION NOTE\n" + geoError.message);
        }
      } else { renderMap([]); }
      $("route-summary").textContent = `${state.trace.hop_count} hop entries returned for ${state.trace.target}. ${state.trace.reached_destination ? "Destination responded." : "Destination response was not confirmed."}`;
    } else {
      outputs.push("TRACEROUTE ERROR\n" + results[1].reason.message);
      $("route-list").innerHTML = `<div class="empty-state"><b>Traceroute unavailable</b><span>${results[1].reason.message}</span></div>`;
      $("route-summary").textContent = "The traceroute test could not be completed.";
    }

    renderStats();
    $("raw-output").textContent = outputs.join("\n\n────────────────────────────────────────\n\n");
    if (results.every(item => item.status === "fulfilled")) toast("Journey diagnostics completed.");
    else toast("Journey completed with one or more diagnostic limitations.");
  } catch (error) {
    $("route-list").innerHTML = `<div class="empty-state"><b>Could not start journey</b><span>${error.message}</span></div>`;
    $("route-summary").textContent = "The destination could not be resolved.";
    $("raw-output").textContent = error.message;
    toast(error.message);
  } finally {
    setBusy(false);
  }
}

async function checkBackend() {
  try {
    const response = await fetch("/api/health");
    if (!response.ok) throw new Error("offline");
    $("engine-status").textContent = "Connected · Flask API";
  } catch {
    $("engine-status").textContent = "Backend unavailable";
  }
}

$("replay-button").addEventListener("click", replayPacketJourney);
$("start-button").addEventListener("click", startJourney);
$("target-input").addEventListener("keydown", event => {
  if (event.key === "Enter") startJourney();
});
checkBackend();
