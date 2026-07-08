const DATA_PATH = "./data_clean/";

const agentColors = d3.scaleOrdinal()
  .domain([
    "Legal-Agent",
    "Social-Manager-Agent",
    "Social-Media-Agent",
    "Platform-Trust-Agent",
    "Quality-Agent",
    "PR-Agent",
    "PR-Intern-Agent",
    "Intern-Agent",
    "Judge-Agent",
    "system",
    "external"
  ])
  .range([
    "#ef4444",
    "#f97316",
    "#fb923c",
    "#22c55e",
    "#22c55e",
    "#38bdf8",
    "#a78bfa",
    "#eab308",
    "#94a3b8",
    "#64748b",
    "#f43f5e"
  ]);

const tooltip = d3.select("body").append("div").attr("class", "tooltip");

function showTip(event, html) {
  tooltip
    .html(html)
    .style("left", `${event.clientX + 14}px`)
    .style("top", `${event.clientY + 14}px`)
    .style("opacity", 1);
}

function hideTip() {
  tooltip.style("opacity", 0);
}
function createResponsiveSvg(containerId, height) {
  const container = d3.select(containerId);
  container.selectAll("*").remove();

  const box = container.node().getBoundingClientRect();
  const width = Math.max(720, box.width - 20);

  const svg = container.append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .style("width", "100%")
    .style("height", "auto");

  return { container, svg, width, height };
}

async function loadCSV(fileName) {
  const response = await fetch(DATA_PATH + fileName);

  if (!response.ok) {
    throw new Error(`Cannot load ${fileName}. Run Python script first.`);
  }

  const text = await response.text();

  return Papa.parse(text, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true
  }).data;
}

function cleanDate(value) {
  return new Date(value);
}

function formatDate(value) {
  return new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function embedVegaLite(elementId, spec) {
  vegaEmbed(`#${elementId}`, spec, {
    actions: false,
    theme: "dark",
    config: {
      background: "transparent",
      axis: {
        labelColor: "#cbd5e1",
        titleColor: "#e5e7eb",
        gridColor: "#334155"
      },
      legend: {
        labelColor: "#cbd5e1",
        titleColor: "#e5e7eb"
      },
      view: {
        stroke: "transparent"
      }
    }
  });
}

async function renderSummary() {
  const messages = await loadCSV("messages_clean.csv");

  document.getElementById("totalMessages").textContent = messages.length;
  document.getElementById("totalAgents").textContent = new Set(messages.map(d => d.agent_id)).size;
  document.getElementById("totalChannels").textContent = new Set(messages.map(d => d.channel)).size;
}

async function renderCausalMap() {
  const nodes = await loadCSV("causal_nodes.csv");
  const edges = await loadCSV("causal_edges.csv");

  nodes.forEach(d => {
    d.dateObj = cleanDate(d.timestamp);
    d.severity = Number(d.severity);
  });

  edges.forEach(d => {
    d.strength = Number(d.strength);
  });

  const container = d3.select("#causalMap");
  container.selectAll("*").remove();

  const width = Math.max(1050, container.node().clientWidth - 20);
  const height = 480;

  const margin = {
    top: 35,
    right: 80,
    bottom: 70,
    left: 80
  };

  const svg = container
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  const x = d3.scaleTime()
    .domain(d3.extent(nodes, d => d.dateObj))
    .range([margin.left, width - margin.right]);

  const y = d3.scalePoint()
    .domain(nodes.map(d => d.id))
    .range([margin.top, height - margin.bottom])
    .padding(0.7);

  const severityColor = d3.scaleLinear()
    .domain([30, 60, 100])
    .range(["#38bdf8", "#f97316", "#ef4444"]);

  const nodeMap = new Map(nodes.map(d => [d.id, d]));

  svg.append("g")
    .attr("transform", `translate(0,${height - margin.bottom + 20})`)
    .call(
      d3.axisBottom(x)
        .ticks(6)
        .tickFormat(d3.timeFormat("%d %b %H:%M"))
    )
    .selectAll("text")
    .attr("fill", "#cbd5e1");

  svg.selectAll(".causal-link")
    .data(edges)
    .enter()
    .append("path")
    .attr("class", "causal-link")
    .attr("d", d => {
      const s = nodeMap.get(d.source);
      const t = nodeMap.get(d.target);

      const x1 = x(s.dateObj);
      const y1 = y(s.id);
      const x2 = x(t.dateObj);
      const y2 = y(t.id);

      const midX = (x1 + x2) / 2;

      return `M${x1},${y1} C${midX},${y1 - 70} ${midX},${y2 - 70} ${x2},${y2}`;
    })
    .attr("fill", "none")
    .attr("stroke", "#64748b")
    .attr("stroke-width", d => Math.max(2, d.strength / 18))
    .attr("opacity", 0.72)
    .on("mousemove", (event, d) => {
      showTip(event, `<strong>Causal mechanism</strong><br>${d.mechanism}<br><br><strong>Strength:</strong> ${d.strength}`);
    })
    .on("mouseleave", hideTip);

  svg.selectAll(".event-node")
    .data(nodes)
    .enter()
    .append("circle")
    .attr("class", "event-node")
    .attr("cx", d => x(d.dateObj))
    .attr("cy", d => y(d.id))
    .attr("r", d => 9 + d.severity / 12)
    .attr("fill", d => severityColor(d.severity))
    .attr("stroke", "#f8fafc")
    .attr("stroke-width", 1.4)
    .attr("opacity", 0.95)
    .on("mousemove", (event, d) => {
      showTip(
        event,
        `<strong>${d.label}</strong><br>${formatDate(d.timestamp)}<br>${d.summary}`
      );
    })
    .on("mouseleave", hideTip)
    .on("click", (event, d) => {
      document.getElementById("selectedEvidence").innerHTML = `
        <strong>${d.label}</strong><br>
        <span>${formatDate(d.timestamp)} | ${d.agent} | ${d.channel}</span>
        <p>${d.summary}</p>
      `;
    });

  svg.selectAll(".event-label")
    .data(nodes)
    .enter()
    .append("text")
    .attr("x", d => x(d.dateObj) + 18)
    .attr("y", d => y(d.id) + 4)
    .text(d => d.label)
    .attr("fill", "#e5e7eb")
    .attr("font-size", 12);

  svg.append("text")
    .attr("x", margin.left)
    .attr("y", 22)
    .attr("fill", "#93c5fd")
    .attr("font-size", 13)
    .text("Node size and colour show severity. Curved arrows show causal direction.");
}

async function renderJune5Swimlane() {
  const messages = await loadCSV("messages_clean.csv");
  const june5 = messages
    .filter(d => d.date === "2046-06-05")
    .map(d => ({
      ...d,
      dateObj: cleanDate(d.timestamp)
    }));

  const channels = [...new Set(june5.map(d => d.channel))];

  const annotations = [
    {
      time: "2046-06-05T15:08:00",
      label: "Judge warning",
      channel: "comms_huddle"
    },
    {
      time: "2046-06-05T17:01:00",
      label: "Section 4.3(c)",
      channel: "comms_huddle"
    },
    {
      time: "2046-06-05T17:25:00",
      label: "Legal breach post",
      channel: "personal_post"
    },
    {
      time: "2046-06-05T17:26:00",
      label: "Social amplification",
      channel: "personal_post"
    },
    {
      time: "2046-06-05T18:00:00",
      label: "Embargo expiry",
      channel: "official_post"
    }
  ].map(d => ({
    ...d,
    dateObj: cleanDate(d.time)
  }));

  const container = d3.select("#june5Swimlane");
  container.selectAll("*").remove();

  const width = Math.max(1050, container.node().clientWidth - 20);
  const height = 470;

  const margin = {
    top: 30,
    right: 120,
    bottom: 60,
    left: 145
  };

  const svg = container.append("svg")
    .attr("width", width)
    .attr("height", height);

  const x = d3.scaleTime()
    .domain([
      new Date("2046-06-05T08:30:00"),
      new Date("2046-06-05T18:30:00")
    ])
    .range([margin.left, width - margin.right]);

  const y = d3.scalePoint()
    .domain(channels)
    .range([margin.top, height - margin.bottom])
    .padding(0.8);

  svg.append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(10).tickFormat(d3.timeFormat("%H:%M")))
    .selectAll("text")
    .attr("fill", "#cbd5e1");

  svg.append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y))
    .selectAll("text")
    .attr("fill", "#cbd5e1");

  svg.selectAll(".lane-line")
    .data(channels)
    .enter()
    .append("line")
    .attr("x1", margin.left)
    .attr("x2", width - margin.right)
    .attr("y1", d => y(d))
    .attr("y2", d => y(d))
    .attr("stroke", "#334155")
    .attr("stroke-dasharray", "4 6");

  svg.selectAll(".message-dot")
    .data(june5)
    .enter()
    .append("circle")
    .attr("cx", d => x(d.dateObj))
    .attr("cy", d => y(d.channel))
    .attr("r", d => d.is_public === "True" || d.is_public === true ? 6 : 4)
    .attr("fill", d => agentColors(d.agent_label))
    .attr("opacity", 0.78)
    .on("mousemove", (event, d) => {
      showTip(
        event,
        `<strong>${d.agent_label}</strong><br>${formatDate(d.timestamp)}<br>${d.channel}<br><br>${String(d.content).slice(0, 220)}`
      );
    })
    .on("mouseleave", hideTip);

  svg.selectAll(".annotation-line")
    .data(annotations)
    .enter()
    .append("line")
    .attr("x1", d => x(d.dateObj))
    .attr("x2", d => x(d.dateObj))
    .attr("y1", margin.top - 8)
    .attr("y2", height - margin.bottom + 8)
    .attr("stroke", d => d.label.includes("breach") ? "#ef4444" : "#facc15")
    .attr("stroke-width", 2)
    .attr("stroke-dasharray", "4 4");

  svg.selectAll(".annotation-label")
    .data(annotations)
    .enter()
    .append("text")
    .attr("x", d => x(d.dateObj) + 5)
    .attr("y", d => y(d.channel) - 12)
    .text(d => d.label)
    .attr("fill", "#f8fafc")
    .attr("font-size", 12);
}

async function renderSankey() {
  const matrix = await loadCSV("agent_channel_matrix.csv");

  const filtered = matrix.filter(d => Number(d.message_count) > 0);

  const agentNodes = [...new Set(filtered.map(d => d.agent_label))];
  const channelNodes = [...new Set(filtered.map(d => d.channel))];

  const nodes = [
    ...agentNodes.map(name => ({ name })),
    ...channelNodes.map(name => ({ name }))
  ];

  const nodeIndex = new Map(nodes.map((d, i) => [d.name, i]));

  const links = filtered.map(d => ({
    source: nodeIndex.get(d.agent_label),
    target: nodeIndex.get(d.channel),
    value: Number(d.message_count)
  }));

  const container = d3.select("#sankeyChart");
  container.selectAll("*").remove();

  const width = Math.max(620, container.node().clientWidth - 20);
  const height = 360;

  const svg = container.append("svg")
    .attr("width", width)
    .attr("height", height);

  const sankey = d3.sankey()
    .nodeWidth(16)
    .nodePadding(12)
    .extent([[15, 15], [width - 20, height - 20]]);

  const graph = sankey({
    nodes: nodes.map(d => ({ ...d })),
    links: links.map(d => ({ ...d }))
  });

  svg.append("g")
    .selectAll("path")
    .data(graph.links)
    .enter()
    .append("path")
    .attr("d", d3.sankeyLinkHorizontal())
    .attr("stroke", "#38bdf8")
    .attr("stroke-opacity", 0.22)
    .attr("stroke-width", d => Math.max(1, d.width))
    .attr("fill", "none")
    .on("mousemove", (event, d) => {
      showTip(event, `<strong>${d.source.name}</strong> → <strong>${d.target.name}</strong><br>${d.value} messages`);
    })
    .on("mouseleave", hideTip);

  const node = svg.append("g")
    .selectAll("g")
    .data(graph.nodes)
    .enter()
    .append("g");

  node.append("rect")
    .attr("x", d => d.x0)
    .attr("y", d => d.y0)
    .attr("height", d => d.y1 - d.y0)
    .attr("width", d => d.x1 - d.x0)
    .attr("fill", d => agentColors(d.name))
    .attr("opacity", 0.9);

  node.append("text")
    .attr("x", d => d.x0 < width / 2 ? d.x1 + 6 : d.x0 - 6)
    .attr("y", d => (d.y1 + d.y0) / 2)
    .attr("dy", "0.35em")
    .attr("text-anchor", d => d.x0 < width / 2 ? "start" : "end")
    .attr("fill", "#e5e7eb")
    .attr("font-size", 11)
    .text(d => d.name);
}

async function renderHeatmap() {
  const data = await loadCSV("agent_channel_matrix.csv");

  const agents = [...new Set(data.map(d => d.agent_label))];
  const channels = [...new Set(data.map(d => d.channel))];

  const { svg, width, height } = createResponsiveSvg("#agentChannelHeatmap", 420);

  const margin = {
    top: 55,
    right: 30,
    bottom: 90,
    left: 180
  };

  const x = d3.scaleBand()
    .domain(channels)
    .range([margin.left, width - margin.right])
    .padding(0.15);

  const y = d3.scaleBand()
    .domain(agents)
    .range([margin.top, height - margin.bottom])
    .padding(0.15);

  const maxCount = d3.max(data, d => Number(d.message_count));
  const color = d3.scaleSequential(d3.interpolateYlOrRd)
    .domain([0, maxCount || 1]);

  svg.append("text")
    .attr("x", margin.left)
    .attr("y", 26)
    .attr("fill", "#93c5fd")
    .attr("font-size", 14)
    .text("Agent-channel intensity shows which agents used which channels most heavily.");

  svg.append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x))
    .selectAll("text")
    .attr("fill", "#cbd5e1")
    .attr("font-size", 11)
    .attr("transform", "rotate(-35)")
    .style("text-anchor", "end");

  svg.append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y))
    .selectAll("text")
    .attr("fill", "#cbd5e1")
    .attr("font-size", 12);

  svg.selectAll(".heat-cell")
    .data(data)
    .enter()
    .append("rect")
    .attr("x", d => x(d.channel))
    .attr("y", d => y(d.agent_label))
    .attr("width", x.bandwidth())
    .attr("height", y.bandwidth())
    .attr("rx", 8)
    .attr("fill", d => color(Number(d.message_count)))
    .attr("stroke", "#1f2937")
    .attr("stroke-width", 1)
    .on("mousemove", (event, d) => {
      showTip(
        event,
        `<strong>${d.agent_label}</strong><br>${d.channel}<br>Messages: ${d.message_count}`
      );
    })
    .on("mouseleave", hideTip);

  svg.selectAll(".heat-label")
    .data(data.filter(d => Number(d.message_count) > 0))
    .enter()
    .append("text")
    .attr("x", d => x(d.channel) + x.bandwidth() / 2)
    .attr("y", d => y(d.agent_label) + y.bandwidth() / 2 + 4)
    .attr("text-anchor", "middle")
    .attr("fill", "#0f172a")
    .attr("font-size", 10)
    .attr("font-weight", 700)
    .text(d => d.message_count);
}

async function renderBehaviourDeviation() {
  const data = await loadCSV("agent_daily_activity.csv");

  const baseline = data
    .filter(d => d.date !== "2046-06-05")
    .reduce((acc, row) => {
      const key = row.agent_label;
      const count = Number(row.message_count);
      if (!acc[key]) acc[key] = { total: 0, days: 0 };
      acc[key].total += count;
      acc[key].days += 1;
      return acc;
    }, {});

  const june5 = data
    .filter(d => d.date === "2046-06-05")
    .reduce((acc, row) => {
      acc[row.agent_label] = Number(row.message_count);
      return acc;
    }, {});

  const agents = [...new Set(data.map(d => d.agent_label))];

  const deviation = agents.map(agent => {
    const avg = baseline[agent] ? baseline[agent].total / baseline[agent].days : 0;
    const current = june5[agent] || 0;
    return {
      agent,
      baseline: Math.round(avg * 10) / 10,
      june5: current,
      delta: current - avg
    };
  }).sort((a, b) => b.delta - a.delta);

  const { svg, width, height } = createResponsiveSvg("#behaviourDeviation", 460);

  const margin = {
    top: 55,
    right: 110,
    bottom: 80,
    left: 180
  };

  const y = d3.scaleBand()
    .domain(deviation.map(d => d.agent))
    .range([margin.top, height - margin.bottom])
    .padding(0.22);

  const maxValue = d3.max(deviation, d => Math.max(d.baseline, d.june5));
  const x = d3.scaleLinear()
    .domain([0, maxValue * 1.25])
    .range([margin.left, width - margin.right]);

  svg.append("text")
    .attr("x", margin.left)
    .attr("y", 26)
    .attr("fill", "#93c5fd")
    .attr("font-size", 14)
    .text("June 5 message counts vs prior baseline activity for each agent.");

  svg.append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(6))
    .selectAll("text")
    .attr("fill", "#cbd5e1");

  svg.append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y))
    .selectAll("text")
    .attr("fill", "#cbd5e1")
    .attr("font-size", 12);

  svg.selectAll(".baseline-bar")
    .data(deviation)
    .enter()
    .append("rect")
    .attr("x", margin.left)
    .attr("y", d => y(d.agent))
    .attr("height", y.bandwidth() / 2 - 4)
    .attr("width", d => x(d.baseline) - margin.left)
    .attr("fill", "#38bdf8")
    .attr("rx", 5)
    .attr("opacity", 0.85)
    .on("mousemove", (event, d) => {
      showTip(event, `<strong>${d.agent}</strong><br>Baseline average: ${d.baseline}`);
    })
    .on("mouseleave", hideTip);

  svg.selectAll(".june5-bar")
    .data(deviation)
    .enter()
    .append("rect")
    .attr("x", margin.left)
    .attr("y", d => y(d.agent) + y.bandwidth() / 2 + 4)
    .attr("height", y.bandwidth() / 2 - 4)
    .attr("width", d => x(d.june5) - margin.left)
    .attr("fill", "#facc15")
    .attr("rx", 5)
    .attr("opacity", 0.9)
    .on("mousemove", (event, d) => {
      showTip(event, `<strong>${d.agent}</strong><br>June 5: ${d.june5}`);
    })
    .on("mouseleave", hideTip);

  svg.append("rect")
    .attr("x", width - margin.right + 5)
    .attr("y", 48)
    .attr("width", 10)
    .attr("height", 10)
    .attr("fill", "#38bdf8");

  svg.append("text")
    .attr("x", width - margin.right + 22)
    .attr("y", 58)
    .attr("fill", "#cbd5e1")
    .attr("font-size", 11)
    .text("Baseline");

  svg.append("rect")
    .attr("x", width - margin.right + 5)
    .attr("y", 70)
    .attr("width", 10)
    .attr("height", 10)
    .attr("fill", "#facc15");

  svg.append("text")
    .attr("x", width - margin.right + 22)
    .attr("y", 80)
    .attr("fill", "#cbd5e1")
    .attr("font-size", 11)
    .text("June 5");
}

function createResponsiveSvg(containerId, height) {
  const container = d3.select(containerId);
  container.selectAll("*").remove();

  const box = container.node().getBoundingClientRect();
  const width = Math.max(720, box.width - 20);

  const svg = container.append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .style("width", "100%")
    .style("height", "auto");

  return { container, svg, width, height };
}

async function renderKeywordTimeline() {
  const data = await loadCSV("keyword_daily_mentions.csv");

  data.forEach(d => {
    d.count = Number(d.count);
  });

  const { svg, width, height } = createResponsiveSvg("#keywordTimeline", 480);

  const margin = {
    top: 55,
    right: 40,
    bottom: 90,
    left: 130
  };

  const dates = [...new Set(data.map(d => d.date))].sort();
  const keywords = [...new Set(data.map(d => d.keyword))];

  const x = d3.scaleBand()
    .domain(dates)
    .range([margin.left, width - margin.right])
    .padding(0.18);

  const y = d3.scaleBand()
    .domain(keywords)
    .range([margin.top, height - margin.bottom])
    .padding(0.20);

  const r = d3.scaleSqrt()
    .domain([0, d3.max(data, d => d.count)])
    .range([3, 22]);

  const color = d3.scaleSequential()
    .domain([0, d3.max(data, d => d.count)])
    .interpolator(d3.interpolateYlOrRd);

  svg.append("text")
    .attr("x", margin.left)
    .attr("y", 26)
    .attr("fill", "#93c5fd")
    .attr("font-size", 14)
    .text("Bubble size shows sensitive keyword burst intensity by date.");

  svg.append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).tickFormat(d => d.slice(5)))
    .selectAll("text")
    .attr("fill", "#cbd5e1")
    .attr("font-size", 11)
    .attr("transform", "rotate(-35)")
    .style("text-anchor", "end");

  svg.append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y))
    .selectAll("text")
    .attr("fill", "#cbd5e1")
    .attr("font-size", 12);

  svg.selectAll(".keyword-grid-x")
    .data(dates)
    .enter()
    .append("line")
    .attr("x1", d => x(d) + x.bandwidth() / 2)
    .attr("x2", d => x(d) + x.bandwidth() / 2)
    .attr("y1", margin.top)
    .attr("y2", height - margin.bottom)
    .attr("stroke", "#1e293b");

  svg.selectAll(".keyword-grid-y")
    .data(keywords)
    .enter()
    .append("line")
    .attr("x1", margin.left)
    .attr("x2", width - margin.right)
    .attr("y1", d => y(d) + y.bandwidth() / 2)
    .attr("y2", d => y(d) + y.bandwidth() / 2)
    .attr("stroke", "#1e293b");

  svg.selectAll(".keyword-bubble")
    .data(data)
    .enter()
    .append("circle")
    .attr("cx", d => x(d.date) + x.bandwidth() / 2)
    .attr("cy", d => y(d.keyword) + y.bandwidth() / 2)
    .attr("r", d => r(d.count))
    .attr("fill", d => color(d.count))
    .attr("opacity", 0.9)
    .attr("stroke", "#f8fafc")
    .attr("stroke-width", 0.6)
    .on("mousemove", (event, d) => {
      showTip(
        event,
        `<strong>${d.keyword}</strong><br>
        Date: ${d.date}<br>
        Mentions: ${d.count}`
      );
    })
    .on("mouseleave", hideTip);

  svg.selectAll(".keyword-label")
    .data(data.filter(d => d.count >= 10))
    .enter()
    .append("text")
    .attr("x", d => x(d.date) + x.bandwidth() / 2)
    .attr("y", d => y(d.keyword) + y.bandwidth() / 2 + 4)
    .attr("text-anchor", "middle")
    .attr("fill", "#ffffff")
    .attr("font-size", 10)
    .attr("font-weight", 700)
    .text(d => d.count);

  const breachDate = "2046-06-05";

  svg.append("rect")
    .attr("x", x(breachDate))
    .attr("y", margin.top - 6)
    .attr("width", x.bandwidth())
    .attr("height", height - margin.top - margin.bottom + 12)
    .attr("fill", "none")
    .attr("stroke", "#ef4444")
    .attr("stroke-width", 2)
    .attr("stroke-dasharray", "5 5");

  svg.append("text")
    .attr("x", x(breachDate) + x.bandwidth() / 2)
    .attr("y", margin.top - 12)
    .attr("text-anchor", "middle")
    .attr("fill", "#fecaca")
    .attr("font-size", 12)
    .text("June 5 breach day");
}
async function renderSideHuddleChart() {
  const data = await loadCSV("channel_daily_activity.csv");

  const side = data
    .filter(d => d.channel === "side_huddle")
    .map(d => ({
      ...d,
      message_count: Number(d.message_count)
    }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const { svg, width, height } = createResponsiveSvg("#sideHuddleChart", 440);

  const margin = {
    top: 55,
    right: 45,
    bottom: 80,
    left: 80
  };

  const x = d3.scaleBand()
    .domain(side.map(d => d.date))
    .range([margin.left, width - margin.right])
    .padding(0.20);

  const y = d3.scaleLinear()
    .domain([0, d3.max(side, d => d.message_count) * 1.20])
    .nice()
    .range([height - margin.bottom, margin.top]);

  svg.append("text")
    .attr("x", margin.left)
    .attr("y", 26)
    .attr("fill", "#93c5fd")
    .attr("font-size", 14)
    .text("side_huddle activity started before June 5, proving an early warning sign.");

  svg.append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).tickFormat(d => d.slice(5)))
    .selectAll("text")
    .attr("fill", "#cbd5e1")
    .attr("font-size", 11)
    .attr("transform", "rotate(-35)")
    .style("text-anchor", "end");

  svg.append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(6))
    .selectAll("text")
    .attr("fill", "#cbd5e1");

  svg.selectAll(".side-bar")
    .data(side)
    .enter()
    .append("rect")
    .attr("x", d => x(d.date))
    .attr("y", d => y(d.message_count))
    .attr("width", x.bandwidth())
    .attr("height", d => height - margin.bottom - y(d.message_count))
    .attr("rx", 7)
    .attr("fill", d => d.date === "2046-05-22" ? "#facc15" : "#f97316")
    .on("mousemove", (event, d) => {
      showTip(
        event,
        `<strong>side_huddle</strong><br>
        Date: ${d.date}<br>
        Messages: ${d.message_count}`
      );
    })
    .on("mouseleave", hideTip);

  svg.selectAll(".side-label")
    .data(side)
    .enter()
    .append("text")
    .attr("x", d => x(d.date) + x.bandwidth() / 2)
    .attr("y", d => y(d.message_count) - 8)
    .attr("text-anchor", "middle")
    .attr("fill", "#f8fafc")
    .attr("font-size", 11)
    .attr("font-weight", 700)
    .text(d => d.message_count);

  const firstWarning = side.find(d => d.date === "2046-05-22");

  if (firstWarning) {
    svg.append("text")
      .attr("x", x(firstWarning.date) + x.bandwidth() / 2)
      .attr("y", y(firstWarning.message_count) - 25)
      .attr("text-anchor", "middle")
      .attr("fill", "#facc15")
      .attr("font-size", 12)
      .text("First warning");
  }
}

async function renderJudgeSilence() {
  const messages = await loadCSV("messages_clean.csv");

  const judge = messages
    .filter(d => d.agent_id === "judge_agent")
    .map(d => ({
      ...d,
      dateObj: cleanDate(d.timestamp)
    }));

  const container = d3.select("#judgeSilenceChart");
  container.selectAll("*").remove();

  const width = Math.max(620, container.node().clientWidth - 20);
  const height = 330;

  const margin = {
    top: 40,
    right: 40,
    bottom: 55,
    left: 60
  };

  const svg = container.append("svg")
    .attr("width", width)
    .attr("height", height);

  const x = d3.scaleTime()
    .domain([
      new Date("2046-05-29T00:00:00"),
      new Date("2046-06-05T18:30:00")
    ])
    .range([margin.left, width - margin.right]);

  const y = d3.scalePoint()
    .domain(["Judge-Agent activity"])
    .range([height / 2, height / 2]);

  svg.append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(6).tickFormat(d3.timeFormat("%d %b %H:%M")))
    .selectAll("text")
    .attr("fill", "#cbd5e1");

  svg.append("line")
    .attr("x1", margin.left)
    .attr("x2", width - margin.right)
    .attr("y1", height / 2)
    .attr("y2", height / 2)
    .attr("stroke", "#334155")
    .attr("stroke-width", 2);

  svg.selectAll(".judge-dot")
    .data(judge)
    .enter()
    .append("circle")
    .attr("cx", d => x(d.dateObj))
    .attr("cy", height / 2)
    .attr("r", 7)
    .attr("fill", "#94a3b8")
    .attr("stroke", "#e5e7eb")
    .on("mousemove", (event, d) => {
      showTip(event, `<strong>Judge-Agent</strong><br>${formatDate(d.timestamp)}<br>${String(d.content).slice(0, 240)}`);
    })
    .on("mouseleave", hideTip);

  const warningTime = new Date("2046-06-05T15:08:00");
  const breachTime = new Date("2046-06-05T17:25:00");

  svg.append("line")
    .attr("x1", x(warningTime))
    .attr("x2", x(warningTime))
    .attr("y1", 60)
    .attr("y2", height - margin.bottom)
    .attr("stroke", "#facc15")
    .attr("stroke-width", 2)
    .attr("stroke-dasharray", "4 4");

  svg.append("text")
    .attr("x", x(warningTime) + 6)
    .attr("y", 72)
    .attr("fill", "#facc15")
    .attr("font-size", 12)
    .text("3:08 PM warning");

  svg.append("line")
    .attr("x1", x(breachTime))
    .attr("x2", x(breachTime))
    .attr("y1", 60)
    .attr("y2", height - margin.bottom)
    .attr("stroke", "#ef4444")
    .attr("stroke-width", 2)
    .attr("stroke-dasharray", "4 4");

  svg.append("text")
    .attr("x", x(breachTime) + 6)
    .attr("y", 92)
    .attr("fill", "#ef4444")
    .attr("font-size", 12)
    .text("5:25 PM breach");

  svg.append("rect")
    .attr("x", x(warningTime))
    .attr("y", height / 2 - 28)
    .attr("width", x(breachTime) - x(warningTime))
    .attr("height", 56)
    .attr("fill", "#ef4444")
    .attr("opacity", 0.14);

  svg.append("text")
    .attr("x", (x(warningTime) + x(breachTime)) / 2)
    .attr("y", height / 2 + 50)
    .attr("text-anchor", "middle")
    .attr("fill", "#fecaca")
    .attr("font-size", 13)
    .text("Compliance silence gap");
}

async function renderRiskRanking() {
  const data = await loadCSV("agent_risk_scores.csv");

  data.forEach(d => {
    d.risk_score = Number(d.risk_score);
    d.activity_multiplier = Number(d.activity_multiplier);
    d.side_huddle_count = Number(d.side_huddle_count);
    d.public_pre_embargo = Number(d.public_pre_embargo);
  });

  data.sort((a, b) => b.risk_score - a.risk_score);

  const { svg, width, height } = createResponsiveSvg("#riskRanking", 450);

  const margin = {
    top: 55,
    right: 120,
    bottom: 55,
    left: 175
  };

  const y = d3.scaleBand()
    .domain(data.map(d => d.agent_label))
    .range([margin.top, height - margin.bottom])
    .padding(0.25);

  const maxRisk = d3.max(data, d => d.risk_score);

  const x = d3.scaleLinear()
    .domain([0, maxRisk * 1.20])
    .range([margin.left, width - margin.right]);

  const color = d3.scaleOrdinal()
    .domain(["High risk", "Medium risk", "Compliance failure", "Lower risk"])
    .range(["#ef4444", "#f97316", "#facc15", "#38bdf8"]);

  svg.append("text")
    .attr("x", margin.left)
    .attr("y", 26)
    .attr("fill", "#93c5fd")
    .attr("font-size", 14)
    .text("Risk is calculated from volume, side_huddle use, public posts, keywords and role deviation.");

  svg.append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(5))
    .selectAll("text")
    .attr("fill", "#cbd5e1");

  svg.append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y))
    .selectAll("text")
    .attr("fill", "#cbd5e1")
    .attr("font-size", 12);

  svg.selectAll(".risk-bar")
    .data(data)
    .enter()
    .append("rect")
    .attr("x", margin.left)
    .attr("y", d => y(d.agent_label))
    .attr("height", y.bandwidth())
    .attr("width", d => x(d.risk_score) - margin.left)
    .attr("rx", 8)
    .attr("fill", d => color(d.risk_category))
    .on("mousemove", (event, d) => {
      showTip(
        event,
        `<strong>${d.agent_label}</strong><br>
        Risk score: ${d.risk_score}<br>
        Category: ${d.risk_category}<br>
        Activity multiplier: ${d.activity_multiplier}×<br>
        side_huddle messages: ${d.side_huddle_count}<br>
        Public pre-embargo posts: ${d.public_pre_embargo}`
      );
    })
    .on("mouseleave", hideTip);

  svg.selectAll(".risk-label")
    .data(data)
    .enter()
    .append("text")
    .attr("x", d => x(d.risk_score) + 8)
    .attr("y", d => y(d.agent_label) + y.bandwidth() / 2 + 5)
    .attr("fill", "#f8fafc")
    .attr("font-size", 12)
    .attr("font-weight", 700)
    .text(d => d.risk_score);
}

async function renderRiskRadar() {
  const data = await loadCSV("agent_risk_scores.csv");

  const selector = document.getElementById("agentSelector");
  selector.innerHTML = "";

  data.forEach(d => {
    const option = document.createElement("option");
    option.value = d.agent_id;
    option.textContent = d.agent_label;
    selector.appendChild(option);
  });

  selector.value = data[0].agent_id;

  function draw(agentId) {
    const row = data.find(d => d.agent_id === agentId);

    const metrics = [
      { axis: "Volume", value: Number(row.volume_risk) },
      { axis: "side_huddle", value: Number(row.side_huddle_risk) },
      { axis: "Public post", value: Number(row.public_risk) },
      { axis: "Keywords", value: Number(row.keyword_risk) },
      { axis: "Role risk", value: Number(row.role_risk) },
      { axis: "Judge silence", value: Number(row.judge_silence_risk) }
    ];

    const container = d3.select("#riskRadar");
    container.selectAll("*").remove();

    const width = Math.max(480, container.node().clientWidth - 20);
    const height = 330;
    const radius = Math.min(width, height) / 2 - 50;
    const centerX = width / 2;
    const centerY = height / 2 + 10;

    const svg = container.append("svg")
      .attr("width", width)
      .attr("height", height);

    const angle = d3.scalePoint()
      .domain(metrics.map(d => d.axis))
      .range([0, Math.PI * 2]);

    const r = d3.scaleLinear()
      .domain([0, 100])
      .range([0, radius]);

    [20, 40, 60, 80, 100].forEach(level => {
      const points = metrics.map(m => {
        const a = angle(m.axis) - Math.PI / 2;
        return [
          centerX + Math.cos(a) * r(level),
          centerY + Math.sin(a) * r(level)
        ];
      });

      svg.append("polygon")
        .attr("points", points.map(p => p.join(",")).join(" "))
        .attr("fill", "none")
        .attr("stroke", "#334155")
        .attr("stroke-width", 1);
    });

    metrics.forEach(m => {
      const a = angle(m.axis) - Math.PI / 2;
      const x2 = centerX + Math.cos(a) * radius;
      const y2 = centerY + Math.sin(a) * radius;

      svg.append("line")
        .attr("x1", centerX)
        .attr("y1", centerY)
        .attr("x2", x2)
        .attr("y2", y2)
        .attr("stroke", "#334155");

      svg.append("text")
        .attr("x", centerX + Math.cos(a) * (radius + 24))
        .attr("y", centerY + Math.sin(a) * (radius + 24))
        .attr("text-anchor", "middle")
        .attr("fill", "#cbd5e1")
        .attr("font-size", 12)
        .text(m.axis);
    });

    const radarPoints = metrics.map(m => {
      const a = angle(m.axis) - Math.PI / 2;
      return [
        centerX + Math.cos(a) * r(m.value),
        centerY + Math.sin(a) * r(m.value)
      ];
    });

    svg.append("polygon")
      .attr("points", radarPoints.map(p => p.join(",")).join(" "))
      .attr("fill", "#ef4444")
      .attr("opacity", 0.28)
      .attr("stroke", "#ef4444")
      .attr("stroke-width", 2);

    svg.selectAll(".radar-dot")
      .data(metrics)
      .enter()
      .append("circle")
      .attr("cx", d => {
        const a = angle(d.axis) - Math.PI / 2;
        return centerX + Math.cos(a) * r(d.value);
      })
      .attr("cy", d => {
        const a = angle(d.axis) - Math.PI / 2;
        return centerY + Math.sin(a) * r(d.value);
      })
      .attr("r", 5)
      .attr("fill", "#f8fafc")
      .on("mousemove", (event, d) => {
        showTip(event, `<strong>${d.axis}</strong><br>${d.value}`);
      })
      .on("mouseleave", hideTip);

    svg.append("text")
      .attr("x", centerX)
      .attr("y", 25)
      .attr("text-anchor", "middle")
      .attr("fill", "#f8fafc")
      .attr("font-size", 15)
      .attr("font-weight", 700)
      .text(`${row.agent_label} risk profile`);
  }

  draw(selector.value);

  selector.addEventListener("change", () => {
    draw(selector.value);
  });
}

async function renderHeatmap() {
  const data = await loadCSV("agent_channel_matrix.csv");

  data.forEach(d => {
    d.message_count = Number(d.message_count);
  });

  const container = d3.select("#agentChannelHeatmap");
  container.selectAll("*").remove();

  const width = Math.max(700, container.node().clientWidth - 20);
  const height = 420;

  const margin = {
    top: 40,
    right: 30,
    bottom: 90,
    left: 170
  };

  const svg = container.append("svg")
    .attr("width", width)
    .attr("height", height);

  const agents = [...new Set(data.map(d => d.agent_label))];
  const channels = [...new Set(data.map(d => d.channel))];

  const x = d3.scaleBand()
    .domain(channels)
    .range([margin.left, width - margin.right])
    .padding(0.08);

  const y = d3.scaleBand()
    .domain(agents)
    .range([margin.top, height - margin.bottom])
    .padding(0.08);

  const color = d3.scaleSequential()
    .domain([0, d3.max(data, d => d.message_count)])
    .interpolator(d3.interpolateOrRd);

  svg.append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x))
    .selectAll("text")
    .attr("fill", "#cbd5e1")
    .attr("transform", "rotate(-35)")
    .style("text-anchor", "end");

  svg.append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y))
    .selectAll("text")
    .attr("fill", "#cbd5e1");

  svg.selectAll(".heat-cell")
    .data(data)
    .enter()
    .append("rect")
    .attr("class", "heat-cell")
    .attr("x", d => x(d.channel))
    .attr("y", d => y(d.agent_label))
    .attr("width", x.bandwidth())
    .attr("height", y.bandwidth())
    .attr("rx", 5)
    .attr("fill", d => d.message_count > 0 ? color(d.message_count) : "#111827")
    .attr("stroke", "#1e293b")
    .on("mousemove", (event, d) => {
      showTip(
        event,
        `<strong>${d.agent_label}</strong><br>
        Channel: ${d.channel}<br>
        Messages: ${d.message_count}`
      );
    })
    .on("mouseleave", hideTip);

  svg.selectAll(".heat-label")
    .data(data.filter(d => d.message_count > 0))
    .enter()
    .append("text")
    .attr("x", d => x(d.channel) + x.bandwidth() / 2)
    .attr("y", d => y(d.agent_label) + y.bandwidth() / 2 + 4)
    .attr("text-anchor", "middle")
    .attr("fill", "#f8fafc")
    .attr("font-size", 11)
    .text(d => d.message_count);

  svg.append("text")
    .attr("x", margin.left)
    .attr("y", 22)
    .attr("fill", "#93c5fd")
    .attr("font-size", 13)
    .text("Darker cells show heavier agent activity in that channel.");
}

async function renderEvidenceCards() {
  const evidence = await loadCSV("evidence_events.csv");

  const container = d3.select("#evidenceCards");
  container.selectAll("*").remove();

  const cards = container.selectAll(".evidence-card")
    .data(evidence)
    .enter()
    .append("div")
    .attr("class", "evidence-card");

  cards.append("h3")
    .text(d => d.title);

  cards.append("div")
    .attr("class", "meta")
    .text(d => `${formatDate(d.timestamp)} | ${d.agent_id} | ${d.channel}`);

  cards.append("p")
    .html(d => `<strong>Finding:</strong> ${d.finding}`);

  cards.append("p")
    .html(d => `<strong>Evidence:</strong> ${d.evidence_text}`);
}

async function startDashboard() {
  try {
    await renderSummary();
    await renderCausalMap();
    await renderJune5Swimlane();
    await renderSankey();
    await renderHeatmap();
    await renderBehaviourDeviation();
    await renderKeywordTimeline();
    await renderSideHuddleChart();
    await renderJudgeSilence();
    await renderRiskRanking();
    await renderRiskRadar();
    await renderEvidenceCards();
  } catch (error) {
    console.error(error);
    document.body.insertAdjacentHTML(
      "afterbegin",
      `<div style="background:#7f1d1d;color:white;padding:15px;">
        Error: ${error.message}<br>
        Run: python python_scripts/clean_vast_mc1.py
      </div>`
    );
  }
}

startDashboard();
