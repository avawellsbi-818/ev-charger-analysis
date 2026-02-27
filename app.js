// app.js - Layer 2: Interactive Logic and Visualization
let rawData = [];
let chartDensity, chartOperator;

const THEME = {
    blue: '#0066cc',
    orange: '#f59e0b', // Operational
    yellow: '#eab308', // Planned
    green: '#10b981',  // Suggested
};

// Initialize App
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Fetch raw data cached by tools/extract_data.js
        const res = await fetch('.tmp/raw_data.json');
        if (!res.ok) throw new Error("Could not load data. Did you run `node tools/extract_data.js`?");
        rawData = await res.json();

        // Clean poorly formatted state data directly upon load
        rawData.forEach(station => {
            if (station.AddressInfo) {
                const s = station.AddressInfo.StateOrProvince || '';
                let t = station.AddressInfo.Town || '';

                const ls = s.trim().toLowerCase();
                let cleanS = 'Unknown';

                if (['vic', 'victoria'].includes(ls)) cleanS = 'VIC';
                else if (['nsw', 'new south wales', 'new south wells'].includes(ls)) cleanS = 'NSW';
                else if (['qld', 'queensland'].includes(ls)) cleanS = 'QLD';
                else if (['wa', 'western australia', 'western autralia'].includes(ls)) cleanS = 'WA';
                else if (['sa', 'south australia'].includes(ls)) cleanS = 'SA';
                else if (['act', 'australian capital territory'].includes(ls)) cleanS = 'ACT';
                else if (['tas', 'tasmania'].includes(ls)) cleanS = 'TAS';
                else if (['nt', 'northern territory'].includes(ls)) cleanS = 'NT';
                else if (s) {
                    // It's not a recognized state or empty.
                    // If town is empty, try moving it to town.
                    if (!t || t.toLowerCase() === 'unknown') {
                        station.AddressInfo.Town = s.trim();
                    }
                }

                station.AddressInfo.StateOrProvince = cleanS;
            }
        });

        console.log(`Loaded ${rawData.length} charging stations.`);

        initFilters();
        updateDashboard();

        // Add event listeners
        document.getElementById('apply-filters').addEventListener('click', updateDashboard);
    } catch (err) {
        console.error("Initialization error:", err);
        document.querySelector('.metrics-grid').innerHTML =
            `<div class="metric-card" style="grid-column: 1/-1; border-left-color: red;">
                <h4>Error Loading Data</h4>
                <p>${err.message}</p>
            </div>`;
    }
});

// Process data into state
function processData() {
    const selectedState = document.getElementById('state-filter').value;
    const selectedCity = document.getElementById('city-filter').value;
    const selectedTown = document.getElementById('town-filter').value;
    const selectedStatus = document.getElementById('status-filter').value;

    // Filter raw data
    const filtered = rawData.filter(station => {
        const info = station.AddressInfo || {};
        const state = info.StateOrProvince || 'Unknown';
        const city = info.Town || 'Unknown';
        const town = info.Town || 'Unknown'; // OpenChargeMap usually uses Town for City/Town

        let statusCategory = 'unknown';
        const isOperational = station.StatusType ? station.StatusType.IsOperational : false;
        if (isOperational) statusCategory = 'operational';
        else if (station.StatusType && station.StatusType.Title && station.StatusType.Title.toLowerCase().includes('plan')) {
            statusCategory = 'planned';
        }

        if (selectedState !== 'all' && state !== selectedState) return false;
        if (selectedCity !== 'all' && city !== selectedCity) return false;
        if (selectedTown !== 'all' && town !== selectedTown) return false;
        if (selectedStatus !== 'all' && statusCategory !== selectedStatus) return false;

        return true;
    });

    // Aggregations
    const stats = {
        active: 0,
        planned: 0,
        gaps: 0, // AI predictions
        stateDensity: {},
        operators: {}
    };

    filtered.forEach(station => {
        const info = station.AddressInfo || {};
        const state = info.StateOrProvince || 'Unknown';
        const operator = (station.OperatorInfo && station.OperatorInfo.Title) ? station.OperatorInfo.Title : 'Unknown';

        let isOp = station.StatusType ? station.StatusType.IsOperational : false;
        if (isOp) { stats.active++; }
        else if (station.StatusType && station.StatusType.Title && station.StatusType.Title.toLowerCase().includes('plan')) {
            stats.planned++;
        }

        if (!stats.stateDensity[state]) stats.stateDensity[state] = 0;
        stats.stateDensity[state]++;

        if (!stats.operators[operator]) stats.operators[operator] = 0;
        stats.operators[operator]++;
    });

    // Simple mock prediction logic "gaps" based on data volume
    stats.gaps = Math.floor(stats.active * 0.15); // suggest 15% new locations based on current scale

    return { filtered, stats };
}

// Generate predictions logically (Layer 2 logic)
function generatePredictions(stats) {
    const list = document.getElementById('predictions-list');
    list.innerHTML = '';

    if (stats.gaps === 0) {
        list.innerHTML = '<p>No predictions for this filter.</p>';
        return;
    }

    const topStates = Object.entries(stats.stateDensity)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);

    topStates.forEach(([state, count]) => {
        const suggestionCount = Math.ceil(count * 0.15);
        const item = document.createElement('div');
        item.className = 'prediction-item';
        item.innerHTML = `
            <strong>Route Expansion: ${state} (${suggestionCount} units)</strong>
            <p>High existing density suggests strong EV adoption. Identifying transit gaps between current top clusters in ${state} to support highway connectivity.</p>
        `;
        list.appendChild(item);
    });
}

function updateDashboard() {
    const { filtered, stats } = processData();

    // Update Metrics
    document.getElementById('metric-active').textContent = stats.active.toLocaleString();
    document.getElementById('metric-planned').textContent = stats.planned.toLocaleString();
    document.getElementById('metric-gaps').textContent = stats.gaps.toLocaleString();

    generatePredictions(stats);
    renderCharts(stats);
}

function renderCharts(stats) {
    // Destroy existing to prevent overlap
    if (chartDensity) chartDensity.destroy();
    if (chartOperator) chartOperator.destroy();

    Chart.defaults.color = '#718096';
    Chart.defaults.font.family = 'Inter';

    // 1. State Density Chart
    const ctxDensity = document.getElementById('densityChart').getContext('2d');
    const stateLabels = Object.keys(stats.stateDensity);
    const stateData = Object.values(stats.stateDensity);

    chartDensity = new Chart(ctxDensity, {
        type: 'bar',
        data: {
            labels: stateLabels,
            datasets: [{
                label: 'Charger Density',
                data: stateData,
                backgroundColor: THEME.orange,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            }
        }
    });

    // 2. Operator Share Chart
    const ctxOperator = document.getElementById('operatorChart').getContext('2d');
    const opEntries = Object.entries(stats.operators)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5); // top 5

    chartOperator = new Chart(ctxOperator, {
        type: 'doughnut',
        data: {
            labels: opEntries.map(e => e[0]),
            datasets: [{
                data: opEntries.map(e => e[1]),
                backgroundColor: [THEME.blue, THEME.orange, THEME.yellow, THEME.green, '#e2e8f0']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: { position: 'bottom' }
            }
        }
    });
}

// Populate filters dynamically from dataset
function initFilters() {
    const states = new Set();
    const cities = new Set();

    rawData.forEach(station => {
        const info = station.AddressInfo || {};
        if (info.StateOrProvince) states.add(info.StateOrProvince);
        if (info.Town) cities.add(info.Town);
    });

    const stateSelect = document.getElementById('state-filter');
    Array.from(states).sort().forEach(state => {
        const opt = document.createElement('option');
        opt.value = state;
        opt.textContent = state;
        stateSelect.appendChild(opt);
    });

    const citySelect = document.getElementById('city-filter');
    const townSelect = document.getElementById('town-filter'); // Synonymous with city for now based on API limitations
    Array.from(cities).sort().forEach(city => {
        const opt1 = document.createElement('option');
        const opt2 = document.createElement('option');
        opt1.value = opt2.value = city;
        opt1.textContent = opt2.textContent = city;
        citySelect.appendChild(opt1);
        townSelect.appendChild(opt2);
    });
}
