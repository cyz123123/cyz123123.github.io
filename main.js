// ========== 后端API配置 ==========
const API_BASE = 'http://localhost:8080/api';
let pollTimer = null;
let lastDataTime = null;
let connectionType = 'none'; // 'none', 'serial', 'wifi'

// DOM元素
const tempEl = document.getElementById('tempVal');
const humEl = document.getElementById('humVal');
const lightEl = document.getElementById('lightVal');
const relayEl = document.getElementById('relayVal');
const humThr = document.getElementById('humThr');
const humThrVal = document.getElementById('humThrVal');
const humThrConfirm = document.getElementById('humThrConfirm');
const autoOnBtn = document.getElementById('autoOn');
const autoOffBtn = document.getElementById('autoOff');
const relayOnBtn = document.getElementById('relayOn');
const relayOffBtn = document.getElementById('relayOff');
const tempChart = document.getElementById('tempChart');
const humChart = document.getElementById('humChart');
const lightChart = document.getElementById('lightChart');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const footerStatus = document.getElementById('footerStatus');

let isAuto = null;
let relayState = null;
const series = { T: [], H: [], L: [] };
const maxLen = 60;
let curT = null, curH = null, curL = null;
const tempNowEl = document.getElementById('tempNow');
const tempMinEl = document.getElementById('tempMin');
const tempMaxEl = document.getElementById('tempMax');
const tempAvgEl = document.getElementById('tempAvg');
const tempComfortEl = document.getElementById('tempComfort');
const humNowEl = document.getElementById('humNow');
const humMinEl = document.getElementById('humMin');
const humMaxEl = document.getElementById('humMax');
const humAvgEl = document.getElementById('humAvg');
const humThrStatEl = document.getElementById('humThrStat');
const autoStatEl = document.getElementById('autoStat');
const relayStatEl = document.getElementById('relayStat');
const lightNowEl = document.getElementById('lightNow');
const lightMinEl = document.getElementById('lightMin');
const lightMaxEl = document.getElementById('lightMax');
const lightAvgEl = document.getElementById('lightAvg');
const lightPercentEl = document.getElementById('lightPercent');

// 事件监听
humThr.addEventListener('input', () => {
  humThrVal.textContent = humThr.value + '%';
});
humThrConfirm.addEventListener('click', () => {
  sendCmd('threshold', { value: parseInt(humThr.value) });
});

autoOnBtn.addEventListener('click', () => { sendCmd('auto', { enable: true }); });
autoOffBtn.addEventListener('click', () => { sendCmd('auto', { enable: false }); });
relayOnBtn.addEventListener('click', () => { sendCmd('relay', { enable: true }); });
relayOffBtn.addEventListener('click', () => { sendCmd('relay', { enable: false }); });

// 更新连接状态显示
function updateConnectionStatus(type, message) {
  connectionType = type;
  
  if (type === 'wifi') {
    statusDot.className = 'status-dot wifi';
    statusText.textContent = '📶 WiFi传输';
    footerStatus.textContent = 'WiFi连接 - TCP端口3203';
  } else if (type === 'serial') {
    statusDot.className = 'status-dot serial';
    statusText.textContent = '🔌 串口连接';
    footerStatus.textContent = '串口连接 - COM端口';
  } else {
    statusDot.className = 'status-dot offline';
    statusText.textContent = '⚫ 未连接';
    footerStatus.textContent = message || '等待数据...';
  }
}

// 开始轮询获取数据
function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(fetchData, 1000);
  fetchData();
}

// 从后端获取数据和状态
async function fetchData() {
  try {
    // 获取最新传感器数据
    const dataRes = await fetch(`${API_BASE}/sensor/latest`);
    if (dataRes.status === 204) {
      updateConnectionStatus('none', '暂无数据');
      return;
    }
    
    const data = await dataRes.json();
    if (data && data.recordTime) {
      // 检查数据是否更新
      const newTime = new Date(data.recordTime).getTime();
      if (lastDataTime !== newTime) {
        lastDataTime = newTime;
        updateDisplay(data);
      }
      
      // 根据数据来源更新连接状态
      updateConnectionFromSource(data.source);
    }
    
  } catch (e) {
    console.error('获取数据失败:', e);
    updateConnectionStatus('none', '后端连接失败');
  }
}

// 根据数据来源更新连接状态（在updateDisplay中调用）
function updateConnectionFromSource(source) {
  if (source === 'serial') {
    updateConnectionStatus('serial');
  } else if (source === 'wifi') {
    updateConnectionStatus('wifi');
  } else {
    // 未知来源，检查后端状态
    checkBackendStatus();
  }
}

// 检查后端连接状态（备用）
async function checkBackendStatus() {
  try {
    const serialRes = await fetch(`${API_BASE}/serial/status`);
    const serialStatus = await serialRes.json();
    
    if (serialStatus.connected) {
      updateConnectionStatus('serial');
    } else {
      updateConnectionStatus('none', '等待设备连接...');
    }
  } catch (e) {
    updateConnectionStatus('none', '后端连接失败');
  }
}

// 更新界面显示
function updateDisplay(data) {
  if (data.temperature != null) {
    tempEl.textContent = `${data.temperature.toFixed(1)} °C`;
    curT = data.temperature;
    pushAndDraw('T', curT);
  }
  if (data.humidity != null) {
    humEl.textContent = `${data.humidity.toFixed(1)} %`;
    curH = data.humidity;
    pushAndDraw('H', curH);
  }
  if (data.lightValue != null) {
    lightEl.textContent = data.lightValue;
    curL = data.lightValue;
    pushAndDraw('L', curL);
  }
  if (data.relayState != null) {
    relayEl.textContent = data.relayState ? 'ON' : 'OFF';
    relayState = data.relayState;
    updateButtons();
  }
  if (data.autoMode != null) {
    isAuto = data.autoMode;
    updateButtons();
  }
}

// 发送控制命令到后端（自动选择串口或TCP）
async function sendCmd(type, params) {
  try {
    // 构建命令字符串
    let cmdStr = '';
    if (type === 'auto') {
      cmdStr = params.enable ? 'AUTO=1' : 'AUTO=0';
    } else if (type === 'relay') {
      cmdStr = params.enable ? 'RELAY=1' : 'RELAY=0';
    } else if (type === 'threshold') {
      cmdStr = 'THR=' + params.value;
    }

    let success = false;

    // 优先尝试通过TCP发送（WiFi模式）
    if (connectionType === 'wifi') {
      try {
        const tcpRes = await fetch(`${API_BASE}/tcp/command`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: cmdStr + '\r\n' })
        });
        const tcpData = await tcpRes.json();
        if (tcpData.success) {
          success = true;
          console.log(`[TCP] 命令 ${cmdStr} 发送成功`);
        }
      } catch (e) {
        console.warn('[TCP] 发送失败，尝试串口');
      }
    }

    // 如果TCP失败或是串口模式，尝试通过串口发送
    if (!success) {
      const url = new URL(`${API_BASE}/control/${type}`);
      Object.keys(params).forEach(k => url.searchParams.append(k, params[k]));
      const res = await fetch(url, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        success = true;
        console.log(`[Serial] 命令 ${type} 发送成功`);
      }
    }

    if (success) {
      // 更新本地状态
      if (type === 'auto') { isAuto = params.enable; updateButtons(); }
      if (type === 'relay') { relayState = params.enable; updateButtons(); }
    } else {
      console.warn('命令发送失败');
    }
  } catch (e) {
    console.error('发送命令失败:', e);
  }
}

// 页面加载时自动开始获取数据
window.addEventListener('load', async () => {
  console.log('智慧农业监测系统启动...');
  updateConnectionStatus('none', '正在连接后端...');
  
  // 延迟一下再开始轮询，等待DOM完全加载
  setTimeout(() => {
    startPolling();
  }, 500);
});

function updateButtons() {
  if (isAuto === true) { autoOnBtn.classList.add('active'); autoOffBtn.classList.remove('active'); }
  else if (isAuto === false) { autoOffBtn.classList.add('active'); autoOnBtn.classList.remove('active'); }
  if (relayState === true) { relayOnBtn.classList.add('active'); relayOffBtn.classList.remove('active'); }
  else if (relayState === false) { relayOffBtn.classList.add('active'); relayOnBtn.classList.remove('active'); }
}

function pushAndDraw(key, val) {
  const arr = series[key];
  arr.push(val);
  if (arr.length > maxLen) arr.shift();
  drawAll();
  updateStats();
}

function drawAll() {
  drawBarChart(tempChart, series.T, 60, '#ff7043');
  drawBarChart(humChart, series.H, 100, '#4caf50');
  drawBarChart(lightChart, series.L, 3300, '#ffd54f');
}

function drawBarChart(canvas, data, maxY, color) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#0b1a0b';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#9fbf9f';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(40, 10);
  ctx.lineTo(40, h - 30);
  ctx.lineTo(w - 10, h - 30);
  ctx.stroke();
  ctx.fillStyle = '#9fbf9f';
  ctx.font = '12px system-ui';
  ctx.fillText('0', 10, h - 30);
  ctx.fillText(String(maxY), 6, 16);
  const n = data.length;
  const plotW = w - 60;
  const plotH = h - 50;
  const barW = Math.max(1, Math.floor(plotW / Math.max(1, maxLen)) - 1);
  for (let i = 0; i < Math.min(n, maxLen); i++) {
    const v = data[n - Math.min(n, maxLen) + i];
    const x = 50 + i * (barW + 1);
    const y = h - 30 - (v / maxY) * plotH;
    const bh = (v / maxY) * plotH;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, barW, bh);
  }
}

function calcStats(arr) {
  if (!arr.length) return { min: null, max: null, avg: null };
  let min = arr[0], max = arr[0], sum = 0;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  return { min, max, avg: sum / arr.length };
}

function updateStats() {
  const tStats = calcStats(series.T);
  const hStats = calcStats(series.H);
  const lStats = calcStats(series.L);
  if (curT != null) tempNowEl.textContent = `${curT.toFixed(1)} °C`;
  if (tStats.min != null) tempMinEl.textContent = `${tStats.min.toFixed(1)} °C`;
  if (tStats.max != null) tempMaxEl.textContent = `${tStats.max.toFixed(1)} °C`;
  if (tStats.avg != null) tempAvgEl.textContent = `${tStats.avg.toFixed(1)} °C`;
  if (curH != null) humNowEl.textContent = `${curH.toFixed(1)} %`;
  if (hStats.min != null) humMinEl.textContent = `${hStats.min.toFixed(1)} %`;
  if (hStats.max != null) humMaxEl.textContent = `${hStats.max.toFixed(1)} %`;
  if (hStats.avg != null) humAvgEl.textContent = `${hStats.avg.toFixed(1)} %`;
  humThrStatEl.textContent = `${humThr.value}%`;
  autoStatEl.textContent = isAuto === null ? '--' : (isAuto ? '自动' : '手动');
  relayStatEl.textContent = relayState === null ? '--' : (relayState ? '开启' : '关闭');
  if (curL != null) lightNowEl.textContent = String(curL);
  if (lStats.min != null) lightMinEl.textContent = String(lStats.min);
  if (lStats.max != null) lightMaxEl.textContent = String(lStats.max);
  if (lStats.avg != null) lightAvgEl.textContent = lStats.avg.toFixed(0);
  if (curL != null) lightPercentEl.textContent = `${Math.round(curL / 1023 * 100)} %`;
  if (curT != null) {
    let comfort = '舒适';
    if (curT < 18) comfort = '偏冷';
    else if (curT > 26) comfort = '偏热';
    tempComfortEl.textContent = comfort;
  }
}
