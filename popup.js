const DOM = {
  authenticate: document.getElementById("authenticate"),
  authenticateButton: document.getElementById("github-authenticate-button"),
  hookRepo: document.getElementById("hook-repo"),
  authenticated: document.getElementById("authenticated"),
  repoName: document.getElementById("repo-name"),
  repoNameError: document.getElementById("repo-name-error"),
  hookButton: document.getElementById("hook-button"),
  unlinkButton: document.getElementById("unlink-button"),
  repositoryName: document.getElementById("repository-name"),
  repositoryLink: document.getElementById("repository-link"),
  githubUsername: document.getElementById("github-username"),
  logoutButton: document.getElementById("logout-button"),
  changeAccountButton: document.getElementById("change-account-button"),
  checkboxCodeSubmitSetting: document.getElementById("submit-code-checkbox"),
  stats: {
    easy: document.getElementById("easy"),
    medium: document.getElementById("medium"),
    hard: document.getElementById("hard"),
  },
};

class PopupManager {
  constructor() {
    this.initializeEventListeners();
    this.initializeStats();
    this.initializeCodeSubmitSetting();
  }

  initializeCodeSubmitSetting() {
    chrome.storage.local.get("leetcode_scrapper_code_submit", (result) => {
      const codeSubmit = result.leetcode_scrapper_code_submit;
      DOM.checkboxCodeSubmitSetting.checked = codeSubmit;
    });
  }

  toggleCodeSubmitSetting() {
    chrome.storage.local.get("leetcode_scrapper_code_submit", (result) => {
      const codeSubmit = result.leetcode_scrapper_code_submit;
      chrome.storage.local.set({
        leetcode_scrapper_code_submit: !codeSubmit,
      });
    });
  }

  initializeEventListeners() {
    document.addEventListener("DOMContentLoaded", this.setupLinks.bind(this));
    DOM.authenticateButton.addEventListener(
      "click",
      this.handleAuthentication.bind(this)
    );
    DOM.hookButton.addEventListener("click", this.handleHookRepo.bind(this));
    DOM.unlinkButton.addEventListener("click", this.unlinkRepo.bind(this));
    DOM.logoutButton.addEventListener("click", this.logout.bind(this));
    DOM.changeAccountButton.addEventListener("click", this.logout.bind(this));
    DOM.checkboxCodeSubmitSetting.addEventListener(
      "click",
      this.toggleCodeSubmitSetting.bind(this)
    );

    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === "statsUpdate") {
        this.updateStatsDisplay(message.data);
      }
    });
  }

  setupLinks() {
    document.querySelectorAll("a.link").forEach((link) => {
      link.onclick = () => chrome.tabs.create({ active: true, url: link.href });
    });
  }

  async checkAuthStatus() {
    const result = await chrome.storage.local.get([
      "leetcode_scrapper_token",
      "leetcode_scrapper_username",
      "leetcode_scrapper_mode",
      "leetcode_scrapper_repo",
    ]);

    if (!result.leetcode_scrapper_token || !result.leetcode_scrapper_username) {
      DOM.authenticate.style.display = "block";
    } else if (
      !result.leetcode_scrapper_repo ||
      !result.leetcode_scrapper_mode
    ) {
      DOM.hookRepo.style.display = "block";
    } else {
      DOM.authenticated.style.display = "block";
    }

    this.updateUserInfos();
  }

  async logout() {
    try {
      await chrome.storage.local.clear();

      DOM.authenticate.style.display = "block";
      DOM.hookRepo.style.display = "none";
      DOM.authenticated.style.display = "none";
    } catch (error) {
      console.error("Error logging out:", error);
    }
  }

  async updateUserInfos() {
    const { leetcode_scrapper_repo, leetcode_scrapper_username } =
      await chrome.storage.local.get([
        "leetcode_scrapper_repo",
        "leetcode_scrapper_username",
      ]);
    if (leetcode_scrapper_repo) {
      DOM.repositoryName.textContent = leetcode_scrapper_repo;
    }
    if (leetcode_scrapper_username) {
      DOM.githubUsername.textContent = leetcode_scrapper_username;
    }
    if (leetcode_scrapper_username && leetcode_scrapper_repo) {
      DOM.repositoryLink.href = `https://github.com/${leetcode_scrapper_username}/${leetcode_scrapper_repo}`;
    }
  }

  async initializeStats() {
    try {
      const initialStats = await this.getInitialStats();
      if (initialStats) {
        this.updateStatsDisplay(initialStats);
      }
    } catch (error) {
      console.error("Error getting initial stats:", error);
    }
  }

  getInitialStats() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: "requestInitialStats" },
        (response) => {
          resolve(response);
        }
      );
    });
  }

  updateStatsDisplay(stats) {
    if (!stats) return;

    Object.keys(DOM.stats).forEach((key) => {
      if (DOM.stats[key]) {
        DOM.stats[key].textContent = stats[key] || 0;
      }
    });
  }

  async handleAuthentication() {
    try {
      const data = await chrome.runtime.sendMessage({ type: "getDataConfig" });
      const url = `${data.URL}?client_id=${data.CLIENT_ID}&redirect_uri${
        data.REDIRECT_URL
      }&scope=${data.SCOPES.join(" ")}`;
      chrome.tabs.create({ url, active: true });
    } catch (error) {
      console.error("Authentication error:", error);
    }
  }

  async handleHookRepo() {
    const repositoryName = DOM.repoName.value;
    DOM.repoNameError.textContent = "";

    if (!repositoryName) {
      DOM.repoNameError.textContent = "Please enter a repository name";
      return;
    }

    try {
      const result = await chrome.storage.local.get([
        "leetcode_scrapper_token",
        "leetcode_scrapper_username",
      ]);

      if (result) {
        await this.linkRepo(result, repositoryName);
      }
    } catch (error) {
      console.error("Error linking repository:", error);
      DOM.repoNameError.textContent =
        "An error occurred while linking the repository";
    }
  }

  async linkRepo(githubAuthData, repositoryName) {
    const { leetcode_scrapper_token, leetcode_scrapper_username } =
      githubAuthData;
    const dataConfig = await chrome.runtime.sendMessage({
      type: "getDataConfig",
    });

    try {
      const response = await fetch(
        `${dataConfig.REPOSITORY_URL}${leetcode_scrapper_username}/${repositoryName}`,
        {
          method: "GET",
          headers: {
            ...dataConfig.HEADERS,
            Authorization: `token ${leetcode_scrapper_token}`,
          },
        }
      );

      const result = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          this.logout();
        }

        throw new Error(result.message);
      }

      await chrome.storage.local.set({
        leetcode_scrapper_mode: "commit",
        leetcode_scrapper_repo: repositoryName,
      });

      DOM.hookRepo.style.display = "none";
      DOM.authenticated.style.display = "block";
    } catch (error) {
      DOM.repoNameError.textContent = error.message;
    }
  }

  async unlinkRepo() {
    try {
      await chrome.storage.local.remove([
        "leetcode_scrapper_mode",
        "leetcode_scrapper_repo",
      ]);
      DOM.authenticated.style.display = "none";
      DOM.hookRepo.style.display = "block";
    } catch (error) {
      console.error("Error unlinking repository:", error);
    }
  }
}

const popupManager = new PopupManager();
popupManager.checkAuthStatus();
