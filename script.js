// === ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ===
let rawData = [];
let data = [];
let allTweets = [];
let sortKey = "posts";
let sortOrder = "desc";
let currentPage = 1;
const perPage = 15;
let timeFilter = "all";
let analyticsChart = null;
let analyticsPeriod = "all"; // filter for analytics: 'all', '7', '14', '30'

// --- Fetch leaderboard data ---
async function fetchData() {
  try {
    const response = await fetch("leaderboard.json"); // <-- путь к файлу в репо
    const json = await response.json();
    rawData = json;
    normalizeData(rawData);
    sortData();
    renderTable();
    updateArrows();
    updateTotals();
  } catch (err) {
    console.error("Failed to fetch leaderboard:", err);
  }
}

// --- Fetch all tweets ---
async function fetchTweets() {
  try {
    const response = await fetch("all_tweets.json"); // <-- путь к файлу в репо
    const json = await response.json();
    if (Array.isArray(json)) {
      allTweets = json;
    } else if (json && typeof json === "object") {
      if (Array.isArray(json.tweets)) {
        allTweets = json.tweets;
      } else if (Array.isArray(json.data)) {
        allTweets = json.data;
      } else {
        allTweets = [json];
      }
    } else {
      allTweets = [];
    }
    // если есть функция рендера аналитики — обновим её
    if (typeof renderAnalytics === "function") renderAnalytics();
  } catch (err) {
    console.error("Failed to fetch all tweets:", err);
    allTweets = [];
  }
}

// стартовые загрузки
fetchTweets().then(() => fetchData());
setInterval(() => {
  fetchTweets();
  fetchData();
}, 3600000); // обновлять каждый час

// --- Normalize leaderboard data ---
function normalizeData(json) {
  data = [];

  if (Array.isArray(json) && json.length > 0 && !Array.isArray(json[0])) {
    data = json.map(item => extractBaseStatsFromItem(item));
  } else if (Array.isArray(json) && json.length > 0 && Array.isArray(json[0])) {
    data = json.map(([name, stats]) => {
      const base = extractBaseStatsFromItem(stats || {});
      base.username = name || base.username || "";
      return applyTimeFilterIfNeeded(base);
    });
  } else if (json && typeof json === "object") {
    data = Object.entries(json).map(([name, stats]) => {
      const base = extractBaseStatsFromItem(stats || {});
      base.username = name || base.username || "";
      return applyTimeFilterIfNeeded(base);
    });
  }

  data = data.map(d => applyTimeFilterIfNeeded(d));

  function extractBaseStatsFromItem(item) {
    const username = item.username || item.user || item.name || item.screen_name || "";
    const posts = Number(item.posts || item.tweets || 0);
    const likes = Number(item.likes || item.favorite_count || 0);
    const retweets = Number(item.retweets || item.retweet_count || 0);
    const comments = Number(item.comments || item.reply_count || 0);
    const views = Number(item.views || item.views_count || 0);
    return { username, posts, likes, retweets, comments, views };
  }

  function applyTimeFilterIfNeeded(base) {
    if (!base || !base.username) return base;
    if (timeFilter === "all") return base;

    const days = Number(timeFilter);
    if (!days || days <= 0) return base;

    const now = new Date();
    const uname = String(base.username).toLowerCase().replace(/^@/, "");

    const userTweets = allTweets.filter(t => {
      const candidate = (t.user && (t.user.screen_name || t.user.name)) || "";
      return String(candidate).toLowerCase().replace(/^@/, "") === uname;
    });

    let posts = 0, likes = 0, retweets = 0, comments = 0, views = 0;

    userTweets.forEach(tweet => {
      const created = tweet.tweet_created_at || tweet.created_at || tweet.created || null;
      if (!created) return;
      const tweetDate = new Date(created);
      if (isNaN(tweetDate)) return;
      const diffDays = (now - tweetDate) / (1000 * 60 * 60 * 24);
      if (diffDays <= days) {
        posts += 1;
        likes += Number(tweet.favorite_count || 0);
        retweets += Number(tweet.retweet_count || 0);
        comments += Number(tweet.reply_count || 0);
        views += Number(tweet.views_count || 0);
      }
    });

    return { username: base.username, posts, likes, retweets, comments, views };
  }
}

// --- Update totals ---
function updateTotals() {
  const totalPosts = data.reduce((sum, s) => sum + (Number(s.posts) || 0), 0);
  const totalViews = data.reduce((sum, s) => sum + (Number(s.views) || 0), 0);
  document.getElementById("total-posts").textContent = `Total Posts: ${totalPosts}`;
  document.getElementById("total-users").textContent = `Total Users: ${data.length}`;
  document.getElementById("total-views").textContent = `Total Views: ${totalViews}`;
}

// --- Sort, Filter, Render ---
function sortData() {
  data.sort((a, b) => {
    const valA = Number(a[sortKey] || 0);
    const valB = Number(b[sortKey] || 0);
    return sortOrder === "asc" ? valA - valB : valB - valA;
  });
}

function filterData() {
  const query = document.getElementById("search").value.toLowerCase();
  return data.filter(item => (item.username || "").toLowerCase().includes(query));
}

function renderTable() {
  const tbody = document.getElementById("leaderboard-body");
  tbody.innerHTML = "";

  const filtered = filterData();
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  if (currentPage > totalPages) currentPage = totalPages;
  const start = (currentPage - 1) * perPage;
  const pageData = filtered.slice(start, start + perPage);

  pageData.forEach(stats => {
    const name = stats.username || "";
    const tr = document.createElement("tr");
    // --- ИЗМЕНЕНО: Добавлена кнопка "Поделиться" ---
    tr.innerHTML = `
      <td>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span>${escapeHtml(name)}</span>
          <button class="share-btn" onclick="shareUserOnTwitter('${escapeHtml(name)}')" title="Share ${escapeHtml(name)} on Twitter">🐦</button>
        </div>
      </td>
      <td>${Number(stats.posts || 0)}</td>
      <td>${Number(stats.likes || 0)}</td>
      <td>${Number(stats.retweets || 0)}</td>
      <td>${Number(stats.comments || 0)}</td>
      <td>${Number(stats.views || 0)}</td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById("page-info").textContent = `Page ${currentPage} / ${totalPages}`;

  // Добавляем обработчики клика (всегда вызываем после рендера)
  addUserClickHandlers();
}

function escapeHtml(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "<").replace(/>/g, ">");
}

// --- Sorting headers ---
function updateSort(key) {
  if (sortKey === key) sortOrder = sortOrder === "asc" ? "desc" : "asc";
  else { sortKey = key; sortOrder = "desc"; }
  sortData();
  renderTable();
  updateArrows();
}

function updateArrows() {
  document.querySelectorAll(".sort-arrow").forEach(el => el.textContent = "");
  const active = document.querySelector(`#${sortKey}-header .sort-arrow`) || document.querySelector(`#${sortKey}-col-header .sort-arrow`);
  if (active) active.textContent = sortOrder === "asc" ? "▲" : "▼";
  document.querySelectorAll("thead th").forEach(th => th.classList.remove("active"));
  const headerId = sortKey + (["views", "retweets", "comments"].includes(sortKey) ? "-col-header" : "-header");
  const headerEl = document.getElementById(headerId);
  if (headerEl) headerEl.classList.add("active");
}

// --- Pagination ---
document.getElementById("prev-page").onclick = () => { if (currentPage > 1) { currentPage--; renderTable(); } };
document.getElementById("next-page").onclick = () => {
  const total = Math.ceil(filterData().length / perPage);
  if (currentPage < total) { currentPage++; renderTable(); }
};

// --- Search ---
document.getElementById("search").addEventListener("input", () => { currentPage = 1; renderTable(); });

// --- Sorting headers click ---
["posts","likes","retweets","comments","views"].forEach(key => {
  const el = document.getElementById(key === "views" ? "views-col-header" : key+"-header");
  if(el) el.addEventListener("click", () => updateSort(key));
});

// --- Time filter ---
document.getElementById("time-select").addEventListener("change", e => {
  timeFilter = e.target.value || "all";
  currentPage = 1;
  normalizeData(rawData);
  sortData();
  renderTable();
  updateTotals();
});

// --- Отображение твитов при клике на пользователя ---
function showTweets(username) {
    const container = document.getElementById("tweets-list");
    const title = document.getElementById("tweets-title");
    container.innerHTML = "";

    const userTweets = allTweets.filter(tweet => {
        const candidate = (tweet.user && (tweet.user.screen_name || tweet.user.name)) || "";
        return candidate.toLowerCase().replace(/^@/, "") === username.toLowerCase().replace(/^@/, "");
    });

    title.textContent = `Посты пользователя: ${username}`;

    if(userTweets.length === 0) {
        container.innerHTML = "<li>У пользователя нет постов</li>";
        return;
    }

    userTweets.forEach(tweet => {
        const li = document.createElement("li");
        const content = tweet.text || tweet.content || "(no content)";
        const url = tweet.url || (tweet.id_str ? `https://twitter.com/${username}/status/${tweet.id_str}` : "#");
        li.innerHTML = `<a href="${url}" target="_blank">${escapeHtml(content)}</a>`;
        container.appendChild(li);
    });
}

// --- Добавляем обработчики клика на строки таблицы после рендера ---
function addUserClickHandlers() {
    const tbody = document.getElementById("leaderboard-body");
    tbody.querySelectorAll("tr").forEach(tr => {
        tr.addEventListener("click", () => {
            const usernameElement = tr.querySelector('td:first-child span'); // Находим span с именем
            if (usernameElement) {
                const username = usernameElement.textContent.trim();
                showTweets(username);
            }
        });
    });
}

// --- Обновляем renderTable, чтобы добавлять клики ---
function renderTable() {
    const tbody = document.getElementById("leaderboard-body");
    tbody.innerHTML = "";

    const filtered = filterData();
    const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
    if (currentPage > totalPages) currentPage = totalPages;
    const start = (currentPage - 1) * perPage;
    const pageData = filtered.slice(start, start + perPage);

    pageData.forEach(stats => {
        const name = stats.username || "";
        const tr = document.createElement("tr");
        // --- ИЗМЕНЕНО: Добавлена кнопка "Поделиться" ---
        tr.innerHTML = `
          <td>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span>${escapeHtml(name)}</span>
              <button class="share-btn" onclick="shareUserOnTwitter('${escapeHtml(name)}')" title="Share ${escapeHtml(name)} on Twitter">🐦</button>
            </div>
          </td>
          <td>${Number(stats.posts || 0)}</td>
          <td>${Number(stats.likes || 0)}</td>
          <td>${Number(stats.retweets || 0)}</td>
          <td>${Number(stats.comments || 0)}</td>
          <td>${Number(stats.views || 0)}</td>
        `;
        tbody.appendChild(tr);
    });

    document.getElementById("page-info").textContent = `Page ${currentPage} / ${totalPages}`;

    // Добавляем обработчики клика
    addUserClickHandlers();
}

// --- Создание аккордеона твитов ---
function toggleTweetsRow(tr, username) {
    // Если уже есть раскрытая строка под этим пользователем — удаляем её
    const nextRow = tr.nextElementSibling;
    if (nextRow && nextRow.classList.contains("tweets-row")) {
        nextRow.remove();
        return;
    }

    // Удаляем все остальные раскрытые строки
    document.querySelectorAll(".tweets-row").forEach(row => row.remove());

    // Создаем новую строку
    const tweetsRow = document.createElement("tr");
    tweetsRow.classList.add("tweets-row");
    const td = document.createElement("td");
    td.colSpan = 6; // охватывает все колонки таблицы
    td.style.background = "#f9f9f9";
    td.style.padding = "10px";

    const userTweets = allTweets.filter(tweet => {
        const candidate = (tweet.user && (tweet.user.screen_name || tweet.user.name)) || "";
        return candidate.toLowerCase().replace(/^@/, "") === username.toLowerCase().replace(/^@/, "");
    });

    if (userTweets.length === 0) {
        td.innerHTML = "<i>У пользователя нет постов</i>";
    } else {
        const ul = document.createElement("ul");
        ul.style.margin = "0";
        ul.style.padding = "0 0 0 20px";
        userTweets.forEach(tweet => {
            const li = document.createElement("li");
            const content = tweet.text || tweet.content || "(no content)";
            const url = tweet.url || (tweet.id_str ? `https://twitter.com/${username}/status/${tweet.id_str}` : "#");
            li.innerHTML = `<a href="${url}" target="_blank">${escapeHtml(content)}</a>`;
            ul.appendChild(li);
        });
        td.appendChild(ul);
    }

    tweetsRow.appendChild(td);
    tr.parentNode.insertBefore(tweetsRow, tr.nextElementSibling);
}

// --- Обновляем обработчики клика ---
function addUserClickHandlers() {
    const tbody = document.getElementById("leaderboard-body");
    tbody.querySelectorAll("tr").forEach(tr => {
        tr.addEventListener("click", () => {
            const usernameElement = tr.querySelector('td:first-child span'); // Находим span с именем
            if (usernameElement) {
                const username = usernameElement.textContent.trim();
                toggleTweetsRow(tr, username);
            }
        });
    });
}

// --- renderTable остаётся как раньше, addUserClickHandlers вызывается в конце ---

const player = document.getElementById('player');
const playBtn = document.getElementById('play-btn');
const nextBtn = document.getElementById('next-btn');


let isPlaying = false;

player.volume = 0.5; // стартовая громкость

if (playBtn) {
  playBtn.addEventListener('click', () => {
    if (isPlaying) {
      player.pause();
      playBtn.textContent = '▶️';
    } else {
      player.play().then(() => {
        playBtn.textContent = '⏸️';
      }).catch(err => console.log('Autoplay blocked:', err));
    }
    isPlaying = !isPlaying;
  });
}

if (nextBtn) {
  nextBtn.addEventListener('click', () => {
    player.currentTime = 0;
    player.play();
    if (playBtn) playBtn.textContent = '⏸️';
    isPlaying = true;
  });
}

// --- Tabs setup and Analytics rendering ---
function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      const lb = document.getElementById('leaderboard-wrapper');
      const an = document.getElementById('tab-analytics');
      if (tab === 'analytics') {
        if (lb) lb.style.display = 'none';
        if (an) an.style.display = 'block';
        renderAnalytics();
      } else {
        if (lb) lb.style.display = 'block';
        if (an) an.style.display = 'none';
      }
    });
  });
}

function renderAnalytics() {
  // Filter tweets by the selected analytics period
  let tweets = Array.isArray(allTweets) ? allTweets : [];
  const now = new Date();
  const period = analyticsPeriod;

  if (period !== 'all') {
    const days = Number(period);
    if (days > 0) {
      tweets = tweets.filter(t => {
        const created = t.tweet_created_at || t.created_at || t.created || null;
        if (!created) return false;
        const d = new Date(created);
        if (isNaN(d)) return false;
        const diffDays = (now - d) / (1000 * 60 * 60 * 24);
        return diffDays <= days;
      });
    }
  }

  // build per-user aggregates: posts, likes, views (from FILTERED tweets)
  const users = {}; // {uname: {posts, likes, views}}
  tweets.forEach(t => {
    const u = (t.user && (t.user.screen_name || t.user.name)) || t.username || "";
    const uname = String(u).toLowerCase().replace(/^@/, "");
    if (!uname) return;
    const likes = Number(t.favorite_count || t.likes || t.like_count || 0) || 0;
    const views = Number(t.views_count || t.views || 0) || 0;
    if (!users[uname]) users[uname] = { posts: 0, likes: 0, views: 0 };
    users[uname].posts += 1;
    users[uname].likes += likes;
    users[uname].views += views;
  });

  const uniqueUsers = Object.keys(users).length;
  const totalPosts = tweets.length;
  const totalLikes = Object.values(users).reduce((
