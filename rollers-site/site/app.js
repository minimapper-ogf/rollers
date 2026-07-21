const apiBase = window.location.origin;

const state = {
  heartbeatHistory: [],
  mapIndex: [],
  selectedMapId: null,
  selectedMapData: null,
};

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

function renderHeartbeatChart() {
  if (!state.heartbeatHistory.length) return;

  const points = state.heartbeatHistory.slice().reverse().map((item) => ({
    x: new Date(item.recorded_at).getTime(),
    y: item.total_players,
  }));

  const serverPoints = state.heartbeatHistory.slice().reverse().map((item) => ({
    x: new Date(item.recorded_at).getTime(),
    y: item.active_servers,
  }));

  Highcharts.chart('heartbeat-chart', {
    chart: { type: 'line', backgroundColor: 'transparent' },
    title: { text: null },
    credits: { enabled: false },
    legend: { enabled: true },
    xAxis: { type: 'datetime' },
    yAxis: [{ title: { text: 'Players' } }, { title: { text: 'Servers' }, opposite: true }],
    series: [
      {
        name: 'Players',
        data: points,
        color: '#5b7cff',
        yAxis: 0,
      },
      {
        name: 'Servers',
        data: serverPoints,
        color: '#22c55e',
        yAxis: 1,
      },
    ],
    tooltip: { shared: true },
  });
}

function renderMapTable() {
  const body = document.getElementById('map-table-body');
  if (!body) return;

  if (!state.mapIndex.length) {
    body.innerHTML = '<tr><td colspan="5" class="muted">No maps found.</td></tr>';
    return;
  }

  body.innerHTML = state.mapIndex
    .map((map) => {
      const id = map.id;
      return `
        <tr data-map-id="${id}">
          <td>${map.name}</td>
          <td>${map.creator_name || 'Unknown'}</td>
          <td>${map.total_views || 0}</td>
          <td>${map.total_loads || 0}</td>
          <td>${map.block_count || 0}</td>
        </tr>`;
    })
    .join('');

  body.querySelectorAll('tr').forEach((row) => {
    row.addEventListener('click', () => {
      const mapId = row.getAttribute('data-map-id');
      if (mapId) loadMapDetails(mapId);
    });
  });
}

function renderMapDetails() {
  const details = document.getElementById('map-details');
  if (!details) return;

  if (!state.selectedMapData) {
    details.innerHTML = '<p class="muted">Select a map from the table to see its details.</p>';
    return;
  }

  const map = state.selectedMapData;
  const history = state.selectedMapHistory || [];
  const latest = history[0] || null;

  details.innerHTML = `
    <div class="meta-grid">
      <div class="meta-box">
        <strong>${map.metadata.name}</strong>
        <div class="muted">By ${map.metadata.author || 'Unknown'}</div>
      </div>
      <div class="meta-box">
        <strong>${map.metadata.views.total}</strong>
        <div class="muted">Total views</div>
      </div>
      <div class="meta-box">
        <strong>${map.metadata.loads.total}</strong>
        <div class="muted">Total loads</div>
      </div>
    </div>

    <div class="meta-grid">
      <div class="meta-box">
        <strong>${map.metadata.block_count}</strong>
        <div class="muted">Blocks</div>
      </div>
      <div class="meta-box">
        <strong>${map.metadata.medals.Gold}</strong>
        <div class="muted">Gold medal</div>
      </div>
      <div class="meta-box">
        <strong>${map.metadata.medals.Silver}</strong>
        <div class="muted">Silver medal</div>
      </div>
    </div>

    <div class="card" style="padding: 16px;">
      <div class="section-head">
        <h2>History</h2>
        <p class="muted">Latest snapshot: ${latest ? new Date(latest.recorded_at).toLocaleString() : 'No history yet'}</p>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Time</th><th>Views</th><th>Loads</th></tr>
          </thead>
          <tbody>
            ${history.slice(0, 8).map((entry) => `
              <tr>
                <td>${new Date(entry.recorded_at).toLocaleString()}</td>
                <td>${entry.total_views}</td>
                <td>${entry.total_loads}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

async function loadHeartbeatData() {
  const data = await fetchJson(`${apiBase}/api/v1/heartbeat/history?limit=24`);
  state.heartbeatHistory = data.history || [];
  renderHeartbeatChart();
}

async function loadStatus() {
  const data = await fetchJson(`${apiBase}/api/v1/heartbeat/status`);
  setText('total-players', data.total_players ?? '—');
  setText('active-servers', data.active_servers ?? '—');
  setText('status-updated', `Updated ${new Date().toLocaleTimeString()}`);
}

async function loadMaps() {
  const data = await fetchJson(`${apiBase}/api/v1/maps/home?sort=views`);
  state.mapIndex = data.maps || [];
  renderMapTable();
  if (!state.selectedMapId && state.mapIndex.length) {
    loadMapDetails(state.mapIndex[0].id);
  }
}

async function loadMapDetails(mapId) {
  state.selectedMapId = mapId;
  const [mapData, historyData] = await Promise.all([
    fetchJson(`${apiBase}/api/v1/maps/get/${mapId}`),
    fetchJson(`${apiBase}/api/v1/maps/history?map_id=${mapId}&limit=12`),
  ]);
  state.selectedMapData = mapData;
  state.selectedMapHistory = historyData.history || [];
  renderMapDetails();
}

function attachSearch() {
  const input = document.getElementById('map-search');
  if (!input) return;
  input.addEventListener('input', async (event) => {
    const query = event.target.value.trim();
    if (!query) {
      await loadMaps();
      return;
    }
    const data = await fetchJson(`${apiBase}/api/v1/maps/search?q=${encodeURIComponent(query)}`);
    state.mapIndex = data.maps || [];
    renderMapTable();
  });
}

async function init() {
  await Promise.all([loadStatus(), loadHeartbeatData(), loadMaps()]);
  attachSearch();
}

init().catch((error) => {
  console.error(error);
  setText('status-updated', 'Unable to load dashboard data.');
});
