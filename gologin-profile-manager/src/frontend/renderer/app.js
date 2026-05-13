/**
 * GoLogin Profile Manager - Frontend Application
 */

// State
let profiles = [];
let isLoading = false;
let pollInterval = null;
let logPollInterval = null;
let lastLogTimestamp = null;
let selectedProfiles = new Set(); // Track selected profiles
let searchQuery = ''; // Search query
let tagFilter = ''; // Tag filter
let allTags = []; // All available tags
let piaCountries = []; // PIA Proxy countries
let settingsTags = []; // Tags from settings

// DOM Elements
const profileList = document.getElementById('profile-list');
const loading = document.getElementById('loading');
const emptyState = document.getElementById('empty-state');
const runningCount = document.getElementById('running-count');
const lastUpdated = document.getElementById('last-updated');

// Log Elements
const logContainer = document.getElementById('log-container');
const logPanel = document.querySelector('.log-panel');
const btnClearLogs = document.getElementById('btn-clear-logs');
const btnToggleLogs = document.getElementById('btn-toggle-logs');

// Buttons
const btnCreateProfile = document.getElementById('btn-create-profile');
const btnRefresh = document.getElementById('btn-refresh');

// Search elements
const searchInput = document.getElementById('search-input');
const btnClearSearch = document.getElementById('btn-clear-search');

// Tag filter element
const tagFilterSelect = document.getElementById('tag-filter');

// Bulk action elements
const bulkActions = document.getElementById('bulk-actions');
const selectedCount = document.getElementById('selected-count');
const selectAllCheckbox = document.getElementById('select-all');
const btnBulkRun = document.getElementById('btn-bulk-run');
const btnBulkStop = document.getElementById('btn-bulk-stop');
const btnBulkDelete = document.getElementById('btn-bulk-delete');
const btnClearSelection = document.getElementById('btn-clear-selection');

// Modals
const modalCreate = document.getElementById('modal-create');
const modalProxy = document.getElementById('modal-proxy');
const modalBulkCreate = document.getElementById('modal-bulk-create');

// Forms
const formCreateProfile = document.getElementById('form-create-profile');
const formProxyConfig = document.getElementById('form-proxy-config');
const formBulkCreate = document.getElementById('form-bulk-create');

// Proxy fields container
const proxyFields = document.getElementById('proxy-fields');
const proxyMode = document.getElementById('proxy-mode');
const piaFields = document.getElementById('pia-fields');
const piaCountrySelect = document.getElementById('pia-country');

// Create profile PIA fields
const createPiaFields = document.getElementById('create-pia-fields');
const createPiaCountrySelect = document.getElementById('create-pia-country');

// Settings elements
const settingsNewTag = document.getElementById('settings-new-tag');
const btnAddTag = document.getElementById('btn-add-tag');
const settingsTagList = document.getElementById('settings-tag-list');

// Tab elements
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

/**
 * Initialize application
 */
document.addEventListener('DOMContentLoaded', async () => {
  console.log('[App] Initializing...');

  await loadProfiles();
  await loadPiaCountries();
  await loadSettings();
  setupEventListeners();
  setupLogPanel();
  setupTabs();
  startPolling();
  startLogPolling();

  addLog('info', 'Application initialized');
  console.log('[App] Initialized');
});

/**
 * Load profiles from API
 */
async function loadProfiles() {
  if (isLoading) return;

  isLoading = true;
  showLoading(true);

  try {
    const response = await window.api.profiles.list();

    if (response.success) {
      profiles = response.data;
      renderProfileList();
      updateRunningCount();
      updateLastUpdated();
      await loadAllTags();
    } else {
      showToast('Failed to load profiles', 'error');
    }
  } catch (error) {
    console.error('[App] Load profiles error:', error);
    showToast('Failed to connect to server', 'error');
  } finally {
    isLoading = false;
    showLoading(false);
  }
}

/**
 * Load all tags from API
 */
async function loadAllTags() {
  try {
    const response = await window.api.tags.getAll();
    if (response.success) {
      allTags = response.data || [];
      updateTagFilterOptions();
    }
  } catch (error) {
    console.error('[App] Load tags error:', error);
  }
}

/**
 * Update tag filter dropdown options
 */
function updateTagFilterOptions() {
  const currentValue = tagFilterSelect.value;
  tagFilterSelect.innerHTML = '<option value="">All Tags</option>';

  allTags.forEach(tag => {
    const option = document.createElement('option');
    option.value = tag;
    option.textContent = tag;
    tagFilterSelect.appendChild(option);
  });

  // Restore previous selection if still valid
  if (currentValue && allTags.includes(currentValue)) {
    tagFilterSelect.value = currentValue;
  }
}

/**
 * Load PIA countries from API
 */
async function loadPiaCountries() {
  try {
    const response = await window.api.pia.getCountries();
    if (response.success) {
      piaCountries = response.data || [];
      updatePiaCountryOptions();
    }
  } catch (error) {
    console.error('[App] Load PIA countries error:', error);
  }
}

/**
 * Update PIA country dropdown options
 */
function updatePiaCountryOptions() {
  // Update proxy modal country select
  if (piaCountrySelect) {
    piaCountrySelect.innerHTML = '<option value="">Select Country</option>';
    piaCountries.forEach(country => {
      const option = document.createElement('option');
      option.value = country.code;
      option.textContent = `${country.name} (${country.code})`;
      piaCountrySelect.appendChild(option);
    });
  }

  // Update create profile country select
  if (createPiaCountrySelect) {
    createPiaCountrySelect.innerHTML = '<option value="">Select Country</option>';
    piaCountries.forEach(country => {
      const option = document.createElement('option');
      option.value = country.code;
      option.textContent = `${country.name} (${country.code})`;
      createPiaCountrySelect.appendChild(option);
    });
  }
}

/**
 * Render profile list
 */
function renderProfileList() {
  // Clear list
  profileList.innerHTML = '';

  if (profiles.length === 0) {
    emptyState.style.display = 'block';
    return;
  }

  emptyState.style.display = 'none';

  // Filter by search query
  let filteredProfiles = profiles;
  if (searchQuery.trim()) {
    const query = searchQuery.toLowerCase().trim();
    filteredProfiles = profiles.filter(p => {
      const name = (p.name || p.profileId).toLowerCase();
      const id = p.profileId.toLowerCase();
      return name.includes(query) || id.includes(query);
    });
  }

  // Filter by tag
  if (tagFilter) {
    filteredProfiles = filteredProfiles.filter(p => {
      return p.tags && Array.isArray(p.tags) && p.tags.includes(tagFilter);
    });
  }

  // Show message if no results
  if (filteredProfiles.length === 0) {
    const filterMsg = tagFilter ? ` with tag "${escapeHtml(tagFilter)}"` : '';
    const searchMsg = searchQuery ? ` matching "${escapeHtml(searchQuery)}"` : '';
    profileList.innerHTML = `
      <div class="empty-state">
        <p>No profiles found${searchMsg}${filterMsg}</p>
      </div>
    `;
    return;
  }

  // Sort by name only (không đưa running lên đầu)
  const sortedProfiles = [...filteredProfiles].sort((a, b) => {
    return (a.name || a.profileId).localeCompare(b.name || b.profileId);
  });

  // Render với số thứ tự
  sortedProfiles.forEach((profile, index) => {
    const card = createProfileCard(profile, index + 1);
    profileList.appendChild(card);
  });
}

/**
 * Create profile card element
 */
function createProfileCard(profile, stt) {
  const card = document.createElement('div');
  card.className = 'profile-card';
  card.dataset.id = profile.profileId;

  // Format proxy text
  let proxyText = 'No proxy';
  if (profile.proxy && profile.proxy.mode !== 'none') {
    if (profile.proxy.mode === 'pia' && profile.proxy.piaPort) {
      proxyText = `127.0.0.1:${profile.proxy.piaPort}`;
    } else if (profile.proxy.host && profile.proxy.port) {
      // Format: IP:PORT:USER:PASS hoặc IP:PORT nếu không có credentials
      if (profile.proxy.username && profile.proxy.password) {
        proxyText = `${profile.proxy.host}:${profile.proxy.port}:${profile.proxy.username}:${profile.proxy.password}`;
      } else {
        proxyText = `${profile.proxy.host}:${profile.proxy.port}`;
      }
    }
  }

  const isRunning = profile.status === 'running';
  const isSelected = selectedProfiles.has(profile.profileId);

  // Format dates
  const createdAt = profile.createdAt ? formatDateTime(profile.createdAt) : '-';
  const lastUsedAt = profile.lastUsedAt ? formatDateTime(profile.lastUsedAt) : '-';

  // Render tags
  const tags = profile.tags && Array.isArray(profile.tags) ? profile.tags : [];
  const tagsHtml = renderTagsHtml(profile.profileId, tags);

  card.innerHTML = `
    <div class="col-checkbox">
      <input type="checkbox" class="profile-checkbox" data-id="${profile.profileId}" ${isSelected ? 'checked' : ''}>
    </div>
    <div class="col-stt">
      <span class="stt-number">${stt}</span>
    </div>
    <div class="col-status">
      <span class="status-indicator ${profile.status}">${profile.status}</span>
    </div>
    <div class="col-name editable-cell" data-id="${profile.profileId}">
      <span class="profile-name" data-id="${profile.profileId}">${escapeHtml(profile.name || profile.profileId)}</span>
      <span class="edit-icon" data-id="${profile.profileId}" data-field="name" title="Edit name">&#9998;</span>
    </div>
    <div class="col-tags editable-cell" data-id="${profile.profileId}">
      ${tagsHtml}
      <span class="edit-icon" data-id="${profile.profileId}" data-field="tags" title="Edit tags">&#9998;</span>
    </div>
    <div class="col-id">
      <span class="profile-id">${profile.profileId}</span>
    </div>
    <div class="col-proxy editable-cell" data-id="${profile.profileId}">
      <span class="profile-proxy ${!profile.proxy || profile.proxy.mode === 'none' ? 'no-proxy' : ''}">${escapeHtml(proxyText)}</span>
      <span class="edit-icon" data-id="${profile.profileId}" data-field="proxy" title="Edit proxy">&#9998;</span>
    </div>
    <div class="col-created">
      <span class="profile-date">${createdAt}</span>
    </div>
    <div class="col-lastused">
      <span class="profile-date">${lastUsedAt}</span>
    </div>
    <div class="col-actions profile-actions">
      ${isRunning
        ? `<button class="btn btn-danger btn-sm btn-stop" data-id="${profile.profileId}">Stop</button>`
        : `<button class="btn btn-success btn-sm btn-start" data-id="${profile.profileId}">Run</button>`
      }
      <button class="btn btn-secondary btn-sm btn-proxy" data-id="${profile.profileId}">Proxy</button>
      <button class="btn btn-danger btn-sm btn-delete" data-id="${profile.profileId}" ${isRunning ? 'disabled' : ''}>Delete</button>
    </div>
  `;

  return card;
}

/**
 * Render tags HTML for a profile
 */
function renderTagsHtml(profileId, tags) {
  let html = '<div class="profile-tags">';

  if (tags.length > 0) {
    tags.forEach(tag => {
      html += `
        <span class="tag-pill" data-id="${profileId}" data-tag="${escapeHtml(tag)}">
          ${escapeHtml(tag)}
          <span class="tag-remove" data-id="${profileId}" data-tag="${escapeHtml(tag)}">&times;</span>
        </span>
      `;
    });
  }

  // Add tag button
  html += `<button class="add-tag-btn" data-id="${profileId}" title="Add tag">+</button>`;
  html += '</div>';

  return html;
}

/**
 * Format date time for display
 */
function formatDateTime(isoString) {
  try {
    const date = new Date(isoString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  } catch (e) {
    return '-';
  }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  // Create profile button
  btnCreateProfile.addEventListener('click', () => openModal(modalCreate));

  // Refresh button
  btnRefresh.addEventListener('click', () => loadProfiles());

  // Modal close buttons
  document.getElementById('btn-close-create').addEventListener('click', () => closeModal(modalCreate));
  document.getElementById('btn-cancel-create').addEventListener('click', () => closeModal(modalCreate));
  document.getElementById('btn-close-proxy').addEventListener('click', () => closeModal(modalProxy));
  document.getElementById('btn-cancel-proxy').addEventListener('click', () => closeModal(modalProxy));
  document.getElementById('btn-close-bulk-create').addEventListener('click', () => closeModal(modalBulkCreate));
  document.getElementById('btn-cancel-bulk-create').addEventListener('click', () => closeModal(modalBulkCreate));

  // Tags modal
  const modalTags = document.getElementById('modal-tags');
  document.getElementById('btn-close-tags').addEventListener('click', () => closeModal(modalTags));
  document.getElementById('btn-cancel-tags').addEventListener('click', () => closeModal(modalTags));
  modalTags.querySelector('.modal-overlay').addEventListener('click', () => closeModal(modalTags));

  // Tags modal - Add selected tag button
  document.getElementById('btn-add-selected-tag').addEventListener('click', handleAddSelectedTag);

  // Tags modal - Add new tag button
  document.getElementById('btn-add-new-tag').addEventListener('click', handleAddNewTagFromModal);

  // Tags modal - Enter key on new tag input
  document.getElementById('tag-new-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddNewTagFromModal();
    }
  });

  // Tags modal - Remove tag click handler
  document.getElementById('current-tags-list').addEventListener('click', handleRemoveTagFromModal);

  // Modal overlays
  modalCreate.querySelector('.modal-overlay').addEventListener('click', () => closeModal(modalCreate));
  modalProxy.querySelector('.modal-overlay').addEventListener('click', () => closeModal(modalProxy));
  modalBulkCreate.querySelector('.modal-overlay').addEventListener('click', () => closeModal(modalBulkCreate));

  // Create profile form
  formCreateProfile.addEventListener('submit', handleCreateProfile);

  // Proxy config form
  formProxyConfig.addEventListener('submit', handleUpdateProxy);

  // Bulk create form
  formBulkCreate.addEventListener('submit', handleBulkCreateProfiles);
  document.getElementById('btn-bulk-create').addEventListener('click', () => openModal(modalBulkCreate));

  // Bulk create proxy mode change
  const bulkProxyMode = document.getElementById('bulk-proxy-mode');
  const bulkProxyFields = document.getElementById('bulk-proxy-fields');
  bulkProxyMode.addEventListener('change', () => {
    bulkProxyFields.style.display = bulkProxyMode.value === 'none' ? 'none' : 'block';
  });

  // Bulk proxy list change - count proxies
  document.getElementById('bulk-proxy-list').addEventListener('input', updateBulkProxyCount);

  // Bulk name list change - count names
  document.getElementById('bulk-name-list').addEventListener('input', updateBulkNameCount);

  // Proxy mode change (edit proxy modal)
  proxyMode.addEventListener('change', () => {
    const mode = proxyMode.value;
    proxyFields.style.display = (mode === 'none' || mode === 'pia') ? 'none' : 'block';
    piaFields.style.display = mode === 'pia' ? 'block' : 'none';
  });

  // Proxy mode change (create profile modal)
  const createProxyMode = document.getElementById('create-proxy-mode');
  const createProxyFields = document.getElementById('create-proxy-fields');
  createProxyMode.addEventListener('change', () => {
    const mode = createProxyMode.value;
    createProxyFields.style.display = (mode === 'none' || mode === 'pia') ? 'none' : 'block';
    createPiaFields.style.display = mode === 'pia' ? 'block' : 'none';
  });

  // Profile list event delegation
  profileList.addEventListener('click', handleProfileAction);

  // Inline edit name - click on profile name
  profileList.addEventListener('click', handleInlineEditName);

  // Checkbox change event delegation
  profileList.addEventListener('change', handleCheckboxChange);

  // Select all checkbox
  selectAllCheckbox.addEventListener('change', handleSelectAll);

  // Bulk action buttons
  btnBulkRun.addEventListener('click', handleBulkRun);
  btnBulkStop.addEventListener('click', handleBulkStop);
  btnBulkDelete.addEventListener('click', handleBulkDelete);
  btnClearSelection.addEventListener('click', clearSelection);

  // Search input
  searchInput.addEventListener('input', handleSearch);
  btnClearSearch.addEventListener('click', clearSearch);

  // Tag filter
  tagFilterSelect.addEventListener('change', handleTagFilterChange);

  // Tag actions (add/remove) - event delegation
  profileList.addEventListener('click', handleTagAction);

  // Edit icon clicks - event delegation
  profileList.addEventListener('click', handleEditIconClick);

  // Settings - Add tag
  btnAddTag.addEventListener('click', handleAddSettingsTag);
  settingsNewTag.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddSettingsTag();
    }
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal(modalCreate);
      closeModal(modalProxy);
      closeModal(modalBulkCreate);
      closeModal(modalTags);
    }
  });
}

/**
 * Handle search input
 */
function handleSearch(e) {
  searchQuery = e.target.value;
  updateClearSearchButton();
  renderProfileList();
}

/**
 * Handle tag filter change
 */
function handleTagFilterChange(e) {
  tagFilter = e.target.value;
  renderProfileList();
}

/**
 * Handle tag actions (add/remove)
 */
async function handleTagAction(e) {
  const target = e.target;

  // Handle remove tag
  if (target.classList.contains('tag-remove')) {
    const profileId = target.dataset.id;
    const tagToRemove = target.dataset.tag;
    await removeTagFromProfile(profileId, tagToRemove);
    return;
  }

  // Handle add tag button
  if (target.classList.contains('add-tag-btn')) {
    const profileId = target.dataset.id;
    showAddTagInput(target, profileId);
    return;
  }
}

/**
 * Show inline input to add a new tag
 */
function showAddTagInput(addBtn, profileId) {
  // Check if input already exists
  if (addBtn.parentNode.querySelector('.tag-input')) {
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'tag-input-wrapper';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'tag-input';
  input.placeholder = 'New tag';
  input.dataset.id = profileId;

  wrapper.appendChild(input);
  addBtn.parentNode.insertBefore(wrapper, addBtn);
  input.focus();

  const saveTag = async () => {
    const tagName = input.value.trim();
    if (tagName) {
      await addTagToProfile(profileId, tagName);
    }
    wrapper.remove();
  };

  input.addEventListener('blur', saveTag);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      input.blur();
    } else if (e.key === 'Escape') {
      input.removeEventListener('blur', saveTag);
      wrapper.remove();
    }
  });
}

/**
 * Add a tag to a profile
 */
async function addTagToProfile(profileId, tagName) {
  const profile = profiles.find(p => p.profileId === profileId);
  if (!profile) return;

  const currentTags = profile.tags && Array.isArray(profile.tags) ? [...profile.tags] : [];

  // Check if tag already exists
  if (currentTags.includes(tagName)) {
    showToast('Tag already exists', 'warning');
    return;
  }

  const newTags = [...currentTags, tagName];

  try {
    const response = await window.api.profiles.updateTags(profileId, newTags);
    if (response.success) {
      showToast('Tag added', 'success');
      await loadProfiles();
    } else {
      showToast(response.error || 'Failed to add tag', 'error');
    }
  } catch (error) {
    console.error('[App] Add tag error:', error);
    showToast('Failed to add tag', 'error');
  }
}

/**
 * Remove a tag from a profile
 */
async function removeTagFromProfile(profileId, tagToRemove) {
  const profile = profiles.find(p => p.profileId === profileId);
  if (!profile) return;

  const currentTags = profile.tags && Array.isArray(profile.tags) ? [...profile.tags] : [];
  const newTags = currentTags.filter(t => t !== tagToRemove);

  try {
    const response = await window.api.profiles.updateTags(profileId, newTags);
    if (response.success) {
      showToast('Tag removed', 'success');
      await loadProfiles();
    } else {
      showToast(response.error || 'Failed to remove tag', 'error');
    }
  } catch (error) {
    console.error('[App] Remove tag error:', error);
    showToast('Failed to remove tag', 'error');
  }
}

/**
 * Clear search
 */
function clearSearch() {
  searchQuery = '';
  searchInput.value = '';
  updateClearSearchButton();
  renderProfileList();
}

/**
 * Update clear search button visibility
 */
function updateClearSearchButton() {
  if (searchQuery.trim()) {
    btnClearSearch.style.display = 'block';
  } else {
    btnClearSearch.style.display = 'none';
  }
}

/**
 * Handle profile actions (start, stop, delete, proxy)
 */
async function handleProfileAction(e) {
  const target = e.target;
  const profileId = target.dataset.id;

  if (!profileId) return;

  if (target.classList.contains('btn-start')) {
    await startProfile(profileId);
  } else if (target.classList.contains('btn-stop')) {
    await stopProfile(profileId);
  } else if (target.classList.contains('btn-proxy')) {
    openProxyModal(profileId);
  } else if (target.classList.contains('btn-delete')) {
    await deleteProfile(profileId);
  }
}

/**
 * Parse proxy string format: ip:port or ip:port:user:pass
 * @param {string} proxyString - The proxy string to parse
 * @returns {Object|null} { host, port, username, password } or null if invalid
 */
function parseProxyString(proxyString) {
  if (!proxyString || !proxyString.trim()) {
    return null;
  }

  const parts = proxyString.trim().split(':');

  if (parts.length < 2) {
    return null;
  }

  const host = parts[0];
  const port = parseInt(parts[1]) || 0;

  if (!host || !port) {
    return null;
  }

  const result = { host, port };

  // If has user:pass
  if (parts.length >= 4) {
    result.username = parts[2] || '';
    result.password = parts.slice(3).join(':'); // Password may contain ':'
  } else if (parts.length === 3) {
    result.username = parts[2] || '';
    result.password = '';
  } else {
    result.username = '';
    result.password = '';
  }

  return result;
}

/**
 * Format proxy object to string: ip:port or ip:port:user:pass
 * @param {Object} proxy - The proxy object
 * @returns {string} Formatted proxy string
 */
function formatProxyString(proxy) {
  if (!proxy || !proxy.host || !proxy.port) {
    return '';
  }

  let str = `${proxy.host}:${proxy.port}`;

  if (proxy.username) {
    str += `:${proxy.username}`;
    if (proxy.password) {
      str += `:${proxy.password}`;
    }
  }

  return str;
}

/**
 * Create new profile
 */
async function handleCreateProfile(e) {
  e.preventDefault();

  const name = document.getElementById('profile-name').value.trim();
  const platform = document.getElementById('profile-platform').value;

  // Get proxy settings
  const proxyModeValue = document.getElementById('create-proxy-mode').value;
  let proxy = null;

  if (proxyModeValue === 'pia') {
    // PIA Proxy
    const country = createPiaCountrySelect.value;
    if (!country) {
      showToast('Please select a country for PIA Proxy', 'error');
      return;
    }
    proxy = { mode: 'pia', piaCountry: country };
  } else if (proxyModeValue !== 'none') {
    // Regular proxy
    const proxyString = document.getElementById('create-proxy-string').value.trim();
    const parsed = parseProxyString(proxyString);

    if (!parsed) {
      showToast('Invalid proxy format. Use ip:port or ip:port:user:pass', 'error');
      return;
    }

    proxy = { mode: proxyModeValue, ...parsed };
  }

  const submitBtn = document.getElementById('btn-submit-create');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Creating...';

  try {
    const response = await window.api.profiles.create({ name, platform, proxy });

    if (response.success) {
      showToast('Profile created successfully', 'success');
      closeModal(modalCreate);
      resetCreateForm();
      await loadProfiles();
    } else {
      showToast(response.error || 'Failed to create profile', 'error');
    }
  } catch (error) {
    console.error('[App] Create profile error:', error);
    showToast('Failed to create profile', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Create';
  }
}

/**
 * Reset create profile form
 */
function resetCreateForm() {
  formCreateProfile.reset();
  document.getElementById('create-proxy-mode').value = 'none';
  document.getElementById('create-proxy-fields').style.display = 'none';
  createPiaFields.style.display = 'none';
}

/**
 * Update bulk proxy count display
 */
function updateBulkProxyCount() {
  const proxyList = document.getElementById('bulk-proxy-list').value.trim();
  const lines = proxyList ? proxyList.split('\n').filter(line => line.trim()) : [];
  document.getElementById('bulk-proxy-count').textContent = lines.length;
}

/**
 * Update bulk name count display
 */
function updateBulkNameCount() {
  const nameList = document.getElementById('bulk-name-list').value.trim();
  const lines = nameList ? nameList.split('\n').filter(line => line.trim()) : [];
  document.getElementById('bulk-name-count').textContent = lines.length;
}

/**
 * Handle bulk create profiles
 */
async function handleBulkCreateProfiles(e) {
  e.preventDefault();

  const count = parseInt(document.getElementById('bulk-profile-count').value) || 1;
  const platform = document.getElementById('bulk-profile-platform').value;
  const proxyMode = document.getElementById('bulk-proxy-mode').value;

  // Parse name list
  let names = [];
  const nameList = document.getElementById('bulk-name-list').value.trim();
  if (nameList) {
    names = nameList.split('\n').filter(line => line.trim()).map(line => line.trim());
  }

  // Parse proxy list
  let proxies = [];
  if (proxyMode !== 'none') {
    const proxyList = document.getElementById('bulk-proxy-list').value.trim();
    if (proxyList) {
      const lines = proxyList.split('\n').filter(line => line.trim());
      for (const line of lines) {
        const parsed = parseProxyString(line.trim());
        if (parsed) {
          proxies.push({ mode: proxyMode, ...parsed });
        }
      }
    }
  }

  if (count < 1 || count > 100) {
    showToast('Number of profiles must be between 1 and 100', 'error');
    return;
  }

  const submitBtn = document.getElementById('btn-submit-bulk-create');
  const cancelBtn = document.getElementById('btn-cancel-bulk-create');
  const progressDiv = document.getElementById('bulk-progress');
  const progressFill = document.getElementById('bulk-progress-fill');
  const progressText = document.getElementById('bulk-progress-text');

  submitBtn.disabled = true;
  cancelBtn.disabled = true;
  submitBtn.textContent = 'Creating...';
  progressDiv.classList.remove('hidden');

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < count; i++) {
    // Update progress
    const percent = Math.round(((i + 1) / count) * 100);
    progressFill.style.width = `${percent}%`;
    progressText.textContent = `Creating profile ${i + 1} of ${count}...`;

    // Get name for this profile (if available)
    const name = i < names.length ? names[i] : null;

    // Get proxy for this profile (if available)
    const proxy = i < proxies.length ? proxies[i] : null;

    try {
      const response = await window.api.profiles.create({
        name,
        platform,
        proxy
      });

      if (response.success) {
        successCount++;
        addLog('info', `Created profile: ${response.data.profileId} (${response.data.name})`);
      } else {
        failCount++;
        addLog('error', `Failed to create profile ${i + 1}: ${response.error}`);
      }
    } catch (error) {
      failCount++;
      addLog('error', `Error creating profile ${i + 1}: ${error.message}`);
    }

    // Small delay between creates
    if (i < count - 1) {
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }

  // Done
  submitBtn.disabled = false;
  cancelBtn.disabled = false;
  submitBtn.textContent = 'Create Profiles';
  progressDiv.classList.add('hidden');
  progressFill.style.width = '0%';

  showToast(
    `Created ${successCount} profile(s)${failCount > 0 ? `, ${failCount} failed` : ''}`,
    successCount > 0 ? 'success' : 'error'
  );

  if (successCount > 0) {
    closeModal(modalBulkCreate);
    resetBulkCreateForm();
    await loadProfiles();
  }
}

/**
 * Reset bulk create form
 */
function resetBulkCreateForm() {
  formBulkCreate.reset();
  document.getElementById('bulk-proxy-mode').value = 'none';
  document.getElementById('bulk-proxy-fields').style.display = 'none';
  document.getElementById('bulk-proxy-count').textContent = '0';
  document.getElementById('bulk-name-count').textContent = '0';
}

/**
 * Start profile browser
 */
async function startProfile(profileId) {
  const btn = document.querySelector(`.btn-start[data-id="${profileId}"]`);
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Starting...';
  }

  try {
    const profile = profiles.find(p => p.profileId === profileId);
    const response = await window.api.profiles.start(profileId, profile?.proxy);

    if (response.success) {
      showToast(`Profile ${profileId} started`, 'success');
      await loadProfiles();
    } else {
      showToast(response.error || 'Failed to start profile', 'error');
    }
  } catch (error) {
    console.error('[App] Start profile error:', error);
    showToast(error.message || 'Failed to start profile', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Run';
    }
  }
}

/**
 * Stop profile browser
 */
async function stopProfile(profileId) {
  const btn = document.querySelector(`.btn-stop[data-id="${profileId}"]`);
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Stopping...';
  }

  try {
    const response = await window.api.profiles.stop(profileId);

    if (response.success) {
      showToast(`Profile ${profileId} stopped`, 'success');
      await loadProfiles();
    } else {
      showToast(response.error || 'Failed to stop profile', 'error');
    }
  } catch (error) {
    console.error('[App] Stop profile error:', error);
    showToast('Failed to stop profile', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Stop';
    }
  }
}

/**
 * Delete profile
 */
async function deleteProfile(profileId) {
  const confirmed = await window.api.dialog.confirm(`Are you sure you want to delete profile "${profileId}"?`);

  if (!confirmed) return;

  try {
    const response = await window.api.profiles.delete(profileId);

    if (response.success) {
      showToast(`Profile ${profileId} deleted`, 'success');
      await loadProfiles();
    } else {
      showToast(response.error || 'Failed to delete profile', 'error');
    }
  } catch (error) {
    console.error('[App] Delete profile error:', error);
    showToast('Failed to delete profile', 'error');
  }
}

/**
 * Handle edit icon click - dispatches to appropriate edit handler
 */
function handleEditIconClick(e) {
  const target = e.target;

  if (!target.classList.contains('edit-icon')) {
    return;
  }

  e.stopPropagation();
  const profileId = target.dataset.id;
  const field = target.dataset.field;

  if (!profileId || !field) return;

  switch (field) {
    case 'name':
      startEditName(profileId);
      break;
    case 'proxy':
      openProxyModal(profileId);
      break;
    case 'tags':
      openTagsModal(profileId);
      break;
  }
}

/**
 * Handle inline edit name - click on profile name to edit (legacy, kept for backwards compatibility)
 */
function handleInlineEditName(e) {
  // This function is now deprecated, edit is triggered via edit icon
  return;
}

/**
 * Start editing profile name
 */
function startEditName(profileId) {
  const profile = profiles.find(p => p.profileId === profileId);
  if (!profile) return;

  const nameCell = document.querySelector(`.col-name[data-id="${profileId}"]`);
  if (!nameCell) return;

  const nameSpan = nameCell.querySelector('.profile-name');
  if (!nameSpan) return;

  // Create inline input
  const currentName = profile.name || profile.profileId;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'inline-edit-input';
  input.value = currentName;
  input.dataset.id = profileId;

  // Hide span and edit icon
  nameSpan.style.display = 'none';
  const editIcon = nameCell.querySelector('.edit-icon');
  if (editIcon) editIcon.style.display = 'none';

  nameCell.appendChild(input);
  input.focus();
  input.select();

  // Handle save on blur or Enter
  const saveEdit = async () => {
    const newName = input.value.trim();

    if (newName && newName !== currentName) {
      try {
        const response = await window.api.profiles.updateName(profileId, newName);
        if (response.success) {
          showToast('Profile name updated', 'success');
          await loadProfiles();
        } else {
          showToast(response.error || 'Failed to update name', 'error');
          restoreSpan();
        }
      } catch (error) {
        console.error('[App] Update name error:', error);
        showToast('Failed to update name', 'error');
        restoreSpan();
      }
    } else {
      restoreSpan();
    }
  };

  const restoreSpan = () => {
    input.remove();
    nameSpan.style.display = '';
    if (editIcon) editIcon.style.display = '';
  };

  // Event listeners
  input.addEventListener('blur', saveEdit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      input.blur();
    } else if (e.key === 'Escape') {
      input.removeEventListener('blur', saveEdit);
      restoreSpan();
    }
  });
}

/**
 * Open tags modal for editing profile tags
 */
function openTagsModal(profileId) {
  const profile = profiles.find(p => p.profileId === profileId);
  if (!profile) return;

  const modalTags = document.getElementById('modal-tags');
  document.getElementById('tags-profile-id').value = profileId;

  // Render current tags
  renderCurrentTagsInModal(profile);

  // Update select dropdown with available tags
  updateTagSelectOptions(profile);

  // Clear new tag input
  document.getElementById('tag-new-name').value = '';

  openModal(modalTags);
}

/**
 * Render current tags in the modal
 */
function renderCurrentTagsInModal(profile) {
  const container = document.getElementById('current-tags-list');
  const currentTags = profile.tags && Array.isArray(profile.tags) ? profile.tags : [];

  if (currentTags.length === 0) {
    container.innerHTML = '<span class="tags-list-empty">No tags</span>';
    return;
  }

  container.innerHTML = currentTags.map(tag => `
    <span class="tag-pill" data-tag="${escapeHtml(tag)}">
      ${escapeHtml(tag)}
      <span class="tag-remove" data-tag="${escapeHtml(tag)}">&times;</span>
    </span>
  `).join('');
}

/**
 * Update tag select dropdown options
 */
function updateTagSelectOptions(profile) {
  const select = document.getElementById('tag-select-existing');
  const currentTags = profile.tags && Array.isArray(profile.tags) ? profile.tags : [];

  select.innerHTML = '<option value="">-- Select existing tag --</option>';

  // Add available tags (excluding already added tags)
  allTags.forEach(tag => {
    if (!currentTags.includes(tag)) {
      const option = document.createElement('option');
      option.value = tag;
      option.textContent = tag;
      select.appendChild(option);
    }
  });
}

/**
 * Handle adding selected tag from dropdown in modal
 */
async function handleAddSelectedTag() {
  const profileId = document.getElementById('tags-profile-id').value;
  const select = document.getElementById('tag-select-existing');
  const tagToAdd = select.value;

  if (!tagToAdd) {
    showToast('Please select a tag', 'warning');
    return;
  }

  await addTagToProfileAndRefreshModal(profileId, tagToAdd);
}

/**
 * Handle adding new tag from input in modal
 */
async function handleAddNewTagFromModal() {
  const profileId = document.getElementById('tags-profile-id').value;
  const input = document.getElementById('tag-new-name');
  const tagToAdd = input.value.trim();

  if (!tagToAdd) {
    showToast('Please enter a tag name', 'warning');
    return;
  }

  await addTagToProfileAndRefreshModal(profileId, tagToAdd);
  input.value = '';
}

/**
 * Handle removing tag from modal
 */
async function handleRemoveTagFromModal(e) {
  if (!e.target.classList.contains('tag-remove')) return;

  const profileId = document.getElementById('tags-profile-id').value;
  const tagToRemove = e.target.dataset.tag;

  await removeTagFromProfileAndRefreshModal(profileId, tagToRemove);
}

/**
 * Add tag to profile and refresh modal
 */
async function addTagToProfileAndRefreshModal(profileId, tagName) {
  const profile = profiles.find(p => p.profileId === profileId);
  if (!profile) return;

  const currentTags = profile.tags && Array.isArray(profile.tags) ? [...profile.tags] : [];

  if (currentTags.includes(tagName)) {
    showToast('Tag already exists', 'warning');
    return;
  }

  const newTags = [...currentTags, tagName];

  try {
    const response = await window.api.profiles.updateTags(profileId, newTags);
    if (response.success) {
      showToast('Tag added', 'success');
      await loadProfiles();
      await loadAllTags();

      // Refresh modal display
      const updatedProfile = profiles.find(p => p.profileId === profileId);
      if (updatedProfile) {
        renderCurrentTagsInModal(updatedProfile);
        updateTagSelectOptions(updatedProfile);
      }
    } else {
      showToast(response.error || 'Failed to add tag', 'error');
    }
  } catch (error) {
    console.error('[App] Add tag error:', error);
    showToast('Failed to add tag', 'error');
  }
}

/**
 * Remove tag from profile and refresh modal
 */
async function removeTagFromProfileAndRefreshModal(profileId, tagToRemove) {
  const profile = profiles.find(p => p.profileId === profileId);
  if (!profile) return;

  const currentTags = profile.tags && Array.isArray(profile.tags) ? [...profile.tags] : [];
  const newTags = currentTags.filter(tag => tag !== tagToRemove);

  try {
    const response = await window.api.profiles.updateTags(profileId, newTags);
    if (response.success) {
      showToast('Tag removed', 'success');
      await loadProfiles();

      // Refresh modal display
      const updatedProfile = profiles.find(p => p.profileId === profileId);
      if (updatedProfile) {
        renderCurrentTagsInModal(updatedProfile);
        updateTagSelectOptions(updatedProfile);
      }
    } else {
      showToast(response.error || 'Failed to remove tag', 'error');
    }
  } catch (error) {
    console.error('[App] Remove tag error:', error);
    showToast('Failed to remove tag', 'error');
  }
}

/**
 * Open proxy config modal
 */
function openProxyModal(profileId) {
  const profile = profiles.find(p => p.profileId === profileId);
  if (!profile) return;

  document.getElementById('proxy-profile-id').value = profileId;

  if (profile.proxy && profile.proxy.mode !== 'none') {
    const mode = profile.proxy.mode || 'none';
    document.getElementById('proxy-mode').value = mode;

    if (mode === 'pia') {
      // PIA Proxy
      piaCountrySelect.value = profile.proxy.piaCountry || '';
      document.getElementById('proxy-string').value = '';
    } else {
      // Regular proxy
      document.getElementById('proxy-string').value = formatProxyString(profile.proxy);
      piaCountrySelect.value = '';
    }
  } else {
    formProxyConfig.reset();
    document.getElementById('proxy-profile-id').value = profileId;
    document.getElementById('proxy-mode').value = 'none';
    document.getElementById('proxy-string').value = '';
    piaCountrySelect.value = '';
  }

  // Toggle fields visibility
  const mode = document.getElementById('proxy-mode').value;
  proxyFields.style.display = (mode === 'none' || mode === 'pia') ? 'none' : 'block';
  piaFields.style.display = mode === 'pia' ? 'block' : 'none';

  openModal(modalProxy);
}

/**
 * Update proxy config
 */
async function handleUpdateProxy(e) {
  e.preventDefault();

  const profileId = document.getElementById('proxy-profile-id').value;
  const mode = document.getElementById('proxy-mode').value;

  let proxy = null;
  if (mode === 'pia') {
    // PIA Proxy
    const country = piaCountrySelect.value;
    if (!country) {
      showToast('Please select a country for PIA Proxy', 'error');
      return;
    }
    proxy = { mode: 'pia', piaCountry: country };
  } else if (mode !== 'none') {
    const proxyString = document.getElementById('proxy-string').value.trim();
    const parsed = parseProxyString(proxyString);

    if (!parsed) {
      showToast('Invalid proxy format. Use ip:port or ip:port:user:pass', 'error');
      return;
    }

    proxy = { mode, ...parsed };
  }

  try {
    const response = await window.api.profiles.updateProxy(profileId, proxy);

    if (response.success) {
      showToast('Proxy updated successfully', 'success');
      closeModal(modalProxy);
      await loadProfiles();
    } else {
      showToast(response.error || 'Failed to update proxy', 'error');
    }
  } catch (error) {
    console.error('[App] Update proxy error:', error);
    showToast('Failed to update proxy', 'error');
  }
}

/**
 * Handle checkbox change in profile list
 */
function handleCheckboxChange(e) {
  if (!e.target.classList.contains('profile-checkbox')) return;

  const profileId = e.target.dataset.id;
  if (e.target.checked) {
    selectedProfiles.add(profileId);
  } else {
    selectedProfiles.delete(profileId);
  }

  updateBulkActionsUI();
  updateSelectAllCheckbox();
}

/**
 * Handle select all checkbox
 */
function handleSelectAll(e) {
  const isChecked = e.target.checked;

  if (isChecked) {
    // Select all profiles
    profiles.forEach(p => selectedProfiles.add(p.profileId));
  } else {
    // Deselect all
    selectedProfiles.clear();
  }

  // Update all checkboxes
  document.querySelectorAll('.profile-checkbox').forEach(cb => {
    cb.checked = isChecked;
  });

  updateBulkActionsUI();
}

/**
 * Update select all checkbox state
 */
function updateSelectAllCheckbox() {
  const total = profiles.length;
  const selected = selectedProfiles.size;

  if (selected === 0) {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = false;
  } else if (selected === total) {
    selectAllCheckbox.checked = true;
    selectAllCheckbox.indeterminate = false;
  } else {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = true;
  }
}

/**
 * Update bulk actions UI visibility
 */
function updateBulkActionsUI() {
  const count = selectedProfiles.size;

  if (count > 0) {
    bulkActions.classList.remove('hidden');
    selectedCount.textContent = `${count} selected`;
  } else {
    bulkActions.classList.add('hidden');
  }
}

/**
 * Clear all selections
 */
function clearSelection() {
  selectedProfiles.clear();
  document.querySelectorAll('.profile-checkbox').forEach(cb => {
    cb.checked = false;
  });
  selectAllCheckbox.checked = false;
  selectAllCheckbox.indeterminate = false;
  updateBulkActionsUI();
}

/**
 * Handle bulk run action
 */
async function handleBulkRun() {
  const selectedIds = Array.from(selectedProfiles);
  const stoppedProfiles = selectedIds.filter(id => {
    const profile = profiles.find(p => p.profileId === id);
    return profile && profile.status !== 'running';
  });

  if (stoppedProfiles.length === 0) {
    showToast('No stopped profiles selected', 'warning');
    return;
  }

  const confirmed = await window.api.dialog.confirm(
    `Start ${stoppedProfiles.length} profile(s)?`
  );

  if (!confirmed) return;

  btnBulkRun.disabled = true;
  btnBulkRun.textContent = 'Starting...';

  let successCount = 0;
  let failCount = 0;

  for (const profileId of stoppedProfiles) {
    try {
      const profile = profiles.find(p => p.profileId === profileId);
      const response = await window.api.profiles.start(profileId, profile?.proxy);

      if (response.success) {
        successCount++;
        addLog('info', `Started profile: ${profileId}`);
      } else {
        failCount++;
        addLog('error', `Failed to start ${profileId}: ${response.error}`);
      }
    } catch (error) {
      failCount++;
      addLog('error', `Error starting ${profileId}: ${error.message}`);
    }

    // Small delay between starts to avoid overwhelming the system
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  btnBulkRun.disabled = false;
  btnBulkRun.textContent = '▶ Run';

  showToast(`Started ${successCount} profile(s)${failCount > 0 ? `, ${failCount} failed` : ''}`, successCount > 0 ? 'success' : 'error');
  await loadProfiles();
}

/**
 * Handle bulk stop action
 */
async function handleBulkStop() {
  const selectedIds = Array.from(selectedProfiles);
  const runningProfiles = selectedIds.filter(id => {
    const profile = profiles.find(p => p.profileId === id);
    return profile && profile.status === 'running';
  });

  if (runningProfiles.length === 0) {
    showToast('No running profiles selected', 'warning');
    return;
  }

  const confirmed = await window.api.dialog.confirm(
    `Stop ${runningProfiles.length} profile(s)?`
  );

  if (!confirmed) return;

  btnBulkStop.disabled = true;
  btnBulkStop.textContent = 'Stopping...';

  let successCount = 0;
  let failCount = 0;

  for (const profileId of runningProfiles) {
    try {
      const response = await window.api.profiles.stop(profileId);

      if (response.success) {
        successCount++;
        addLog('info', `Stopped profile: ${profileId}`);
      } else {
        failCount++;
        addLog('error', `Failed to stop ${profileId}: ${response.error}`);
      }
    } catch (error) {
      failCount++;
      addLog('error', `Error stopping ${profileId}: ${error.message}`);
    }
  }

  btnBulkStop.disabled = false;
  btnBulkStop.textContent = '⏹ Stop';

  showToast(`Stopped ${successCount} profile(s)${failCount > 0 ? `, ${failCount} failed` : ''}`, successCount > 0 ? 'success' : 'error');
  await loadProfiles();
}

/**
 * Handle bulk delete action
 */
async function handleBulkDelete() {
  const selectedIds = Array.from(selectedProfiles);
  const deletableProfiles = selectedIds.filter(id => {
    const profile = profiles.find(p => p.profileId === id);
    return profile && profile.status !== 'running';
  });

  if (deletableProfiles.length === 0) {
    showToast('No stopped profiles selected (cannot delete running profiles)', 'warning');
    return;
  }

  const confirmed = await window.api.dialog.confirm(
    `Delete ${deletableProfiles.length} profile(s)? This action cannot be undone.`
  );

  if (!confirmed) return;

  btnBulkDelete.disabled = true;
  btnBulkDelete.textContent = 'Deleting...';

  let successCount = 0;
  let failCount = 0;

  for (const profileId of deletableProfiles) {
    try {
      const response = await window.api.profiles.delete(profileId);

      if (response.success) {
        successCount++;
        selectedProfiles.delete(profileId);
        addLog('info', `Deleted profile: ${profileId}`);
      } else {
        failCount++;
        addLog('error', `Failed to delete ${profileId}: ${response.error}`);
      }
    } catch (error) {
      failCount++;
      addLog('error', `Error deleting ${profileId}: ${error.message}`);
    }
  }

  btnBulkDelete.disabled = false;
  btnBulkDelete.textContent = '🗑 Delete';

  updateBulkActionsUI();
  showToast(`Deleted ${successCount} profile(s)${failCount > 0 ? `, ${failCount} failed` : ''}`, successCount > 0 ? 'success' : 'error');
  await loadProfiles();
}

/**
 * Start polling for status updates
 */
function startPolling() {
  pollInterval = setInterval(async () => {
    if (!isLoading) {
      await loadProfiles();
    }
  }, 5000); // Poll every 5 seconds
}

/**
 * Update running count in header
 */
function updateRunningCount() {
  const running = profiles.filter(p => p.status === 'running').length;
  runningCount.textContent = `${running} running`;
}

/**
 * Update last updated timestamp
 */
function updateLastUpdated() {
  const now = new Date();
  lastUpdated.textContent = `Last updated: ${now.toLocaleTimeString()}`;
}

/**
 * Show/hide loading indicator
 */
function showLoading(show) {
  loading.style.display = show ? 'block' : 'none';
  if (show) {
    emptyState.style.display = 'none';
  }
}

/**
 * Open modal
 */
function openModal(modal) {
  modal.classList.remove('hidden');
}

/**
 * Close modal
 */
function closeModal(modal) {
  modal.classList.add('hidden');
}

/**
 * Show toast notification
 */
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  // Auto remove after 3 seconds
  setTimeout(() => {
    toast.remove();
  }, 3000);
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Cleanup on window unload
window.addEventListener('beforeunload', () => {
  if (pollInterval) {
    clearInterval(pollInterval);
  }
  if (logPollInterval) {
    clearInterval(logPollInterval);
  }
});

/**
 * Setup log panel event listeners
 */
function setupLogPanel() {
  // Clear logs button
  btnClearLogs.addEventListener('click', () => {
    logContainer.innerHTML = '';
    addLog('info', 'Logs cleared');
  });

  // Toggle logs button
  btnToggleLogs.addEventListener('click', () => {
    logPanel.classList.toggle('collapsed');
    btnToggleLogs.textContent = logPanel.classList.contains('collapsed') ? 'Show' : 'Hide';
  });
}

/**
 * Add log entry to log panel
 */
function addLog(level, message) {
  const entry = document.createElement('div');
  entry.className = `log-entry ${level}`;

  const timestamp = new Date().toLocaleTimeString();
  entry.innerHTML = `<span class="timestamp">[${timestamp}]</span> ${escapeHtml(message)}`;

  logContainer.appendChild(entry);

  // Auto-scroll to bottom
  logContainer.scrollTop = logContainer.scrollHeight;

  // Keep max 500 entries
  while (logContainer.children.length > 500) {
    logContainer.removeChild(logContainer.firstChild);
  }
}

/**
 * Start polling for logs
 */
function startLogPolling() {
  // Initial fetch
  fetchLogs();

  // Poll every 2 seconds
  logPollInterval = setInterval(fetchLogs, 2000);
}

/**
 * Fetch logs from API
 */
async function fetchLogs() {
  try {
    const response = await window.api.logs.get(lastLogTimestamp);

    if (response.success && response.data.logs) {
      for (const log of response.data.logs) {
        // Parse log level from message
        let level = 'info';
        if (log.includes('[ERROR]') || log.includes('[error]')) level = 'error';
        else if (log.includes('[WARN]') || log.includes('[warn]')) level = 'warn';
        else if (log.includes('[DEBUG]') || log.includes('[debug]')) level = 'debug';

        // Add to log panel (remove timestamp from server log since we add our own)
        const message = log.replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\s*/, '');
        addLogRaw(level, message);
      }

      if (response.data.lastTimestamp) {
        lastLogTimestamp = response.data.lastTimestamp;
      }
    }
  } catch (error) {
    // Silently fail - logs are not critical
    console.error('[App] Fetch logs error:', error);
  }
}

/**
 * Add raw log entry (without adding timestamp)
 */
function addLogRaw(level, message) {
  const entry = document.createElement('div');
  entry.className = `log-entry ${level}`;
  entry.textContent = message;

  logContainer.appendChild(entry);

  // Auto-scroll to bottom
  logContainer.scrollTop = logContainer.scrollHeight;

  // Keep max 500 entries
  while (logContainer.children.length > 500) {
    logContainer.removeChild(logContainer.firstChild);
  }
}

/**
 * Setup tabs navigation
 */
function setupTabs() {
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;
      switchTab(tabId);
    });
  });

  // Settings button in header
  document.getElementById('btn-settings').addEventListener('click', () => {
    switchTab('settings');
  });
}

/**
 * Switch to a tab
 */
function switchTab(tabId) {
  // Update tab buttons
  tabBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });

  // Update tab contents
  tabContents.forEach(content => {
    content.classList.toggle('active', content.id === `tab-${tabId}`);
  });

  // Load settings data if switching to settings tab
  if (tabId === 'settings') {
    loadSettingsData();
  }

  // Load scripts data if switching to scripts tab
  if (tabId === 'scripts') {
    loadScriptsData();
  }
}

/**
 * Load settings from API
 */
async function loadSettings() {
  try {
    const response = await window.api.settings.getAll();
    if (response.success) {
      settingsTags = response.data.tags || [];
    }
  } catch (error) {
    console.error('[App] Load settings error:', error);
  }
}

/**
 * Load settings data for settings tab
 */
async function loadSettingsData() {
  await loadSettings();
  renderSettingsTags();
}

/**
 * Render tags in settings
 */
function renderSettingsTags() {
  if (settingsTags.length === 0) {
    settingsTagList.innerHTML = '<p class="no-tags-message">No tags created yet</p>';
    return;
  }

  settingsTagList.innerHTML = settingsTags.map(tag => `
    <span class="tag-item" data-tag="${escapeHtml(tag)}">
      ${escapeHtml(tag)}
      <span class="tag-delete" data-tag="${escapeHtml(tag)}">&times;</span>
    </span>
  `).join('');

  // Add delete event listeners
  settingsTagList.querySelectorAll('.tag-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const tagToDelete = e.target.dataset.tag;
      await handleDeleteSettingsTag(tagToDelete);
    });
  });
}

/**
 * Handle add tag in settings
 */
async function handleAddSettingsTag() {
  const tagName = settingsNewTag.value.trim();
  if (!tagName) {
    showToast('Please enter a tag name', 'warning');
    return;
  }

  try {
    const response = await window.api.settings.addTag(tagName);
    if (response.success) {
      settingsTags = response.data;
      settingsNewTag.value = '';
      renderSettingsTags();
      await loadAllTags(); // Update tag filter dropdown
      showToast('Tag added', 'success');
    } else {
      showToast(response.error || 'Failed to add tag', 'error');
    }
  } catch (error) {
    console.error('[App] Add tag error:', error);
    showToast('Failed to add tag', 'error');
  }
}

/**
 * Handle delete tag in settings
 */
async function handleDeleteSettingsTag(tagName) {
  const confirmed = await window.api.dialog.confirm(`Delete tag "${tagName}"?`);
  if (!confirmed) return;

  try {
    const response = await window.api.settings.deleteTag(tagName);
    if (response.success) {
      settingsTags = response.data;
      renderSettingsTags();
      await loadAllTags(); // Update tag filter dropdown
      showToast('Tag deleted', 'success');
    } else {
      showToast(response.error || 'Failed to delete tag', 'error');
    }
  } catch (error) {
    console.error('[App] Delete tag error:', error);
    showToast('Failed to delete tag', 'error');
  }
}

// ============================================
// Scripts Tab Logic
// ============================================

let scriptsList = [];
let currentScript = null;
let executionsList = [];
let execLogsPollTimer = null;

// ============================================
// Template Library
// ============================================

const SCRIPT_TEMPLATES = [
  {
    id: 'get-page-title',
    name: 'Get Page Title',
    category: 'scraping',
    description: 'Navigate to a URL and get the page title',
    params: [
      { name: 'URL', label: 'Page URL', placeholder: 'https://example.com' }
    ],
    code: `await page.goto('{{URL}}', { waitUntil: 'networkidle2' });
const title = await page.title();
logger.info('Page title: ' + title);`
  },
  {
    id: 'scrape-links',
    name: 'Scrape Links',
    category: 'scraping',
    description: 'Extract all links from a page',
    params: [
      { name: 'URL', label: 'Page URL', placeholder: 'https://example.com' }
    ],
    code: `await page.goto('{{URL}}', { waitUntil: 'networkidle2' });
const links = await page.$$eval('a[href]', anchors => anchors.map(a => ({ text: a.textContent.trim(), href: a.href })));
logger.info('Found ' + links.length + ' links');
links.forEach(l => logger.info(l.text + ' -> ' + l.href));`
  },
  {
    id: 'scrape-table',
    name: 'Scrape Table',
    category: 'scraping',
    description: 'Extract table data as JSON',
    params: [
      { name: 'URL', label: 'Page URL', placeholder: 'https://example.com' },
      { name: 'TABLE_SELECTOR', label: 'Table Selector', placeholder: 'table', default: 'table' }
    ],
    code: `await page.goto('{{URL}}', { waitUntil: 'networkidle2' });
const tableData = await page.$eval('{{TABLE_SELECTOR}}', table => {
  const headers = Array.from(table.querySelectorAll('th')).map(th => th.textContent.trim());
  const rows = Array.from(table.querySelectorAll('tbody tr')).map(tr => {
    const cells = Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim());
    const row = {};
    cells.forEach((cell, i) => { row[headers[i] || 'col' + i] = cell; });
    return row;
  });
  return rows;
});
logger.info('Table data (' + tableData.length + ' rows): ' + JSON.stringify(tableData, null, 2));`
  },
  {
    id: 'login-form',
    name: 'Login Form',
    category: 'automation',
    description: 'Fill and submit a login form',
    params: [
      { name: 'URL', label: 'Login Page URL', placeholder: 'https://example.com/login' },
      { name: 'EMAIL', label: 'Email / Username', placeholder: 'user@example.com' },
      { name: 'PASSWORD', label: 'Password', placeholder: 'your-password' }
    ],
    code: `await page.goto('{{URL}}', { waitUntil: 'networkidle2' });
await page.type('input[type="email"], input[name="email"], input[name="username"]', '{{EMAIL}}', { delay: 50 });
await page.type('input[type="password"], input[name="password"]', '{{PASSWORD}}', { delay: 50 });
await page.click('button[type="submit"], input[type="submit"]');
await sleep(2000);
logger.info('Login submitted. Current URL: ' + page.url());`
  },
  {
    id: 'fill-form',
    name: 'Fill Form Fields',
    category: 'automation',
    description: 'Fill multiple form fields using JSON config',
    params: [
      { name: 'URL', label: 'Page URL', placeholder: 'https://example.com/form' },
      { name: 'FIELDS_JSON', label: 'Fields JSON (selector: value)', placeholder: '{"#name": "John", "#email": "john@test.com"}' }
    ],
    code: `await page.goto('{{URL}}', { waitUntil: 'networkidle2' });
const fields = JSON.parse('{{FIELDS_JSON}}');
for (const [selector, value] of Object.entries(fields)) {
  await page.type(selector, value, { delay: 30 });
  logger.info('Filled ' + selector);
}
logger.info('All fields filled');`
  },
  {
    id: 'take-screenshot',
    name: 'Take Screenshot',
    category: 'utility',
    description: 'Navigate and take a full page screenshot',
    params: [
      { name: 'URL', label: 'Page URL', placeholder: 'https://example.com' }
    ],
    code: `await page.goto('{{URL}}', { waitUntil: 'networkidle2' });
const screenshot = await page.screenshot({ encoding: 'base64', fullPage: true });
logger.info('Screenshot taken (' + Math.round(screenshot.length / 1024) + ' KB base64)');`
  },
  {
    id: 'wait-for-element',
    name: 'Wait for Element',
    category: 'utility',
    description: 'Wait for an element to appear and get its text',
    params: [
      { name: 'URL', label: 'Page URL', placeholder: 'https://example.com' },
      { name: 'SELECTOR', label: 'CSS Selector', placeholder: '.result, #status' }
    ],
    code: `await page.goto('{{URL}}', { waitUntil: 'networkidle2' });
logger.info('Waiting for element: {{SELECTOR}}');
await page.waitForSelector('{{SELECTOR}}', { timeout: 15000 });
const text = await page.$eval('{{SELECTOR}}', el => el.textContent.trim());
logger.info('Element text: ' + text);`
  },
  {
    id: 'multi-page-scrape',
    name: 'Multi-page Scrape',
    category: 'scraping',
    description: 'Scrape data across paginated pages',
    params: [
      { name: 'URL', label: 'Start URL', placeholder: 'https://example.com/page/1' },
      { name: 'NEXT_SELECTOR', label: 'Next Button Selector', placeholder: 'a.next, .pagination .next' },
      { name: 'DATA_SELECTOR', label: 'Data Item Selector', placeholder: '.item, .result' },
      { name: 'MAX_PAGES', label: 'Max Pages', placeholder: '5', default: '5' }
    ],
    code: `const allData = [];
const maxPages = {{MAX_PAGES}};
await page.goto('{{URL}}', { waitUntil: 'networkidle2' });

for (let i = 0; i < maxPages; i++) {
  const items = await page.$$eval('{{DATA_SELECTOR}}', els => els.map(el => el.textContent.trim()));
  allData.push(...items);
  logger.info('Page ' + (i + 1) + ': ' + items.length + ' items');

  const nextBtn = await page.$('{{NEXT_SELECTOR}}');
  if (!nextBtn) { logger.info('No more pages'); break; }
  await nextBtn.click();
  await sleep(1500);
  await page.waitForSelector('{{DATA_SELECTOR}}', { timeout: 10000 });
}
logger.info('Total items scraped: ' + allData.length);`
  },
  {
    id: 'monitor-element',
    name: 'Monitor Element',
    category: 'utility',
    description: 'Periodically check an element text for changes',
    params: [
      { name: 'URL', label: 'Page URL', placeholder: 'https://example.com' },
      { name: 'SELECTOR', label: 'CSS Selector', placeholder: '#price, .status' },
      { name: 'INTERVAL_SEC', label: 'Check Interval (seconds)', placeholder: '10', default: '10' },
      { name: 'MAX_CHECKS', label: 'Max Checks', placeholder: '10', default: '10' }
    ],
    code: `await page.goto('{{URL}}', { waitUntil: 'networkidle2' });
let lastValue = '';
for (let i = 0; i < {{MAX_CHECKS}}; i++) {
  await page.reload({ waitUntil: 'networkidle2' });
  const value = await page.$eval('{{SELECTOR}}', el => el.textContent.trim());
  if (value !== lastValue) {
    logger.info('Check ' + (i + 1) + ' - Changed: ' + value);
    lastValue = value;
  } else {
    logger.info('Check ' + (i + 1) + ' - No change: ' + value);
  }
  if (i < {{MAX_CHECKS}} - 1) await sleep({{INTERVAL_SEC}} * 1000);
}
logger.info('Monitoring completed');`
  },
  {
    id: 'cookie-export',
    name: 'Cookie Export',
    category: 'utility',
    description: 'Export all cookies from a page as JSON',
    params: [
      { name: 'URL', label: 'Page URL', placeholder: 'https://example.com' }
    ],
    code: `await page.goto('{{URL}}', { waitUntil: 'networkidle2' });
const cookies = await page.cookies();
logger.info('Cookies (' + cookies.length + '): ' + JSON.stringify(cookies, null, 2));`
  }
];

let selectedTemplateId = null;

function openTemplateLibrary() {
  selectedTemplateId = null;
  const modal = document.getElementById('modal-templates');
  modal.classList.remove('hidden');
  document.getElementById('template-params-form').classList.add('hidden');
  renderTemplateGrid('all');
}

function closeTemplateLibrary() {
  document.getElementById('modal-templates').classList.add('hidden');
}

function renderTemplateGrid(category) {
  const grid = document.getElementById('template-grid');
  const filtered = category === 'all' ? SCRIPT_TEMPLATES : SCRIPT_TEMPLATES.filter(t => t.category === category);

  grid.innerHTML = filtered.map(t => `
    <div class="template-card" data-id="${t.id}">
      <h4>${escapeHtml(t.name)}</h4>
      <p>${escapeHtml(t.description)}</p>
      <span class="template-category">${t.category}</span>
    </div>
  `).join('');

  grid.querySelectorAll('.template-card').forEach(card => {
    card.addEventListener('click', () => selectTemplate(card.dataset.id));
  });
}

function selectTemplate(templateId) {
  const template = SCRIPT_TEMPLATES.find(t => t.id === templateId);
  if (!template) return;

  selectedTemplateId = templateId;
  document.getElementById('template-grid').style.display = 'none';
  document.querySelector('.template-filter').style.display = 'none';

  const paramsForm = document.getElementById('template-params-form');
  paramsForm.classList.remove('hidden');
  document.getElementById('template-params-title').textContent = template.name;

  const fieldsEl = document.getElementById('template-params-fields');
  fieldsEl.innerHTML = template.params.map(p => `
    <div class="form-group">
      <label>${escapeHtml(p.label)}</label>
      <input type="text" data-param="${p.name}" placeholder="${escapeHtml(p.placeholder)}" value="${escapeHtml(p.default || '')}">
    </div>
  `).join('');
}

function applyTemplate() {
  const template = SCRIPT_TEMPLATES.find(t => t.id === selectedTemplateId);
  if (!template) return;

  let code = template.code;
  const fields = document.getElementById('template-params-fields');
  fields.querySelectorAll('input[data-param]').forEach(input => {
    const paramName = input.dataset.param;
    const value = input.value;
    code = code.replace(new RegExp('\\{\\{' + paramName + '\\}\\}', 'g'), value);
  });

  document.getElementById('script-code-editor').value = code;
  closeTemplateLibrary();
  showToast('Template applied to editor', 'success');
}

// ============================================
// Visual Block Editor
// ============================================

const BLOCK_TYPES = [
  {
    type: 'goto',
    label: 'Go to URL',
    icon: '🌐',
    params: [{ name: 'url', label: 'URL', placeholder: 'https://example.com' }],
    codeTemplate: "await page.goto('{{url}}', { waitUntil: 'networkidle2' });"
  },
  {
    type: 'click',
    label: 'Click',
    icon: '👆',
    params: [{ name: 'selector', label: 'Selector', placeholder: '#btn, .button' }],
    codeTemplate: "await page.click('{{selector}}');"
  },
  {
    type: 'type',
    label: 'Type Text',
    icon: '⌨',
    params: [
      { name: 'selector', label: 'Selector', placeholder: '#input, .field' },
      { name: 'text', label: 'Text', placeholder: 'Hello world' },
      { name: 'delay', label: 'Delay (ms)', placeholder: '50', default: '50' }
    ],
    codeTemplate: "await page.type('{{selector}}', '{{text}}', { delay: {{delay}} });"
  },
  {
    type: 'wait',
    label: 'Wait',
    icon: '⏳',
    params: [{ name: 'ms', label: 'Milliseconds', placeholder: '1000', default: '1000' }],
    codeTemplate: 'await sleep({{ms}});'
  },
  {
    type: 'screenshot',
    label: 'Screenshot',
    icon: '📸',
    params: [],
    codeTemplate: "const ss = await page.screenshot({ encoding: 'base64' });\nlogger.info('Screenshot taken');"
  },
  {
    type: 'extract',
    label: 'Extract Text',
    icon: '📄',
    params: [
      { name: 'selector', label: 'Selector', placeholder: '.title, #result' },
      { name: 'varName', label: 'Variable Name', placeholder: 'result', default: 'result' }
    ],
    codeTemplate: "const {{varName}} = await page.$eval('{{selector}}', el => el.textContent.trim());\nlogger.info('{{varName}}: ' + {{varName}});"
  },
  {
    type: 'select',
    label: 'Select Option',
    icon: '📋',
    params: [
      { name: 'selector', label: 'Selector', placeholder: '#dropdown, select' },
      { name: 'value', label: 'Value', placeholder: 'option1' }
    ],
    codeTemplate: "await page.select('{{selector}}', '{{value}}');"
  },
  {
    type: 'log',
    label: 'Log Message',
    icon: '💬',
    params: [{ name: 'message', label: 'Message', placeholder: 'Step completed' }],
    codeTemplate: "logger.info('{{message}}');"
  }
];

let editorBlocks = [];
let blockIdCounter = 0;
let draggedBlockIndex = null;

function openBlockEditor() {
  editorBlocks = [];
  blockIdCounter = 0;
  draggedBlockIndex = null;
  const modal = document.getElementById('modal-block-editor');
  modal.classList.remove('hidden');
  renderBlockPalette();
  renderBlockCanvas();
}

function closeBlockEditor() {
  document.getElementById('modal-block-editor').classList.add('hidden');
}

function renderBlockPalette() {
  const list = document.getElementById('block-palette-list');
  list.innerHTML = BLOCK_TYPES.map(bt => `
    <div class="block-palette-item" data-type="${bt.type}">
      <span class="block-icon">${bt.icon}</span>
      <span>${bt.label}</span>
    </div>
  `).join('');

  list.querySelectorAll('.block-palette-item').forEach(item => {
    item.addEventListener('click', () => addBlock(item.dataset.type));
  });
}

function addBlock(type) {
  const blockType = BLOCK_TYPES.find(bt => bt.type === type);
  if (!blockType) return;

  const block = {
    id: 'block_' + (++blockIdCounter),
    type: type,
    params: {},
    order: editorBlocks.length
  };

  // Set defaults
  blockType.params.forEach(p => {
    block.params[p.name] = p.default || '';
  });

  editorBlocks.push(block);
  renderBlockCanvas();
}

function removeBlock(blockId) {
  editorBlocks = editorBlocks.filter(b => b.id !== blockId);
  renderBlockCanvas();
}

function renderBlockCanvas() {
  const canvas = document.getElementById('block-canvas');
  document.getElementById('block-count').textContent = `(${editorBlocks.length} blocks)`;

  if (editorBlocks.length === 0) {
    canvas.innerHTML = '<p class="block-canvas-empty">Click a block on the left to add it here</p>';
    return;
  }

  canvas.innerHTML = editorBlocks.map((block, index) => {
    const blockType = BLOCK_TYPES.find(bt => bt.type === block.type);
    if (!blockType) return '';

    const paramsHtml = blockType.params.map(p => `
      <input type="text" data-block-id="${block.id}" data-param="${p.name}"
        placeholder="${escapeHtml(p.label)}" value="${escapeHtml(block.params[p.name] || '')}"
        title="${escapeHtml(p.label)}">
    `).join('');

    return `
      <div class="block-canvas-item" data-index="${index}" data-block-id="${block.id}" draggable="true">
        <span class="block-drag-handle">⠿</span>
        <div class="block-content">
          <div class="block-label">${blockType.icon} ${blockType.label}</div>
          <div class="block-params">${paramsHtml}</div>
        </div>
        <button class="block-remove" data-block-id="${block.id}">&times;</button>
      </div>
    `;
  }).join('');

  // Remove handlers
  canvas.querySelectorAll('.block-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeBlock(btn.dataset.blockId);
    });
  });

  // Param change handlers
  canvas.querySelectorAll('input[data-block-id]').forEach(input => {
    input.addEventListener('input', () => {
      const block = editorBlocks.find(b => b.id === input.dataset.blockId);
      if (block) block.params[input.dataset.param] = input.value;
    });
    // Prevent drag when interacting with inputs
    input.addEventListener('mousedown', (e) => e.stopPropagation());
  });

  // Drag-and-drop reorder
  const items = canvas.querySelectorAll('.block-canvas-item');
  items.forEach(item => {
    item.addEventListener('dragstart', (e) => {
      draggedBlockIndex = parseInt(item.dataset.index);
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });

    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      draggedBlockIndex = null;
      // Remove any drop indicators
      canvas.querySelectorAll('.block-drop-indicator').forEach(el => el.remove());
    });

    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });

    item.addEventListener('drop', (e) => {
      e.preventDefault();
      const targetIndex = parseInt(item.dataset.index);
      if (draggedBlockIndex !== null && draggedBlockIndex !== targetIndex) {
        const [moved] = editorBlocks.splice(draggedBlockIndex, 1);
        editorBlocks.splice(targetIndex, 0, moved);
        renderBlockCanvas();
      }
    });
  });
}

function generateCodeFromBlocks() {
  if (editorBlocks.length === 0) {
    showToast('No blocks added', 'warning');
    return;
  }

  const lines = ['// Auto-generated from Block Editor'];
  editorBlocks.forEach(block => {
    const blockType = BLOCK_TYPES.find(bt => bt.type === block.type);
    if (!blockType) return;

    let code = blockType.codeTemplate;
    blockType.params.forEach(p => {
      code = code.replace(new RegExp('\\{\\{' + p.name + '\\}\\}', 'g'), block.params[p.name] || p.default || '');
    });
    lines.push(code);
  });

  document.getElementById('script-code-editor').value = lines.join('\n');
  closeBlockEditor();
  showToast('Code generated from blocks', 'success');
}

// ============================================
// Record & Replay
// ============================================
// Pick Selector
// ============================================

let isPicking = false;

async function startPicker() {
  const runningProfiles = profiles.filter(p => p.status === 'running');
  if (runningProfiles.length === 0) {
    showToast('No running profiles. Start a browser first.', 'warning');
    return;
  }

  const select = document.getElementById('run-profile-select');
  let profileId = select ? select.value : '';
  if (!profileId) {
    profileId = runningProfiles[0].profileId;
  }

  const btnPick = document.getElementById('btn-pick-selector');
  isPicking = true;
  btnPick.classList.add('picking-active');
  btnPick.textContent = 'Picking...';
  btnPick.disabled = true;
  showToast('Switch to browser and click on any element', 'info');

  try {
    const response = await window.api.scripts.startPicker(profileId);
    if (response.success && response.data && !response.data.cancelled) {
      const { cssSelector, xpath, tagName, text } = response.data;

      // Insert selector at cursor in editor
      const editor = document.getElementById('script-code-editor');
      const cursorPos = editor.selectionStart;
      const before = editor.value.substring(0, cursorPos);
      const after = editor.value.substring(editor.selectionEnd);
      const insertText = cssSelector;
      editor.value = before + insertText + after;
      editor.selectionStart = editor.selectionEnd = cursorPos + insertText.length;
      editor.focus();

      showToast(`Picked: ${cssSelector}`, 'success');
    } else if (response.data && response.data.cancelled) {
      showToast('Picker cancelled', 'info');
    } else {
      showToast(response.error || 'Picker failed', 'error');
    }
  } catch (error) {
    showToast('Picker failed: ' + (error.message || 'Unknown error'), 'error');
  }

  isPicking = false;
  btnPick.classList.remove('picking-active');
  btnPick.textContent = 'Pick Selector';
  btnPick.disabled = false;
}

// ============================================
// Record & Replay
// ============================================

let isRecording = false;
let recordingProfileId = null;
let recordingPollTimer = null;

async function startRecording() {
  // Get running profiles
  const runningProfiles = profiles.filter(p => p.status === 'running');
  if (runningProfiles.length === 0) {
    showToast('No running profiles. Start a browser first.', 'warning');
    return;
  }

  // Use the profile selected in run-profile-select, or first running
  const select = document.getElementById('run-profile-select');
  let profileId = select ? select.value : '';
  if (!profileId) {
    profileId = runningProfiles[0].profileId;
  }

  try {
    const response = await window.api.scripts.startRecording(profileId);
    if (response.success) {
      isRecording = true;
      recordingProfileId = profileId;
      updateRecordingUI();
      showToast('Recording started. Interact with the browser.', 'success');

      // Poll status every 2s
      recordingPollTimer = setInterval(async () => {
        try {
          const statusRes = await window.api.scripts.getRecordingStatus(recordingProfileId);
          if (statusRes.success) {
            document.getElementById('recording-event-count').textContent = statusRes.data.eventCount;
          }
        } catch (e) { /* ignore */ }
      }, 2000);
    } else {
      showToast(response.error || 'Failed to start recording', 'error');
    }
  } catch (error) {
    showToast('Failed to start recording', 'error');
  }
}

async function stopRecording() {
  if (!isRecording || !recordingProfileId) return;

  if (recordingPollTimer) {
    clearInterval(recordingPollTimer);
    recordingPollTimer = null;
  }

  try {
    const response = await window.api.scripts.stopRecording(recordingProfileId);
    if (response.success) {
      document.getElementById('script-code-editor').value = response.data.code;
      showToast(`Recording stopped. ${response.data.eventCount} events captured.`, 'success');
    } else {
      showToast(response.error || 'Failed to stop recording', 'error');
    }
  } catch (error) {
    showToast('Failed to stop recording', 'error');
  }

  isRecording = false;
  recordingProfileId = null;
  updateRecordingUI();
}

function updateRecordingUI() {
  const indicator = document.getElementById('recording-indicator');
  const btnRecord = document.getElementById('btn-record');

  if (isRecording) {
    indicator.classList.remove('hidden');
    btnRecord.classList.add('recording-active');
    btnRecord.textContent = 'Recording...';
  } else {
    indicator.classList.add('hidden');
    btnRecord.classList.remove('recording-active');
    btnRecord.textContent = 'Record';
    document.getElementById('recording-event-count').textContent = '0';
  }
}

/**
 * Load scripts data
 */
async function loadScriptsData() {
  try {
    const response = await window.api.scripts.list();
    if (response.success) {
      scriptsList = response.data;
      renderScriptList();
      updateRunProfileSelect();
    }
  } catch (error) {
    console.error('[App] Load scripts error:', error);
  }

  // Load executions
  await loadExecutions();
}

/**
 * Render script list sidebar
 */
function renderScriptList() {
  const listEl = document.getElementById('script-list');
  if (!listEl) return;

  if (scriptsList.length === 0) {
    listEl.innerHTML = '<p class="no-scripts-message">No scripts yet</p>';
    return;
  }

  listEl.innerHTML = scriptsList.map(s => `
    <div class="script-list-item ${currentScript && currentScript.id === s.id ? 'active' : ''}" data-id="${s.id}">
      <span class="script-item-name">${escapeHtml(s.name)}</span>
      <span class="script-item-date">${new Date(s.updatedAt).toLocaleDateString()}</span>
    </div>
  `).join('');

  // Click handlers
  listEl.querySelectorAll('.script-list-item').forEach(item => {
    item.addEventListener('click', () => {
      selectScript(item.dataset.id);
    });
  });
}

/**
 * Select and load a script into editor
 */
async function selectScript(scriptId) {
  try {
    const response = await window.api.scripts.get(scriptId);
    if (response.success) {
      currentScript = response.data;
      document.getElementById('script-name-input').value = currentScript.name;
      document.getElementById('script-desc-input').value = currentScript.description || '';
      document.getElementById('script-code-editor').value = currentScript.code || '';

      // Enable buttons
      document.getElementById('btn-save-script').disabled = false;
      document.getElementById('btn-run-script').disabled = false;
      document.getElementById('btn-delete-script').disabled = false;
      document.getElementById('btn-run-on-profile').disabled = false;
      document.getElementById('btn-run-batch').disabled = false;

      renderScriptList();
    }
  } catch (error) {
    console.error('[App] Select script error:', error);
    showToast('Failed to load script', 'error');
  }
}

/**
 * Update running profiles in the select dropdown
 */
function updateRunProfileSelect() {
  const select = document.getElementById('run-profile-select');
  if (!select) return;

  // Get running profiles from main profile list
  const runningProfiles = profiles.filter(p => p.status === 'running');

  select.innerHTML = '<option value="">Select running profile...</option>';
  runningProfiles.forEach(p => {
    const option = document.createElement('option');
    option.value = p.profileId;
    option.textContent = `${p.name || p.profileId} (PID: ${p.pid || '?'})`;
    select.appendChild(option);
  });
}

/**
 * Load executions
 */
async function loadExecutions() {
  try {
    const response = await window.api.scripts.getExecutions();
    if (response.success) {
      executionsList = response.data;
      renderExecutionList();
    }
  } catch (error) {
    console.error('[App] Load executions error:', error);
  }
}

/**
 * Render execution list
 */
function renderExecutionList() {
  const listEl = document.getElementById('execution-list');
  if (!listEl) return;

  if (executionsList.length === 0) {
    listEl.innerHTML = '<p class="no-executions-message">No executions yet</p>';
    return;
  }

  listEl.innerHTML = executionsList.slice(0, 20).map(e => {
    const time = new Date(e.startedAt).toLocaleTimeString();
    return `
      <div class="exec-item" data-id="${e.id}">
        <span class="exec-status ${e.status}"></span>
        <span class="exec-info">
          ${escapeHtml(e.scriptName || e.scriptId)} - ${e.profileId.substr(0, 8)}... [${e.status}] ${time}
        </span>
        <span class="exec-actions">
          ${e.status === 'running' ? `<button class="btn btn-danger btn-sm btn-stop-exec" data-id="${e.id}">Stop</button>` : ''}
          <button class="btn btn-secondary btn-sm btn-view-logs" data-id="${e.id}">Logs</button>
        </span>
      </div>
    `;
  }).join('');

  // Stop button handlers
  listEl.querySelectorAll('.btn-stop-exec').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const execId = btn.dataset.id;
      try {
        await window.api.scripts.stopExecution(execId);
        showToast('Execution stopped', 'success');
        await loadExecutions();
      } catch (error) {
        showToast('Failed to stop execution', 'error');
      }
    });
  });

  // View logs handlers
  listEl.querySelectorAll('.btn-view-logs').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      viewExecutionLogs(btn.dataset.id);
    });
  });
}

/**
 * View execution logs
 */
async function viewExecutionLogs(execId) {
  const logsPanel = document.getElementById('execution-logs');
  const logsContainer = document.getElementById('exec-logs-container');
  const logsTitle = document.getElementById('exec-logs-title');

  // Find execution info
  const exec = executionsList.find(e => e.id === execId);
  logsTitle.textContent = exec ? `Logs - ${exec.scriptName || exec.scriptId}` : 'Logs';
  logsPanel.style.display = 'flex';
  logsContainer.innerHTML = '<div class="exec-log-entry info">Loading logs...</div>';

  // Clear previous poll
  if (execLogsPollTimer) {
    clearInterval(execLogsPollTimer);
    execLogsPollTimer = null;
  }

  const fetchLogs = async () => {
    try {
      const response = await window.api.scripts.getExecutionLogs(execId);
      if (response.success) {
        const logs = response.data;
        if (logs.length === 0) {
          logsContainer.innerHTML = '<div class="exec-log-entry info">No logs yet...</div>';
        } else {
          logsContainer.innerHTML = logs.map(log => {
            const time = new Date(log.time).toLocaleTimeString();
            return `<div class="exec-log-entry ${log.level}"><span class="log-time">${time}</span>${escapeHtml(log.message)}</div>`;
          }).join('');
          logsContainer.scrollTop = logsContainer.scrollHeight;
        }
      }
    } catch (error) {
      console.error('[App] Fetch logs error:', error);
    }
  };

  await fetchLogs();

  // Auto-refresh logs if execution is running
  if (exec && exec.status === 'running') {
    execLogsPollTimer = setInterval(async () => {
      await fetchLogs();
      // Check if still running
      const updated = executionsList.find(e => e.id === execId);
      if (!updated || updated.status !== 'running') {
        clearInterval(execLogsPollTimer);
        execLogsPollTimer = null;
        await loadExecutions();
      }
    }, 2000);
  }
}

/**
 * Setup Scripts tab event listeners
 */
function setupScriptsEvents() {
  // New script button
  const btnNew = document.getElementById('btn-new-script');
  if (btnNew) {
    btnNew.addEventListener('click', async () => {
      try {
        const response = await window.api.scripts.create({
          name: 'New Script',
          code: '// Write your automation script here\n// Available: page, browser, logger, sleep(ms)\n\nawait page.goto(\'https://example.com\', { waitUntil: \'networkidle2\' });\nconst title = await page.title();\nlogger.info(\'Page title: \' + title);\n'
        });
        if (response.success) {
          await loadScriptsData();
          selectScript(response.data.id);
          showToast('Script created', 'success');
        }
      } catch (error) {
        showToast('Failed to create script', 'error');
      }
    });
  }

  // Save script button
  const btnSave = document.getElementById('btn-save-script');
  if (btnSave) {
    btnSave.addEventListener('click', async () => {
      if (!currentScript) return;

      const name = document.getElementById('script-name-input').value.trim();
      const description = document.getElementById('script-desc-input').value.trim();
      const code = document.getElementById('script-code-editor').value;

      if (!name) {
        showToast('Script name is required', 'warning');
        return;
      }

      try {
        const response = await window.api.scripts.update(currentScript.id, { name, description, code });
        if (response.success) {
          currentScript = response.data;
          await loadScriptsData();
          showToast('Script saved', 'success');
        } else {
          showToast(response.error || 'Failed to save', 'error');
        }
      } catch (error) {
        showToast('Failed to save script', 'error');
      }
    });
  }

  // Delete script button
  const btnDelete = document.getElementById('btn-delete-script');
  if (btnDelete) {
    btnDelete.addEventListener('click', async () => {
      if (!currentScript) return;

      const confirmed = await window.api.dialog.confirm(`Delete script "${currentScript.name}"?`);
      if (!confirmed) return;

      try {
        await window.api.scripts.delete(currentScript.id);
        currentScript = null;
        document.getElementById('script-name-input').value = '';
        document.getElementById('script-desc-input').value = '';
        document.getElementById('script-code-editor').value = '';
        document.getElementById('btn-save-script').disabled = true;
        document.getElementById('btn-run-script').disabled = true;
        document.getElementById('btn-delete-script').disabled = true;
        document.getElementById('btn-run-on-profile').disabled = true;
        document.getElementById('btn-run-batch').disabled = true;
        await loadScriptsData();
        showToast('Script deleted', 'success');
      } catch (error) {
        showToast('Failed to delete script', 'error');
      }
    });
  }

  // Run on selected profile
  const btnRunOnProfile = document.getElementById('btn-run-on-profile');
  if (btnRunOnProfile) {
    btnRunOnProfile.addEventListener('click', async () => {
      if (!currentScript) return;

      const select = document.getElementById('run-profile-select');
      const profileId = select.value;
      if (!profileId) {
        showToast('Select a running profile first', 'warning');
        return;
      }

      try {
        const response = await window.api.scripts.run(currentScript.id, profileId);
        if (response.success) {
          showToast('Script started', 'success');
          await loadExecutions();
          // Auto view logs
          viewExecutionLogs(response.data.id);
        } else {
          showToast(response.error || 'Failed to run script', 'error');
        }
      } catch (error) {
        showToast('Failed to run script', 'error');
      }
    });
  }

  // Run on all running profiles
  const btnRunBatch = document.getElementById('btn-run-batch');
  if (btnRunBatch) {
    btnRunBatch.addEventListener('click', async () => {
      if (!currentScript) return;

      const runningProfiles = profiles.filter(p => p.status === 'running');
      if (runningProfiles.length === 0) {
        showToast('No running profiles', 'warning');
        return;
      }

      const confirmed = await window.api.dialog.confirm(`Run script on ${runningProfiles.length} running profiles?`);
      if (!confirmed) return;

      try {
        const profileIds = runningProfiles.map(p => p.profileId);
        const response = await window.api.scripts.runBatch(currentScript.id, profileIds, 3);
        if (response.success) {
          showToast(`Script started on ${response.data.length} profiles`, 'success');
          await loadExecutions();
        } else {
          showToast(response.error || 'Failed to run batch', 'error');
        }
      } catch (error) {
        showToast('Failed to run batch', 'error');
      }
    });
  }

  // Run button in editor header (same as run on profile)
  const btnRun = document.getElementById('btn-run-script');
  if (btnRun) {
    btnRun.addEventListener('click', () => {
      const btnRunOnP = document.getElementById('btn-run-on-profile');
      if (btnRunOnP) btnRunOnP.click();
    });
  }

  // Refresh executions
  const btnRefreshExec = document.getElementById('btn-refresh-executions');
  if (btnRefreshExec) {
    btnRefreshExec.addEventListener('click', async () => {
      await loadExecutions();
      showToast('Executions refreshed', 'info');
    });
  }

  // Close execution logs
  const btnCloseExecLogs = document.getElementById('btn-close-exec-logs');
  if (btnCloseExecLogs) {
    btnCloseExecLogs.addEventListener('click', () => {
      document.getElementById('execution-logs').style.display = 'none';
      if (execLogsPollTimer) {
        clearInterval(execLogsPollTimer);
        execLogsPollTimer = null;
      }
    });
  }

  // Tab support in code editor (insert 2 spaces on Tab)
  const codeEditor = document.getElementById('script-code-editor');
  if (codeEditor) {
    codeEditor.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = codeEditor.selectionStart;
        const end = codeEditor.selectionEnd;
        codeEditor.value = codeEditor.value.substring(0, start) + '  ' + codeEditor.value.substring(end);
        codeEditor.selectionStart = codeEditor.selectionEnd = start + 2;
      }
    });
  }

  // ---- Template Library Events ----
  const btnTemplates = document.getElementById('btn-templates');
  if (btnTemplates) {
    btnTemplates.addEventListener('click', openTemplateLibrary);
  }

  const btnCloseTemplates = document.getElementById('btn-close-templates');
  if (btnCloseTemplates) {
    btnCloseTemplates.addEventListener('click', closeTemplateLibrary);
  }

  // Template category filter
  document.querySelectorAll('.template-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.template-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderTemplateGrid(btn.dataset.category);
    });
  });

  const btnTemplateBack = document.getElementById('btn-template-back');
  if (btnTemplateBack) {
    btnTemplateBack.addEventListener('click', () => {
      document.getElementById('template-params-form').classList.add('hidden');
      document.getElementById('template-grid').style.display = '';
      document.querySelector('.template-filter').style.display = '';
    });
  }

  const btnTemplateApply = document.getElementById('btn-template-apply');
  if (btnTemplateApply) {
    btnTemplateApply.addEventListener('click', applyTemplate);
  }

  // Close template modal on overlay click
  const templateModal = document.getElementById('modal-templates');
  if (templateModal) {
    templateModal.querySelector('.modal-overlay').addEventListener('click', closeTemplateLibrary);
  }

  // ---- Block Editor Events ----
  const btnBlockEditor = document.getElementById('btn-block-editor');
  if (btnBlockEditor) {
    btnBlockEditor.addEventListener('click', openBlockEditor);
  }

  const btnCloseBlockEditor = document.getElementById('btn-close-block-editor');
  if (btnCloseBlockEditor) {
    btnCloseBlockEditor.addEventListener('click', closeBlockEditor);
  }

  const btnCancelBlockEditor = document.getElementById('btn-cancel-block-editor');
  if (btnCancelBlockEditor) {
    btnCancelBlockEditor.addEventListener('click', closeBlockEditor);
  }

  const btnGenerateBlockCode = document.getElementById('btn-generate-block-code');
  if (btnGenerateBlockCode) {
    btnGenerateBlockCode.addEventListener('click', generateCodeFromBlocks);
  }

  const btnClearBlocks = document.getElementById('btn-clear-blocks');
  if (btnClearBlocks) {
    btnClearBlocks.addEventListener('click', () => {
      editorBlocks = [];
      renderBlockCanvas();
    });
  }

  // Close block editor modal on overlay click
  const blockEditorModal = document.getElementById('modal-block-editor');
  if (blockEditorModal) {
    blockEditorModal.querySelector('.modal-overlay').addEventListener('click', closeBlockEditor);
  }

  // ---- Pick Selector Events ----
  const btnPickSelector = document.getElementById('btn-pick-selector');
  if (btnPickSelector) {
    btnPickSelector.addEventListener('click', () => {
      if (!isPicking) startPicker();
    });
  }

  // ---- Record & Replay Events ----
  const btnRecord = document.getElementById('btn-record');
  if (btnRecord) {
    btnRecord.addEventListener('click', () => {
      if (isRecording) {
        stopRecording();
      } else {
        startRecording();
      }
    });
  }

  const btnStopRecording = document.getElementById('btn-stop-recording');
  if (btnStopRecording) {
    btnStopRecording.addEventListener('click', stopRecording);
  }
}

// Initialize scripts events after DOM ready
document.addEventListener('DOMContentLoaded', () => {
  setupScriptsEvents();
});

console.log('[App] Script loaded');
