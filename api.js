// ================================
// 🔌 영화과 아카이브 - API 레이어
// Supabase 연동 + localStorage 폴백, XSS 방지
// ================================

(function(global) {
    const config = global.ARCHIVE_CONFIG || {};
    const STORAGE_KEYS = {
        users: 'filmArchive_users',
        videos: 'filmArchive_videos',
        currentUser: 'filmArchive_currentUser'
    };

    let supabase = null;
    // CDN(@supabase/supabase-js@2)을 사용하는 경우
    // 전역 객체는 global.supabase 이고, createClient 는 global.supabase.createClient 입니다.
    if (
        config.SUPABASE_URL &&
        config.SUPABASE_ANON_KEY &&
        global.supabase &&
        typeof global.supabase.createClient === 'function'
    ) {
        supabase = global.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
    }

    function log(...args) {
        if (config.DEBUG) console.log('[Archive]', ...args);
    }

    // ---------- XSS 방지: HTML 이스케이프 ----------
    function escapeHtml(str) {
        if (str == null || typeof str !== 'string') return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function isSupabaseMode() {
        return supabase !== null;
    }

    // ---------- localStorage 초기 데이터 ----------
    function initLocalStorage() {
        // 기본 데이터 없음 - 빈 상태로 시작
        if (!localStorage.getItem(STORAGE_KEYS.videos)) {
            localStorage.setItem(STORAGE_KEYS.videos, JSON.stringify([]));
        }
        if (!localStorage.getItem(STORAGE_KEYS.users)) {
            localStorage.setItem(STORAGE_KEYS.users, JSON.stringify([]));
        }
    }

    // ---------- 영상 목록/단건 ----------
    async function getVideos() {
        if (supabase) {
            const [videosRes, likesRes, commentsRes] = await Promise.all([
                supabase.from('videos').select('*').order('created_at', { ascending: false }),
                supabase.from('video_likes').select('video_id'),
                supabase.from('comments').select('video_id')
            ]);
            if (videosRes.error) {
                log('getVideos error', videosRes.error);
                throw new Error(videosRes.error.message || '영상 목록을 불러오지 못했습니다.');
            }
            const likesByVideo = {};
            (likesRes.data || []).forEach(r => { likesByVideo[r.video_id] = (likesByVideo[r.video_id] || 0) + 1; });
            const commentsByVideo = {};
            (commentsRes.data || []).forEach(r => { commentsByVideo[r.video_id] = (commentsByVideo[r.video_id] || 0) + 1; });
            return (videosRes.data || []).map(row => ({
                id: row.id,
                title: row.title,
                director: row.director_name,
                directorId: row.director_id,
                year: row.year,
                genre: row.genre,
                category: row.category,
                duration: row.duration,
                youtubeUrl: row.youtube_url,
                thumbnail: row.thumbnail,
                description: row.description,
                views: row.views || 0,
                likes: Array(likesByVideo[row.id] || 0).fill(null),
                comments: Array(commentsByVideo[row.id] || 0).fill(null),
                createdAt: row.created_at
            }));
        }
        initLocalStorage();
        return JSON.parse(localStorage.getItem(STORAGE_KEYS.videos) || '[]');
    }

    async function getVideo(id) {
        if (supabase) {
            const { data: row, error } = await supabase.from('videos').select('*').eq('id', id).single();
            if (error || !row) return null;
            const [likesRes, commentsRes] = await Promise.all([
                supabase.from('video_likes').select('user_id').eq('video_id', id),
                supabase.from('comments').select('*').eq('video_id', id).order('created_at', { ascending: true })
            ]);
            const likeIds = (likesRes.data || []).map(r => r.user_id);
            const comments = (commentsRes.data || []).map(c => ({
                id: c.id,
                userId: c.user_id,
                userName: c.user_name,
                content: c.content,
                createdAt: c.created_at
            }));
            return {
                id: row.id,
                title: row.title,
                director: row.director_name,
                directorId: row.director_id,
                year: row.year,
                genre: row.genre,
                category: row.category,
                duration: row.duration,
                youtubeUrl: row.youtube_url,
                thumbnail: row.thumbnail,
                description: row.description,
                views: row.views || 0,
                likes: likeIds,
                comments,
                createdAt: row.created_at
            };
        }
        const videos = JSON.parse(localStorage.getItem(STORAGE_KEYS.videos) || '[]');
        return videos.find(v => v.id === id) || null;
    }

    async function addVideo(video) {
        if (supabase) {
            const { data: user } = await supabase.auth.getUser();
            if (!user?.user) throw new Error('로그인이 필요합니다.');
            const { data, error } = await supabase
                .from('videos')
                .insert({
                    title: video.title,
                    director_id: user.user.id,
                    director_name: video.director,
                    year: video.year,
                    genre: video.genre,
                    category: video.category,
                    duration: video.duration,
                    youtube_url: video.youtubeUrl,
                    thumbnail: video.thumbnail,
                    description: video.description,
                    views: 0
                })
                .select('id')
                .single();
            if (error) throw new Error(error.message || '업로드에 실패했습니다.');
            return data.id;
        }
        const videos = JSON.parse(localStorage.getItem(STORAGE_KEYS.videos) || '[]');
        const newId = videos.length ? Math.max(...videos.map(v => v.id)) + 1 : 1;
        const newVideo = {
            ...video,
            id: newId,
            views: 0,
            likes: [],
            comments: [],
            createdAt: new Date().toISOString()
        };
        videos.unshift(newVideo);
        localStorage.setItem(STORAGE_KEYS.videos, JSON.stringify(videos));
        return newId;
    }

    async function incrementVideoViews(id) {
        if (supabase) {
            const { data } = await supabase.from('videos').select('views').eq('id', id).single();
            if (data) await supabase.from('videos').update({ views: (data.views || 0) + 1 }).eq('id', id);
            return;
        }
        const videos = JSON.parse(localStorage.getItem(STORAGE_KEYS.videos) || '[]');
        const v = videos.find(x => x.id === id);
        if (v) { v.views++; localStorage.setItem(STORAGE_KEYS.videos, JSON.stringify(videos)); }
    }

    // ---------- 댓글 ----------
    async function getComments(videoId) {
        if (supabase) {
            const { data, error } = await supabase
                .from('comments')
                .select('*')
                .eq('video_id', videoId)
                .order('created_at', { ascending: true });
            if (error) return [];
            return (data || []).map(c => ({ id: c.id, userId: c.user_id, userName: c.user_name, content: c.content, createdAt: c.created_at }));
        }
        const videos = JSON.parse(localStorage.getItem(STORAGE_KEYS.videos) || '[]');
        const v = videos.find(x => x.id === videoId);
        return v ? (v.comments || []) : [];
    }

    async function addComment(videoId, content, userId, userName) {
        if (supabase) {
            const { error } = await supabase.from('comments').insert({
                video_id: videoId,
                user_id: userId,
                user_name: userName,
                content: content
            });
            if (error) throw new Error(error.message || '댓글 작성에 실패했습니다.');
            return;
        }
        const videos = JSON.parse(localStorage.getItem(STORAGE_KEYS.videos) || '[]');
        const v = videos.find(x => x.id === videoId);
        if (!v) return;
        v.comments = v.comments || [];
        v.comments.push({ id: v.comments.length + 1, userId, userName, content, createdAt: new Date().toISOString() });
        localStorage.setItem(STORAGE_KEYS.videos, JSON.stringify(videos));
    }

    // ---------- 좋아요 ----------
    async function getLikeCount(videoId) {
        if (supabase) {
            const { count } = await supabase.from('video_likes').select('*', { count: 'exact', head: true }).eq('video_id', videoId);
            return count || 0;
        }
        const videos = JSON.parse(localStorage.getItem(STORAGE_KEYS.videos) || '[]');
        const v = videos.find(x => x.id === videoId);
        return v ? (v.likes || []).length : 0;
    }

    async function getUserLiked(videoId, userId) {
        if (!userId) return false;
        if (supabase) {
            const { data } = await supabase.from('video_likes').select('user_id').eq('video_id', videoId).eq('user_id', userId).maybeSingle();
            return !!data;
        }
        const videos = JSON.parse(localStorage.getItem(STORAGE_KEYS.videos) || '[]');
        const v = videos.find(x => x.id === videoId);
        return v && (v.likes || []).includes(userId);
    }

    async function toggleLike(videoId, userId) {
        if (!userId) throw new Error('로그인이 필요합니다.');
        if (supabase) {
            const liked = await getUserLiked(videoId, userId);
            if (liked) {
                await supabase.from('video_likes').delete().eq('video_id', videoId).eq('user_id', userId);
            } else {
                await supabase.from('video_likes').insert({ video_id: videoId, user_id: userId });
            }
            return;
        }
        const videos = JSON.parse(localStorage.getItem(STORAGE_KEYS.videos) || '[]');
        const v = videos.find(x => x.id === videoId);
        if (!v) return;
        v.likes = v.likes || [];
        const idx = v.likes.indexOf(userId);
        if (idx > -1) v.likes.splice(idx, 1);
        else v.likes.push(userId);
        localStorage.setItem(STORAGE_KEYS.videos, JSON.stringify(videos));
    }

    // ---------- 인증 (Supabase: 이메일 = 학번@filmarchive.local) ----------
    async function authSignIn(studentId, password) {
        if (supabase) {
            const email = studentId + '@filmarchive.local';
            const { data, error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) throw new Error(error.message === 'Invalid login credentials' ? '학번 또는 비밀번호가 일치하지 않습니다.' : error.message);
            const profile = await getProfile(data.user.id);
            return { id: data.user.id, studentId, name: profile?.name || studentId };
        }
        const users = JSON.parse(localStorage.getItem(STORAGE_KEYS.users) || '[]');
        const user = users.find(u => u.studentId === studentId && u.password === password);
        if (!user) throw new Error('학번 또는 비밀번호가 일치하지 않습니다.');
        return { id: user.id, studentId: user.studentId, name: user.name };
    }

    async function getProfile(uid) {
        if (!supabase) return null;
        const { data } = await supabase.from('profiles').select('student_id, name').eq('id', uid).single();
        return data;
    }

    async function authSignUp(studentId, password, name) {
        if (supabase) {
            const email = studentId + '@filmarchive.local';
            const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { student_id: studentId, name } } });
            if (error) throw new Error(error.message || '회원가입에 실패했습니다.');
            await supabase.from('profiles').insert({ id: data.user.id, student_id: studentId, name });
            return { id: data.user.id, studentId, name };
        }
        const users = JSON.parse(localStorage.getItem(STORAGE_KEYS.users) || '[]');
        if (users.some(u => u.studentId === studentId)) throw new Error('이미 사용 중인 학번입니다.');
        const newUser = { id: users.length ? Math.max(...users.map(u => u.id)) + 1 : 1, studentId, name, password };
        users.push(newUser);
        localStorage.setItem(STORAGE_KEYS.users, JSON.stringify(users));
        return { id: newUser.id, studentId, name };
    }

    async function authSignOut() {
        if (supabase) await supabase.auth.signOut();
        localStorage.removeItem(STORAGE_KEYS.currentUser);
    }

    async function getCurrentUser() {
        if (supabase) {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.user) return null;
            const profile = await getProfile(session.user.id);
            return { id: session.user.id, studentId: profile?.student_id || session.user.email?.replace('@filmarchive.local',''), name: profile?.name || '사용자' };
        }
        const raw = localStorage.getItem(STORAGE_KEYS.currentUser);
        if (!raw) return null;
        try {
            const u = JSON.parse(raw);
            return { id: u.id, studentId: u.studentId, name: u.name };
        } catch { return null; }
    }

    function setCurrentUserLocal(user) {
        if (!supabase) localStorage.setItem(STORAGE_KEYS.currentUser, JSON.stringify(user));
    }

    // ---------- 내보내기 ----------
    global.ArchiveAPI = {
        escapeHtml,
        isSupabaseMode,
        initLocalStorage,
        getVideos,
        getVideo,
        addVideo,
        incrementVideoViews,
        getComments,
        addComment,
        getLikeCount,
        getUserLiked,
        toggleLike,
        authSignIn,
        authSignUp,
        authSignOut,
        getCurrentUser,
        setCurrentUserLocal
    };
})(typeof window !== 'undefined' ? window : this);
