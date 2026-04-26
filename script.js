const form = document.querySelector("#planner-form");
const canvas = document.querySelector("#coverage-canvas");
const metricsContainer = document.querySelector("#metrics");
const notesContainer = document.querySelector("#notes");
const ctx = canvas.getContext("2d");

const sliders = ["area", "terrain", "canopy", "wind", "resolution", "nofly", "drones"];

const objectiveEffects = {
  orthomosaic: { confidence: 6, speed: -0.08, detail: 0.9 },
  change: { confidence: 4, speed: 0.12, detail: 0.75 },
  thermal: { confidence: 3, speed: 0.06, detail: 0.68 },
  volume: { confidence: 5, speed: -0.02, detail: 0.8 }
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function seededRandom(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function valueFrom(id) {
  const el = document.getElementById(id);
  return el.type === "range" ? Number(el.value) : el.value;
}

function updateSliderOutputs() {
  sliders.forEach((id) => {
    const value = valueFrom(id);
    const output = document.querySelector(`#${id}-output`);
    if (!output) {
      return;
    }
    if (id === "canopy" || id === "nofly") {
      output.textContent = `${Math.round(value)}%`;
    } else if (id === "drones") {
      output.textContent = `${Math.round(value)} drones`;
    } else {
      output.textContent = Number.isInteger(value) ? String(value) : value.toFixed(1);
    }
  });
}

function calculatePlan(inputs) {
  const objective = objectiveEffects[inputs.objective] || objectiveEffects.orthomosaic;

  const altitude = clamp(
    48 + inputs.resolution * 21 + inputs.terrain * 2.6 + inputs.wind * 1.7 + inputs.canopy * 0.22,
    42,
    195
  );

  const frontOverlap = clamp(68 + inputs.terrain * 1.1 + inputs.wind * 1.1 + inputs.canopy * 0.18, 68, 91);
  const sideOverlap = clamp(frontOverlap - (6 + inputs.wind * 0.3), 60, 87);

  const restrictedArea = inputs.area * (inputs.nofly / 100);
  const mapArea = inputs.area - restrictedArea;

  const baseRate = 0.52 + (altitude - 70) / 300;
  const overlapPenalty = (frontOverlap + sideOverlap - 130) / 220;
  const weatherPenalty = inputs.wind * 0.04;
  const terrainPenalty = inputs.terrain * 0.03;

  const droneRate = clamp(baseRate - overlapPenalty - weatherPenalty - terrainPenalty + objective.speed, 0.17, 0.88);
  const swarmRate = droneRate * inputs.drones * (1 - inputs.nofly / 130);

  const missionHours = clamp(mapArea / swarmRate, 0.38, 16);
  const missionMinutes = Math.round(missionHours * 60);

  const confidence = clamp(
    84 + objective.confidence + inputs.drones * 0.9 - inputs.wind * 2.1 - inputs.terrain * 1.2 - inputs.nofly * 0.45,
    41,
    98
  );

  const edgeInferenceMinutes = Math.round(missionMinutes * (0.22 + objective.detail * 0.16 + inputs.terrain * 0.01));
  const revisitPercent = clamp(inputs.terrain * 2.4 + inputs.wind * 1.6 + inputs.canopy * 0.18 - inputs.drones * 0.9, 4, 39);

  return {
    altitude,
    frontOverlap,
    sideOverlap,
    mapArea,
    missionMinutes,
    confidence,
    edgeInferenceMinutes,
    revisitPercent
  };
}

function computeGrid(inputs, plan) {
  const cols = 26;
  const rows = 13;
  const cells = [];
  const seedBase =
    inputs.area * 13.1 +
    inputs.terrain * 8.7 +
    inputs.canopy * 3.3 +
    inputs.wind * 11.9 +
    inputs.resolution * 10.3 +
    inputs.drones * 4.2;

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const wave = Math.sin((x + 1) * 0.34 + inputs.terrain) * 0.3 + Math.cos((y + 2) * 0.46 + inputs.wind) * 0.24;
      const noise = seededRandom(seedBase + x * 2.1 + y * 6.4) * 0.45;
      const canopyInfluence = (inputs.canopy / 100) * (0.3 + seededRandom(seedBase + x * y + 17) * 0.7);
      const volatility = (inputs.wind / 10) * seededRandom(seedBase + x * 17 + y * 11);

      const risk = clamp(0.26 + wave + noise + canopyInfluence + volatility, 0.03, 1);
      const passDemand = clamp(risk * (1.2 + plan.revisitPercent / 100), 0.08, 1.35);
      cells.push({ x, y, risk, passDemand });
    }
  }

  return { cols, rows, cells };
}

function drawCoverage(inputs, grid) {
  const { cols, rows, cells } = grid;
  const pad = 18;
  const w = canvas.width - pad * 2;
  const h = canvas.height - pad * 2;
  const cw = w / cols;
  const ch = h / rows;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, "#0b1626");
  gradient.addColorStop(1, "#0e2032");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  cells.forEach((cell) => {
    const danger = clamp(cell.passDemand / 1.35, 0, 1);
    const red = Math.round(24 + danger * 206);
    const green = Math.round(64 + (1 - danger) * 178);
    const blue = Math.round(132 + (1 - danger) * 70);

    ctx.fillStyle = `rgba(${red}, ${green}, ${blue}, 0.82)`;
    ctx.fillRect(pad + cell.x * cw + 1, pad + cell.y * ch + 1, cw - 2, ch - 2);
  });

  for (let i = 0; i <= cols; i += 1) {
    ctx.strokeStyle = "rgba(220, 234, 255, 0.08)";
    ctx.lineWidth = 1;
    const x = pad + i * cw;
    ctx.beginPath();
    ctx.moveTo(x, pad);
    ctx.lineTo(x, pad + h);
    ctx.stroke();
  }

  for (let i = 0; i <= rows; i += 1) {
    ctx.strokeStyle = "rgba(220, 234, 255, 0.08)";
    ctx.lineWidth = 1;
    const y = pad + i * ch;
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(pad + w, y);
    ctx.stroke();
  }

  const droneCount = Math.max(1, Math.round(inputs.drones));
  for (let drone = 0; drone < droneCount; drone += 1) {
    const hue = 180 + (drone * 240) / droneCount;
    ctx.strokeStyle = `hsla(${hue}, 88%, 68%, 0.9)`;
    ctx.lineWidth = 2.2;
    ctx.beginPath();

    const lane = drone % rows;
    const phase = drone % 2;

    for (let step = 0; step < cols; step += 1) {
      const x = pad + step * cw + cw / 2;
      const offset = phase ? cols - 1 - step : step;
      const y = pad + ((lane + offset * 0.12) % rows) * ch + ch / 2;

      if (step === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();
  }

  ctx.fillStyle = "rgba(228, 240, 255, 0.9)";
  ctx.font = "500 15px IBM Plex Mono";
  ctx.fillText("Blue: low revisit demand  |  Red: dense revisit demand", 20, canvas.height - 12);
}

function renderMetrics(plan) {
  const metrics = [
    { label: "Flight Altitude", value: `${Math.round(plan.altitude)} m`, tone: "good" },
    { label: "Image Overlap", value: `${Math.round(plan.frontOverlap)} / ${Math.round(plan.sideOverlap)} %` },
    { label: "Mapped Area", value: `${plan.mapArea.toFixed(2)} km²` },
    { label: "Mission Time", value: `${plan.missionMinutes} min` },
    { label: "Map Confidence", value: `${Math.round(plan.confidence)}%`, tone: plan.confidence > 78 ? "good" : "hot" },
    { label: "Edge AI Processing", value: `${plan.edgeInferenceMinutes} min` },
    { label: "Predicted Revisits", value: `${plan.revisitPercent.toFixed(1)}%`, tone: plan.revisitPercent < 18 ? "good" : "hot" }
  ];

  metricsContainer.innerHTML = metrics
    .map(
      (metric) => `
      <article class="metric">
        <span class="name">${metric.label}</span>
        <span class="value ${metric.tone || ""}">${metric.value}</span>
      </article>
    `
    )
    .join("");
}

function renderNotes(inputs, plan) {
  const tactics = [
    `Deploy an RTK + vision fusion stack to keep horizontal drift under ${(1.5 + inputs.wind * 0.2).toFixed(1)} m in gust windows.`,
    `Schedule a confidence-triggered micro-reflight whenever cell confidence drops below ${Math.round(plan.confidence - 13)}%.`,
    `Queue edge-based semantic segmentation before cloud upload to reduce data transfer by ${Math.round(20 + inputs.canopy * 0.35)}%.`,
    `Reserve ${(8 + plan.revisitPercent * 0.45).toFixed(1)}% battery for dynamic replanning when corridor restrictions shift.`
  ];

  notesContainer.innerHTML = tactics.map((note) => `<p class="note">${note}</p>`).join("");
}

function runPlanner() {
  const inputs = {
    area: valueFrom("area"),
    terrain: valueFrom("terrain"),
    canopy: valueFrom("canopy"),
    wind: valueFrom("wind"),
    resolution: valueFrom("resolution"),
    nofly: valueFrom("nofly"),
    drones: valueFrom("drones"),
    objective: valueFrom("objective")
  };

  const plan = calculatePlan(inputs);
  const grid = computeGrid(inputs, plan);

  renderMetrics(plan);
  drawCoverage(inputs, grid);
  renderNotes(inputs, plan);
}

sliders.forEach((id) => {
  const input = document.getElementById(id);
  input.addEventListener("input", () => {
    updateSliderOutputs();
    runPlanner();
  });
});

document.getElementById("objective").addEventListener("change", runPlanner);

form.addEventListener("submit", (event) => {
  event.preventDefault();
  runPlanner();
});

updateSliderOutputs();
runPlanner();
