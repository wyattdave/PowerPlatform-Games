/* ====================================================
   site-engine.js – Loads games from GAMELIST.md + README.md
   Works entirely from deployed files (no GitHub API).
   ==================================================== */

const SiteEngine = (() => {
    // ── cache ──
    let _games = null;
    let _categories = null;

    // ── paths ──
    const GAMELIST_PATH = 'GAMELIST.md';
    const CATEGORIES_PATH = 'CATEGORIES.md';

    // ── helpers ──

    /**
     * Fetch a text file, return its content (empty string on 404).
     */
    async function fetchText(url) {
        try {
            const r = await fetch(url);
            if (!r.ok) return '';
            return await r.text();
        } catch {
            return '';
        }
    }

    /**
     * Parse GAMELIST.md into an array of game objects.
     * Expected columns:
     * | Name | Type | Category | Premium | Grading | Author | Folder |
     */
    function parseGameList(md) {
        const lines = md.trim().split('\n').filter(l => l.trim().startsWith('|'));
        if (lines.length < 3) return [];           // header + separator + at least 1 row
        const dataRows = lines.slice(2);            // skip header + dashes
        return dataRows.map(row => {
            const cols = row.split('|').map(c => c.trim()).filter(Boolean);
            if (cols.length < 7) return null;
            return {
                name:     cols[0],
                type:     cols[1],
                category: cols[2],
                premium:  cols[3],
                grading:  cols[4],
                author:   cols[5],
                folder:   cols[6]
            };
        }).filter(Boolean);
    }

    /**
     * Parse a game README.md into structured sections.
     */
    function parseReadme(md) {
        const data = {};
        let currentKey = null;
        let currentValue = [];

        md.split('\n').forEach(line => {
            const heading = line.match(/^##\s+(.+)/);
            if (heading) {
                if (currentKey) {
                    data[currentKey] = currentValue.join('\n').trim();
                }
                currentKey = heading[1].trim().toLowerCase().replace(/\s+/g, '_');
                currentValue = [];
            } else if (line.match(/^#\s+(.+)/)) {
                // top-level heading = game title
                data.title = line.replace(/^#\s+/, '').trim();
            } else if (currentKey) {
                currentValue.push(line);
            }
        });
        if (currentKey) {
            data[currentKey] = currentValue.join('\n').trim();
        }
        return data;
    }

    /**
     * Parse CATEGORIES.md into structured data.
     */
    function parseCategoriesFile(md) {
        const sections = {};
        let currentSection = null;
        let headers = [];
        let rows = [];

        md.split('\n').forEach(line => {
            const heading = line.match(/^#\s+(.+)/);
            if (heading) {
                if (currentSection && rows.length) {
                    sections[currentSection] = { headers, rows };
                }
                currentSection = heading[1].trim();
                headers = [];
                rows = [];
                return;
            }
            if (!currentSection) return;

            if (line.trim().startsWith('|')) {
                const cells = line.split('|').map(c => c.trim()).filter(Boolean);
                if (line.includes('---')) return; // separator
                if (!headers.length) {
                    headers = cells;
                } else {
                    rows.push(cells);
                }
            }
        });
        if (currentSection && rows.length) {
            sections[currentSection] = { headers, rows };
        }
        return sections;
    }

    // ── public API ──

    /**
     * Load and cache full game list (with README data).
     */
    async function loadGames() {
        if (_games) return _games;

        const listMd = await fetchText(GAMELIST_PATH);
        const games = parseGameList(listMd);

        // Load each game's README in parallel
        const readmePromises = games.map(async (game) => {
            const readmePath = `${game.folder}/README.md`;
            const md = await fetchText(readmePath);
            game.readme = parseReadme(md);
            // Derive slug for linking
            game.slug = game.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
            return game;
        });

        _games = await Promise.all(readmePromises);
        return _games;
    }

    /**
     * Load and cache categories data.
     */
    async function loadCategories() {
        if (_categories) return _categories;
        const md = await fetchText(CATEGORIES_PATH);
        _categories = parseCategoriesFile(md);
        return _categories;
    }

    /**
     * Get the 6 most recent games (ordered as they appear last in GAMELIST.md = newest first).
     */
    async function getRecentGames(count = 6) {
        const games = await loadGames();
        // GAMELIST.md is ordered newest first
        return games.slice(0, count);
    }

    /**
     * Filter games by criteria.
     */
    async function filterGames({ type, category, grading, author } = {}) {
        const games = await loadGames();
        return games.filter(g => {
            if (type     && type !== 'All'     && g.type !== type) return false;
            if (category && category !== 'All' && g.category !== category) return false;
            if (grading  && grading !== 'All'  && g.grading !== grading) return false;
            if (author   && author !== 'All'   && g.author !== author) return false;
            return true;
        });
    }

    /**
     * Get a game by its slug.
     */
    async function getGameBySlug(slug) {
        const games = await loadGames();
        return games.find(g => g.slug === slug) || null;
    }

    /**
     * Get unique values for a field.
     */
    async function getDistinct(field) {
        const games = await loadGames();
        return [...new Set(games.map(g => g[field]).filter(Boolean))];
    }

    /**
     * Get icon for a game based on its name.
     */
    function getGameIcon(name) {
        const icons = {
            'Flappy App':    '🐦',
            '404 Not Found': '❓',
            'Canyon Escape': '🏜️',
            'Wordle':        '📝',
            'Game of Life':  '🧬',
            'Snake':         '🐍',
            'Bop It':        '👊'
        };
        return icons[name] || '🎮';
    }

    /**
     * Build the screenshot URL for a game.
     */
    function getScreenshotUrl(game) {
        if (!game.readme || !game.readme.screenshot) return '';
        const screenshot = game.readme.screenshot.trim();
        return `${game.folder}/${screenshot}`;
    }

    /**
     * Build the download URL for a game's zip.
     */
    function getDownloadUrl(game) {
        console.log(game);
        if (!game.readme || !game.readme.solution_name) return '';
        const solution = game.readme.solution_name.trim();
        return `${game.folder}/${solution}`;
    }

    /**
     * Render the nav bar into an element.
     */
    function renderNav(container, activePage) {
        container.innerHTML = `
            <a href="index.html" class="nav-logo">POWER PLATFORM GAMES</a>
            <button class="nav-hamburger" onclick="document.querySelector('.nav-links').classList.toggle('open')">MENU</button>
            <ul class="nav-links">
                <li><a href="index.html" class="${activePage === 'home' ? 'active' : ''}">HOME</a></li>
                <li><a href="games.html" class="${activePage === 'games' ? 'active' : ''}">ALL GAMES</a></li>
                <li><a href="categories.html" class="${activePage === 'categories' ? 'active' : ''}">CATEGORIES</a></li>
                <li><a href="contribute.html" class="${activePage === 'contribute' ? 'active' : ''}">CONTRIBUTE</a></li>
            </ul>
        `;
    }

    /**
     * Render the footer into an element.
     */
    function renderFooter(container) {
        container.innerHTML = `
            <p class="footer-copyright">Copyright &copy; 2026. All Rights Reserved.</p>
            <div class="footer-links">
                <a href="https://github.com/wyattdave" target="_blank">WyattDave</a>
                <a href="https://x.com/WyattDaveDev" target="_blank">WyattDaveDev</a>
                <a href="https://dev.to/wyattdave" target="_blank">LowCodeDev</a>
            </div>
        `;
    }

    /**
     * Create a game card HTML element.
     */
    function createGameCard(game) {
        const card = document.createElement('a');
        card.className = 'game-card';
        card.href = `game.html?game=${encodeURIComponent(game.slug)}`;

        const screenshotUrl = getScreenshotUrl(game);
        const imgHtml = screenshotUrl
            ? `<img class="game-card-img" src="${screenshotUrl}" alt="${game.name}" onerror="this.style.display='none';this.nextElementSibling.style.display='block'">`
            + `<span class="game-card-icon" style="display:none">${getGameIcon(game.name)}</span>`
            : `<span class="game-card-icon">${getGameIcon(game.name)}</span>`;

        const premiumBadge = game.premium === 'Yes'
            ? `<span class="game-card-premium">PREMIUM</span>`
            : '';

        card.innerHTML = `
            ${premiumBadge}
            ${imgHtml}
            <h3 class="game-card-title">${game.name.toUpperCase()}</h3>
            <span class="game-card-category">${game.category.toUpperCase()}</span>
            <span class="game-card-category">${game.grading.toUpperCase()}</span>
            <p class="game-card-type">${game.type}</p>
        `;
        return card;
    }

    return {
        loadGames,
        loadCategories,
        getRecentGames,
        filterGames,
        getGameBySlug,
        getDistinct,
        getGameIcon,
        getScreenshotUrl,
        getDownloadUrl,
        renderNav,
        renderFooter,
        createGameCard,
        parseReadme
    };
})();
