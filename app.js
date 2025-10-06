// Kiko Social - Modern Social Media Platform
// Modified to use KikoChat Firebase Database Structure

// Import Firebase modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-app.js";
import {
    getAuth,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js";
import {
    getDatabase,
    ref,
    push,
    set,
    get,
    update,
    remove,
    onValue,
    serverTimestamp,
    query,
    orderByChild,
    limitToLast,
    child
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-database.js";

// Firebase Configuration (Using KikoChat database)
const firebaseConfig = {
    apiKey: "AIzaSyAe_ZfZ8rKCke47UeA9Kcs8cXpD6-G6RAQ",
    authDomain: "kiko-chat-b6435.firebaseapp.com",
    databaseURL: "https://kiko-chat-b6435-default-rtdb.firebaseio.com",
    projectId: "kiko-chat-b6435",
    storageBucket: "kiko-chat-b6435.appspot.com",
    messagingSenderId: "896370793240",
    appId: "1:896370793240:web:3f14442a5d80cd71fb1c6d",
    measurementId: "G-FB55ZBH15N"
};

// Initialize Firebase
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const database = getDatabase(firebaseApp);

// Database paths based on old KikoChat structure
const USERS_PATH = "users";
const POSTS_PATH = "posts";
const ROOMS_PATH = "rooms";
const ANALYTICS_PATH = "analytics";

// Application State
class KikoSocialApp {
    constructor() {
        this.currentUser = null;
        this.isAdmin = false;
        this.currentPage = 'feed';
        this.theme = localStorage.getItem('kiko-theme') || 'dark';
        this.posts = [];
        this.users = [];
        this.notifications = [];
        this.conversations = [];

        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.applyTheme();
        this.showLoadingScreen();

        // Monitor authentication state
        onAuthStateChanged(auth, (user) => {
            if (user) {
                this.handleUserLogin(user);
            } else {
                this.handleUserLogout();
            }
        });

        // Simulate loading time
        setTimeout(() => {
            this.hideLoadingScreen();
        }, 2000);
    }

    // Utility function from old KikoChat
    mkKey(name) { 
        return String(name || "").trim().toLowerCase(); 
    }

    colorFromName(name) {
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
        }
        return `hsl(${Math.abs(hash % 360)}, 65%, 55%)`;
    }

    // Authentication Methods - Modified for KikoChat user structure
    async handleUserLogin(user) {
        this.currentUser = user;

        // Check if user is admin using KikoChat method
        this.isAdmin = await this.checkAdminStatus(user.email);

        // Update user presence using KikoChat structure
        await this.updateUserPresence(user.email, true);

        // Load user data using KikoChat structure
        await this.loadUserData(user.email);

        this.showMainApp();
        this.loadFeed();
        this.loadNotifications();

        this.showToast('success', 'Welcome back!', `You're now signed in as ${user.email}`);
    }

    async handleUserLogout() {
        if (this.currentUser) {
            await this.updateUserPresence(this.currentUser.email, false);
        }

        this.currentUser = null;
        this.isAdmin = false;
        this.showAuthPage();
    }

    async checkAdminStatus(email) {
        try {
            const userKey = this.mkKey(email);
            const userRef = ref(database, `${USERS_PATH}/${userKey}`);
            const snapshot = await get(userRef);
            
            if (snapshot.exists()) {
                const userData = snapshot.val();
                return userData.role === 'admin';
            }
            return false;
        } catch (error) {
            console.error('Error checking admin status:', error);
            return false;
        }
    }

    async signIn(email, password) {
        try {
            // First check if user exists in KikoChat database
            const userKey = this.mkKey(email);
            const userRef = ref(database, `${USERS_PATH}/${userKey}`);
            const snapshot = await get(userRef);

            if (!snapshot.exists()) {
                return { success: false, error: 'User not found in KikoChat system' };
            }

            const userData = snapshot.val();
            if (userData.pass !== password) {
                return { success: false, error: 'Invalid password' };
            }

            // Create Firebase auth account if it doesn't exist
            try {
                const userCredential = await signInWithEmailAndPassword(auth, email, password);
                return { success: true, user: userCredential.user };
            } catch (authError) {
                // If auth doesn't exist, create it
                if (authError.code === 'auth/user-not-found') {
                    const newUserCredential = await createUserWithEmailAndPassword(auth, email, password);
                    await updateProfile(newUserCredential.user, {
                        displayName: userData.name || email.split('@')[0]
                    });
                    return { success: true, user: newUserCredential.user };
                }
                throw authError;
            }
        } catch (error) {
            console.error('Sign in error:', error);
            return { success: false, error: error.message };
        }
    }

    async createUser(userData) {
        if (!this.isAdmin) {
            throw new Error('Only administrators can create users');
        }

        try {
            const userKey = this.mkKey(userData.email);
            
            // Check if user already exists in KikoChat
            const userRef = ref(database, `${USERS_PATH}/${userKey}`);
            const snapshot = await get(userRef);

            if (snapshot.exists()) {
                return { success: false, error: 'User already exists in KikoChat system' };
            }

            // Create user in KikoChat database structure
            await set(userRef, {
                pass: userData.password,
                role: userData.role || 'user',
                profile: {
                    avatarColor: this.colorFromName(userData.name),
                    status: "Available",
                    joinDate: serverTimestamp(),
                    name: userData.name,
                    username: userData.username,
                    bio: userData.bio || '',
                    email: userData.email
                },
                status: {
                    online: false,
                    lastSeen: serverTimestamp(),
                    typing: false
                }
            });

            // Create Firebase auth account
            const userCredential = await createUserWithEmailAndPassword(
                auth, 
                userData.email, 
                userData.password
            );

            await updateProfile(userCredential.user, {
                displayName: userData.name
            });

            return { success: true, user: userCredential.user };
        } catch (error) {
            console.error('Create user error:', error);
            return { success: false, error: error.message };
        }
    }

    async signOutUser() {
        try {
            await signOut(auth);
            this.showToast('info', 'Signed out', 'You have been successfully signed out');
        } catch (error) {
            console.error('Sign out error:', error);
            this.showToast('error', 'Error', 'Failed to sign out');
        }
    }

    // User Data Methods - Modified for KikoChat structure
    async loadUserData(email) {
        try {
            const userKey = this.mkKey(email);
            const userRef = ref(database, `${USERS_PATH}/${userKey}`);
            const snapshot = await get(userRef);

            if (snapshot.exists()) {
                const userData = snapshot.val();
                const formattedUserData = {
                    uid: userKey,
                    email: email,
                    name: userData.profile?.name || email.split('@')[0],
                    username: userData.profile?.username || email.split('@')[0],
                    bio: userData.profile?.bio || '',
                    avatar: userData.profile?.avatarColor ? this.createAvatarFromColor(userData.profile.avatarColor, userData.profile.name) : `https://ui-avatars.com/api/?name=${encodeURIComponent(userData.profile?.name || email.split('@')[0])}&background=667eea&color=fff`,
                    followers: 0,
                    following: 0,
                    posts: await this.getUserPostCount(userKey),
                    isOnline: userData.status?.online || false,
                    lastSeen: userData.status?.lastSeen,
                    joined: userData.profile?.joinDate,
                    isActive: true,
                    role: userData.role || 'user'
                };
                this.updateUserUI(formattedUserData);
            }
        } catch (error) {
            console.error('Error loading user data:', error);
        }
    }

    createAvatarFromColor(color, name) {
        const initial = name ? name.charAt(0).toUpperCase() : 'U';
        return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="${color}"/><text x="50" y="60" font-family="Arial" font-size="40" text-anchor="middle" fill="white">${initial}</text></svg>`;
    }

    async getUserPostCount(userKey) {
        try {
            const postsRef = ref(database, POSTS_PATH);
            const snapshot = await get(postsRef);
            let count = 0;

            if (snapshot.exists()) {
                snapshot.forEach((childSnapshot) => {
                    const post = childSnapshot.val();
                    if (post.authorId === userKey && post.isActive !== false) {
                        count++;
                    }
                });
            }
            return count;
        } catch (error) {
            console.error('Error getting user post count:', error);
            return 0;
        }
    }

    async updateUserPresence(email, isOnline) {
        try {
            const userKey = this.mkKey(email);
            const userRef = ref(database, `${USERS_PATH}/${userKey}`);
            
            await update(userRef, {
                'status/online': isOnline,
                'status/lastSeen': serverTimestamp()
            });
        } catch (error) {
            console.error('Error updating user presence:', error);
        }
    }

    // Post Methods - Modified for KikoChat structure
    async createPost(content, imageUrl = null) {
        if (!this.currentUser) return;

        try {
            const userKey = this.mkKey(this.currentUser.email);
            const postRef = push(ref(database, POSTS_PATH));
            
            const postData = {
                id: postRef.key,
                authorId: userKey,
                authorName: this.currentUser.displayName || this.currentUser.email.split('@')[0],
                content: content,
                image: imageUrl,
                timestamp: serverTimestamp(),
                likes: 0,
                comments: 0,
                shares: 0,
                hashtags: this.extractHashtags(content),
                isActive: true,
                type: "social_post" // Differentiate from chat messages
            };

            await set(postRef, postData);

            this.showToast('success', 'Post created!', 'Your post has been shared successfully');
            this.loadFeed();
        } catch (error) {
            console.error('Error creating post:', error);
            this.showToast('error', 'Error', 'Failed to create post');
        }
    }

    async loadFeed() {
        try {
            const postsRef = query(ref(database, POSTS_PATH), orderByChild('timestamp'), limitToLast(50));
            const snapshot = await get(postsRef);

            if (snapshot.exists()) {
                const posts = [];
                snapshot.forEach((childSnapshot) => {
                    const post = childSnapshot.val();
                    // Only show social posts, not chat messages
                    if (post.isActive !== false && (post.type === 'social_post' || !post.type)) {
                        posts.unshift(post);
                    }
                });

                this.posts = posts;
                await this.renderFeed();
            }
        } catch (error) {
            console.error('Error loading feed:', error);
        }
    }

    async renderFeed() {
        const feedContainer = document.getElementById('posts-feed');
        if (!feedContainer) return;

        feedContainer.innerHTML = '';

        for (const post of this.posts) {
            const authorData = await this.getUserDataById(post.authorId);
            const postElement = this.createPostElement(post, authorData);
            feedContainer.appendChild(postElement);
        }
    }

    async getUserDataById(userKey) {
        try {
            const userRef = ref(database, `${USERS_PATH}/${userKey}`);
            const snapshot = await get(userRef);

            if (snapshot.exists()) {
                const userData = snapshot.val();
                return {
                    name: userData.profile?.name || userKey,
                    username: userData.profile?.username || userKey,
                    avatar: userData.profile?.avatarColor ? this.createAvatarFromColor(userData.profile.avatarColor, userData.profile.name) : `https://ui-avatars.com/api/?name=${encodeURIComponent(userKey)}&background=667eea&color=fff`,
                    role: userData.role || 'user'
                };
            }
            return {
                name: userKey,
                username: userKey,
                avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(userKey)}&background=667eea&color=fff`,
                role: 'user'
            };
        } catch (error) {
            console.error('Error getting user data by ID:', error);
            return {
                name: userKey,
                username: userKey,
                avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(userKey)}&background=667eea&color=fff`,
                role: 'user'
            };
        }
    }

    createPostElement(post, author) {
        const postDiv = document.createElement('div');
        postDiv.className = 'post';
        postDiv.innerHTML = `
            <div class="post-header">
                <img src="${author.avatar}" alt="${author.name}" class="post-avatar">
                <div class="post-author">
                    <h4>${author.name}</h4>
                    <p>@${author.username}</p>
                    ${author.role === 'admin' ? '<span class="role-badge admin">Admin</span>' : ''}
                </div>
                <span class="post-time">${this.formatTimestamp(post.timestamp)}</span>
            </div>
            <div class="post-content">
                ${this.formatPostContent(post.content)}
            </div>
            ${post.image ? `<img src="${post.image}" alt="Post image" class="post-image">` : ''}
            ${post.hashtags && post.hashtags.length > 0 ? `
                <div class="post-hashtags">
                    ${post.hashtags.map(tag => `<a href="#" class="hashtag-link">#${tag}</a>`).join(' ')}
                </div>
            ` : ''}
            <div class="post-actions">
                <button class="action-btn like-btn" data-post-id="${post.id}">
                    <i class="fas fa-heart"></i>
                    <span>${post.likes || 0}</span>
                </button>
                <button class="action-btn comment-btn" data-post-id="${post.id}">
                    <i class="fas fa-comment"></i>
                    <span>${post.comments || 0}</span>
                </button>
                <button class="action-btn share-btn" data-post-id="${post.id}">
                    <i class="fas fa-share"></i>
                    <span>${post.shares || 0}</span>
                </button>
                <button class="action-btn bookmark-btn" data-post-id="${post.id}">
                    <i class="fas fa-bookmark"></i>
                </button>
            </div>
        `;

        return postDiv;
    }

    formatPostContent(content) {
        // Simple formatting similar to KikoChat
        return content
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code>$1</code>')
            .replace(/@(\w+)/g, '<span class="mention">@$1</span>')
            .replace(/\n/g, '<br>');
    }

    // User Management (Admin Only) - Modified for KikoChat structure
    async loadUsers() {
        if (!this.isAdmin) return;

        try {
            const usersRef = ref(database, USERS_PATH);
            const snapshot = await get(usersRef);

            if (snapshot.exists()) {
                const users = [];
                snapshot.forEach((childSnapshot) => {
                    const userKey = childSnapshot.key;
                    const userData = childSnapshot.val();
                    users.push({
                        uid: userKey,
                        email: userKey, // In KikoChat, key is the username/email
                        name: userData.profile?.name || userKey,
                        username: userData.profile?.username || userKey,
                        role: userData.role || 'user',
                        isActive: true,
                        isOnline: userData.status?.online || false,
                        lastSeen: userData.status?.lastSeen,
                        joined: userData.profile?.joinDate,
                        avatar: userData.profile?.avatarColor ? this.createAvatarFromColor(userData.profile.avatarColor, userData.profile.name) : `https://ui-avatars.com/api/?name=${encodeURIComponent(userKey)}&background=667eea&color=fff`
                    });
                });
                this.users = users;
                this.renderUsersTable();
            }
        } catch (error) {
            console.error('Error loading users:', error);
        }
    }

    renderUsersTable() {
        const usersList = document.getElementById('users-list');
        if (!usersList) return;

        usersList.innerHTML = '';

        this.users.forEach(user => {
            const userRow = document.createElement('div');
            userRow.className = 'user-row';
            userRow.innerHTML = `
                <div class="user-info">
                    <img src="${user.avatar}" alt="${user.name}">
                    <div>
                        <h4>${user.name}</h4>
                        <p>@${user.username}</p>
                    </div>
                </div>
                <div>${user.email}</div>
                <div>${this.formatDate(user.joined)}</div>
                <div>
                    <span class="status-badge ${user.isOnline ? 'status-active' : 'status-inactive'}">
                        ${user.isOnline ? 'Online' : 'Offline'}
                    </span>
                </div>
                <div>
                    <span class="role-badge ${user.role}">${user.role}</span>
                </div>
                <div class="user-actions">
                    <button class="btn btn-secondary btn-sm edit-user-btn" data-user-id="${user.uid}">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-danger btn-sm delete-user-btn" data-user-id="${user.uid}">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            usersList.appendChild(userRow);
        });
    }

    // Utility Methods
    extractHashtags(text) {
        const hashtagRegex = /#(\w+)/g;
        const hashtags = [];
        let match;

        while ((match = hashtagRegex.exec(text)) !== null) {
            hashtags.push(match[1].toLowerCase());
        }

        return hashtags;
    }

    formatTimestamp(timestamp) {
        if (!timestamp) return 'Just now';

        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;

        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;

        return date.toLocaleDateString();
    }

    formatDate(timestamp) {
        if (!timestamp) return 'Unknown';
        return new Date(timestamp).toLocaleDateString();
    }

    // ... (rest of the methods remain the same as your original KikoSocialApp)

    // UI Methods
    showLoadingScreen() {
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) {
            loadingScreen.classList.remove('fade-out');
        }
    }

    hideLoadingScreen() {
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) {
            loadingScreen.classList.add('fade-out');
            setTimeout(() => {
                loadingScreen.style.display = 'none';
            }, 500);
        }
    }

    showAuthPage() {
        document.getElementById('auth-page').classList.remove('hidden');
        document.getElementById('main-app').classList.add('hidden');
    }

    showMainApp() {
        document.getElementById('auth-page').classList.add('hidden');
        document.getElementById('main-app').classList.remove('hidden');
    }

    updateUserUI(userData) {
        const userNameElement = document.getElementById('user-name');
        const userEmailElement = document.getElementById('user-email');

        if (userNameElement) userNameElement.textContent = userData.name;
        if (userEmailElement) userEmailElement.textContent = userData.email;

        // Show/hide admin elements
        const adminElements = document.querySelectorAll('[data-admin-only]');
        adminElements.forEach(el => {
            el.style.display = this.isAdmin ? 'block' : 'none';
        });

        const adminPanelBtn = document.getElementById('admin-panel-btn');
        if (adminPanelBtn) {
            adminPanelBtn.style.display = this.isAdmin ? 'flex' : 'none';
        }
    }

    // Navigation Methods
    showPage(pageId) {
        // Hide all pages
        document.querySelectorAll('.page').forEach(page => {
            page.classList.remove('active');
        });

        // Show selected page
        const targetPage = document.getElementById(`${pageId}-page`);
        if (targetPage) {
            targetPage.classList.add('active');
        }

        // Update navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });

        const activeNavItem = document.querySelector(`[data-page="${pageId}"]`);
        if (activeNavItem) {
            activeNavItem.classList.add('active');
        }

        this.currentPage = pageId;

        // Load page-specific content
        if (pageId === 'admin' && this.isAdmin) {
            this.loadUsers();
            this.loadAnalytics();
        } else if (pageId === 'feed') {
            this.loadFeed();
        }
    }

    // Theme Methods
    applyTheme() {
        document.body.setAttribute('data-theme', this.theme);
        const themeIcon = document.querySelector('#theme-toggle i');
        if (themeIcon) {
            themeIcon.className = this.theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
        }
    }

    toggleTheme() {
        this.theme = this.theme === 'dark' ? 'light' : 'dark';
        localStorage.setItem('kiko-theme', this.theme);
        this.applyTheme();
    }

    // Modal Methods
    showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('show');
            document.body.style.overflow = 'hidden';
        }
    }

    hideModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('show');
            document.body.style.overflow = '';
        }
    }

    // Toast Notifications
    showToast(type, title, message) {
        const toastContainer = document.getElementById('toast-container');
        if (!toastContainer) return;

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        const icons = {
            success: 'fas fa-check-circle',
            error: 'fas fa-exclamation-circle',
            info: 'fas fa-info-circle',
            warning: 'fas fa-exclamation-triangle'
        };

        toast.innerHTML = `
            <i class="${icons[type]} toast-icon"></i>
            <div class="toast-content">
                <h4>${title}</h4>
                <p>${message}</p>
            </div>
            <button class="toast-close">&times;</button>
        `;

        toastContainer.appendChild(toast);

        // Show toast
        setTimeout(() => toast.classList.add('show'), 100);

        // Auto remove after 5 seconds
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 5000);

        // Manual close
        toast.querySelector('.toast-close').addEventListener('click', () => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        });
    }

    // Analytics Methods
    async loadAnalytics() {
        if (!this.isAdmin) return;

        try {
            // Calculate analytics from existing data
            const totalUsers = this.users.length;
            const activeUsers = this.users.filter(user => user.isOnline).length;
            
            const postsRef = ref(database, POSTS_PATH);
            const postsSnapshot = await get(postsRef);
            const totalPosts = postsSnapshot.exists() ? Object.keys(postsSnapshot.val()).length : 0;

            const analyticsData = {
                totalUsers: totalUsers,
                activeUsers: activeUsers,
                totalPosts: totalPosts,
                engagementRate: Math.round((activeUsers / Math.max(totalUsers, 1)) * 100)
            };

            this.updateAnalyticsUI(analyticsData);
        } catch (error) {
            console.error('Error loading analytics:', error);
        }
    }

    updateAnalyticsUI(data) {
        const elements = {
            'total-users': data.totalUsers,
            'active-users': data.activeUsers,
            'total-posts': data.totalPosts,
            'engagement-rate': data.engagementRate + '%'
        };

        Object.entries(elements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) element.textContent = value;
        });
    }

    // Load notifications
    async loadNotifications() {
        // Placeholder for notifications functionality
        console.log('Loading notifications...');
    }

    // Event Listeners Setup
    setupEventListeners() {
        // Authentication form
        const authForm = document.getElementById('auth-form');
        if (authForm) {
            authForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const email = document.getElementById('email').value;
                const password = document.getElementById('password').value;

                const result = await this.signIn(email, password);
                if (!result.success) {
                    this.showToast('error', 'Sign In Failed', result.error);
                }
            });
        }

        // Theme toggle
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => this.toggleTheme());
        }

        // User menu toggle
        const userMenuBtn = document.getElementById('user-menu-btn');
        const userDropdown = document.getElementById('user-dropdown');
        if (userMenuBtn && userDropdown) {
            userMenuBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                userDropdown.classList.toggle('show');
            });

            document.addEventListener('click', () => {
                userDropdown.classList.remove('show');
            });
        }

        // Logout button
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.signOutUser();
            });
        }

        // Navigation items
        document.querySelectorAll('[data-page]').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const page = item.getAttribute('data-page');
                this.showPage(page);
            });
        });

        // Post composer
        const publishBtn = document.getElementById('publish-btn');
        const postContent = document.getElementById('post-content');
        if (publishBtn && postContent) {
            publishBtn.addEventListener('click', async () => {
                const content = postContent.value.trim();
                if (content) {
                    await this.createPost(content);
                    postContent.value = '';
                }
            });
        }

        // Admin panel tabs
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.getAttribute('data-tab');

                // Update tab buttons
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                // Update tab content
                document.querySelectorAll('.tab-content').forEach(content => {
                    content.classList.remove('active');
                });
                const targetContent = document.getElementById(`${tab}-tab`);
                if (targetContent) {
                    targetContent.classList.add('active');
                }
            });
        });

        // Create user modal
        const createUserBtn = document.getElementById('create-user-btn');
        if (createUserBtn) {
            createUserBtn.addEventListener('click', () => {
                this.showModal('create-user-modal');
            });
        }

        // Create user form
        const createUserForm = document.getElementById('create-user-form');
        if (createUserForm) {
            createUserForm.addEventListener('submit', async (e) => {
                e.preventDefault();

                const userData = {
                    name: document.getElementById('new-user-name').value,
                    username: document.getElementById('new-user-username').value,
                    email: document.getElementById('new-user-email').value,
                    password: document.getElementById('new-user-password').value,
                    bio: document.getElementById('new-user-bio').value,
                    role: document.getElementById('new-user-role').value || 'user'
                };

                const result = await this.createUser(userData);
                if (result.success) {
                    this.hideModal('create-user-modal');
                    this.showToast('success', 'User Created', `Successfully created user: ${userData.name}`);
                    createUserForm.reset();
                    this.loadUsers();
                } else {
                    this.showToast('error', 'Creation Failed', result.error);
                }
            });
        }

        // Modal close buttons
        document.querySelectorAll('.modal-close, [data-modal-close]').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.modal').forEach(modal => {
                    modal.classList.remove('show');
                });
                document.body.style.overflow = '';
            });
        });

        // Modal backdrop click
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('show');
                    document.body.style.overflow = '';
                }
            });
        });
    }
}

// Initialize the application
const kikoApp = new KikoSocialApp();

// Export for debugging
window.KikoSocialApp = kikoApp;
