const $ = (id) => document.getElementById(id);
const state = { busy: false, dns: null, ping: null, trace: null };
const HISTORY_KEY = "ijv.journey-history.v1";
let routeMap = null, routeLayer = null, latencyChart = null, journeyTimer = null;

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[char]);
}
function toast(message) {
  const node = $("toast"); node.textContent = message; node.classList.add("show");
  clearTimeout(toast.timer); toast.timer = setTimeout(() => node.classList.remove("show"), 3600);
}
async function requestJSON(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { "Content-Type":"application/json", ...(options.headers || {}) } });
  let data;
  try { data = await response.json(); } catch { throw new Error("The server returned an unreadable response."); }
  if (!response.ok || data.success === false) throw new Error(data.error || "Request failed (" + response.status + ").");
  return data;
}
const postTarget = (path, target) => requestJSON(path, { method:"POST", body:JSON.stringify({target}) });
const postJSON = (path, payload) => requestJSON(path, { method:"POST", body:JSON.stringify(payload) });

function setBusy(busy) {
  state.busy = busy; $("start-button").disabled = busy;
  $("start-button").innerHTML = busy ? "Tracing route…" : 'Start journey <span>↗</span>';
}
function renderStats() {
  $("stat-ip").textContent = state.dns?.records?.[0]?.address || "—";
  $("stat-host").textContent = state.dns?.hostname || "Waiting for a target";
  $("stat-latency").innerHTML = state.ping?.avg_ms == null ? "— <i>ms</i>" : state.ping.avg_ms + " <i>ms</i>";
  $("stat-loss").innerHTML = state.ping ? state.ping.packet_loss_percent + " <i>%</i>" : "— <i>%</i>";
  $("stat-hops").textContent = state.trace ? state.trace.hop_count : "—";
}
function renderHops(data) {
  const list = $("route-list");
  if (!data.hops.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-symbol">⌁</div><b>No responding hops detected</b><span>Routers may filter traceroute probes. Check the raw output below.</span></div>';
    return;
  }
  list.innerHTML = data.hops.map((hop, index) => {
    const timeout = !hop.ip, label = timeout ? "No response received" : escapeHTML(hop.ip);
    const rtt = hop.rtt_ms == null ? "—" : escapeHTML(hop.rtt_ms) + " ms";
    return '<div class="hop-row ' + (timeout ? "timeout" : "") + '" style="animation-delay:' + Math.min(index * 45, 500) + 'ms">' +
      '<div class="hop-number">' + escapeHTML(hop.hop) + '</div><div class="hop-main"><b>' + label + '</b><small>HOP ' +
      String(hop.hop).padStart(2,"0") + " · " + (timeout ? "REQUEST TIMED OUT" : "RESPONDED") +
      '</small></div><div class="hop-rtt">' + rtt + '</div></div>';
  }).join("");
}
function stopJourneyReplay() { if (journeyTimer) clearTimeout(journeyTimer); journeyTimer = null; }
function renderPacketJourney(trace) {
  stopJourneyReplay();
  const track = $("journey-track"), button = $("replay-button"), hops = trace?.hops || [];
  $("journey-progress-bar").style.width = "0%";
  if (!hops.length) {
    track.innerHTML = '<div class="journey-empty">No traceroute hops are available to replay.</div>';
    $("journey-status").textContent = "No route data to animate."; button.disabled = true; return;
  }
  track.innerHTML = hops.map((hop,index) => {
    const timeout = !hop.ip, title = timeout ? "No response from this hop" : escapeHTML(hop.ip);
    const detail = timeout ? "Probe timed out" : (hop.rtt_ms == null ? "Responding router" : escapeHTML(hop.rtt_ms) + " ms response time");
    return '<div class="journey-step ' + (timeout ? "is-timeout" : "") + '" data-step="' + index + '">' +
      '<span class="journey-node">' + (timeout ? "?" : index + 1) + '</span><span class="journey-step-copy"><b>' + title +
      '</b><small>HOP ' + String(hop.hop).padStart(2,"0") + " · " + detail + '</small></span><span class="journey-step-state">' +
      (timeout ? "NO REPLY" : "WAITING") + '</span></div>';
  }).join("");
  button.disabled = false;
  $("journey-status").textContent = hops.length + " traceroute hop entries ready. Replay follows the measured sequence.";
}
function replayPacketJourney() {
  stopJourneyReplay();
  const steps = [...$("journey-track").querySelectorAll(".journey-step")], button = $("replay-button");
  const progress = $("journey-progress-bar"), status = $("journey-status");
  if (!steps.length) return;
  steps.forEach(step => {
    step.classList.remove("is-active","is-complete");
    step.querySelector(".journey-step-state").textContent = step.classList.contains("is-timeout") ? "NO REPLY" : "WAITING";
  });
  button.disabled = true; let index = 0;
  const advance = () => {
    if (index > 0) {
      const previous = steps[index-1]; previous.classList.remove("is-active"); previous.classList.add("is-complete");
      previous.querySelector(".journey-step-state").textContent = previous.classList.contains("is-timeout") ? "TIMEOUT" : "PASSED";
    }
    if (index >= steps.length) {
      progress.style.width = "100%"; status.textContent = "Replay complete. This is a traceroute visualization, not a captured application packet.";
      button.disabled = false; journeyTimer = null; return;
    }
    const current = steps[index]; current.classList.add("is-active");
    current.querySelector(".journey-step-state").textContent = current.classList.contains("is-timeout") ? "NO REPLY" : "CURRENT HOP";
    progress.style.width = ((index+1)/steps.length*100) + "%";
    status.textContent = "Following hop " + (index+1) + " of " + steps.length + (current.classList.contains("is-timeout") ? ": no response was received." : ".");
    index++; journeyTimer = setTimeout(advance,650);
  };
  advance();
}
function renderLatencyChart(trace) {
  const canvas = $("latency-chart");
  if (!window.Chart) { canvas.parentElement.innerHTML = '<div class="journey-empty">Chart library unavailable. RTT values remain in the route list.</div>'; return; }
  const hops = trace?.hops || [];
  if (latencyChart) latencyChart.destroy();
  latencyChart = new Chart(canvas, {
    type:"line",
    data:{ labels:hops.map(hop=>"Hop "+hop.hop), datasets:[{
      label:"RTT", data:hops.map(hop=>hop.rtt_ms), borderColor:"#59d7c8", backgroundColor:"rgba(89,215,200,.12)",
      pointBackgroundColor:"#72b8ff", pointBorderColor:"#0d1a2a", pointRadius:4, borderWidth:2, tension:.25, spanGaps:false, fill:true
    }]},
    options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>ctx.parsed.y==null?"No RTT response":ctx.parsed.y+" ms"}}},
      scales:{x:{ticks:{color:"#8195ad",maxRotation:0,autoSkip:true},grid:{color:"rgba(125,150,180,.08)"}},
      y:{beginAtZero:true,title:{display:true,text:"RTT (ms)",color:"#8195ad"},ticks:{color:"#8195ad"},grid:{color:"rgba(125,150,180,.1)"}}}}
  });
}
function initializeMap() {
  const mapNode = $("map");
  if (!window.L) {
    mapNode.innerHTML = '<div class="map-placeholder"><b>Map library unavailable</b><small>Leaflet could not load. Check CDN access or browser extensions.</small></div>';
    $("map-note").textContent = "Map library failed to load. Reload the page or check whether the Leaflet CDN is blocked.";
    return false;
  }
  if (routeMap) {
    setTimeout(() => routeMap.invalidateSize(), 120);
    return true;
  }
  mapNode.innerHTML = "";
  routeMap = L.map(mapNode, { scrollWheelZoom: false }).setView([23.8, 90.4], 3);
  const tiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
  });
  tiles.on("tileerror", () => {
    $("map-note").textContent = "Map tiles could not load. Check your internet connection, content blockers, or OpenStreetMap access.";
  });
  tiles.on("load", () => {
    if (!state.trace) $("map-note").textContent = "Base map loaded. Run a journey to display approximate responding router locations.";
  });
  tiles.addTo(routeMap);
  routeLayer = L.layerGroup().addTo(routeMap);
  setTimeout(() => routeMap.invalidateSize(), 150);
  return true;
}

function renderMap(locations) {
  if (!initializeMap()) return;
  routeLayer.clearLayers();
  const points = (locations||[]).filter(item=>item.available&&Number.isFinite(item.latitude)&&Number.isFinite(item.longitude));
  if (!points.length) {
    routeMap.setView([20,0],2); $("map-note").textContent = "No responding hop had an available approximate location. The route list still shows traceroute results.";
    setTimeout(()=>routeMap.invalidateSize(),100); return;
  }
  const coordinates = points.map(item=>[item.latitude,item.longitude]);
  points.forEach((item,index)=>{
    const marker = L.circleMarker(coordinates[index],{radius:7,color:"#071522",weight:2,fillColor:"#59d7c8",fillOpacity:.95}).addTo(routeLayer);
    const popup = document.createElement("div"), title = document.createElement("strong");
    title.textContent = "Hop " + (item.hop||index+1) + ": " + item.ip; popup.appendChild(title);
    const location = document.createElement("div"); location.textContent = [item.city,item.region,item.country].filter(Boolean).join(", ")||"Location unavailable"; popup.appendChild(location);
    if(item.isp){const isp=document.createElement("small");isp.textContent=item.isp;popup.appendChild(isp);}
    marker.bindPopup(popup);
  });
  if(coordinates.length>1){L.polyline(coordinates,{color:"#59d7c8",weight:3,opacity:.8,dashArray:"7 8"}).addTo(routeLayer);routeMap.fitBounds(L.latLngBounds(coordinates),{padding:[28,28],maxZoom:6});}
  else routeMap.setView(coordinates[0],4);
  $("map-note").textContent = points.length + " approximate IP location(s) shown. Dotted lines are visual guides, not actual cable routes.";
  setTimeout(()=>routeMap.invalidateSize(),100);
}
function readHistory() {
  try { const parsed=JSON.parse(localStorage.getItem(HISTORY_KEY)||"[]");return Array.isArray(parsed)?parsed:[]; }
  catch { return []; }
}
function renderHistory() {
  const history=readHistory(), body=$("history-list");
  $("export-csv").disabled=history.length===0; $("export-json").disabled=history.length===0; $("clear-history").disabled=history.length===0;
  if(!history.length){body.innerHTML='<tr><td colspan="4" class="history-empty">No saved journeys yet.</td></tr>';return;}
  body.innerHTML=history.map(item=>'<tr title="'+escapeHTML(new Date(item.timestamp).toLocaleString())+'"><td>'+escapeHTML(item.target)+'</td><td>'+
    (item.avg_ms==null?"—":escapeHTML(item.avg_ms)+" ms")+'</td><td>'+(item.packet_loss_percent==null?"—":escapeHTML(item.packet_loss_percent)+"%")+
    '</td><td>'+(item.hop_count==null?"—":escapeHTML(item.hop_count))+'</td></tr>').join("");
}
function saveHistory(entry) {
  const history=[entry,...readHistory()].slice(0,20);
  try{localStorage.setItem(HISTORY_KEY,JSON.stringify(history));}catch{toast("Browser storage unavailable. This journey was not saved.");}
  renderHistory();
}
function downloadFile(filename,content,mime) {
  const blob=new Blob([content],{type:mime}),url=URL.createObjectURL(blob),anchor=document.createElement("a");
  anchor.href=url;anchor.download=filename;document.body.appendChild(anchor);anchor.click();anchor.remove();URL.revokeObjectURL(url);
}
function exportHistory(format) {
  const history=readHistory();if(!history.length)return;
  if(format==="json"){downloadFile("internet-journey-history.json",JSON.stringify(history,null,2),"application/json");return;}
  const columns=["timestamp","target","destination_ip","avg_ms","packet_loss_percent","hop_count","reached_destination"];
  const quote=value=>'"'+String(value??"").replace(/"/g,'""')+'"';
  downloadFile("internet-journey-history.csv",[columns.join(","),...history.map(item=>columns.map(key=>quote(item[key])).join(","))].join("\r\n"),"text/csv;charset=utf-8");
}
async function startJourney() {
  if(state.busy)return;
  const target=$("target-input").value.trim();if(!target)return toast("Enter a domain name or public IP address first.");
  stopJourneyReplay();state.dns=state.ping=state.trace=null;renderStats();renderPacketJourney(null);renderLatencyChart(null);
  $("route-list").innerHTML='<div class="empty-state"><div class="empty-symbol">◌</div><b>Resolving destination…</b><span>Contacting DNS and preparing diagnostics.</span></div>';
  $("raw-output").textContent="Running real network diagnostics…";$("route-summary").textContent="Resolving DNS, measuring latency and discovering route hops.";
  $("map-note").textContent="Waiting for traceroute and geolocation results.";setBusy(true);const outputs=[];
  try{
    state.dns=await postTarget("/api/dns",target);outputs.push("DNS LOOKUP\n"+JSON.stringify(state.dns,null,2));renderStats();
    $("route-summary").textContent="Resolved "+state.dns.hostname+". Running ping and traceroute…";
    const results=await Promise.allSettled([postTarget("/api/ping",target),postTarget("/api/traceroute",target)]);
    if(results[0].status==="fulfilled"){state.ping=results[0].value;outputs.push("PING RESULTS\n"+JSON.stringify(state.ping,null,2));}
    else outputs.push("PING ERROR\n"+results[0].reason.message);
    if(results[1].status==="fulfilled"){
      state.trace=results[1].value;outputs.push("TRACEROUTE RESULTS\n"+state.trace.raw_output);renderHops(state.trace);renderPacketJourney(state.trace);renderLatencyChart(state.trace);
      const hopIps=[...new Set(state.trace.hops.filter(hop=>hop.ip).map(hop=>hop.ip))];
      if(hopIps.length){
        try{
          const geo=await postJSON("/api/geolocate",{ips:hopIps});
          geo.locations.forEach(location=>{const hop=state.trace.hops.find(item=>item.ip===location.ip);location.hop=hop?hop.hop:null;});
          renderMap(geo.locations);outputs.push("APPROXIMATE HOP LOCATIONS\n"+JSON.stringify(geo,null,2));
        }catch(error){renderMap([]);outputs.push("GEOLOCATION NOTE\n"+error.message);}
      }else renderMap([]);
      $("route-summary").textContent=state.trace.hop_count+" hop entries returned for "+state.trace.target+". "+
        (state.trace.reached_destination?"Destination responded.":"Destination response was not confirmed.");
    }else{
      outputs.push("TRACEROUTE ERROR\n"+results[1].reason.message);
      $("route-list").innerHTML='<div class="empty-state"><b>Traceroute unavailable</b><span>'+escapeHTML(results[1].reason.message)+'</span></div>';
      $("route-summary").textContent="The traceroute test could not be completed.";renderMap([]);
    }
    renderStats();$("raw-output").textContent=outputs.join("\n\n────────────────────────────────────────\n\n");
    if(state.trace)saveHistory({timestamp:new Date().toISOString(),target:target,destination_ip:state.trace.destination_ip,
      avg_ms:state.ping?.avg_ms??null,packet_loss_percent:state.ping?.packet_loss_percent??null,
      hop_count:state.trace.hop_count,reached_destination:state.trace.reached_destination});
    toast(results.every(item=>item.status==="fulfilled")?"Journey diagnostics completed.":"Journey completed with diagnostic limitations.");
  }catch(error){
    $("route-list").innerHTML='<div class="empty-state"><b>Could not start journey</b><span>'+escapeHTML(error.message)+'</span></div>';
    $("route-summary").textContent="The destination could not be resolved.";$("raw-output").textContent=error.message;toast(error.message);
  }finally{setBusy(false);}
}
async function checkBackend(){
  try{const response=await fetch("/api/health");if(!response.ok)throw new Error("offline");const data=await response.json();
    $("engine-status").textContent=(data.status==="ok"?"Connected":"Unknown")+" · Flask API";
  }catch{$("engine-status").textContent="Backend unavailable";}
}
$("replay-button").addEventListener("click",replayPacketJourney);
$("start-button").addEventListener("click",startJourney);
$("target-input").addEventListener("keydown",event=>{if(event.key==="Enter")startJourney();});
$("export-csv").addEventListener("click",()=>exportHistory("csv"));
$("export-json").addEventListener("click",()=>exportHistory("json"));
$("clear-history").addEventListener("click",()=>{if(window.confirm("Clear all journey history saved in this browser?")){localStorage.removeItem(HISTORY_KEY);renderHistory();toast("Browser-local journey history cleared.");}});
renderHistory();initializeMap();checkBackend();
