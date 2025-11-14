// === ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ===
let rawData = []; // Хранит нефильтрованные данные из leaderboard.json
let data = [];    // Хранит отфильтрованные данные для отображения
let allTweets = []; // Хранит все твиты из all_tweets.json (для фильтрации и графика)
let sortKey = "posts";
let sortOrder = "desc";
let currentPage = 1;
const perPage = 15;
let timeFilter = "all";
let analyticsChart = null; // Для хранения экземпляра Chart.js

// --- Fetch leaderboard data ---
async function fetchData() {
  try {
    const response = await fetch("leaderboard.json");
    const json = await response.json();
    rawData = json; // Сохраняем raw данные
    // Обновляем отображение, используя allTweets для фильтрации
    normalizeDataFromTweets();
    sortData();
    renderTable();
    updateArrows();
    updateTotals();
  } catch (err) {
    console.error("Failed to fetch leaderboard:", err);
  }
}

// --- Fetch all tweets (для фильтрации и графика) ---
async function fetchTweets() {
  try {
    const response = await fetch("all_tweets.json");
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
    // После загрузки твитов, обновляем отображение
    normalizeDataFromTweets();
    sortData();
    renderTable();
    updateArrows();
    updateTotals();
    // И строим график
    renderAnalyticsChart();
  } catch (err) {
    console.error("Failed to fetch all tweets:", err);
    allTweets = [];
  }
}

// --- Render Chart (аналогично rialo-club-leaderboard.xyz) ---
function renderAnalyticsChart() {
    const ctx = document.getElementById('analytics-chart').getContext('2d');

    // Уничтожаем предыдущий экземпляр Chart, если он существует
    if (analyticsChart) {
        analyticsChart.destroy();
    }

    // Подготовим данные для графика на основе allTweets
    // Фильтруем по выбранному периоду (аналогично фильтрации таблицы)
    const now = new Date();
    const period = document.getElementById('time-select').value; // Используем текущий фильтр времени
    let tweetsForChart = allTweets;

    if (period !== 'all') {
        const days = Number(period);
        if (days > 0) {
            tweetsForChart = allTweets.filter(t => {
                const created = t.tweet_created_at || t.created_at || t.created || null;
                if (!created) return false;
                const d = new Date(created);
                if (isNaN(d)) return false;
                const diffDays = (now - d) / (1000 * 60 * 60 * 24);
                return diffDays <= days;
            });
        }
    }

    // Собираем статистику по дням (как в renderAnalytics на rialo-club)
    const perDay = {}; // key YYYY-MM-DD -> count
    tweetsForChart.forEach(t => {
        const created = t.tweet_created_at || t.created_at || t.created || null;
        if (!created) return;
        const d = new Date(created);
        if (isNaN(d)) return;
        const key = d.toISOString().slice(0,10); // Формат YYYY-MM-DD
        perDay[key] = (perDay[key] || 0) + 1;
    });

    // Подготовим метки и данные для Chart.js
    // Используем диапазон от выбранного периода
    const chartDays = period === 'all' ? 60 : (period === '7' ? 7 : (period === '14' ? 14 : (period === '30' ? 30 : 60)));
    const labels = [];
    const counts = [];
    for (let i = chartDays - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(now.getDate() - i);
        const key = d.toISOString().slice(0,10);
        labels.push(key);
        counts.push(perDay[key] || 0);
    }

    analyticsChart = new Chart(ctx, {
        type: 'bar',
         {
            labels: labels,
            datasets: [{
                label: 'Tweets per day',
                backgroundColor: 'rgba(75, 200, 160, 0.8)', // Можно изменить цвет
                borderColor: 'rgba(75, 200, 160, 1)',
                 counts
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false, // Позволяет canvas занимать всю высоту контейнера
            plugins: {
                legend: {
                    display: false // Скрыть легенду
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `Posts: ${context.raw}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Number of Posts'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Date'
                    },
                    maxTicksLimit: 15, // Ограничивает количество подписей по оси X
                    ticks: {
                        autoSkip: true, // Автоматически пропускать метки, если их слишком много
                        maxRotation: 45,
                        minRotation: 45
                    }
                }
            }
        }
    });
}


// стартовые загрузки
fetchTweets().then(() => fetchData()); // Сначала загружаем твиты, потом leaderboard
setInterval(() => {
  fetchTweets(); // Обновляем твиты, leaderboard и график
  fetchData();   // fetchData вызывает renderAnalyticsChart внутри себя
}, 3600000); // обновлять каждый час

// --- Normalize leaderboard data based on allTweets (аналогично rialo-club-leaderboard.xyz) ---
function normalizeDataFromTweets() {
    // Очищаем текущую data
    data = [];

    // Используем allTweets для пересчёта статистики
    const now = new Date();
    const period = timeFilter;
    let filteredTweets = allTweets;

    // Фильтруем твиты по времени
    if (period !== 'all') {
        const days = Number(period);
        if (days > 0) {
            filteredTweets = allTweets.filter(t => {
                const created = t.tweet_created_at || t.created_at || t.created || null;
                if (!created) return false;
                const d = new Date(created);
                if (isNaN(d)) return false;
                const diffDays = (now - d) / (1000 * 60 * 60 * 24);
                return diffDays <= days;
            });
        }
    }

    // Собираем агрегированные данные по пользователям из отфильтрованных твитов
    const userStats = {};
    filteredTweets.forEach(t => {
        const u = (t.user && (t.user.screen_name || t.user.name)) || t.username || "";
        const uname = String(u).toLowerCase().replace(/^@/, "");
        if (!uname) return;
        const likes = Number(t.favorite_count || t.likes || t.like_count || 0) || 0;
        const views = Number(t.views_count || t.views || 0) || 0;
        if (!userStats[uname]) userStats[uname] = { posts: 0, likes: 0, views: 0, retweets: 0, comments: 0 };
        userStats[uname].posts += 1;
        userStats[uname].likes += likes;
        userStats[uname].views += views;
        userStats[uname].retweets += Number(t.retweet_count || 0) || 0;
        userStats[uname].comments += Number(t.reply_count || 0) || 0;
    });

    // Преобразуем в формат, подходящий для таблицы (массив объектов)
    data = Object.entries(userStats).map(([name, stats]) => ({
        username: name,
        posts: stats.posts,
        likes: stats.likes,
        retweets: stats.retweets,
        comments: stats.comments,
        views: stats.views
    }));
}

// --- Update totals based on current data ---
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
    tr.innerHTML = `
      <td>${escapeHtml(name)}</td>
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

// --- Time filter (новая логика: пересчитывает данные на основе allTweets) ---
document.getElementById("time-select").addEventListener("change", e => {
  timeFilter = e.target.value || "all";
  currentPage = 1;
  // Пересчитываем данные на основе allTweets и выбранного фильтра
  normalizeDataFromTweets();
  sortData();
  renderTable();
  updateTotals();
  // Обновляем график
  if (analyticsChart) {
      renderAnalyticsChart(); // Перестраиваем график с новым фильтром
  }
});

// --- Добавляем обработчики клика на строки таблицы после рендера ---
function addUserClickHandlers() {
    const tbody = document.getElementById("leaderboard-body");
    tbody.querySelectorAll("tr").forEach(tr => {
        tr.addEventListener("click", () => {
            const username = tr.children[0].textContent.trim();
            toggleTweetsRow(tr, username);
        });
    });
}

function toggleTweetsRow(tr, username) {
  const nextRow = tr.nextElementSibling;
  const isAlreadyOpen = nextRow && nextRow.classList.contains("tweets-row") &&
                        nextRow.dataset.username === username;

  document.querySelectorAll(".tweets-row").forEach(row => row.remove());
  document.querySelectorAll("tbody tr").forEach(row => row.classList.remove("active-row"));

  if (isAlreadyOpen) return;

  tr.classList.add("active-row");

  const tweetsRow = document.createElement("tr");
  tweetsRow.classList.add("tweets-row");
  tweetsRow.dataset.username = username;
  const td = document.createElement("td");
  td.colSpan = 6;

  const userTweets = allTweets.filter(tweet => {
    const candidate = (tweet.user?.screen_name || tweet.user?.name || "").toLowerCase();
    return candidate.replace(/^@/, "") === username.toLowerCase().replace(/^@/, "");
  });

  if (userTweets.length === 0) {
    td.innerHTML = "<i style='color:#aaa;'>User has no posts</i>";
  } else {
    const container = document.createElement("div");
    container.classList.add("tweet-container");

    userTweets.forEach(tweet => {
      const content = tweet.full_text || tweet.text || tweet.content || "";
      const url = tweet.url || (tweet.id_str ? `https://twitter.com/${username}/status/${tweet.id_str}` : "#");
      let dateRaw = tweet.created_at || tweet.tweet_created_at || "";
      let date = "";
      if (dateRaw) {
        const parsed = new Date(dateRaw);
        date = !isNaN(parsed)
          ? parsed.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
          : dateRaw.split(" ")[0];
      }
      const mediaList = tweet.extended_entities?.media || tweet.entities?.media || tweet.media || [];
      const uniqueMediaUrls = [...new Set(mediaList.map(m => m.media_url_https || m.media_url).filter(Boolean))];
      let imgTag = uniqueMediaUrls.map(url => `<img src="${url}">`).join("");
      if (!imgTag) {
        const match = content.match(/https?:\/\/\S+\.(jpg|jpeg|png|gif|webp)/i);
        if (match) imgTag = `<img src="${match[0]}">`;
      }
      const card = document.createElement("div");
      card.classList.add("tweet-card");
      const wordCount = content.trim().split(/\s+/).length;
      if (wordCount <= 3 && !imgTag) card.classList.add("short");
      card.innerHTML = `
        <a href="${url}" target="_blank" style="text-decoration:none; color:inherit;">
          <p>${escapeHtml(content)}</p>
          ${imgTag}
          <div class="tweet-date">${date}</div>
        </a>
      `;
      container.appendChild(card);
    });
    td.appendChild(container);
  }
  tweetsRow.appendChild(td);
  tr.parentNode.insertBefore(tweetsRow, tr.nextElementSibling);
}
