const form = document.querySelector("#planner-form");
const canvas = document.querySelector("#coverage-canvas");
const ctx = canvas.getContext("2d");

const metricsContainer = document.querySelector("#metrics");
const notesContainer = document.querySelector("#notes");
const alertsContainer = document.querySelector("#alerts");
const summaryContainer = document.querySelector("#summary");
const timelineContainer = document.querySelector("#timeline");
const lastUpdatedEl = document.querySelector("#last-updated");
const toastEl = document.querySelector("#toast");

const sliders = ["area", "terrain", "canopy", "wind", "resolution", "nofly", "drones", "riskTolerance"];
const fields = [...sliders, "objective", "batteryProfile", "comms", "hourlyCost"];

const objectiveEffects = {
  orthomosaic: { label: "High-Integrity Orthomosaic", confidence: 7, speed: -0.09, detail: 0.88 },
  change: { label: "Change Detection at Scale", confidence: 5, speed: 0.14, detail: 0.76 },
  thermal: { label: "Thermal Risk Mapping", confidence: 3, speed: 0.07, detail: 0.69 },
  volume: { label: "Volumetric Progress Modeling", confidence: 6, speed: -0.03, detail: 0.81 }
};

const batteryProfiles = {
  light: { label: "High-Efficiency Pack", endurance: 48, recharge: 31 },
  standard: { label: "Standard Pack", endurance: 42, recharge: 36 },
  heavy: { label: "Heavy Payload Pack", endurance: 33, recharge: 45 }
};

const commsProfiles = {
  mesh: { label: "Mesh + RTK Relay", reliability: 0.93, throughput: 1.02 },
  lte: { label: "LTE + Edge Sync", reliability: 0.86, throughput: 1.06 },
  satcom: { label: "Satcom Fallback Mesh", reliability: 0.8, throughput: 0.92 }
};

const presets = {
  forestry: {
    area: 18.6,
    terrain: 8,
    canopy: 72,
    wind: 6,
    resolution: 2.4,
    nofly: 8,
    drones: 8,
    riskTolerance: 4,
    objective: "change",
    batteryProfile: "standard",
    comms: "mesh",
    hourlyCost: 168
  },
  construction: {
    area: 3.9,
    terrain: 4,
    canopy: 10,
    wind: 5,
    resolution: 1.7,
    nofly: 6,
    drones: 5,
    riskTolerance: 6,
    objective: "volume",
    batteryProfile: "heavy",
    comms: "lte",
    hourlyCost: 142
  },
  disaster: {
    area: 11.2,
    terrain: 7,
    canopy: 34,
    wind: 8,
    resolution: 2.1,
    nofly: 24,
    drones: 10,
    riskTolerance: 5,
    objective: "thermal",
    batteryProfile: "light",
    comms: "satcom",
    hourlyCost: 215
  },
  utility: {
    area: 24.4,
    terrain: 5,
    canopy: 26,
    wind: 4,
    resolution: 3.2,
    nofly: 18,
    drones: 12,
    riskTolerance: 7,
    objective: "orthomosaic",
    batteryProfile: "light",
    comms: "lte",
    hourlyCost: 156
  }
};

const state = {
  inputs: null,
  plan: null,
  alerts: [],
  tactics: []
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function seededRandom(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function roundTo(value, decimals = 1) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function valueFrom(id) {
  const el = document.getElementById(id);
  if (!el) {
    return 0;
  }
  if (el.type === "range" || el.type === "number") {
    return Number(el.value);
  }
  return el.value;
}

function setFieldValue(id, value) {
  const el = document.getElementById(id);
  if (!el || value === null || value === undefined || value === "") {
    return;
  }

  if (el.type === "range" || el.type === "number") {
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) {
      el.value = String(numeric);
    }
    return;
  }

  el.value = String(value);
}

function outputValue(id, value) {
  if (id === "canopy" || id === "nofly") {
    return `${Math.round(value)}%`;
  }
  if (id === "drones") {
    return `${Math.round(value)} drones`;
  }
  if (id === "resolution" || id === "area") {
    return roundTo(value, 1).toFixed(1);
  }
  return String(Math.round(value));
}

function updateSliderOutputs() {
  sliders.forEach((id) => {
    const output = document.querySelector(`#${id}-output`);
    if (!output) {
      return;
    }
    output.textContent = outputValue(id, valueFrom(id));
  });
}

function getInputs() {
  return {
    area: valueFrom("area"),
    terrain: valueFrom("terrain"),
    canopy: valueFrom("canopy"),
    wind: valueFrom("wind"),
    resolution: valueFrom("resolution"),
    nofly: valueFrom("nofly"),
    drones: valueFrom("drones"),
    riskTolerance: valueFrom("riskTolerance"),
    objective: valueFrom("objective"),
    batteryProfile: valueFrom("batteryProfile"),
    comms: valueFrom("comms"),
    hourlyCost: clamp(valueFrom("hourlyCost"), 60, 500)
  };
}

function calculatePlan(inputs) {
  const objective = objectiveEffects[inputs.objective] || objectiveEffects.orthomosaic;
  const battery = batteryProfiles[inputs.batteryProfile] || batteryProfiles.standard;
  const comms = commsProfiles[inputs.comms] || commsProfiles.mesh;
  const conservativeFactor = (11 - inputs.riskTolerance) / 10;

  const altitude = clamp(
    46 + inputs.resolution * 20 + inputs.terrain * 2.7 + inputs.wind * 1.6 + inputs.canopy * 0.18 + conservativeFactor * 7,
    40,
    200
  );

  const frontOverlap = clamp(
    65 + inputs.terrain * 1.15 + inputs.wind * 1.0 + inputs.canopy * 0.15 + conservativeFactor * 7,
    62,
    92
  );
  const sideOverlap = clamp(frontOverlap - (5.5 + inputs.wind * 0.3 - conservativeFactor * 1.4), 58, 88);

  const restrictedArea = inputs.area * (inputs.nofly / 100);
  const mapArea = Math.max(0.25, inputs.area - restrictedArea);

  const baseRate = 0.56 + (altitude - 70) / 340;
  const overlapPenalty = (frontOverlap + sideOverlap - 128) / 230;
  const weatherPenalty = inputs.wind * 0.041;
  const terrainPenalty = inputs.terrain * 0.028;
  const toleranceBias = (inputs.riskTolerance - 5) * 0.022;

  const droneRate = clamp(
    baseRate - overlapPenalty - weatherPenalty - terrainPenalty + objective.speed + toleranceBias,
    0.14,
    0.98
  );

  const swarmRate = Math.max(0.08, droneRate * inputs.drones * (1 - inputs.nofly / 125) * comms.throughput);
  const missionHours = clamp(mapArea / swarmRate, 0.35, 22);
  const missionMinutes = Math.round(missionHours * 60);

  const confidence = clamp(
    87 + objective.confidence + comms.reliability * 6 + conservativeFactor * 6 - inputs.wind * 2.0 - inputs.terrain * 1.15 - inputs.nofly * 0.42,
    37,
    99
  );

  const edgeInferenceMinutes = Math.round(missionMinutes * (0.19 + objective.detail * 0.2 + inputs.terrain * 0.012));
  const revisitPercent = clamp(
    inputs.terrain * 2.2 + inputs.wind * 1.45 + inputs.canopy * 0.15 - inputs.drones * 0.8 - inputs.riskTolerance * 0.75 + (1 - comms.reliability) * 18,
    3,
    46
  );

  const sensorPenalty = inputs.resolution < 2 ? 6 : inputs.resolution < 3 ? 4 : 2;
  const weatherDrainPenalty = inputs.wind * 0.95 + inputs.terrain * 0.43 + inputs.canopy * 0.05;
  const endurancePerSortie = clamp(
    battery.endurance - sensorPenalty - weatherDrainPenalty + conservativeFactor * 1.8,
    12,
    58
  );

  const sortiesTotal = Math.max(1, Math.ceil(missionMinutes / endurancePerSortie));
  const swapsTotal = Math.max(0, sortiesTotal - inputs.drones);
  const rechargePads = Math.max(1, Math.ceil(inputs.drones / 2));
  const rechargeWindowHours = (swapsTotal * battery.recharge) / (rechargePads * 60);

  const crewCount = clamp(2 + Math.ceil(inputs.drones / 4) + (missionMinutes > 180 ? 1 : 0), 2, 12);
  const takeoffSetupMinutes = Math.round(10 + inputs.drones * 1.1 + (10 - inputs.riskTolerance) * 0.7);
  const uploadQaMinutes = Math.round(18 + mapArea * 2.2 + (1 - comms.reliability) * 42);

  const totalOpsMinutes = takeoffSetupMinutes + missionMinutes + edgeInferenceMinutes + uploadQaMinutes;
  const weatherBufferMinutes = Math.round(clamp(14 + inputs.wind * 3 + conservativeFactor * 7, 12, 62));

  const flightCost = missionHours * inputs.drones * inputs.hourlyCost;
  const crewCost = missionHours * crewCount * 58;
  const aiProcessingCost = edgeInferenceMinutes * 0.88 + mapArea * (14 + objective.detail * 9);
  const totalCost = flightCost + crewCost + aiProcessingCost;
  const costPerKm2 = totalCost / mapArea;

  return {
    objectiveLabel: objective.label,
    batteryLabel: battery.label,
    commsLabel: comms.label,
    altitude,
    frontOverlap,
    sideOverlap,
    mapArea,
    missionMinutes,
    confidence,
    edgeInferenceMinutes,
    revisitPercent,
    endurancePerSortie,
    sortiesTotal,
    swapsTotal,
    rechargeWindowHours,
    crewCount,
    takeoffSetupMinutes,
    uploadQaMinutes,
    totalOpsMinutes,
    weatherBufferMinutes,
    flightCost,
    crewCost,
    aiProcessingCost,
    totalCost,
    costPerKm2
  };
}

function buildAlerts(inputs, plan) {
  const alerts = [];

  if (plan.confidence < 72) {
    alerts.push({
      severity: "High",
      text: "Predicted map confidence is below 72%. Increase overlap, lower altitude, or reduce wind exposure windows."
    });
  }

  if (plan.revisitPercent > 25) {
    alerts.push({
      severity: "Medium",
      text: "Revisit demand is high. Enable confidence-triggered micro-reflights on hotspot cells to avoid full rescan."
    });
  }

  if (inputs.wind >= 8) {
    alerts.push({
      severity: "High",
      text: "Wind volatility is elevated. Plan wider safety buffers and reduce simultaneous launch count."
    });
  }

  if (plan.endurancePerSortie < 19) {
    alerts.push({
      severity: "High",
      text: "Per-sortie endurance is low for this mission profile. Add hot-swappable packs or lower payload weight."
    });
  }

  if (inputs.nofly > 30) {
    alerts.push({
      severity: "Medium",
      text: "No-fly constraints exceed 30%. Validate corridor geofencing and pre-authorize alternate lanes."
    });
  }

  if (plan.totalCost > plan.mapArea * 900) {
    alerts.push({
      severity: "Medium",
      text: "Cost intensity is above target. Use a lighter objective profile or reduce drone-hour rates for non-critical passes."
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      severity: "Info",
      text: "No critical blockers detected for the current configuration."
    });
  }

  return alerts;
}

function buildTactics(inputs, plan) {
  return [
    `Set geofenced loiter points every ${Math.max(0.5, roundTo(plan.mapArea / Math.max(2, inputs.drones), 1))} km² for mid-mission replanning and safe hover fallback.`,
    `Use ${plan.commsLabel} with confidence-driven relay handoff to keep packet loss below ${Math.max(2, Math.round((1 - plan.confidence / 100) * 11))}%.`,
    `Trigger real-time segmentation on edge devices and prioritize upload of anomaly clusters first to shorten decision loops by ${Math.round(18 + inputs.riskTolerance * 2)}%.`,
    `Plan ${plan.swapsTotal} battery swaps and keep ${Math.max(2, Math.ceil(inputs.drones * 0.35))} spare packs staged near corridor pinch points.`,
    `Run post-flight QA with a weather buffer of ${plan.weatherBufferMinutes} minutes and hold handoff to GIS only after hotspot confidence clears 85%.`
  ];
}

function computeGrid(inputs, plan) {
  const cols = 30;
  const rows = 14;
  const cells = [];

  const seedBase =
    inputs.area * 13.8 +
    inputs.terrain * 8.4 +
    inputs.canopy * 3.5 +
    inputs.wind * 11.6 +
    inputs.resolution * 10.7 +
    inputs.drones * 4.6 +
    inputs.riskTolerance * 5.2;

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const wave = Math.sin((x + 1) * 0.32 + inputs.terrain) * 0.29 + Math.cos((y + 2) * 0.41 + inputs.wind) * 0.27;
      const noise = seededRandom(seedBase + x * 2.4 + y * 6.7) * 0.46;
      const canopyInfluence = (inputs.canopy / 100) * (0.28 + seededRandom(seedBase + x * y + 17.4) * 0.8);
      const volatility = (inputs.wind / 10) * seededRandom(seedBase + x * 17.2 + y * 11.3);

      const risk = clamp(0.24 + wave + noise + canopyInfluence + volatility, 0.03, 1.08);
      const restrictedRoll = seededRandom(seedBase + x * 1.9 + y * 7.5 + 91.7);
      const restricted = restrictedRoll < inputs.nofly / 120;
      const passDemand = restricted ? 0 : clamp(risk * (1.12 + plan.revisitPercent / 100), 0.08, 1.35);

      cells.push({ x, y, risk, passDemand, restricted });
    }
  }

  return { cols, rows, cells };
}

function drawCoverage(inputs, grid) {
  const { cols, rows, cells } = grid;
  const pad = 18;
  const width = canvas.width - pad * 2;
  const height = canvas.height - pad * 2;
  const cellWidth = width / cols;
  const cellHeight = height / rows;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, "#081426");
  gradient.addColorStop(1, "#111d32");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  cells.forEach((cell) => {
    const x = pad + cell.x * cellWidth;
    const y = pad + cell.y * cellHeight;

    if (cell.restricted) {
      ctx.fillStyle = "rgba(122, 137, 161, 0.45)";
      ctx.fillRect(x + 1, y + 1, cellWidth - 2, cellHeight - 2);
      ctx.strokeStyle = "rgba(165, 180, 252, 0.24)";
      ctx.beginPath();
      ctx.moveTo(x + 3, y + cellHeight - 3);
      ctx.lineTo(x + cellWidth - 3, y + 3);
      ctx.stroke();
      return;
    }

    const danger = clamp(cell.passDemand / 1.35, 0, 1);
    const red = Math.round(25 + danger * 208);
    const green = Math.round(68 + (1 - danger) * 165);
    const blue = Math.round(140 + (1 - danger) * 60);
    ctx.fillStyle = `rgba(${red}, ${green}, ${blue}, 0.84)`;
    ctx.fillRect(x + 1, y + 1, cellWidth - 2, cellHeight - 2);
  });

  for (let i = 0; i <= cols; i += 1) {
    const x = pad + i * cellWidth;
    ctx.strokeStyle = "rgba(203, 213, 225, 0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, pad);
    ctx.lineTo(x, pad + height);
    ctx.stroke();
  }

  for (let i = 0; i <= rows; i += 1) {
    const y = pad + i * cellHeight;
    ctx.strokeStyle = "rgba(203, 213, 225, 0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(pad + width, y);
    ctx.stroke();
  }

  const droneCount = Math.max(1, Math.round(inputs.drones));
  for (let drone = 0; drone < droneCount; drone += 1) {
    const hue = 170 + (drone * 220) / droneCount;
    ctx.strokeStyle = `hsla(${hue}, 90%, 69%, 0.85)`;
    ctx.lineWidth = 2;
    ctx.beginPath();

    const lane = drone % rows;
    const phase = drone % 2;

    for (let step = 0; step < cols; step += 1) {
      const x = pad + step * cellWidth + cellWidth / 2;
      const offset = phase ? cols - 1 - step : step;
      const y = pad + ((lane + offset * 0.13) % rows) * cellHeight + cellHeight / 2;

      if (step === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();
  }

  ctx.fillStyle = "rgba(226, 232, 240, 0.95)";
  ctx.font = "500 14px IBM Plex Mono";
  ctx.fillText("Blue: low revisit demand  |  Red: dense revisit demand  |  Gray: restricted", 22, canvas.height - 12);
}

function toneClasses(tone) {
  if (tone === "good") {
    return "text-cyanAccent";
  }
  if (tone === "hot") {
    return "text-roseAlert";
  }
  return "text-slate-100";
}

function renderSummary(inputs, plan) {
  summaryContainer.innerHTML = `
    <div class="grid grid-cols-1 gap-2 md:grid-cols-3">
      <div class="rounded-xl border border-slate-600/40 bg-slate-900/70 px-3 py-2">
        <p class="font-mono text-[11px] uppercase tracking-wider text-slate-400">Objective</p>
        <p class="mt-1 text-sm font-medium text-slate-100">${plan.objectiveLabel}</p>
      </div>
      <div class="rounded-xl border border-slate-600/40 bg-slate-900/70 px-3 py-2">
        <p class="font-mono text-[11px] uppercase tracking-wider text-slate-400">Battery + Comms</p>
        <p class="mt-1 text-sm font-medium text-slate-100">${plan.batteryLabel} / ${plan.commsLabel}</p>
      </div>
      <div class="rounded-xl border border-slate-600/40 bg-slate-900/70 px-3 py-2">
        <p class="font-mono text-[11px] uppercase tracking-wider text-slate-400">Area + Swarm</p>
        <p class="mt-1 text-sm font-medium text-slate-100">${roundTo(plan.mapArea, 2).toFixed(2)} km² with ${inputs.drones} drones</p>
      </div>
    </div>
  `;
}

function renderMetrics(plan) {
  const metrics = [
    { label: "Flight Altitude", value: `${Math.round(plan.altitude)} m`, tone: "good" },
    { label: "Image Overlap", value: `${Math.round(plan.frontOverlap)} / ${Math.round(plan.sideOverlap)} %` },
    { label: "Mission Duration", value: `${plan.missionMinutes} min` },
    { label: "Map Confidence", value: `${Math.round(plan.confidence)}%`, tone: plan.confidence >= 78 ? "good" : "hot" },
    { label: "Predicted Revisits", value: `${roundTo(plan.revisitPercent, 1).toFixed(1)}%`, tone: plan.revisitPercent < 18 ? "good" : "hot" },
    { label: "Edge AI Processing", value: `${plan.edgeInferenceMinutes} min` },
    { label: "Endurance / Sortie", value: `${Math.round(plan.endurancePerSortie)} min`, tone: plan.endurancePerSortie >= 24 ? "good" : "hot" },
    { label: "Battery Swaps", value: `${plan.swapsTotal} swaps` },
    { label: "Recharge Window", value: `${roundTo(plan.rechargeWindowHours, 2).toFixed(2)} h` },
    { label: "Crew Recommendation", value: `${plan.crewCount} operators` },
    { label: "Total Cost", value: `$${Math.round(plan.totalCost).toLocaleString()}`, tone: plan.costPerKm2 < 650 ? "good" : "hot" },
    { label: "Cost / km²", value: `$${Math.round(plan.costPerKm2).toLocaleString()}` }
  ];

  metricsContainer.innerHTML = metrics
    .map(
      (metric) => `
      <article class="rounded-xl border border-slate-600/40 bg-slate-900/72 px-3 py-2">
        <p class="font-mono text-[11px] uppercase tracking-wider text-slate-400">${metric.label}</p>
        <p class="mt-1 text-base font-semibold ${toneClasses(metric.tone)}">${metric.value}</p>
      </article>
    `
    )
    .join("");
}

function renderAlerts(alerts) {
  alertsContainer.innerHTML = alerts
    .map((alert) => {
      const styleMap = {
        High: "border-rose-300/50 bg-rose-900/30 text-rose-100",
        Medium: "border-amber-200/40 bg-amber-800/30 text-amber-100",
        Info: "border-cyan-200/40 bg-cyan-900/25 text-cyan-100"
      };
      const className = styleMap[alert.severity] || styleMap.Info;

      return `
        <div class="rounded-xl border px-3 py-2 ${className}">
          <p class="font-mono text-[11px] uppercase tracking-wide">${alert.severity}</p>
          <p class="mt-1 text-sm leading-snug">${alert.text}</p>
        </div>
      `;
    })
    .join("");
}

function renderTimeline(plan) {
  const phases = [
    { name: "Launch + Calibration", minutes: plan.takeoffSetupMinutes, color: "bg-sky-300/80" },
    { name: "Aerial Capture", minutes: plan.missionMinutes, color: "bg-cyan-300/80" },
    { name: "Edge Processing", minutes: plan.edgeInferenceMinutes, color: "bg-indigo-300/80" },
    { name: "Upload + QA", minutes: plan.uploadQaMinutes, color: "bg-amber-300/80" }
  ];

  const total = phases.reduce((sum, phase) => sum + phase.minutes, 0);

  timelineContainer.innerHTML = phases
    .map((phase) => {
      const pct = Math.max(4, Math.round((phase.minutes / total) * 100));
      return `
        <div class="rounded-xl border border-slate-600/40 bg-slate-900/72 p-2">
          <div class="mb-1 flex items-center justify-between text-xs">
            <span class="text-slate-200">${phase.name}</span>
            <span class="font-mono text-slate-400">${phase.minutes} min</span>
          </div>
          <div class="h-2 rounded-full bg-slate-700/70">
            <div class="h-2 rounded-full ${phase.color}" style="width: ${pct}%"></div>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderTactics(tactics) {
  notesContainer.innerHTML = tactics
    .map(
      (note) => `
      <p class="rounded-xl border border-slate-600/40 bg-slate-900/72 px-3 py-2 text-sm text-slate-200">
        ${note}
      </p>
    `
    )
    .join("");
}

function serializeInputs(inputs) {
  const params = new URLSearchParams();
  fields.forEach((field) => {
    params.set(field, String(inputs[field]));
  });
  return params;
}

function parseInputsFromQuery() {
  const params = new URLSearchParams(window.location.search);
  fields.forEach((field) => {
    if (!params.has(field)) {
      return;
    }
    setFieldValue(field, params.get(field));
  });
}

async function copyText(text, successMessage) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "readonly");
      textarea.style.position = "absolute";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    showToast(successMessage || "Copied.");
  } catch (error) {
    showToast("Clipboard write failed.", true);
  }
}

function triggerDownload(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function buildBrief(inputs, plan, alerts, tactics) {
  const lines = [
    "# Drone Mapping Mission Brief",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Objective: ${plan.objectiveLabel}`,
    `Mapped Area: ${roundTo(plan.mapArea, 2).toFixed(2)} km²`,
    `Swarm Size: ${inputs.drones} drones`,
    `Mission Time: ${plan.missionMinutes} min`,
    `Confidence: ${Math.round(plan.confidence)}%`,
    `Battery Swaps: ${plan.swapsTotal}`,
    `Total Cost Estimate: $${Math.round(plan.totalCost).toLocaleString()}`,
    "",
    "## Active Alerts"
  ];

  alerts.forEach((alert) => {
    lines.push(`- [${alert.severity}] ${alert.text}`);
  });

  lines.push("", "## Autonomy Tactics");
  tactics.forEach((tactic) => {
    lines.push(`- ${tactic}`);
  });

  return lines.join("\n");
}

function showToast(message, isError = false) {
  toastEl.textContent = message;
  toastEl.classList.remove("opacity-0", "translate-y-4", "border-cyan-200/40", "border-rose-200/40");
  toastEl.classList.add("opacity-100", "translate-y-0");
  toastEl.classList.add(isError ? "border-rose-200/40" : "border-cyan-200/40");

  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toastEl.classList.add("opacity-0", "translate-y-4");
  }, 1800);
}

function runPlanner() {
  const inputs = getInputs();
  const plan = calculatePlan(inputs);
  const alerts = buildAlerts(inputs, plan);
  const tactics = buildTactics(inputs, plan);
  const grid = computeGrid(inputs, plan);

  state.inputs = inputs;
  state.plan = plan;
  state.alerts = alerts;
  state.tactics = tactics;

  renderSummary(inputs, plan);
  renderMetrics(plan);
  renderAlerts(alerts);
  renderTimeline(plan);
  drawCoverage(inputs, grid);
  renderTactics(tactics);

  lastUpdatedEl.textContent = `Updated ${new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  })}`;
}

function applyPreset(presetName) {
  const preset = presets[presetName];
  if (!preset) {
    return;
  }

  Object.entries(preset).forEach(([field, value]) => {
    setFieldValue(field, value);
  });

  updateSliderOutputs();
  runPlanner();
  showToast(`Applied ${presetName} preset.`);
}

function bindEvents() {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    runPlanner();
  });

  sliders.forEach((id) => {
    const input = document.getElementById(id);
    input.addEventListener("input", () => {
      updateSliderOutputs();
      runPlanner();
    });
  });

  ["objective", "batteryProfile", "comms", "hourlyCost"].forEach((id) => {
    const field = document.getElementById(id);
    const eventType = field.type === "number" ? "input" : "change";
    field.addEventListener(eventType, runPlanner);
  });

  document.querySelectorAll(".preset-btn").forEach((button) => {
    button.addEventListener("click", () => {
      applyPreset(button.dataset.preset);
    });
  });

  document.getElementById("copy-link-btn").addEventListener("click", async () => {
    const params = serializeInputs(state.inputs || getInputs());
    const link = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    await copyText(link, "Share link copied.");
  });

  document.getElementById("download-json-btn").addEventListener("click", () => {
    if (!state.inputs || !state.plan) {
      runPlanner();
    }

    const payload = {
      generatedAt: new Date().toISOString(),
      inputs: state.inputs,
      outputs: state.plan,
      alerts: state.alerts,
      tactics: state.tactics
    };

    triggerDownload(
      `drone-mission-plan-${Date.now()}.json`,
      JSON.stringify(payload, null, 2),
      "application/json;charset=utf-8"
    );
    showToast("Mission JSON downloaded.");
  });

  document.getElementById("download-csv-btn").addEventListener("click", () => {
    if (!state.inputs || !state.plan) {
      runPlanner();
    }

    const rows = [
      ["metric", "value"],
      ["objective", state.plan.objectiveLabel],
      ["mapped_area_km2", roundTo(state.plan.mapArea, 2).toFixed(2)],
      ["drones", state.inputs.drones],
      ["mission_minutes", state.plan.missionMinutes],
      ["confidence_percent", Math.round(state.plan.confidence)],
      ["revisit_percent", roundTo(state.plan.revisitPercent, 1).toFixed(1)],
      ["endurance_per_sortie_min", Math.round(state.plan.endurancePerSortie)],
      ["battery_swaps", state.plan.swapsTotal],
      ["total_cost_usd", Math.round(state.plan.totalCost)],
      ["cost_per_km2_usd", Math.round(state.plan.costPerKm2)]
    ];

    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    triggerDownload(`drone-mission-plan-${Date.now()}.csv`, csv, "text/csv;charset=utf-8");
    showToast("Mission CSV downloaded.");
  });

  document.getElementById("copy-brief-btn").addEventListener("click", async () => {
    if (!state.inputs || !state.plan) {
      runPlanner();
    }
    const brief = buildBrief(state.inputs, state.plan, state.alerts, state.tactics);
    await copyText(brief, "Mission brief copied.");
  });
}

parseInputsFromQuery();
updateSliderOutputs();
bindEvents();
runPlanner();
