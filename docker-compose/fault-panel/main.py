#!/usr/bin/env python3
"""
Travel Agent Control Panel — lightweight UI for toggling fault injection scenarios.
The canary polls GET /config every cycle to pick up changes in real time.
"""

import json
import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from typing import Optional


app = FastAPI(title="Travel Agent Control Panel", version="1.0.0")

STATE_FILE = Path(os.getenv("STATE_FILE", "/data/state.json"))

DEFAULT_STATE = {
    "enabled": True,
    "fault_weights": {
        "none": 0.50,
        "weather_error": 0.10,
        "weather_rate_limited": 0.08,
        "weather_high_latency": 0.07,
        "events_error": 0.08,
        "events_rate_limited": 0.07,
        "partial_failure": 0.10,
    },
    "trace_shape_weights": {
        "normal": 0.60,
        "shallow": 0.25,
        "deep": 0.15,
    },
    "canary_interval": 30,
    "preset": "default",
}


def load_state() -> dict:
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text())
        except (json.JSONDecodeError, OSError):
            pass
    return DEFAULT_STATE.copy()


def save_state():
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, indent=2))


state = load_state()

PRESETS = {
    "default": {
        "fault_weights": {
            "none": 0.50,
            "weather_error": 0.10,
            "weather_rate_limited": 0.08,
            "weather_high_latency": 0.07,
            "events_error": 0.08,
            "events_rate_limited": 0.07,
            "partial_failure": 0.10,
        },
        "trace_shape_weights": {"normal": 0.60, "shallow": 0.25, "deep": 0.15},
        "canary_interval": 30,
    },
    "all_clean": {
        "fault_weights": {"none": 1.0},
        "trace_shape_weights": {"normal": 0.60, "shallow": 0.25, "deep": 0.15},
        "canary_interval": 30,
    },
    "chaos": {
        "fault_weights": {
            "none": 0.0,
            "weather_error": 0.20,
            "weather_rate_limited": 0.15,
            "weather_high_latency": 0.15,
            "events_error": 0.20,
            "events_rate_limited": 0.15,
            "partial_failure": 0.15,
        },
        "trace_shape_weights": {"normal": 0.50, "shallow": 0.20, "deep": 0.30},
        "canary_interval": 10,
    },
    "latency_spike": {
        "fault_weights": {
            "none": 0.30,
            "weather_high_latency": 0.70,
        },
        "trace_shape_weights": {"normal": 0.80, "shallow": 0.10, "deep": 0.10},
        "canary_interval": 15,
    },
    "cascading_failure": {
        "fault_weights": {
            "none": 0.0,
            "weather_error": 0.30,
            "events_error": 0.30,
            "partial_failure": 0.40,
        },
        "trace_shape_weights": {"normal": 0.70, "shallow": 0.0, "deep": 0.30},
        "canary_interval": 10,
    },
    "deep_traces_only": {
        "fault_weights": {"none": 1.0},
        "trace_shape_weights": {"normal": 0.0, "shallow": 0.0, "deep": 1.0},
        "canary_interval": 60,
    },
}


class ConfigUpdate(BaseModel):
    preset: Optional[str] = None
    enabled: Optional[bool] = None
    fault_weights: Optional[dict] = None
    trace_shape_weights: Optional[dict] = None
    canary_interval: Optional[int] = None


@app.get("/health")
async def health():
    return {"status": "healthy"}


@app.get("/config")
async def get_config():
    """Canary polls this endpoint every cycle."""
    return state


@app.post("/config")
async def update_config(update: ConfigUpdate):
    """UI posts changes here."""
    if update.preset and update.preset in PRESETS:
        preset = PRESETS[update.preset]
        state["fault_weights"] = preset["fault_weights"]
        state["trace_shape_weights"] = preset["trace_shape_weights"]
        state["canary_interval"] = preset["canary_interval"]
        state["preset"] = update.preset
    if update.enabled is not None:
        state["enabled"] = update.enabled
    if update.fault_weights is not None:
        state["fault_weights"] = update.fault_weights
        state["preset"] = "custom"
    if update.trace_shape_weights is not None:
        state["trace_shape_weights"] = update.trace_shape_weights
        state["preset"] = "custom"
    if update.canary_interval is not None:
        state["canary_interval"] = update.canary_interval
    save_state()
    return state


@app.get("/presets")
async def get_presets():
    return PRESETS


@app.get("/", response_class=HTMLResponse)
async def ui():
    return HTML_PAGE


HTML_PAGE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Travel Agent Control Panel</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #1a1a2e; color: #e0e0e0; padding: 32px 40px; min-height: 100vh; }
  header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 28px; }
  header .left h1 { font-size: 1.6rem; color: #fff; margin-bottom: 4px; }
  header .left .subtitle { color: #888; font-size: 0.85rem; }
  header .right { display: flex; align-items: center; gap: 20px; }
  .switch { position: relative; width: 48px; height: 26px; flex-shrink: 0; }
  .switch input { opacity: 0; width: 0; height: 0; }
  .slider { position: absolute; cursor: pointer; inset: 0; background: #333; border-radius: 26px; transition: 0.3s; }
  .slider:before { content: ""; position: absolute; height: 20px; width: 20px; left: 3px; bottom: 3px; background: #fff; border-radius: 50%; transition: 0.3s; }
  .switch input:checked + .slider { background: #4cc9f0; }
  .switch input:checked + .slider:before { transform: translateX(22px); }
  .interval-group { display: flex; align-items: center; gap: 8px; }
  .interval-group label { font-size: 0.85rem; color: #aaa; }
  .interval-group input { width: 60px; background: #1a1a2e; border: 1px solid #0f3460; color: #e0e0e0; border-radius: 6px; padding: 5px 8px; text-align: center; font-size: 0.85rem; }

  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }

  .card { background: #16213e; border-radius: 12px; padding: 24px; border: 1px solid #0f3460; }
  .card h2 { font-size: 0.95rem; margin-bottom: 16px; color: #4cc9f0; }

  .presets { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .preset-btn { padding: 12px 16px; border-radius: 10px; border: 1px solid #0f3460; background: #1a1a2e; color: #e0e0e0; cursor: pointer; font-size: 0.85rem; transition: all 0.2s; text-align: left; }
  .preset-btn:hover { border-color: #4cc9f0; color: #4cc9f0; }
  .preset-btn.active { background: #4cc9f0; color: #1a1a2e; border-color: #4cc9f0; font-weight: 600; }
  .preset-btn.custom { border-color: #f72585; }
  .preset-btn.custom.active { background: #f72585; border-color: #f72585; color: #fff; }
  .preset-btn .btn-label { display: block; font-weight: 600; margin-bottom: 3px; }
  .preset-btn .btn-desc { display: block; font-size: 0.75rem; opacity: 0.7; font-weight: 400; }
  .preset-btn .btn-look { display: block; font-size: 0.7rem; opacity: 0.5; margin-top: 4px; font-style: italic; }
  .preset-btn.active .btn-desc { opacity: 0.9; }
  .preset-btn.active .btn-look { opacity: 0.8; }

  .bars-section { margin-bottom: 20px; }
  .bars-section:last-child { margin-bottom: 0; }
  .bars-section h3 { font-size: 0.8rem; color: #666; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
  .bar-row { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
  .bar-row label { font-size: 0.82rem; min-width: 130px; color: #aaa; }
  .bar-track { flex: 1; height: 8px; background: #0f3460; border-radius: 4px; overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 4px; transition: width 0.3s ease; }
  .bar-fill.fault { background: linear-gradient(90deg, #4cc9f0, #4895ef); }
  .bar-fill.shape { background: linear-gradient(90deg, #f72585, #b5179e); }
  .bar-row .val { font-size: 0.8rem; min-width: 40px; text-align: right; color: #666; }
  .bar-row.editable label { color: #e0e0e0; }
  .bar-row.editable .val { color: #4cc9f0; }
  input[type=range] { flex: 1; accent-color: #4cc9f0; height: 8px; }
  input[type=range].shape-slider { accent-color: #f72585; }
  .custom-note { font-size: 0.8rem; color: #f72585; margin-bottom: 14px; }

  .status { margin-top: 20px; padding: 12px 16px; border-radius: 8px; background: #0f3460; font-size: 0.82rem; font-family: 'SF Mono', 'Fira Code', monospace; }
  .status.ok { border-left: 4px solid #4cc9f0; }
  .status.off { border-left: 4px solid #e63946; }
</style>
</head>
<body>

<header>
  <div class="left">
    <h1>Travel Agent Control Panel</h1>
    <div class="subtitle">Toggle fault injection scenarios for the Travel Planner agents</div>
  </div>
  <div class="right">
    <div class="interval-group">
      <label>Interval:</label>
      <input type="number" id="interval" value="30" min="5" max="300" onchange="updateInterval()">
      <label>sec</label>
    </div>
    <label class="switch"><input type="checkbox" id="enabled" checked onchange="toggleEnabled()"><span class="slider"></span></label>
  </div>
</header>

<div class="grid">
  <div class="card">
    <h2>Scenario</h2>
    <div class="presets" id="presets"></div>
  </div>

  <div class="card" id="details-card">
    <h2>Configuration</h2>
    <div id="custom-note"></div>
    <div class="bars-section">
      <h3>Fault Injection</h3>
      <div id="faults"></div>
    </div>
    <div class="bars-section">
      <h3>Trace Shape</h3>
      <div id="shapes"></div>
    </div>
  </div>
</div>

<div class="status ok" id="status">Loading...</div>

<script>
const FAULT_LABELS = {
  none: 'No fault',
  weather_error: 'Weather error',
  weather_rate_limited: 'Weather rate limit',
  weather_high_latency: 'Weather latency',
  events_error: 'Events error',
  events_rate_limited: 'Events rate limit',
  partial_failure: 'Partial failure',
};
const SHAPE_LABELS = { normal: 'Normal', shallow: 'Shallow', deep: 'Deep' };
const PRESET_META = {
  all_clean:          { label: 'All Clean',          desc: 'Only healthy traces for baseline', look: 'All traces green, no errors in service map' },
  default:            { label: 'Default',            desc: '50/50 mix of healthy and faults', look: 'Mix of green and red traces, partial failures visible' },
  latency_spike:      { label: 'Latency Spike',     desc: '70% slow weather (5s delay)', look: 'P95 latency spike on weather-agent, long spans in waterfall' },
  chaos:              { label: 'Chaos',              desc: 'Every request gets a random fault', look: 'High error rate across all services, red edges in service map' },
  cascading_failure:  { label: 'Cascading Failure',  desc: 'Both sub-agents fail', look: 'Orchestrator shows partial=true, multiple error spans per trace' },
  deep_traces_only:   { label: 'Deep Traces',       desc: '100+ span trace waterfalls', look: 'Very deep trace trees, 4+ sequential orchestrator calls' },
  custom:             { label: 'Custom',             desc: 'Manually adjust weights below', look: 'Depends on your configuration' },
};

let config = {};
let isCustom = false;

async function load() {
  const resp = await fetch('/config');
  config = await resp.json();
  isCustom = config.preset === 'custom';
  render();
}

function render() {
  document.getElementById('enabled').checked = config.enabled;
  document.getElementById('interval').value = config.canary_interval;
  isCustom = config.preset === 'custom';

  const presetsEl = document.getElementById('presets');
  presetsEl.innerHTML = Object.keys(PRESET_META).map(k => {
    const cls = k === 'custom' ? 'preset-btn custom' : 'preset-btn';
    const active = config.preset === k ? ' active' : '';
    return `<button class="${cls}${active}" onclick="applyPreset('${k}')"><span class="btn-label">${PRESET_META[k].label}</span><span class="btn-desc">${PRESET_META[k].desc}</span><span class="btn-look">${PRESET_META[k].look}</span></button>`;
  }).join('');

  document.getElementById('custom-note').innerHTML = isCustom
    ? '<p class="custom-note">Sliders are editable — drag to adjust weights</p>' : '';

  const faultsEl = document.getElementById('faults');
  faultsEl.innerHTML = Object.keys(FAULT_LABELS).map(k => {
    const v = config.fault_weights[k] || 0;
    const pct = Math.round(v * 100);
    if (isCustom) {
      return `<div class="bar-row editable">
        <label>${FAULT_LABELS[k]}</label>
        <input type="range" min="0" max="100" value="${pct}" oninput="setFault('${k}', this.value)">
        <span class="val" id="fv_${k}">${pct}%</span>
      </div>`;
    }
    return `<div class="bar-row">
      <label>${FAULT_LABELS[k]}</label>
      <div class="bar-track"><div class="bar-fill fault" style="width:${pct}%"></div></div>
      <span class="val">${pct}%</span>
    </div>`;
  }).join('');

  const shapesEl = document.getElementById('shapes');
  shapesEl.innerHTML = Object.keys(SHAPE_LABELS).map(k => {
    const v = config.trace_shape_weights[k] || 0;
    const pct = Math.round(v * 100);
    if (isCustom) {
      return `<div class="bar-row editable">
        <label>${SHAPE_LABELS[k]}</label>
        <input type="range" class="shape-slider" min="0" max="100" value="${pct}" oninput="setShape('${k}', this.value)">
        <span class="val" id="sv_${k}" style="color:#f72585">${pct}%</span>
      </div>`;
    }
    return `<div class="bar-row">
      <label>${SHAPE_LABELS[k]}</label>
      <div class="bar-track"><div class="bar-fill shape" style="width:${pct}%"></div></div>
      <span class="val">${pct}%</span>
    </div>`;
  }).join('');

  updateStatus();
}

function updateStatus() {
  const el = document.getElementById('status');
  if (!config.enabled) {
    el.className = 'status off';
    el.textContent = 'PAUSED — canary is not sending traffic';
  } else {
    el.className = 'status ok';
    const faults = Object.entries(config.fault_weights).filter(([k,v]) => k !== 'none' && v > 0);
    const faultStr = faults.length ? faults.map(([k,v]) => `${k}:${Math.round(v*100)}%`).join('  ') : 'none';
    el.textContent = `ACTIVE [${config.preset}]  interval=${config.canary_interval}s  faults: ${faultStr}`;
  }
}

async function post(data) {
  const resp = await fetch('/config', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) });
  config = await resp.json();
  isCustom = config.preset === 'custom';
  render();
}

function toggleEnabled() { post({ enabled: document.getElementById('enabled').checked }); }
function updateInterval() { post({ canary_interval: parseInt(document.getElementById('interval').value) || 30 }); }
function applyPreset(name) {
  if (name === 'custom') {
    isCustom = true;
    config.preset = 'custom';
    render();
    return;
  }
  post({ preset: name });
}

function setFault(key, val) {
  document.getElementById('fv_' + key).textContent = val + '%';
  config.fault_weights[key] = parseInt(val) / 100;
  debouncePost();
}

function setShape(key, val) {
  document.getElementById('sv_' + key).textContent = val + '%';
  config.trace_shape_weights[key] = parseInt(val) / 100;
  debouncePost();
}

let timer = null;
function debouncePost() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    post({ fault_weights: config.fault_weights, trace_shape_weights: config.trace_shape_weights });
  }, 300);
}

load();
</script>
</body>
</html>
"""


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
