// ================================
// 💾 영화과 아카이브 - 프론트 (실제 웹사이트용)
// API 레이어 + XSS 방지 + 에러/로딩 처리
// ================================

const API = window.ArchiveAPI;
const escapeHtml = API ? API.escapeHtml : function(s) { return (s == null ? '' : String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };

let currentUser = null;
let selectedYear = '전체';
let selectedGenre = '전체';
let selectedCategory = '전체';
let currentVideoId = null;
let videosCache = [];
let customThumbnailFile = null;
let customThumbnailDataUrl = null;

// ---------- 유틸 ----------
function setLoading(show) {
    const el = document.getElementById('loadingOverlay');
    if (el) el.classList.toggle('hidden', !show);
}

function showMessage(msg, isError) {
    const el = document.getElementById('globalMessage');
    if (!el) return;
    el.textContent = msg;
    el.className = 'global-message ' + (isError ? 'error' : 'info');
    el.classList.remove('hidden');
    setTimeout(function() { el.classList.add('hidden'); }, 4000);
}

function getYoutubeEmbedUrl(url) {
    try {
        const videoId = url.split('v=')[1]?.split('&')[0] || url.split('/').pop();
        return 'https://www.youtube.com/embed/' + (videoId || '');
    } catch { return url; }
}

function getYoutubeVideoId(url) {
    try {
        return url.split('v=')[1]?.split('&')[0] || url.split('/').pop() || '';
    } catch { return ''; }
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);
    if (diff < 60) return '방금 전';
    if (diff < 3600) return Math.floor(diff / 60) + '분 전';
    if (diff < 86400) return Math.floor(diff / 3600) + '시간 전';
    if (diff < 604800) return Math.floor(diff / 86400) + '일 전';
    return date.toLocaleDateString('ko-KR');
}

// ---------- 초기화 ----------
window.addEventListener('DOMContentLoaded', function() {
    API.initLocalStorage();
    populateYearOptions();
    if (API.isSupabaseMode()) {
        var hint = document.getElementById('testAccountHint');
        if (hint) hint.classList.add('hidden');
    }
    initAuth();
    loadAndRender();
});

function populateYearOptions() {
    const yearSelect = document.getElementById('uploadYear');
    if (!yearSelect) return;
    const currentYear = new Date().getFullYear();
    for (let year = currentYear; year >= currentYear - 10; year--) {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year;
        if (year === currentYear) option.selected = true;
        yearSelect.appendChild(option);
    }
}

async function initAuth() {
    try {
        currentUser = await API.getCurrentUser();
        if (currentUser && !API.isSupabaseMode()) API.setCurrentUserLocal(currentUser);
        updateLoginStatus();
    } catch (e) {
        showMessage(e.message || '로그인 상태를 확인할 수 없습니다.', true);
    }
}

async function loadAndRender() {
    setLoading(true);
    try {
        videosCache = await API.getVideos();
        renderFilters();
        renderVideos();
    } catch (e) {
        showMessage(e.message || '영상 목록을 불러오지 못했습니다.', true);
        document.getElementById('videoGrid').innerHTML = '<div class="empty-message">영상을 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.</div>';
    } finally {
        setLoading(false);
    }
}

// ---------- 로그인/회원가입 ----------
function showLoginModal() {
    document.getElementById('loginModal').style.display = 'block';
    switchAuthTab('login');
    document.getElementById('authError').classList.add('hidden');
}

function closeLoginModal() {
    document.getElementById('loginModal').style.display = 'none';
    document.getElementById('loginForm').reset();
    document.getElementById('signupForm').reset();
    document.getElementById('authError').classList.add('hidden');
}

function switchAuthTab(tab) {
    var isLogin = tab === 'login';
    document.getElementById('authModalTitle').textContent = isLogin ? '로그인' : '회원가입';
    document.querySelectorAll('.auth-tab').forEach(function(t) { t.classList.toggle('active', t.getAttribute('data-tab') === tab); });
    document.getElementById('loginForm').classList.toggle('hidden', !isLogin);
    document.getElementById('signupForm').classList.toggle('hidden', isLogin);
    document.getElementById('authError').classList.add('hidden');
}

function showAuthError(msg) {
    var el = document.getElementById('authError');
    el.textContent = msg;
    el.classList.remove('hidden');
}

document.getElementById('loginForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    var studentId = document.getElementById('studentId').value.trim();
    var password = document.getElementById('password').value;
    document.getElementById('authError').classList.add('hidden');
    if (studentId.length !== 8) {
        showAuthError('학번은 8자리여야 합니다.');
        return;
    }
    setLoading(true);
    try {
        currentUser = await API.authSignIn(studentId, password);
        API.setCurrentUserLocal(currentUser);
        updateLoginStatus();
        closeLoginModal();
        showMessage('환영합니다, ' + escapeHtml(currentUser.name) + '님!', false);
    } catch (err) {
        showAuthError(err.message || '로그인에 실패했습니다.');
    } finally {
        setLoading(false);
    }
});

document.getElementById('signupForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    var studentId = document.getElementById('signupStudentId').value.trim();
    var name = document.getElementById('signupName').value.trim();
    var password = document.getElementById('signupPassword').value;
    var confirmPassword = document.getElementById('signupPasswordConfirm').value;
    document.getElementById('authError').classList.add('hidden');
    if (studentId.length !== 8) {
        showAuthError('학번은 8자리여야 합니다.');
        return;
    }
    if (password.length < 6) {
        showAuthError('비밀번호는 6자 이상이어야 합니다.');
        return;
    }
    if (password !== confirmPassword) {
        showAuthError('비밀번호가 일치하지 않습니다.');
        return;
    }
    setLoading(true);
    try {
        currentUser = await API.authSignUp(studentId, password, name);
        API.setCurrentUserLocal(currentUser);
        updateLoginStatus();
        closeLoginModal();
        showMessage('회원가입이 완료되었습니다. 환영합니다!', false);
    } catch (err) {
        showAuthError(err.message || '회원가입에 실패했습니다.');
    } finally {
        setLoading(false);
    }
});

function logout() {
    if (!confirm('로그아웃 하시겠습니까?')) return;
    API.authSignOut();
    currentUser = null;
    updateLoginStatus();
    if (!document.getElementById('playerScreen').classList.contains('hidden')) closePlayer();
}

function updateLoginStatus() {
    var isLoggedIn = currentUser !== null;
    document.getElementById('loginButton').classList.toggle('hidden', isLoggedIn);
    document.getElementById('logoutButton').classList.toggle('hidden', !isLoggedIn);
    document.getElementById('userName').textContent = isLoggedIn ? currentUser.name : '';
    document.getElementById('playerLoginButton').classList.toggle('hidden', isLoggedIn);
    document.getElementById('playerLogoutButton').classList.toggle('hidden', !isLoggedIn);
    document.getElementById('playerUserName').textContent = isLoggedIn ? currentUser.name : '';
}

// ---------- 필터 및 영상 목록 ----------
function renderFilters() {
    var videos = videosCache;
    var years = ['전체'].concat([].slice.call(new Set(videos.map(function(v) { return v.year; }))).sort(function(a,b) { return b - a; }));
    var genres = ['전체'].concat([].slice.call(new Set(videos.map(function(v) { return v.genre; }))));
    var categories = ['전체'].concat([].slice.call(new Set(videos.map(function(v) { return v.category; }))));

    function yearItem(y) {
        var count = y === '전체' ? videos.length : videos.filter(function(v) { return v.year === y; }).length;
        var onclick = "selectYear(" + (y === '전체' ? "'전체'" : y) + ")";
        return '<div class="filter-item ' + (y === selectedYear ? 'active' : '') + '" onclick="' + onclick + '"><span>' + escapeHtml(String(y)) + '</span><span class="filter-count">' + count + '</span></div>';
    }
    function genreItem(g) {
        var count = g === '전체' ? videos.length : videos.filter(function(v) { return v.genre === g; }).length;
        return '<div class="filter-item ' + (g === selectedGenre ? 'active' : '') + '" onclick="selectGenre(\'' + escapeHtml(g).replace(/'/g, "\\'") + '\')"><span>' + escapeHtml(g) + '</span><span class="filter-count">' + count + '</span></div>';
    }
    function categoryItem(c) {
        var count = c === '전체' ? videos.length : videos.filter(function(v) { return v.category === c; }).length;
        return '<div class="filter-item ' + (c === selectedCategory ? 'active' : '') + '" onclick="selectCategory(\'' + escapeHtml(c).replace(/'/g, "\\'") + '\')"><span>' + escapeHtml(c) + '</span><span class="filter-count">' + count + '</span></div>';
    }

    document.getElementById('yearFilters').innerHTML = years.map(yearItem).join('');
    document.getElementById('genreFilters').innerHTML = genres.map(genreItem).join('');
    document.getElementById('categoryFilters').innerHTML = categories.map(categoryItem).join('');
}

function selectYear(year) {
    selectedYear = year;
    renderFilters();
    renderVideos();
}

function selectGenre(genre) {
    selectedGenre = genre;
    renderFilters();
    renderVideos();
}

function selectCategory(category) {
    selectedCategory = category;
    renderFilters();
    renderVideos();
}

function resetFilters() {
    selectedYear = '전체';
    selectedGenre = '전체';
    selectedCategory = '전체';
    document.getElementById('searchInput').value = '';
    document.getElementById('sortSelect').value = 'latest';
    renderFilters();
    renderVideos();
}

function filterVideos() {
    renderVideos();
}

function renderVideos() {
    var searchQuery = (document.getElementById('searchInput').value || '').toLowerCase();
    var sortOption = document.getElementById('sortSelect').value;

    var filtered = videosCache.filter(function(video) {
        var matchSearch = (video.title || '').toLowerCase().includes(searchQuery) || (video.director || '').toLowerCase().includes(searchQuery);
        var matchYear = selectedYear === '전체' || video.year === selectedYear;
        var matchGenre = selectedGenre === '전체' || video.genre === selectedGenre;
        var matchCategory = selectedCategory === '전체' || video.category === selectedCategory;
        return matchSearch && matchYear && matchGenre && matchCategory;
    });

    if (sortOption === 'latest') filtered.sort(function(a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
    else if (sortOption === 'oldest') filtered.sort(function(a, b) { return new Date(a.createdAt) - new Date(b.createdAt); });
    else if (sortOption === 'views') filtered.sort(function(a, b) { return (b.views || 0) - (a.views || 0); });
    else if (sortOption === 'likes') filtered.sort(function(a, b) { return (b.likes ? b.likes.length : 0) - (a.likes ? a.likes.length : 0); });

    var titleParts = [];
    if (selectedYear !== '전체') titleParts.push(selectedYear);
    if (selectedCategory !== '전체') titleParts.push(selectedCategory);
    if (selectedGenre !== '전체') titleParts.push(selectedGenre);
    document.getElementById('sectionTitle').textContent = titleParts.length ? titleParts.join(' > ') : '전체 영상';
    document.getElementById('videoCount').textContent = filtered.length + '개의 영상';

    var grid = document.getElementById('videoGrid');
    if (filtered.length === 0) {
        grid.innerHTML = '<div class="empty-message"><div style="font-size:48px;margin-bottom:16px">🎬</div><div>영상이 없습니다</div><div style="font-size:14px;margin-top:8px">필터를 변경하거나 첫 번째 영상을 업로드해보세요!</div></div>';
        return;
    }

    var videoIdAttr = function(v) { return typeof v.id === 'string' ? "'" + escapeHtml(v.id).replace(/'/g, "\\'") + "'" : v.id; };
    grid.innerHTML = filtered.map(function(video) {
        var thumb = escapeHtml(video.thumbnail || '');
        var title = escapeHtml(video.title || '');
        var director = escapeHtml(video.director || '');
        var duration = escapeHtml(video.duration || '');
        var year = escapeHtml(String(video.year || ''));
        var category = escapeHtml(video.category || '');
        var genre = escapeHtml(video.genre || '');
        var views = video.views || 0;
        var likeCount = video.likes ? video.likes.length : 0;
        var commentCount = video.comments ? video.comments.length : 0;
        return '<div class="video-card" onclick="openPlayer(' + videoIdAttr(video) + ')"><div class="video-thumbnail"><img src="' + thumb + '" alt="' + title + '"><div class="play-overlay"><div class="play-button">▶</div></div><div class="duration">' + duration + '</div></div><div class="video-info"><div class="video-title">' + title + '</div><div class="video-director">' + director + '</div><div class="video-meta"><div class="video-year">' + year + ' · ' + category + '</div><div class="genre-tag">' + genre + '</div></div><div class="video-stats"><div class="stat"><span>👁️</span><span>' + views + '</span></div><div class="stat"><span>❤️</span><span>' + likeCount + '</span></div><div class="stat"><span>💬</span><span>' + commentCount + '</span></div></div></div></div>';
    }).join('');
}

// ---------- 플레이어 ----------
function openPlayer(videoId) {
    currentVideoId = videoId;
    setLoading(true);
    API.getVideo(videoId).then(function(video) {
        if (!video) return;
        API.incrementVideoViews(videoId);
        document.getElementById('mainScreen').classList.add('hidden');
        document.getElementById('playerScreen').classList.remove('hidden');

        var embedUrl = getYoutubeEmbedUrl(video.youtubeUrl);
        document.getElementById('videoPlayer').innerHTML = '<iframe src="' + escapeHtml(embedUrl) + '" allowfullscreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"></iframe>';

        document.getElementById('playerTitle').textContent = video.title;
        document.getElementById('playerMeta').innerHTML = '<div class="detail-meta-item"><span>👤</span><span>' + escapeHtml(video.director || '') + '</span></div><div class="detail-meta-item"><span>📅</span><span>' + escapeHtml(String(video.year)) + '</span></div><div class="detail-meta-item"><span>⏱️</span><span>' + escapeHtml(video.duration || '') + '</span></div><div class="detail-meta-item"><span>👁️</span><span>' + (video.views || 0) + '회</span></div>';
        document.getElementById('playerGenre').textContent = video.genre || '';
        document.getElementById('playerDescription').textContent = video.description || '';
        document.getElementById('youtubeLink').innerHTML = '<a href="' + escapeHtml(video.youtubeUrl || '#') + '" target="_blank" rel="noopener"><span>▶️</span><span>유튜브에서 보기</span></a>';

        updateLikeButtonAsync();
        renderCommentsAsync();
        window.scrollTo(0, 0);
    }).catch(function(e) {
        showMessage(e.message || '영상을 불러오지 못했습니다.', true);
    }).finally(function() {
        setLoading(false);
    });
}

function closePlayer() {
    document.getElementById('playerScreen').classList.add('hidden');
    document.getElementById('mainScreen').classList.remove('hidden');
    currentVideoId = null;
    document.getElementById('commentInput').value = '';
    loadAndRender();
    window.scrollTo(0, 0);
}

function updateLikeButtonAsync() {
    if (!currentVideoId) return;
    Promise.all([API.getLikeCount(currentVideoId), API.getUserLiked(currentVideoId, currentUser ? currentUser.id : null)]).then(function(res) {
        var count = res[0];
        var hasLiked = res[1];
        var likeBtn = document.getElementById('likeButton');
        likeBtn.className = 'btn-like' + (hasLiked ? ' liked' : '');
        document.getElementById('likeIcon').textContent = hasLiked ? '❤️' : '🤍';
        document.getElementById('likeCount').textContent = count;
    });
}

function toggleLike() {
    if (!currentUser) {
        showMessage('로그인이 필요합니다.', true);
        showLoginModal();
        return;
    }
    API.toggleLike(currentVideoId, currentUser.id).then(function() {
        updateLikeButtonAsync();
    }).catch(function(e) {
        showMessage(e.message || '처리하지 못했습니다.', true);
    });
}

function renderCommentsAsync() {
    if (!currentVideoId) return;
    API.getComments(currentVideoId).then(function(comments) {
        document.getElementById('commentCount').textContent = comments.length;
        var list = document.getElementById('commentsList');
        if (comments.length === 0) {
            list.innerHTML = '<div class="empty-message"><div style="font-size:32px;margin-bottom:8px">💬</div><div>첫 댓글을 남겨보세요!</div></div>';
            return;
        }
        list.innerHTML = comments.map(function(c) {
            return '<div class="comment"><div class="comment-header"><div class="comment-user">' + escapeHtml(c.userName || '') + '</div><div class="comment-date">' + formatDate(c.createdAt) + '</div></div><div class="comment-text">' + escapeHtml(c.content || '') + '</div></div>';
        }).join('');
    });
}

function addComment() {
    if (!currentUser) {
        showMessage('로그인이 필요합니다.', true);
        showLoginModal();
        return;
    }
    var content = (document.getElementById('commentInput').value || '').trim();
    if (!content) {
        showMessage('댓글 내용을 입력해주세요.', true);
        return;
    }
    var btn = document.getElementById('commentSubmitBtn');
    btn.disabled = true;
    API.addComment(currentVideoId, content, currentUser.id, currentUser.name).then(function() {
        document.getElementById('commentInput').value = '';
        renderCommentsAsync();
    }).catch(function(e) {
        showMessage(e.message || '댓글 작성에 실패했습니다.', true);
    }).finally(function() {
        btn.disabled = false;
    });
}

// ---------- 업로드 ----------
function checkLoginAndUpload() {
    if (!currentUser) {
        showMessage('로그인이 필요합니다.', true);
        showLoginModal();
        return;
    }
    openUploadModal();
}

function openUploadModal() {
    document.getElementById('uploadModal').style.display = 'block';
}

function closeUploadModal() {
    document.getElementById('uploadModal').style.display = 'none';
    document.getElementById('uploadForm').reset();
    document.getElementById('autoThumbnailPreview').innerHTML = '';
    document.getElementById('customThumbnailPreview').innerHTML = '';
    document.getElementById('customThumbnailSection').classList.add('hidden');
    customThumbnailFile = null;
    customThumbnailDataUrl = null;
}

function toggleThumbnailUpload() {
    var option = document.querySelector('input[name="thumbnailOption"]:checked').value;
    var customSection = document.getElementById('customThumbnailSection');
    var autoPreview = document.getElementById('autoThumbnailPreview');
    if (option === 'custom') {
        customSection.classList.remove('hidden');
        autoPreview.innerHTML = '';
    } else {
        customSection.classList.add('hidden');
        document.getElementById('customThumbnailPreview').innerHTML = '';
        customThumbnailFile = null;
        customThumbnailDataUrl = null;
        generateThumbnail();
    }
}

function handleCustomThumbnail() {
    var file = document.getElementById('customThumbnailInput').files[0];
    if (!file) {
        customThumbnailFile = null;
        customThumbnailDataUrl = null;
        document.getElementById('customThumbnailPreview').innerHTML = '';
        return;
    }
    if (file.size > 5 * 1024 * 1024) {
        showMessage('썸네일 이미지는 5MB 이하여야 합니다.', true);
        document.getElementById('customThumbnailInput').value = '';
        return;
    }
    if (!file.type.startsWith('image/')) {
        showMessage('이미지 파일만 업로드 가능합니다.', true);
        document.getElementById('customThumbnailInput').value = '';
        return;
    }
    customThumbnailFile = file;
    var reader = new FileReader();
    reader.onload = function(e) {
        customThumbnailDataUrl = e.target.result;
        document.getElementById('customThumbnailPreview').innerHTML = '<div class="thumbnail-preview"><img src="' + escapeHtml(e.target.result) + '" alt="썸네일 미리보기"></div>';
    };
    reader.readAsDataURL(file);
}

function generateThumbnail() {
    if (document.querySelector('input[name="thumbnailOption"]:checked').value !== 'auto') return;
    var url = document.getElementById('uploadUrl').value;
    var videoId = getYoutubeVideoId(url);
    var preview = document.getElementById('autoThumbnailPreview');
    if (videoId) {
        var thumbUrl = 'https://img.youtube.com/vi/' + videoId + '/maxresdefault.jpg';
        preview.innerHTML = '<div class="thumbnail-preview"><img src="' + escapeHtml(thumbUrl) + '" alt="썸네일 미리보기"></div>';
    } else {
        preview.innerHTML = '';
    }
}

function submitUpload() {
    var title = document.getElementById('uploadTitle').value.trim();
    var url = document.getElementById('uploadUrl').value.trim();
    var genre = document.getElementById('uploadGenre').value;
    var category = document.getElementById('uploadCategory').value;
    var year = parseInt(document.getElementById('uploadYear').value, 10);
    var duration = document.getElementById('uploadDuration').value.trim();
    var description = document.getElementById('uploadDescription').value.trim();
    var thumbnailOption = document.querySelector('input[name="thumbnailOption"]:checked').value;

    if (!title || !url || !duration || !description) {
        showMessage('모든 필수 항목을 입력해주세요.', true);
        return;
    }
    if (!url.includes('youtube.com') && !url.includes('youtu.be')) {
        showMessage('올바른 유튜브 URL을 입력해주세요.', true);
        return;
    }

    var thumbnailUrl;
    if (thumbnailOption === 'custom') {
        if (!customThumbnailDataUrl) {
            showMessage('커스텀 썸네일을 업로드해주세요.', true);
            return;
        }
        thumbnailUrl = customThumbnailDataUrl;
    } else {
        thumbnailUrl = 'https://img.youtube.com/vi/' + getYoutubeVideoId(url) + '/maxresdefault.jpg';
    }

    var video = {
        title: title,
        youtubeUrl: url,
        thumbnail: thumbnailUrl,
        genre: genre,
        category: category,
        year: year,
        duration: duration,
        description: description,
        director: currentUser.name,
        directorId: currentUser.id
    };

    var btn = document.getElementById('uploadSubmitBtn');
    btn.disabled = true;
    setLoading(true);
    API.addVideo(video).then(function() {
        showMessage('영상이 업로드되었습니다!', false);
        closeUploadModal();
        loadAndRender();
    }).catch(function(e) {
        showMessage(e.message || '업로드에 실패했습니다.', true);
    }).finally(function() {
        btn.disabled = false;
        setLoading(false);
    });
}

// ---------- 이벤트 ----------
document.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && e.ctrlKey) {
        var commentInput = document.getElementById('commentInput');
        if (document.activeElement === commentInput && currentVideoId) addComment();
    }
});

window.addEventListener('click', function(e) {
    if (e.target === document.getElementById('loginModal')) closeLoginModal();
    if (e.target === document.getElementById('uploadModal')) closeUploadModal();
});
